from __future__ import annotations

from dataclasses import dataclass

from app.models.schemas import AnswerBankEntry, Fact, Preferences, UserProfile


def normalize(value: str) -> str:
    return value.strip().lower()


@dataclass
class ToolResult:
    value: str
    source_ref: str
    confidence: float = 0.95


class ProfileTools:
    def __init__(self, profile: UserProfile, preferences: Preferences) -> None:
        self.profile = profile
        self.preferences = preferences

    def get_profile_field(self, path: str) -> ToolResult | None:
        current: object = self.profile
        for part in path.split("."):
            if hasattr(current, part):
                current = getattr(current, part)
            elif isinstance(current, dict):
                current = current.get(part, "")
            else:
                return None
        if current is None or current == "":
            return None
        return ToolResult(value=str(current), source_ref=f"profile.{path}")

    def search_profile_facts(
        self, query: str, categories: list[str] | None = None
    ) -> list[ToolResult]:
        query_terms = set(normalize(query).split())
        categories = categories or [
            "education",
            "experience_facts",
            "project_facts",
            "skill_facts",
        ]
        results: list[ToolResult] = []
        for category in categories:
            facts = getattr(self.profile, category, [])
            for fact in facts:
                if self._fact_matches(fact, query_terms):
                    results.append(
                        ToolResult(
                            value=fact.body or fact.title,
                            source_ref=f"{category}.{fact.id}",
                            confidence=0.85,
                        )
                    )
        return results

    def search_resume_facts(self, query: str) -> list[ToolResult]:
        return self.search_profile_facts(query, ["experience_facts", "skill_facts"])

    def search_project_facts(self, query: str) -> list[ToolResult]:
        return self.search_profile_facts(query, ["project_facts"])

    def search_answer_bank(
        self, question_type: str, keywords: list[str] | None = None
    ) -> list[ToolResult]:
        keywords = [normalize(keyword) for keyword in (keywords or [])]
        results: list[ToolResult] = []
        for entry in self.profile.answer_bank:
            if self._answer_matches(entry, question_type, keywords):
                results.append(
                    ToolResult(
                        value=entry.body,
                        source_ref=f"answer_bank.{entry.id}",
                        confidence=0.9,
                    )
                )
        return results

    def get_user_preferences(self) -> Preferences:
        return self.preferences

    def _fact_matches(self, fact: Fact, query_terms: set[str]) -> bool:
        haystack = normalize(" ".join([fact.title, fact.body, " ".join(fact.tags)]))
        return any(term and term in haystack for term in query_terms)

    def _answer_matches(
        self, entry: AnswerBankEntry, question_type: str, keywords: list[str]
    ) -> bool:
        haystack = normalize(
            " ".join([entry.question_type, entry.title, entry.body, " ".join(entry.tags)])
        )
        if question_type and normalize(question_type) in haystack:
            return True
        return any(keyword and keyword in haystack for keyword in keywords)
