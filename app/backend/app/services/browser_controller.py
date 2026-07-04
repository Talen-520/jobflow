from __future__ import annotations

from pathlib import Path

from app.adapters.registry import AdapterRegistry
from app.core.config import settings
from app.models.schemas import (
    BrowserState,
    FillPlan,
    FillResult,
    FormSchema,
    SuccessDetectionRequest,
    SuccessDetectionResult,
)
from app.services.safe_fill import SafeFillExecutor
from app.services.success_detection import SuccessDetectionService


class BrowserController:
    def __init__(
        self,
        user_data_path: Path | None = None,
        headless: bool | None = None,
    ) -> None:
        self.user_data_path = user_data_path or settings.browser_user_data_path
        self.headless = settings.browser_headless if headless is None else headless
        self._playwright = None
        self._context = None
        self._page = None

    async def start(self) -> BrowserState:
        if self._context is not None:
            return BrowserState(status="started", url=self.current_url)
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            return BrowserState(
                status="error",
                message=f"Playwright is not installed: {exc}",
            )
        self.user_data_path.mkdir(parents=True, exist_ok=True)
        self._playwright = await async_playwright().start()
        self._context = await self._playwright.chromium.launch_persistent_context(
            user_data_dir=str(self.user_data_path),
            headless=self.headless,
            viewport={"width": 1440, "height": 960},
        )
        self._page = self._context.pages[0] if self._context.pages else await self._context.new_page()
        return BrowserState(status="started", url=self.current_url)

    async def stop(self) -> BrowserState:
        if self._context is not None:
            await self._context.close()
        if self._playwright is not None:
            await self._playwright.stop()
        self._context = None
        self._page = None
        self._playwright = None
        return BrowserState(status="stopped")

    async def open(self, url: str) -> BrowserState:
        state = await self.start()
        if state.status == "error":
            return state
        assert self._page is not None
        await self._page.goto(url, wait_until="domcontentloaded")
        return BrowserState(status="opened", url=self.current_url)

    async def inspect(self) -> FormSchema:
        page = self.require_page()
        adapter = await AdapterRegistry().select_for_page(page)
        return await adapter.extract_form(page)

    async def apply_fill_plan(
        self, plan: FillPlan, form: FormSchema | None = None, dry_run: bool = False
    ) -> FillResult:
        executor = SafeFillExecutor()
        if dry_run:
            return executor.preview(plan)
        page = self.require_page()
        return await executor.apply(page, plan, form)

    async def detect_success(
        self, company_name_hint: str = "", job_title_hint: str = "", ats: str = "generic"
    ) -> SuccessDetectionResult:
        page = self.require_page()
        adapter = await AdapterRegistry().select_for_page(page)
        adapter_result = await adapter.detect_success(page)
        if adapter_result.detected:
            if adapter_result.proposed_record is not None:
                adapter_result.proposed_record.company_name = (
                    company_name_hint or adapter_result.proposed_record.company_name
                )
                adapter_result.proposed_record.job_title = (
                    job_title_hint or adapter_result.proposed_record.job_title
                )
            return adapter_result
        request = SuccessDetectionRequest(
            url=self.current_url,
            html=await page.content(),
            ats=ats,
            company_name_hint=company_name_hint,
            job_title_hint=job_title_hint,
        )
        return SuccessDetectionService().detect(request)

    @property
    def current_url(self) -> str:
        return getattr(self._page, "url", "") if self._page is not None else ""

    def require_page(self):
        if self._page is None:
            raise RuntimeError("Browser is not started. Call /browser/open first.")
        return self._page
