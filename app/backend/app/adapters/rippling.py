from __future__ import annotations

import re

from app.adapters.dedicated import DedicatedAdapterConfig, DedicatedApplicationAdapter


class RipplingAdapter(DedicatedApplicationAdapter):
    name = "rippling"
    config = DedicatedAdapterConfig(
        name=name,
        root_selectors=("form", "main", "body"),
        field_container_selector="fieldset, [class*='field'], form, main",
        id_aliases={
            "input-resume": "resume",
            "input-first_name": "first_name",
            "input-last_name": "last_name",
            "input-email": "email",
            "input-current_company": "company",
            "input-phone_number": "phone",
            "input-undefined": "location",
            "input-cover_letter": "cover_letter",
            "radio-sms_opt_in": "sms_opt_in",
        },
        field_labels={
            "resume": "Resume",
            "first_name": "First name",
            "last_name": "Last name",
            "email": "Email",
            "phone": "Phone number",
            "location": "Location",
        },
        id_attrs=("data-testid", "name", "id"),
        selector_attrs=("data-testid",),
        ignore_tokens=(
            "captcha-response",
            "g-recaptcha",
            "h-captcha",
            "externalplaceid",
            "aioptout",
        ),
        title_selectors=("main h1", "h1", "h2"),
        success_phrases=(
            "your application has been submitted",
            "application submitted successfully",
            "thanks for applying",
        ),
        success_url_tokens=("/application-submitted", "/confirmation", "/success"),
    )

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "ats.rippling.com" in url or "/demo/rippling/" in url:
            return True
        content = (await page.content()).lower()
        return "data-testid=\"input-first_name\"" in content and "rippling" in content

    async def extract_form(self, page):
        form = await super().extract_form(page)
        normalized_fields = []
        seen: set[str] = set()
        for field in form.fields:
            normalized = self._canonical_field_id(field.field_id, field.label)
            if not normalized or normalized in seen:
                continue
            field.field_id = normalized
            seen.add(normalized)
            normalized_fields.append(field)
        form.fields = normalized_fields
        return form

    def _canonical_field_id(self, field_id: str, label: str) -> str:
        normalized_label = " ".join(str(label).lower().split())
        if re.search(r"\bpronouns?\b", normalized_label):
            return "pronouns"
        if re.search(r"\brace\b", normalized_label):
            return "race"
        if "hispanic" in normalized_label or "latino" in normalized_label:
            return "hispanic_latino"
        if re.search(r"\bgender\b", normalized_label):
            return "gender"
        if re.search(r"\bveteran\b", normalized_label):
            return "veteran_status"
        if re.search(r"\bdisability\b", normalized_label):
            return "disability_status"
        if normalized_label.startswith("location"):
            return "location"
        if field_id == "input-select-search-input" and normalized_label == "search":
            return ""
        return field_id
