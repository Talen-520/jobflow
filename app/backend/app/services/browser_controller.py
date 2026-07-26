from __future__ import annotations

from typing import Any

from app.adapters.ashby import AshbyAdapter
from app.adapters.dedicated import DedicatedHTMLFormExtractionService
from app.adapters.greenhouse import GreenhouseAdapter
from app.adapters.oracle import OracleAdapter
from app.adapters.workday import WorkdayAdapter
from app.models.schemas import (
    BrowserState,
    FillPlan,
    FillResult,
    FormSchema,
    SuccessDetectionRequest,
    SuccessDetectionResult,
)
from app.services.extension_bridge import ExtensionBridge
from app.services.form_extraction import FormExtractionService
from app.services.success_detection import SuccessDetectionService


DEDICATED_CONFIGS = {
    adapter.config.name: adapter.config
    for adapter in (GreenhouseAdapter, AshbyAdapter, OracleAdapter, WorkdayAdapter)
}


class BrowserController:
    def __init__(self, bridge: ExtensionBridge | None = None) -> None:
        self.bridge = bridge or ExtensionBridge()
        self._current_snapshot: dict[str, Any] | None = None
        self._current_form: FormSchema | None = None

    async def start(self) -> BrowserState:
        if self.bridge.connected:
            return BrowserState(
                status="connected",
                url=self.bridge.url,
                message="Chrome extension is connected to the active tab.",
            )
        return BrowserState(
            status="not_started",
            message="Open the JobFlow Chrome extension on the application tab.",
        )

    async def stop(self) -> BrowserState:
        if self.bridge.connected:
            try:
                await self.bridge.request("disconnect", timeout=2.0)
            except (RuntimeError, TimeoutError):
                pass
        self.bridge.detach()
        self._current_snapshot = None
        self._current_form = None
        return BrowserState(status="stopped")

    async def open(self, url: str) -> BrowserState:
        await self.bridge.request("navigate", {"url": url})
        return BrowserState(
            status="opened",
            url=url,
            message=(
                "Chrome navigated to the requested page. Reconnect the extension if the site origin changed."
            ),
        )

    async def inspect(self) -> FormSchema:
        payload = await self.bridge.request("snapshot")
        snapshots = payload.get("snapshots") or []
        if not isinstance(snapshots, list) or not snapshots:
            raise RuntimeError("The connected Chrome tab did not return a page snapshot.")
        snapshot, form = self._best_snapshot(snapshots)
        self._current_snapshot = snapshot
        self._current_form = form
        self.bridge.url = form.url
        self.bridge.captcha_detected = bool(snapshot.get("captcha_detected", False))
        return form

    async def apply_fill_plan(
        self, plan: FillPlan, form: FormSchema | None = None, dry_run: bool = False
    ) -> FillResult:
        if dry_run:
            from app.services.safe_fill import SafeFillExecutor

            return SafeFillExecutor().preview(plan)
        active_form = form or self._current_form
        if active_form is None:
            raise RuntimeError("Inspect the connected Chrome tab before filling.")
        payload = await self.bridge.request(
            "fill_plan",
            {
                "plan": plan.model_dump(mode="json"),
                "form": active_form.model_dump(mode="json"),
            },
            timeout=45.0,
        )
        return FillResult.model_validate(payload.get("result") or payload)

    async def detect_success(
        self, company_name_hint: str = "", job_title_hint: str = "", ats: str = "generic"
    ) -> SuccessDetectionResult:
        payload = await self.bridge.request("snapshot")
        snapshots = payload.get("snapshots") or []
        if not isinstance(snapshots, list) or not snapshots:
            raise RuntimeError("The connected Chrome tab did not return a page snapshot.")
        snapshot, form = self._best_snapshot(snapshots)
        resolved_ats = ats if ats != "generic" else form.ats
        config = DEDICATED_CONFIGS.get(resolved_ats)
        service = SuccessDetectionService(
            extra_phrases=config.success_phrases if config else (),
            url_tokens=config.success_url_tokens if config else (),
            signal_prefix=resolved_ats if config else "",
        )
        result = service.detect(
            SuccessDetectionRequest(
                url=str(snapshot.get("url") or form.url),
                html=str(snapshot.get("html") or ""),
                ats=resolved_ats,
                company_name_hint=company_name_hint or form.company_name_hint,
                job_title_hint=job_title_hint or form.job_title_hint,
            )
        )
        return result

    @property
    def current_url(self) -> str:
        return self.bridge.url

    def _best_snapshot(
        self, snapshots: list[dict[str, Any]]
    ) -> tuple[dict[str, Any], FormSchema]:
        candidates: list[tuple[int, dict[str, Any], FormSchema]] = []
        for snapshot in snapshots:
            if not isinstance(snapshot, dict):
                continue
            form_payload = snapshot.get("form")
            try:
                form = (
                    FormSchema.model_validate(form_payload)
                    if isinstance(form_payload, dict)
                    else self._extract_html_snapshot(snapshot)
                )
            except (TypeError, ValueError):
                continue
            score = len(form.fields) * 10 + (50 if form.ats in DEDICATED_CONFIGS else 0)
            candidates.append((score, snapshot, form))
        if not candidates:
            raise RuntimeError("No supported application form was found in the connected tab.")
        _, snapshot, form = max(candidates, key=lambda candidate: candidate[0])
        return snapshot, form

    def _extract_html_snapshot(self, snapshot: dict[str, Any]) -> FormSchema:
        html = str(snapshot.get("html") or "")
        url = str(snapshot.get("url") or "")
        generic = FormExtractionService().extract_from_html(html, url=url)
        config = DEDICATED_CONFIGS.get(generic.ats)
        if config is None:
            return generic
        return DedicatedHTMLFormExtractionService(config).extract_from_html(
            html, url=url, ats=config.name
        )
