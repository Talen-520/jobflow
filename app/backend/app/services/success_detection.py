from __future__ import annotations

import re
from datetime import date

from app.models.schemas import (
    ApplicationRecord,
    SuccessDetection,
    SuccessDetectionRequest,
    SuccessDetectionResult,
)


SUCCESS_PHRASES = [
    "application submitted",
    "successfully applied",
    "thank you for applying",
    "thanks for applying",
    "application received",
    "we received your application",
]


class SuccessDetectionService:
    def __init__(
        self,
        extra_phrases: tuple[str, ...] = (),
        url_tokens: tuple[str, ...] = (),
        signal_prefix: str = "",
    ) -> None:
        self.extra_phrases = extra_phrases
        self.url_tokens = url_tokens
        self.signal_prefix = signal_prefix

    def detect(self, request: SuccessDetectionRequest) -> SuccessDetectionResult:
        text = self._visible_text(request.html)
        signals: list[str] = []
        for phrase in SUCCESS_PHRASES:
            if phrase in text:
                signals.append(f"text:{phrase}")
        if any(token in request.url.lower() for token in ["confirmation", "success", "submitted"]):
            signals.append("url:success-token")

        for phrase in self.extra_phrases:
            if phrase.lower() in text:
                signals.append(f"{self.signal_prefix}:text:{phrase.lower()}")
        if any(token.lower() in request.url.lower() for token in self.url_tokens):
            signals.append(f"{self.signal_prefix}:url:success-token")

        confidence = min(1.0, 0.35 * len(signals))
        detected = confidence >= 0.35
        record = None
        if detected:
            record = ApplicationRecord(
                company_name=request.company_name_hint or self._guess_company(request.html),
                job_title=request.job_title_hint or self._guess_title(request.html),
                application_date=date.today(),
                job_url=request.url,
                ats=request.ats,
                status="applied",
                success_detection=SuccessDetection(confidence=confidence, signals=signals),
            )
        return SuccessDetectionResult(
            detected=detected,
            confidence=confidence,
            signals=signals,
            proposed_record=record,
        )

    def _visible_text(self, html: str) -> str:
        without_tags = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s+", " ", without_tags).strip().lower()

    def _guess_title(self, html: str) -> str:
        match = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
        return self._clean(match.group(1)) if match else ""

    def _guess_company(self, html: str) -> str:
        match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if not match:
            return ""
        title = self._clean(match.group(1))
        if " - " in title:
            return title.split(" - ")[-1].strip()
        return ""

    def _clean(self, value: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value)).strip()
