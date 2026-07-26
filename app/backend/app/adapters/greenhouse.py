from __future__ import annotations

from app.adapters.dedicated import DedicatedAdapterConfig, DedicatedApplicationAdapter


class GreenhouseAdapter(DedicatedApplicationAdapter):
    name = "greenhouse"
    config = DedicatedAdapterConfig(
        name=name,
        root_selectors=("#application_form", "form", "main"),
        field_container_selector="fieldset, [data-field], [class*='field']",
        id_attrs=("name", "id"),
        ignore_tokens=("g-recaptcha", "h-captcha", "honeypot", "iti-0__search-input"),
        title_selectors=("main h1", "h1"),
        success_phrases=("we've received your application", "thanks for applying to"),
        success_url_tokens=("/confirmation", "/thank-you"),
    )

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "greenhouse" in url or "boards.greenhouse.io" in url:
            return True
        content = (await page.content()).lower()
        return "greenhouse" in content
