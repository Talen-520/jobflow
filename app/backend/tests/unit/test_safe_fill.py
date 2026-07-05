import asyncio

from app.models.schemas import (
    BlockedItem,
    FillPlan,
    FillPlanItem,
    FormField,
    FormSchema,
)
from app.services.safe_fill import SafeFillExecutor


class FakeLocator:
    def __init__(self, selector: str, writes: dict[str, object]) -> None:
        self.selector = selector
        self.writes = writes

    async def fill(self, value: str) -> None:
        self.writes[self.selector] = value

    async def select_option(self, value: str) -> None:
        self.writes[self.selector] = value

    async def set_checked(self, value: bool) -> None:
        self.writes[self.selector] = value

    async def set_input_files(self, value: str) -> None:
        self.writes[self.selector] = value


class FakePage:
    def __init__(self) -> None:
        self.writes: dict[str, object] = {}

    def locator(self, selector: str) -> FakeLocator:
        return FakeLocator(selector, self.writes)


def test_safe_fill_only_writes_eligible_items() -> None:
    page = FakePage()
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="email",
                action="fill",
                value="tao@example.com",
                confidence=0.98,
                source_refs=["profile.identity.email"],
            ),
            FillPlanItem(
                field_id="motivation",
                action="fill",
                value="Review-only answer",
                confidence=0.9,
                needs_review=True,
                selector="#motivation",
                source_refs=["answer_bank.default"],
            ),
            FillPlanItem(
                field_id="optional",
                action="skip",
                value="",
                confidence=0.4,
                selector="#optional",
                source_refs=[],
            ),
            FillPlanItem(
                field_id="resume",
                action="upload",
                value="/tmp/resume.pdf",
                confidence=0.9,
                source_refs=["profile.documents.doc_resume"],
            ),
        ],
        blocked_items=[BlockedItem(field_id="sponsorship", reason="Sensitive field")],
    )
    form = FormSchema(
        fields=[
            FormField(field_id="email", selector="#email"),
            FormField(field_id="motivation", selector="#motivation"),
            FormField(field_id="resume", selector="#resume"),
        ]
    )

    result = asyncio.run(SafeFillExecutor().apply(page, plan, form))

    assert result.status == "applied"
    assert result.filled_count == 2
    assert result.review_count == 2
    assert page.writes == {"#email": "tao@example.com", "#resume": "/tmp/resume.pdf"}
