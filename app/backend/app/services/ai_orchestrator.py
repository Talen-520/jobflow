from __future__ import annotations

import json
import re
from typing import Protocol

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.models.schemas import (
    OpenAnswerDraft,
    OpenAnswerDraftRequest,
    Preferences,
    ToolCallRecord,
    UserProfile,
)
from app.tools.profile_tools import ProfileTools, ToolResult


class GenerateClient(Protocol):
    def generate(self, prompt: str, schema: dict[str, object]) -> str:
        ...


class OllamaGenerateClient:
    def __init__(
        self,
        base_url: str = settings.ollama_base_url,
        model: str = settings.ollama_model,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    def generate(self, prompt: str, schema: dict[str, object]) -> str:
        response = httpx.post(
            f"{self.base_url}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "format": schema,
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        return str(payload.get("response", ""))


class _ModelDraft(BaseModel):
    answer: str = ""
    source_refs: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)


class OpenAnswerOrchestrator:
    def __init__(self, generate_client: GenerateClient | None = None) -> None:
        self.generate_client = generate_client or OllamaGenerateClient()

    def draft(
        self,
        request: OpenAnswerDraftRequest,
        profile: UserProfile,
        preferences: Preferences,
    ) -> OpenAnswerDraft:
        tools = ProfileTools(profile, preferences)
        max_words = request.max_words or preferences.open_answer_max_words
        sources, tool_calls = self._gather_sources(request, tools)
        if not sources:
            return OpenAnswerDraft(
                needs_review=True,
                tool_calls=tool_calls,
                fallback_used=True,
                reason="No matching user-provided facts were found.",
            )

        if request.use_model:
            model_draft = self._try_model_draft(request, sources, max_words)
            if model_draft and self._is_supported(model_draft, sources):
                return OpenAnswerDraft(
                    answer=self._truncate_words(model_draft.answer, max_words),
                    source_refs=model_draft.source_refs,
                    needs_review=True,
                    tool_calls=tool_calls,
                    model_used=settings.ollama_model,
                    fallback_used=False,
                    unsupported_claims=[],
                    reason="Draft generated from local source-backed facts.",
                )

        fallback_answer = self._fallback_answer(sources, max_words)
        return OpenAnswerDraft(
            answer=fallback_answer,
            source_refs=[source.source_ref for source in sources],
            needs_review=True,
            tool_calls=tool_calls,
            fallback_used=True,
            reason="Deterministic draft assembled from user-provided sources.",
        )

    def _gather_sources(
        self, request: OpenAnswerDraftRequest, tools: ProfileTools
    ) -> tuple[list[ToolResult], list[ToolCallRecord]]:
        keywords = self._keywords(request)
        query = " ".join(keywords) or request.question
        calls: list[ToolCallRecord] = []
        results: list[ToolResult] = []

        answer_bank = tools.search_answer_bank(request.question_type, keywords)
        calls.append(
            ToolCallRecord(
                tool_name="search_answer_bank",
                arguments={
                    "question_type": request.question_type,
                    "keywords": keywords,
                },
                source_refs=[item.source_ref for item in answer_bank],
                result_count=len(answer_bank),
            )
        )
        results.extend(answer_bank)

        resume_facts = tools.search_resume_facts(query)
        calls.append(
            ToolCallRecord(
                tool_name="search_resume_facts",
                arguments={"query": query},
                source_refs=[item.source_ref for item in resume_facts],
                result_count=len(resume_facts),
            )
        )
        results.extend(resume_facts)

        project_facts = tools.search_project_facts(query)
        calls.append(
            ToolCallRecord(
                tool_name="search_project_facts",
                arguments={"query": query},
                source_refs=[item.source_ref for item in project_facts],
                result_count=len(project_facts),
            )
        )
        results.extend(project_facts)

        profile_facts = tools.search_profile_facts(query)
        calls.append(
            ToolCallRecord(
                tool_name="search_profile_facts",
                arguments={"query": query},
                source_refs=[item.source_ref for item in profile_facts],
                result_count=len(profile_facts),
            )
        )
        results.extend(profile_facts)

        return self._dedupe_sources(results), calls

    def _try_model_draft(
        self,
        request: OpenAnswerDraftRequest,
        sources: list[ToolResult],
        max_words: int,
    ) -> _ModelDraft | None:
        prompt = self._build_prompt(request, sources, max_words)
        try:
            response_text = self.generate_client.generate(
                prompt=prompt,
                schema=_ModelDraft.model_json_schema(),
            )
            payload = json.loads(response_text)
            return _ModelDraft.model_validate(payload)
        except (httpx.HTTPError, json.JSONDecodeError, ValidationError, ValueError):
            return None

    def _build_prompt(
        self,
        request: OpenAnswerDraftRequest,
        sources: list[ToolResult],
        max_words: int,
    ) -> str:
        source_lines = "\n".join(
            f"- {source.source_ref}: {source.value}" for source in sources
        )
        return (
            "Draft a concise job application answer.\n"
            "Use only the source facts listed below. Do not add new facts, dates, "
            "companies, titles, metrics, legal status, education, or certifications.\n"
            "Return JSON that matches the provided schema. Every answer must include "
            "source_refs from the allowed source list. Put any unsupported claim in "
            "unsupported_claims instead of the answer.\n\n"
            f"Question type: {request.question_type}\n"
            f"Question: {request.question}\n"
            f"Max words: {max_words}\n"
            "Allowed sources:\n"
            f"{source_lines}"
        )

    def _is_supported(
        self, draft: _ModelDraft, sources: list[ToolResult]
    ) -> bool:
        allowed_refs = {source.source_ref for source in sources}
        if not draft.answer.strip():
            return False
        if draft.unsupported_claims:
            return False
        if not draft.source_refs:
            return False
        return set(draft.source_refs).issubset(allowed_refs)

    def _fallback_answer(self, sources: list[ToolResult], max_words: int) -> str:
        ordered_sources = sorted(sources, key=lambda source: source.confidence, reverse=True)
        answer = " ".join(source.value.strip() for source in ordered_sources if source.value)
        return self._truncate_words(answer, max_words)

    def _dedupe_sources(self, sources: list[ToolResult]) -> list[ToolResult]:
        seen: set[str] = set()
        deduped: list[ToolResult] = []
        for source in sources:
            if source.source_ref in seen or not source.value.strip():
                continue
            seen.add(source.source_ref)
            deduped.append(source)
        return deduped[:8]

    def _keywords(self, request: OpenAnswerDraftRequest) -> list[str]:
        terms = request.keywords + re.findall(r"[A-Za-z0-9+#.-]+", request.question)
        normalized: list[str] = []
        for term in terms:
            value = term.strip().lower()
            if len(value) >= 3 and value not in normalized:
                normalized.append(value)
        return normalized[:12]

    def _truncate_words(self, value: str, max_words: int) -> str:
        words = value.split()
        if len(words) <= max_words:
            return value.strip()
        return " ".join(words[:max_words]).strip()
