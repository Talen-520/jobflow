from __future__ import annotations

from app.adapters.generic import GenericFormAdapter


class WorkdayAdapter(GenericFormAdapter):
    name = "workday"

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "myworkdayjobs.com" in url or "workdayjobs.com" in url:
            return True
        content = (await page.content()).lower()
        return "workday" in content or "wd-" in content
