from __future__ import annotations

from app.adapters.dedicated import DedicatedAdapterConfig, DedicatedApplicationAdapter


class WorkdayAdapter(DedicatedApplicationAdapter):
    name = "workday"
    config = DedicatedAdapterConfig(
        name=name,
        root_selectors=(
            "[data-automation-id='applyFlowPage']",
            "[data-automation-id='jobApplicationPage']",
            "main",
            "form",
        ),
        field_container_selector="[data-automation-id^='formField'], form",
        id_attrs=("data-automation-id", "name", "id"),
        selector_attrs=("data-automation-id",),
        ignore_tokens=("beecatcher", "g-recaptcha", "h-captcha", "captcha-response"),
        title_selectors=("[data-automation-id='jobTitleHeading']", "h1", "h2"),
        success_phrases=(
            "you've successfully submitted your application",
            "your application has been submitted",
        ),
        success_url_tokens=("/apply/confirmation", "/apply/success"),
    )

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if (
            "myworkdayjobs.com" in url
            or "workdayjobs.com" in url
            or "/demo/workday/" in url
        ):
            return True
        content = (await page.content()).lower()
        return (
            "workday" in content
            or "wd-" in content
            or "data-automation-id=\"applyflowpage\"" in content
            or "data-automation-id='applyflowpage'" in content
            or "data-automation-id=\"jobapplicationpage\"" in content
        )
