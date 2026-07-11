from __future__ import annotations

from app.models.schemas import (
    FieldType,
    FillPlan,
    FillPlanItem,
    FillResult,
    FillResultItem,
    FormField,
    FormSchema,
)


class SafeFillExecutor:
    def __init__(self, min_confidence: float = 0.85) -> None:
        self.min_confidence = min_confidence

    def preview(self, plan: FillPlan) -> FillResult:
        result = FillResult(status="dry_run")
        for item in plan.items:
            if self.is_eligible(item):
                result.items.append(
                    FillResultItem(
                        field_id=item.field_id,
                        status="filled",
                        reason="Eligible for browser fill.",
                    )
                )
                result.filled_count += 1
            elif item.needs_review:
                result.items.append(
                    FillResultItem(
                        field_id=item.field_id,
                        status="needs_review",
                        reason="Field requires user review before filling.",
                    )
                )
                result.review_count += 1
            else:
                result.items.append(
                    FillResultItem(
                        field_id=item.field_id,
                        status="skipped",
                        reason="Field is not eligible for automated filling.",
                    )
                )
                result.skipped_count += 1
        for blocked in plan.blocked_items:
            result.items.append(
                FillResultItem(
                    field_id=blocked.field_id,
                    status="blocked",
                    reason=blocked.reason,
                )
            )
            result.review_count += 1
        return result

    async def apply(self, page, plan: FillPlan, form: FormSchema | None = None) -> FillResult:
        result = FillResult(status="applied")
        selectors = self._selectors_by_field(form)
        fields = self._fields_by_field(form)
        for item in plan.items:
            selector = item.selector or selectors.get(item.field_id, "")
            field = fields.get(item.field_id)
            if not self.is_eligible(item):
                status = "needs_review" if item.needs_review else "skipped"
                result.items.append(
                    FillResultItem(
                        field_id=item.field_id,
                        status=status,
                        reason="Not eligible for automated browser write.",
                    )
                )
                if status == "needs_review":
                    result.review_count += 1
                else:
                    result.skipped_count += 1
                continue
            if not selector:
                result.items.append(
                    FillResultItem(
                        field_id=item.field_id,
                        status="error",
                        reason="Missing selector for browser write.",
                    )
                )
                result.error_count += 1
                continue
            try:
                await self._apply_item(page, selector, item, field)
                verified = await self._verify_item(page, selector, item, field)
            except Exception as exc:  # pragma: no cover - browser-specific detail
                result.items.append(
                    FillResultItem(
                        field_id=item.field_id,
                        status="error",
                        reason=str(exc),
                    )
                )
                result.error_count += 1
            else:
                if verified:
                    result.items.append(
                        FillResultItem(
                            field_id=item.field_id,
                            status="filled",
                            reason="Filled in browser and verified.",
                        )
                    )
                    result.filled_count += 1
                else:
                    result.items.append(
                        FillResultItem(
                            field_id=item.field_id,
                            status="error",
                            reason="Browser value did not match fill plan after writing.",
                        )
                    )
                    result.error_count += 1
        for blocked in plan.blocked_items:
            result.items.append(
                FillResultItem(
                    field_id=blocked.field_id,
                    status="blocked",
                    reason=blocked.reason,
                )
            )
            result.review_count += 1
        if result.error_count:
            result.status = "error"
        elif result.filled_count == 0 and result.review_count:
            result.status = "blocked"
        return result

    def is_eligible(self, item: FillPlanItem) -> bool:
        return (
            not item.needs_review
            and item.confidence >= self.min_confidence
            and item.action not in {"skip"}
            and bool(item.source_refs)
        )

    async def _apply_item(
        self, page, selector: str, item: FillPlanItem, field: FormField | None = None
    ) -> None:
        locator = page.locator(selector)
        value = item.value
        if item.action == "fill":
            await locator.fill("" if value is None else str(value))
        elif item.action == "select":
            if field and field.type == FieldType.radio:
                await page.locator(
                    self._radio_option_selector(selector, self._string_value(value))
                ).set_checked(True)
            else:
                await locator.select_option("" if value is None else str(value))
        elif item.action == "check":
            await locator.set_checked(self._bool_value(value))
        elif item.action == "upload":
            await locator.set_input_files("" if value is None else str(value))
        else:
            raise ValueError(f"Unsupported fill action: {item.action}")

    async def _verify_item(
        self, page, selector: str, item: FillPlanItem, field: FormField | None = None
    ) -> bool:
        locator = page.locator(selector)
        if item.action in {"fill", "select"}:
            if field and field.type == FieldType.radio:
                return await page.locator(
                    self._radio_option_selector(selector, self._string_value(item.value))
                ).is_checked()
            return await locator.input_value() == self._string_value(item.value)
        if item.action == "check":
            return await locator.is_checked() is self._bool_value(item.value)
        if item.action == "upload":
            return True
        return False

    def _string_value(self, value: str | bool | None) -> str:
        return "" if value is None else str(value)

    def _bool_value(self, value: str | bool | None) -> bool:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"true", "yes", "1", "checked", "on"}

    def _selectors_by_field(self, form: FormSchema | None) -> dict[str, str]:
        if not form:
            return {}
        return {field.field_id: field.selector for field in form.fields if field.selector}

    def _fields_by_field(self, form: FormSchema | None) -> dict[str, FormField]:
        if not form:
            return {}
        return {field.field_id: field for field in form.fields}

    def _radio_option_selector(self, selector: str, value: str) -> str:
        return f"{selector}[value=\"{self._css_attr_value(value)}\"]"

    def _css_attr_value(self, value: str) -> str:
        return value.replace("\\", "\\\\").replace('"', '\\"')
