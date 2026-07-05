from __future__ import annotations

from app.adapters.generic import GenericFormAdapter


class OracleAdapter(GenericFormAdapter):
    name = "oracle"

    async def detect(self, page) -> bool:
        url = getattr(page, "url", "").lower()
        if "oraclecloud.com" in url or "taleo.net" in url:
            return True
        content = (await page.content()).lower()
        return "oracle recruiting" in content or "taleo" in content or "oraclecloud" in content
