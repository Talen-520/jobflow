from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

from app.adapters.dedicated import DedicatedAdapterConfig, DedicatedApplicationAdapter


class AshbyAdapter(DedicatedApplicationAdapter):
    name = "ashby"
    config = DedicatedAdapterConfig(
        name=name,
        root_selectors=(".ashby-application-form", "form", "[role='tabpanel']"),
        field_container_selector=(
            ".ashby-application-form-field-entry, [data-field-path]"
        ),
        id_aliases={
            "_systemfield_name": "name",
            "_systemfield_email": "email",
            "_systemfield_resume": "resume",
        },
        field_labels={"name": "Full name"},
        id_attrs=("data-field-path", "name", "id"),
        selector_attrs=("data-field-path",),
        ignore_tokens=("g-recaptcha", "h-captcha", "captcha-response"),
        title_selectors=("h1",),
        success_phrases=("application submitted successfully", "thanks for applying"),
        success_url_tokens=("/application/submitted", "/application/success"),
    )

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "ashbyhq.com" in url or "jobs.ashbyhq.com" in url:
            return True
        content = (await page.content()).lower()
        return "ashby" in content or "__ashby" in content

    async def resolve_context(self, page):
        page_url = getattr(page, "url", "").lower()
        if "jobs.ashbyhq.com" in page_url:
            return await self._ensure_application_page(page)
        for frame in getattr(page, "frames", []):
            if "jobs.ashbyhq.com" in getattr(frame, "url", "").lower():
                return await self._ensure_application_page(frame)
        return page

    async def _ensure_application_page(self, context):
        url = getattr(context, "url", "")
        parsed = urlsplit(url)
        if "/application" in parsed.path.lower() or not hasattr(context, "goto"):
            return context
        application_url = urlunsplit(
            (
                parsed.scheme,
                parsed.netloc,
                f"{parsed.path.rstrip('/')}/application",
                parsed.query,
                "",
            )
        )
        await context.goto(application_url, wait_until="domcontentloaded")
        return context
