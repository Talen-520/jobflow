from __future__ import annotations

from app.adapters.generic import GenericFormAdapter


class AshbyAdapter(GenericFormAdapter):
    name = "ashby"

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "ashbyhq.com" in url or "jobs.ashbyhq.com" in url:
            return True
        content = (await page.content()).lower()
        return "ashby" in content or "__ashby" in content
