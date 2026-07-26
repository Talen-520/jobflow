from __future__ import annotations

from app.adapters.dedicated import DedicatedAdapterConfig, DedicatedApplicationAdapter


class OracleAdapter(DedicatedApplicationAdapter):
    name = "oracle"
    config = DedicatedAdapterConfig(
        name=name,
        root_selectors=(
            "quick-email-verification-form",
            "[data-page]",
            "main",
            "form",
        ),
        field_container_selector=".input-row, [data-automation-id^='formField'], form",
        id_aliases={
            "primary-email": "email",
            "primary-email-0": "email",
        },
        id_attrs=("data-automation-id", "name", "id"),
        selector_attrs=("name", "data-automation-id"),
        ignore_tokens=(
            "honey-pot",
            "honeypot",
            "g-recaptcha",
            "h-captcha",
            "captcha-response",
            "oda-work-summary",
            "beecatcher",
        ),
        title_selectors=("[data-automation-id='jobTitle']", "h1", "h2"),
        success_phrases=("your application was submitted", "application has been received"),
        success_url_tokens=("/apply/confirmation", "/candidate-experience/confirmation"),
    )

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "oraclecloud.com" in url or "taleo.net" in url or "/demo/oracle/" in url:
            return True
        content = (await page.content()).lower()
        return (
            "oracle recruiting" in content
            or "oracle-recruiting" in content
            or "taleo" in content
            or "oraclecloud" in content
        )
