import pytest

from app.models.schemas import (
    BlockedItem,
    FieldType,
    FillPlan,
    FillPlanItem,
    FillPlanReviewRequest,
    FormField,
    FormSchema,
)
from app.services.fill_plan_review import FillPlanReviewService


def test_review_accepts_source_backed_item_for_safe_fill() -> None:
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="motivation",
                value="Built local AI tools.",
                selector="#motivation",
                confidence=0.72,
                needs_review=True,
                source_refs=["experience_facts.fact_automation"],
                reason="Drafted only from user-provided facts; review required.",
            )
        ]
    )

    result = FillPlanReviewService().review(
        FillPlanReviewRequest(
            field_id="motivation",
            decision="accept",
            current_plan=plan,
        )
    )

    item = result.updated_plan.items[0]
    assert item.needs_review is False
    assert item.confidence == 0.95
    assert item.source_refs == ["experience_facts.fact_automation"]
    assert "accepted" in item.reason


def test_review_converts_blocked_field_to_user_provided_item() -> None:
    plan = FillPlan(
        blocked_items=[
            BlockedItem(
                field_id="salary",
                reason="Sensitive field requires user confirmation",
            )
        ]
    )
    form = FormSchema(
        fields=[
            FormField(
                field_id="salary",
                label="Desired salary",
                type=FieldType.text,
                selector="#salary",
            )
        ]
    )

    result = FillPlanReviewService().review(
        FillPlanReviewRequest(
            field_id="salary",
            decision="edit",
            value="$120,000 base",
            current_plan=plan,
            form=form,
        )
    )

    assert result.updated_plan.blocked_items == []
    item = result.updated_plan.items[0]
    assert item.field_id == "salary"
    assert item.value == "$120,000 base"
    assert item.selector == "#salary"
    assert item.confidence == 1.0
    assert item.needs_review is False
    assert item.source_refs == ["user.review.salary"]


def test_review_can_leave_item_blank() -> None:
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="optional",
                value="Maybe",
                selector="#optional",
                needs_review=True,
                source_refs=["answer_bank.answer_optional"],
            )
        ]
    )

    result = FillPlanReviewService().review(
        FillPlanReviewRequest(
            field_id="optional",
            decision="leave_blank",
            current_plan=plan,
        )
    )

    item = result.updated_plan.items[0]
    assert item.action == "skip"
    assert item.value == ""
    assert item.selector == "#optional"
    assert item.needs_review is False
    assert item.source_refs == []
    assert result.updated_plan.blocked_items == []


def test_review_rejects_accepting_blocked_field_without_value() -> None:
    plan = FillPlan(
        blocked_items=[
            BlockedItem(field_id="sponsorship", reason="Missing sensitive fact")
        ]
    )

    with pytest.raises(ValueError):
        FillPlanReviewService().review(
            FillPlanReviewRequest(
                field_id="sponsorship",
                decision="accept",
                current_plan=plan,
            )
        )
