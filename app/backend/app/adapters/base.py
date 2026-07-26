from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.schemas import FillPlan, FillResult, FormSchema, SuccessDetectionResult


class ApplicationAdapter(ABC):
    name = "base"

    @abstractmethod
    async def detect(self, page) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def extract_form(self, page) -> FormSchema:
        raise NotImplementedError

    @abstractmethod
    async def apply_fill_plan(
        self,
        page,
        plan: FillPlan,
        form: FormSchema | None = None,
        dry_run: bool = False,
    ) -> FillResult:
        raise NotImplementedError

    async def detect_success(self, page) -> SuccessDetectionResult:
        raise NotImplementedError
