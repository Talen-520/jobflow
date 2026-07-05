from app.models.schemas import (
    ChatAdjustRequest,
    FillPlan,
    FillPlanItem,
    Preferences,
    UserProfile,
)
from app.services.chat_adjustment import ChatAdjustmentService


def test_chat_adjustment_shortens_review_item() -> None:
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="motivation",
                value=" ".join(f"word{i}" for i in range(60)),
                needs_review=True,
                source_refs=["answer_bank.default"],
            )
        ]
    )

    result = ChatAdjustmentService().adjust(
        ChatAdjustRequest(message="make it shorter", current_plan=plan),
        UserProfile(),
        Preferences(),
    )

    assert result.command == "shorten"
    assert result.updated_plan is not None
    item = result.updated_plan.items[0]
    assert item.needs_review is True
    assert len(str(item.value).split()) == 30
    assert item.source_refs == ["answer_bank.default"]


def test_chat_adjustment_leaves_target_blank() -> None:
    plan = FillPlan(
        items=[
            FillPlanItem(field_id="salary", value="120000", needs_review=True),
            FillPlanItem(field_id="email", value="tao@example.com"),
        ]
    )

    result = ChatAdjustmentService().adjust(
        ChatAdjustRequest(
            field_id="salary",
            message="leave this blank",
            current_plan=plan,
        ),
        UserProfile(),
        Preferences(),
    )

    assert result.command == "leave_blank"
    assert result.updated_plan is not None
    item = result.updated_plan.items[0]
    assert item.field_id == "salary"
    assert item.action == "skip"
    assert item.value == ""
    assert item.needs_review is False
