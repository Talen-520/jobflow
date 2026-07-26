from __future__ import annotations

from app.models.schemas import (
    FillPlan,
    FillPlanItem,
    FormSchema,
    OpenAnswerDraftRequest,
    Preferences,
    UserProfile,
)
from app.services.ai_orchestrator import OpenAnswerOrchestrator
from app.services.fill_plan import FillPlanService


class AutomatedFillPlanService:
    def __init__(
        self,
        orchestrator: OpenAnswerOrchestrator,
        fill_plan_service: FillPlanService | None = None,
    ) -> None:
        self.orchestrator = orchestrator
        self.fill_plan_service = fill_plan_service or FillPlanService()

    def prepare(
        self,
        form: FormSchema,
        profile: UserProfile,
        preferences: Preferences,
        allow_ai_custom_fields: bool = True,
    ) -> FillPlan:
        plan = self.fill_plan_service.create_plan(form, profile, preferences)
        if not allow_ai_custom_fields:
            return plan
        for field in form.fields:
            if not self.fill_plan_service.is_open_question(field):
                continue
            draft = self.orchestrator.draft(
                request=OpenAnswerDraftRequest(
                    question=field.label or field.field_id,
                    question_type=self.fill_plan_service.open_question_type(field),
                    keywords=[
                        value
                        for value in [form.company_name_hint, form.job_title_hint]
                        if value
                    ],
                    context_facts={
                        key: value
                        for key, value in {
                            "company_name": form.company_name_hint,
                            "job_title": form.job_title_hint,
                        }.items()
                        if value
                    },
                    use_model=True,
                ),
                profile=profile,
                preferences=preferences,
            )
            if not draft.answer.strip() or not draft.source_refs:
                continue
            plan.items = [item for item in plan.items if item.field_id != field.field_id]
            plan.blocked_items = [
                item for item in plan.blocked_items if item.field_id != field.field_id
            ]
            plan.items.append(
                FillPlanItem(
                    field_id=field.field_id,
                    action="fill",
                    value=draft.answer,
                    selector=field.selector,
                    confidence=0.9 if not draft.fallback_used else 0.85,
                    needs_review=False,
                    source_refs=draft.source_refs,
                    reason=(
                        "AI drafted this open answer from validated Profile and form "
                        "context sources."
                    ),
                )
            )
        return plan
