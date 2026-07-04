from __future__ import annotations

from app.adapters.generic import GenericFormAdapter


class LeverAdapter(GenericFormAdapter):
    name = "lever"

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "lever.co" in url:
            return True
        content = (await page.content()).lower()
        return "lever" in content
