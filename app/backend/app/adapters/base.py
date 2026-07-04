from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.schemas import FillPlan, FormSchema, SuccessDetectionResult


class ApplicationAdapter(ABC):
    name = "base"

    @abstractmethod
    async def detect(self, page) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def extract_form(self, page) -> FormSchema:
        raise NotImplementedError

    async def apply_fill_plan(self, page, plan: FillPlan) -> dict[str, object]:
        return {"status": "not_implemented", "items": len(plan.items)}

    async def detect_success(self, page) -> SuccessDetectionResult:
        raise NotImplementedError
