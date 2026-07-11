import asyncio

from app.models.schemas import (
    BlockedItem,
    FieldType,
    FillPlan,
    FillPlanItem,
    FormField,
    FormSchema,
)
from app.services.safe_fill import SafeFillExecutor


class FakeLocator:
    def __init__(
        self,
        selector: str,
        writes: dict[str, object],
        read_overrides: dict[str, object],
    ) -> None:
        self.selector = selector
        self.writes = writes
        self.read_overrides = read_overrides

    async def fill(self, value: str) -> None:
        self.writes[self.selector] = value

    async def select_option(self, value: str) -> None:
        self.writes[self.selector] = value

    async def set_checked(self, value: bool) -> None:
        self.writes[self.selector] = value

    async def set_input_files(self, value: str) -> None:
        self.writes[self.selector] = value

    async def input_value(self) -> str:
        value = self.read_overrides.get(self.selector, self.writes.get(self.selector, ""))
        return str(value)

    async def is_checked(self) -> bool:
        value = self.read_overrides.get(self.selector, self.writes.get(self.selector, False))
        return bool(value)


class FakePage:
    def __init__(self, read_overrides: dict[str, object] | None = None) -> None:
        self.writes: dict[str, object] = {}
        self.read_overrides = read_overrides or {}

    def locator(self, selector: str) -> FakeLocator:
        return FakeLocator(selector, self.writes, self.read_overrides)


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
            FillPlanItem(
                field_id="authorized",
                action="select",
                value="Yes",
                confidence=0.95,
                source_refs=["profile.work_authorization.authorized"],
            ),
            FillPlanItem(
                field_id="newsletter",
                action="check",
                value=True,
                confidence=0.95,
                source_refs=["user.review.newsletter"],
            ),
            FillPlanItem(
                field_id="authorized_radio",
                action="select",
                value="Yes",
                confidence=0.95,
                source_refs=["profile.work_authorization.authorized"],
            ),
        ],
        blocked_items=[BlockedItem(field_id="sponsorship", reason="Sensitive field")],
    )
    form = FormSchema(
        fields=[
            FormField(field_id="email", selector="#email"),
            FormField(field_id="motivation", selector="#motivation"),
            FormField(field_id="resume", selector="#resume"),
            FormField(field_id="authorized", selector="#authorized"),
            FormField(field_id="newsletter", selector="#newsletter"),
            FormField(
                field_id="authorized_radio",
                type=FieldType.radio,
                selector='[name="authorized"]',
            ),
        ]
    )

    result = asyncio.run(SafeFillExecutor().apply(page, plan, form))

    assert result.status == "applied"
    assert result.filled_count == 5
    assert result.review_count == 2
    assert page.writes == {
        "#email": "tao@example.com",
        "#resume": "/tmp/resume.pdf",
        "#authorized": "Yes",
        "#newsletter": True,
        '[name="authorized"][value="Yes"]': True,
    }


def test_safe_fill_reports_error_when_browser_value_does_not_match() -> None:
    page = FakePage(read_overrides={"#email": "wrong@example.com"})
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="email",
                action="fill",
                value="tao@example.com",
                confidence=0.98,
                source_refs=["profile.identity.email"],
            )
        ]
    )
    form = FormSchema(fields=[FormField(field_id="email", selector="#email")])

    result = asyncio.run(SafeFillExecutor().apply(page, plan, form))

    assert result.status == "error"
    assert result.filled_count == 0
    assert result.error_count == 1
    assert result.items[0].field_id == "email"
    assert result.items[0].status == "error"
    assert "did not match" in result.items[0].reason
