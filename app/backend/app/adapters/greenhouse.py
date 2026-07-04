from __future__ import annotations

from app.adapters.generic import GenericFormAdapter


class GreenhouseAdapter(GenericFormAdapter):
    name = "greenhouse"

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "greenhouse" in url or "boards.greenhouse.io" in url:
            return True
        content = (await page.content()).lower()
        return "greenhouse" in content
