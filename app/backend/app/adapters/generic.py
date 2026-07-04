from __future__ import annotations

from app.adapters.base import ApplicationAdapter
from app.models.schemas import FormSchema, SuccessDetectionRequest, SuccessDetectionResult
from app.services.form_extraction import FormExtractionService
from app.services.success_detection import SuccessDetectionService


class GenericFormAdapter(ApplicationAdapter):
    name = "generic"

    async def detect(self, page) -> bool:
        return True

    async def extract_form(self, page) -> FormSchema:
        html = await page.content()
        url = getattr(page, "url", "")
        return FormExtractionService().extract_from_html(html, url=url, ats=self.name)

    async def detect_success(self, page) -> SuccessDetectionResult:
        html = await page.content()
        url = getattr(page, "url", "")
        return SuccessDetectionService().detect(
            SuccessDetectionRequest(url=url, html=html, ats=self.name)
        )
