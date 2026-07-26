from app.models.schemas import (
    FieldType,
    FormField,
    FormSchema,
    OpenAnswerDraft,
    Preferences,
    UserProfile,
)
from app.services.automated_fill_plan import AutomatedFillPlanService


class StubOpenAnswerOrchestrator:
    def draft(self, request, profile, preferences) -> OpenAnswerDraft:
        assert request.use_model is True
        assert request.context_facts == {
            "company_name": "Avoca",
            "job_title": "Agent Engineer",
        }
        return OpenAnswerDraft(
            answer="I am interested in the Agent Engineer role at Avoca.",
            source_refs=[
                "form.context.company_name",
                "form.context.job_title",
            ],
            needs_review=True,
            fallback_used=False,
        )


class UnexpectedOpenAnswerOrchestrator:
    def draft(self, request, profile, preferences) -> OpenAnswerDraft:
        raise AssertionError("AI must not run when custom-field AI is disabled")


def test_prepare_auto_fills_profile_fields_and_source_backed_open_answers() -> None:
    form = FormSchema(
        company_name_hint="Avoca",
        job_title_hint="Agent Engineer",
        fields=[
            FormField(
                field_id="first_name",
                label="First name",
                type=FieldType.text,
                selector="#first_name",
            ),
            FormField(
                field_id="motivation",
                label="Why do you want to work at this company?",
                type=FieldType.textarea,
                selector="#motivation",
            ),
        ],
    )
    profile = UserProfile(identity={"first_name": "Tao"})

    plan = AutomatedFillPlanService(
        orchestrator=StubOpenAnswerOrchestrator()
    ).prepare(form, profile, Preferences())

    assert plan.blocked_items == []
    items = {item.field_id: item for item in plan.items}
    assert items["first_name"].value == "Tao"
    assert items["first_name"].needs_review is False
    assert items["motivation"].value == (
        "I am interested in the Agent Engineer role at Avoca."
    )
    assert items["motivation"].needs_review is False
    assert items["motivation"].source_refs == [
        "form.context.company_name",
        "form.context.job_title",
    ]


def test_prepare_keeps_custom_open_question_blocked_when_ai_is_disabled() -> None:
    form = FormSchema(
        company_name_hint="Avoca",
        fields=[
            FormField(
                field_id="motivation",
                label="Why do you want to work at this company?",
                type=FieldType.textarea,
                required=True,
                selector="#motivation",
            )
        ],
    )

    plan = AutomatedFillPlanService(
        orchestrator=UnexpectedOpenAnswerOrchestrator()
    ).prepare(
        form,
        UserProfile(),
        Preferences(),
        allow_ai_custom_fields=False,
    )

    assert plan.items == []
    assert [item.field_id for item in plan.blocked_items] == ["motivation"]
