from __future__ import annotations

from app.adapters.base import ApplicationAdapter
from app.models.schemas import (
    FillPlan,
    FillResult,
    FormSchema,
    SuccessDetectionRequest,
    SuccessDetectionResult,
)
from app.services.form_extraction import FormExtractionService
from app.services.safe_fill import SafeFillExecutor
from app.services.success_detection import SuccessDetectionService


class GenericFormAdapter(ApplicationAdapter):
    name = "generic"

    async def detect(self, page) -> bool:
        return True

    async def extract_form(self, page) -> FormSchema:
        html = await page.content()
        url = getattr(page, "url", "")
        return FormExtractionService().extract_from_html(html, url=url, ats=self.name)

    async def apply_fill_plan(
        self,
        page,
        plan: FillPlan,
        form: FormSchema | None = None,
        dry_run: bool = False,
    ) -> FillResult:
        executor = SafeFillExecutor()
        if dry_run:
            return executor.preview(plan)
        return await executor.apply(page, plan, form)

    async def detect_success(self, page) -> SuccessDetectionResult:
        html = await page.content()
        url = getattr(page, "url", "")
        return SuccessDetectionService().detect(
            SuccessDetectionRequest(url=url, html=html, ats=self.name)
        )
