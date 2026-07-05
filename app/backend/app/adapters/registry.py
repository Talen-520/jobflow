from __future__ import annotations

from app.adapters.base import ApplicationAdapter
from app.adapters.ashby import AshbyAdapter
from app.adapters.generic import GenericFormAdapter
from app.adapters.greenhouse import GreenhouseAdapter
from app.adapters.lever import LeverAdapter
from app.adapters.oracle import OracleAdapter
from app.adapters.workday import WorkdayAdapter


class AdapterRegistry:
    def __init__(self) -> None:
        self.adapters: list[ApplicationAdapter] = [
            GreenhouseAdapter(),
            LeverAdapter(),
            AshbyAdapter(),
            WorkdayAdapter(),
            OracleAdapter(),
            GenericFormAdapter(),
        ]

    async def select_for_page(self, page) -> ApplicationAdapter:
        for adapter in self.adapters:
            if await adapter.detect(page):
                return adapter
        return self.adapters[-1]
