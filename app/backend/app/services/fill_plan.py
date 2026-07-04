from __future__ import annotations

import re

from app.models.schemas import (
    BlockedItem,
    FieldType,
    FillPlan,
    FillPlanItem,
    FormField,
    FormSchema,
    Preferences,
    UserProfile,
)
from app.tools.profile_tools import ProfileTools, ToolResult


SENSITIVE_TERMS = [
    "gender",
    "race",
    "ethnicity",
    "veteran",
    "disability",
    "sponsorship",
    "visa",
    "authorization",
    "authorized",
    "salary",
    "compensation",
    "birth",
    "ssn",
]


class FillPlanService:
    def create_plan(
        self, form: FormSchema, profile: UserProfile, preferences: Preferences
    ) -> FillPlan:
        tools = ProfileTools(profile, preferences)
        plan = FillPlan()
        for field in form.fields:
            item = self._map_field(field, tools, preferences)
            if isinstance(item, BlockedItem):
                plan.blocked_items.append(item)
            else:
                plan.items.append(item)
        return plan

    def _map_field(
        self, field: FormField, tools: ProfileTools, preferences: Preferences
    ) -> FillPlanItem | BlockedItem:
        label = self._field_text(field)
        if self._is_eeo(label) and not preferences.fill_eeo_fields:
            return BlockedItem(field_id=field.field_id, reason="EEO field disabled")
        if self._is_sensitive(label) and not preferences.fill_sensitive_fields:
            sensitive_item = self._map_sensitive_field(field, tools, label)
            if sensitive_item:
                sensitive_item.needs_review = True
                return sensitive_item
            return BlockedItem(
                field_id=field.field_id,
                reason="Sensitive field requires user confirmation",
            )

        direct = self._direct_profile_mapping(label, tools)
        if direct:
            return self._item(field, direct, "Mapped from profile field.")

        if field.type == FieldType.file:
            return self._map_document(field, tools.profile)

        if field.type == FieldType.textarea or self._is_open_question(label):
            return self._map_open_question(field, tools, label)

        if field.required:
            return BlockedItem(
                field_id=field.field_id,
                reason="Required field has no matching user-provided fact",
            )
        return FillPlanItem(
            field_id=field.field_id,
            action="skip",
            value="",
            selector=field.selector,
            confidence=0.4,
            needs_review=True,
            reason="Optional field without a confident source.",
        )

    def _direct_profile_mapping(
        self, label: str, tools: ProfileTools
    ) -> ToolResult | None:
        rules = [
            (r"\bfirst\b.*\bname\b", "identity.first_name"),
            (r"\blast\b.*\bname\b", "identity.last_name"),
            (r"\bpreferred\b.*\bname\b", "identity.preferred_name"),
            (r"\bfull\b.*\bname\b", None),
            (r"\bemail\b", "identity.email"),
            (r"\bphone\b|\bmobile\b", "identity.phone"),
            (r"\blocation\b|\bcity\b", "identity.location"),
            (r"\baddress\b", "identity.address"),
            (r"\blinkedin\b", "links.linkedin"),
            (r"\bgithub\b", "links.github"),
            (r"\bportfolio\b|\bwebsite\b", "links.portfolio"),
        ]
        for pattern, path in rules:
            if re.search(pattern, label):
                if path is None:
                    first = tools.get_profile_field("identity.first_name")
                    last = tools.get_profile_field("identity.last_name")
                    if first and last:
                        return ToolResult(
                            value=f"{first.value} {last.value}",
                            source_ref="profile.identity.first_name+profile.identity.last_name",
                            confidence=0.95,
                        )
                    return None
                return tools.get_profile_field(path)
        return None

    def _map_sensitive_field(
        self, field: FormField, tools: ProfileTools, label: str
    ) -> FillPlanItem | None:
        if "sponsorship" in label or "visa" in label:
            result = tools.get_profile_field("work_authorization.requires_sponsorship")
            if result:
                return self._item(field, result, "Sensitive work authorization fact.")
        if "authorized" in label or "authorization" in label:
            result = tools.get_profile_field("work_authorization.authorized")
            if result:
                return self._item(field, result, "Sensitive work authorization fact.")
        return None

    def _map_document(self, field: FormField, profile: UserProfile) -> FillPlanItem | BlockedItem:
        label = self._field_text(field)
        preferred = "cover_letter" if "cover" in label else "resume"
        for document in profile.documents:
            if document.kind == preferred:
                return FillPlanItem(
                    field_id=field.field_id,
                    action="upload",
                    value=document.path,
                    selector=field.selector,
                    confidence=0.9,
                    source_refs=[f"profile.documents.{document.id}"],
                    reason=f"Using {preferred} document from local vault.",
                )
        return BlockedItem(field_id=field.field_id, reason=f"Missing {preferred} document")

    def _map_open_question(
        self, field: FormField, tools: ProfileTools, label: str
    ) -> FillPlanItem | BlockedItem:
        question_type = self._classify_open_question(label)
        keywords = [word for word in re.split(r"\W+", label) if len(word) > 3]
        answers = tools.search_answer_bank(question_type, keywords)
        if answers:
            answer = answers[0]
            return FillPlanItem(
                field_id=field.field_id,
                action="fill",
                value=answer.value,
                selector=field.selector,
                confidence=answer.confidence,
                needs_review=True,
                source_refs=[answer.source_ref],
                reason="Open-ended answer from answer bank; review required.",
            )
        facts = tools.search_profile_facts(label)
        if facts:
            joined = " ".join(result.value for result in facts[:3])
            return FillPlanItem(
                field_id=field.field_id,
                action="fill",
                value=joined,
                selector=field.selector,
                confidence=0.72,
                needs_review=True,
                source_refs=[result.source_ref for result in facts[:3]],
                reason="Drafted only from user-provided facts; review required.",
            )
        return BlockedItem(
            field_id=field.field_id,
            reason="Open-ended question needs answer bank or profile facts",
        )

    def _item(self, field: FormField, result: ToolResult, reason: str) -> FillPlanItem:
        action = "select" if field.type in {FieldType.select, FieldType.radio} else "fill"
        if field.type == FieldType.checkbox:
            action = "check"
        return FillPlanItem(
            field_id=field.field_id,
            action=action,
            value=result.value,
            selector=field.selector,
            confidence=result.confidence,
            needs_review=result.confidence < 0.85,
            source_refs=[result.source_ref],
            reason=reason,
        )

    def _field_text(self, field: FormField) -> str:
        return " ".join(
            [field.label, field.placeholder, field.helper_text, field.field_id]
        ).strip().lower()

    def _is_sensitive(self, text: str) -> bool:
        return any(term in text for term in SENSITIVE_TERMS)

    def _is_eeo(self, text: str) -> bool:
        return any(term in text for term in ["gender", "race", "ethnicity", "veteran", "disability"])

    def _is_open_question(self, text: str) -> bool:
        return any(
            phrase in text
            for phrase in [
                "why",
                "tell us",
                "describe",
                "cover letter",
                "additional information",
                "anything else",
            ]
        )

    def _classify_open_question(self, text: str) -> str:
        if "why" in text and "role" in text:
            return "motivation"
        if "company" in text:
            return "company_interest"
        if "cover" in text:
            return "cover_letter"
        if "achievement" in text:
            return "achievement"
        return "general"
