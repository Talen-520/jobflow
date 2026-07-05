from __future__ import annotations

import re

from app.models.schemas import (
    ChatAdjustRequest,
    ChatAdjustResult,
    FillPlan,
    FillPlanItem,
    Preferences,
    UserProfile,
)
from app.tools.profile_tools import ProfileTools, ToolResult


class ChatAdjustmentService:
    def adjust(
        self,
        request: ChatAdjustRequest,
        profile: UserProfile,
        preferences: Preferences,
    ) -> ChatAdjustResult:
        command = self._parse_command(request.message)
        updated_plan = request.current_plan.model_copy(deep=True) if request.current_plan else None
        target = self._target_item(updated_plan, request.field_id) if updated_plan else None
        source_refs: list[str] = []

        if target is not None and command == "leave_blank":
            target.action = "skip"
            target.value = ""
            target.confidence = 1.0
            target.needs_review = False
            target.reason = "User asked to leave this field blank."

        if target is not None and command == "shorten":
            target.value = self._shorten(str(target.value or ""))
            target.needs_review = True
            target.reason = "User asked to shorten this answer. Review before using."

        if target is not None and command == "use_fact":
            fact = self._best_fact(request.message, profile, preferences)
            if fact is not None:
                target.value = fact.value
                target.source_refs = [fact.source_ref]
                target.confidence = fact.confidence
                target.needs_review = True
                target.reason = "User asked to use a matching stored fact. Review before using."
                source_refs = [fact.source_ref]

        field_id = request.field_id or target.field_id if target is not None else request.field_id
        return ChatAdjustResult(
            status="parsed",
            field_id=field_id,
            command=command,
            message=request.message,
            updated_plan=updated_plan,
            source_refs=source_refs,
        )

    def _parse_command(
        self, message: str
    ) -> str:
        normalized = message.lower()
        if "leave" in normalized and "blank" in normalized:
            return "leave_blank"
        if "short" in normalized or "concise" in normalized:
            return "shorten"
        if "use" in normalized and ("fact" in normalized or "experience" in normalized or "project" in normalized):
            return "use_fact"
        return "review"

    def _target_item(self, plan: FillPlan | None, field_id: str | None) -> FillPlanItem | None:
        if plan is None:
            return None
        if field_id:
            for item in plan.items:
                if item.field_id == field_id:
                    return item
        for item in plan.items:
            if item.needs_review:
                return item
        return plan.items[0] if plan.items else None

    def _shorten(self, value: str) -> str:
        words = value.split()
        if len(words) <= 24:
            return value
        target_count = max(24, len(words) // 2)
        return " ".join(words[:target_count]).strip()

    def _best_fact(
        self,
        message: str,
        profile: UserProfile,
        preferences: Preferences,
    ) -> ToolResult | None:
        query = self._fact_query(message)
        tools = ProfileTools(profile, preferences)
        candidates = [
            *tools.search_project_facts(query),
            *tools.search_resume_facts(query),
            *tools.search_profile_facts(query),
        ]
        if not candidates:
            return None
        return sorted(candidates, key=lambda item: item.confidence, reverse=True)[0]

    def _fact_query(self, message: str) -> str:
        words = re.findall(r"[A-Za-z0-9+#.-]+", message.lower())
        stop_words = {"use", "my", "the", "fact", "experience", "project", "for", "this"}
        filtered = [word for word in words if word not in stop_words]
        return " ".join(filtered) or message
