from __future__ import annotations

from typing import Any

from app.models.schemas import (
    AnswerBankEntry,
    DocumentRecord,
    Fact,
    Preferences,
    PromptContextPreview,
    PromptContextSource,
    UserProfile,
)


SYSTEM_RULES = [
    "Use only the local user-provided sources listed in this context.",
    "Do not invent work history, education, dates, employers, titles, metrics, certifications, legal status, identity, salary, or relocation facts.",
    "Open-ended answers must include source_refs and require user review.",
    "Final application submission is manual only.",
    "Leave missing, ambiguous, low-confidence, and disallowed sensitive fields for user review.",
]


class PromptContextService:
    def build_preview(
        self, profile: UserProfile, preferences: Preferences
    ) -> PromptContextPreview:
        sources: list[PromptContextSource] = []
        self._add_identity_sources(profile, sources)
        self._add_link_sources(profile, sources)
        self._add_work_authorization_sources(profile, sources)
        self._add_profile_preference_sources(profile, sources)
        self._add_document_sources(profile.documents, sources)
        self._add_fact_sources("education", "Education", profile.education, sources)
        self._add_fact_sources(
            "experience_facts", "Experience fact", profile.experience_facts, sources
        )
        self._add_fact_sources(
            "project_facts", "Project fact", profile.project_facts, sources
        )
        self._add_fact_sources("skill_facts", "Skill fact", profile.skill_facts, sources)
        self._add_answer_sources(profile.answer_bank, sources)
        preference_summary = self._preference_summary(preferences)
        return PromptContextPreview(
            source_count=len(sources),
            system_rules=SYSTEM_RULES,
            preference_summary=preference_summary,
            sources=sources,
            generated_prompt=self._generated_prompt(sources, preference_summary),
        )

    def _add_identity_sources(
        self, profile: UserProfile, sources: list[PromptContextSource]
    ) -> None:
        fields = [
            ("first_name", "First name"),
            ("last_name", "Last name"),
            ("preferred_name", "Preferred name"),
            ("email", "Email"),
            ("phone", "Phone"),
            ("location", "Location"),
            ("address", "Address"),
        ]
        for key, label in fields:
            value = getattr(profile.identity, key)
            self._add(
                sources,
                source_ref=f"profile.identity.{key}",
                category="Identity",
                label=label,
                value=value,
                sensitive=key in {"address", "phone"},
            )

    def _add_link_sources(
        self, profile: UserProfile, sources: list[PromptContextSource]
    ) -> None:
        fields = [
            ("linkedin", "LinkedIn"),
            ("github", "GitHub"),
            ("portfolio", "Portfolio"),
        ]
        for key, label in fields:
            self._add(
                sources,
                source_ref=f"profile.links.{key}",
                category="Links",
                label=label,
                value=getattr(profile.links, key),
            )

    def _add_work_authorization_sources(
        self, profile: UserProfile, sources: list[PromptContextSource]
    ) -> None:
        auth = profile.work_authorization
        self._add(
            sources,
            source_ref="profile.work_authorization.country",
            category="Work authorization",
            label="Country",
            value=auth.country,
            sensitive=True,
        )
        if auth.authorized is not None:
            self._add(
                sources,
                source_ref="profile.work_authorization.authorized",
                category="Work authorization",
                label="Authorized to work",
                value=self._yes_no(auth.authorized),
                sensitive=True,
            )
        if auth.requires_sponsorship is not None:
            self._add(
                sources,
                source_ref="profile.work_authorization.requires_sponsorship",
                category="Work authorization",
                label="Requires sponsorship",
                value=self._yes_no(auth.requires_sponsorship),
                sensitive=True,
            )
        self._add(
            sources,
            source_ref="profile.work_authorization.notes",
            category="Work authorization",
            label="Notes",
            value=auth.notes,
            sensitive=True,
        )

    def _add_profile_preference_sources(
        self, profile: UserProfile, sources: list[PromptContextSource]
    ) -> None:
        for key, raw_value in sorted(profile.preferences.items()):
            if raw_value is None or raw_value == "" or raw_value == [] or raw_value == {}:
                continue
            self._add(
                sources,
                source_ref=f"profile.preferences.{key}",
                category="Profile preference",
                label=key.replace("_", " ").title(),
                value=self._string_value(raw_value),
                sensitive=self._looks_sensitive(key),
            )

    def _add_document_sources(
        self, documents: list[DocumentRecord], sources: list[PromptContextSource]
    ) -> None:
        for document in documents:
            label = document.name or document.kind
            self._add(
                sources,
                source_ref=f"profile.documents.{document.id}",
                category="Document",
                label=label,
                value=f"{document.kind}: {label}",
            )

    def _add_fact_sources(
        self,
        source_prefix: str,
        category: str,
        facts: list[Fact],
        sources: list[PromptContextSource],
    ) -> None:
        for fact in facts:
            value = fact.body or fact.title
            self._add(
                sources,
                source_ref=f"{source_prefix}.{fact.id}",
                category=category,
                label=fact.title or category,
                value=value,
            )

    def _add_answer_sources(
        self, entries: list[AnswerBankEntry], sources: list[PromptContextSource]
    ) -> None:
        for entry in entries:
            self._add(
                sources,
                source_ref=f"answer_bank.{entry.id}",
                category="Answer bank",
                label=entry.title or entry.question_type,
                value=entry.body,
            )

    def _preference_summary(self, preferences: Preferences) -> list[str]:
        return [
            "Final submit: manual_only",
            f"Sensitive fields: {'auto-fill enabled' if preferences.fill_sensitive_fields else 'review required'}",
            f"EEO fields: {'auto-fill enabled' if preferences.fill_eeo_fields else 'blocked by default'}",
            f"Open answer style: {preferences.open_answer_style}",
            f"Open answer max words: {preferences.open_answer_max_words}",
            f"Salary policy: {preferences.salary_answer_policy}",
            f"Relocation policy: {preferences.relocation_policy}",
            f"Missing fact policy: {preferences.missing_fact_policy}",
            f"Low confidence policy: {preferences.low_confidence_policy}",
        ]

    def _generated_prompt(
        self, sources: list[PromptContextSource], preference_summary: list[str]
    ) -> str:
        rule_lines = "\n".join(f"- {rule}" for rule in SYSTEM_RULES)
        preference_lines = "\n".join(f"- {item}" for item in preference_summary)
        source_lines = "\n".join(
            (
                f"- {source.source_ref} [{source.category}] "
                f"{source.label}: {source.value}"
            )
            for source in sources
        )
        if not source_lines:
            source_lines = "- No saved user sources are available yet."
        return (
            "JobFlow local application assistant context.\n\n"
            "Rules:\n"
            f"{rule_lines}\n\n"
            "Preferences:\n"
            f"{preference_lines}\n\n"
            "Allowed sources:\n"
            f"{source_lines}"
        )

    def _add(
        self,
        sources: list[PromptContextSource],
        source_ref: str,
        category: str,
        label: str,
        value: Any,
        sensitive: bool = False,
    ) -> None:
        rendered = self._string_value(value)
        if not rendered:
            return
        sources.append(
            PromptContextSource(
                source_ref=source_ref,
                category=category,
                label=label,
                value=self._truncate(rendered),
                sensitive=sensitive,
            )
        )

    def _string_value(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, bool):
            return self._yes_no(value)
        if isinstance(value, (int, float)):
            return str(value)
        return str(value).strip()

    def _truncate(self, value: str, max_chars: int = 240) -> str:
        if len(value) <= max_chars:
            return value
        return f"{value[: max_chars - 1].rstrip()}..."

    def _yes_no(self, value: bool) -> str:
        return "Yes" if value else "No"

    def _looks_sensitive(self, key: str) -> bool:
        normalized = key.lower()
        return any(
            term in normalized
            for term in [
                "salary",
                "compensation",
                "relocation",
                "visa",
                "sponsorship",
                "authorization",
            ]
        )
