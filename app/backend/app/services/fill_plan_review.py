from __future__ import annotations

from app.models.schemas import (
    FieldType,
    FillPlan,
    FillPlanItem,
    FillPlanReviewRequest,
    FillPlanReviewResult,
    FormField,
)


class FillPlanReviewService:
    def review(self, request: FillPlanReviewRequest) -> FillPlanReviewResult:
        plan = FillPlan.model_validate(request.current_plan.model_dump(mode="json"))
        item_index = self._item_index(plan, request.field_id)
        blocked_index = self._blocked_index(plan, request.field_id)
        field = self._field(request)
        selector = self._selector(field, plan, item_index)

        if request.decision == "accept":
            if item_index is None:
                raise ValueError("Only planned review items can be accepted.")
            item = plan.items[item_index]
            item.needs_review = False
            item.confidence = max(item.confidence, 0.95)
            item.reason = self._append_reason(item.reason, "User reviewed and accepted.")
            return self._result(
                request=request,
                plan=plan,
                message=f"Accepted {request.field_id} for safe filling.",
            )

        if request.decision == "leave_blank":
            self._remove_field(plan, request.field_id)
            plan.items.append(
                FillPlanItem(
                    field_id=request.field_id,
                    action="skip",
                    value="",
                    selector=selector,
                    confidence=1.0,
                    needs_review=False,
                    reason="User chose to leave this field blank during review.",
                )
            )
            return self._result(
                request=request,
                plan=plan,
                message=f"Marked {request.field_id} as leave blank.",
            )

        if not self._has_value(request.value):
            raise ValueError("Edited review fields require a value.")

        self._remove_field(plan, request.field_id)
        plan.items.append(
            FillPlanItem(
                field_id=request.field_id,
                action=self._action(field),
                value=self._value(field, request.value),
                selector=selector,
                confidence=1.0,
                needs_review=False,
                source_refs=[f"user.review.{request.field_id}"],
                reason="User provided and approved this value during field review.",
            )
        )
        if blocked_index is not None:
            message = f"Converted blocked field {request.field_id} into a reviewed item."
        else:
            message = f"Updated reviewed value for {request.field_id}."
        return self._result(request=request, plan=plan, message=message)

    def _result(
        self, request: FillPlanReviewRequest, plan: FillPlan, message: str
    ) -> FillPlanReviewResult:
        return FillPlanReviewResult(
            field_id=request.field_id,
            decision=request.decision,
            updated_plan=plan,
            message=message,
        )

    def _item_index(self, plan: FillPlan, field_id: str) -> int | None:
        for index, item in enumerate(plan.items):
            if item.field_id == field_id:
                return index
        return None

    def _blocked_index(self, plan: FillPlan, field_id: str) -> int | None:
        for index, blocked in enumerate(plan.blocked_items):
            if blocked.field_id == field_id:
                return index
        return None

    def _remove_field(self, plan: FillPlan, field_id: str) -> None:
        plan.items = [item for item in plan.items if item.field_id != field_id]
        plan.blocked_items = [
            blocked for blocked in plan.blocked_items if blocked.field_id != field_id
        ]

    def _field(self, request: FillPlanReviewRequest) -> FormField | None:
        if not request.form:
            return None
        return next(
            (
                field
                for field in request.form.fields
                if field.field_id == request.field_id
            ),
            None,
        )

    def _selector(
        self, field: FormField | None, plan: FillPlan, item_index: int | None
    ) -> str:
        if field and field.selector:
            return field.selector
        if item_index is not None and item_index < len(plan.items):
            return plan.items[item_index].selector
        return ""

    def _action(self, field: FormField | None) -> str:
        if not field:
            return "fill"
        if field.type in {FieldType.select, FieldType.radio}:
            return "select"
        if field.type == FieldType.checkbox:
            return "check"
        if field.type == FieldType.file:
            return "upload"
        return "fill"

    def _value(
        self, field: FormField | None, value: str | bool | None
    ) -> str | bool | None:
        if field and field.type == FieldType.checkbox:
            return self._bool_value(value)
        return value

    def _bool_value(self, value: str | bool | None) -> bool:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"true", "yes", "1", "checked", "on"}

    def _has_value(self, value: str | bool | None) -> bool:
        if isinstance(value, bool):
            return True
        if value is None:
            return False
        return bool(str(value).strip())

    def _append_reason(self, reason: str, suffix: str) -> str:
        if not reason:
            return suffix
        if reason.endswith(suffix):
            return reason
        return f"{reason} {suffix}"
