from pathlib import Path

from app.models.schemas import (
    AnswerBankEntry,
    DocumentRecord,
    FieldType,
    Fact,
    FormField,
    FormSchema,
    Preferences,
    UserProfile,
)
from app.services.fill_plan import FillPlanService
from app.services.form_extraction import FormExtractionService


def test_fill_plan_uses_only_profile_and_answer_bank_sources(tmp_path: Path) -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(html)
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4 test resume")
    profile = UserProfile(
        identity={
            "first_name": "Tao",
            "last_name": "Hu",
            "email": "tao@example.com",
        },
        links={"linkedin": "https://linkedin.com/in/taohu"},
        documents=[
            DocumentRecord(
                kind="resume",
                name="Resume",
                path=str(resume),
            )
        ],
        answer_bank=[
            AnswerBankEntry(
                question_type="motivation",
                title="AI automation motivation",
                body="I enjoy building automation tools that reduce repetitive manual work.",
                tags=["automation", "ai"],
            )
        ],
        experience_facts=[
            Fact(title="Automation", body="Built local AI workflow tools.")
        ],
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    email_item = next(item for item in plan.items if item.field_id == "email")
    assert email_item.value == "tao@example.com"
    assert email_item.selector == "#email"
    assert email_item.source_refs == ["profile.identity.email"]

    resume_item = next(item for item in plan.items if item.field_id == "resume")
    assert resume_item.action == "upload"
    assert resume_item.value == str(resume.resolve())
    assert resume_item.source_refs[0].startswith("profile.documents.")
    assert resume_item.needs_review is False

    motivation_item = next(item for item in plan.items if item.field_id == "motivation")
    assert motivation_item.needs_review is True
    assert motivation_item.source_refs[0].startswith("answer_bank.")
    assert "repetitive manual work" in str(motivation_item.value)

    blocked_ids = {item.field_id for item in plan.blocked_items}
    assert "sponsorship" in blocked_ids


def test_fill_plan_blocks_upload_when_document_file_is_missing(tmp_path: Path) -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="cover_letter",
                label="Cover letter",
                type=FieldType.file,
                selector="#cover_letter",
                required=True,
            )
        ]
    )
    profile = UserProfile(
        documents=[
            DocumentRecord(
                kind="cover_letter",
                name="Cover Letter",
                path=str(tmp_path / "missing-cover-letter.pdf"),
            )
        ]
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.items == []
    assert plan.blocked_items[0].field_id == "cover_letter"
    assert "missing from local storage" in plan.blocked_items[0].reason


def test_sensitive_work_authorization_fact_requires_review_by_default() -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(html)
    profile = UserProfile(
        work_authorization={
            "country": "US",
            "authorized": True,
            "requires_sponsorship": False,
        }
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    sponsorship_item = next(item for item in plan.items if item.field_id == "sponsorship")
    assert sponsorship_item.action == "select"
    assert sponsorship_item.value == "No"
    assert sponsorship_item.needs_review is True
    assert sponsorship_item.source_refs == [
        "profile.work_authorization.requires_sponsorship"
    ]
    assert "Sensitive work authorization fact" in sponsorship_item.reason
    assert "sponsorship" not in {item.field_id for item in plan.blocked_items}


def test_sensitive_work_authorization_fact_can_fill_when_enabled() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="authorized",
                label="Are you legally authorized to work in the United States?",
                type=FieldType.select,
                required=True,
                options=["Select one", "Yes", "No"],
                selector="#authorized",
                sensitive=True,
            )
        ]
    )
    profile = UserProfile(
        work_authorization={
            "country": "US",
            "authorized": True,
            "requires_sponsorship": False,
        }
    )
    preferences = Preferences(fill_sensitive_fields=True)

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    authorized_item = plan.items[0]
    assert authorized_item.field_id == "authorized"
    assert authorized_item.action == "select"
    assert authorized_item.value == "Yes"
    assert authorized_item.needs_review is False
    assert authorized_item.source_refs == ["profile.work_authorization.authorized"]


def test_missing_fact_policy_can_leave_required_field_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="portfolio_url",
                label="Portfolio URL",
                type=FieldType.text,
                required=True,
                selector="#portfolio_url",
            )
        ]
    )
    preferences = Preferences(missing_fact_policy="leave_blank")

    plan = FillPlanService().create_plan(form, UserProfile(), preferences)

    assert plan.blocked_items == []
    blank_item = plan.items[0]
    assert blank_item.field_id == "portfolio_url"
    assert blank_item.action == "skip"
    assert blank_item.value == ""
    assert blank_item.needs_review is False
    assert "missing-fact policy" in blank_item.reason


def test_salary_policy_can_leave_sensitive_salary_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="salary",
                label="Desired salary",
                type=FieldType.text,
                required=True,
                selector="#salary",
                sensitive=True,
            )
        ]
    )
    preferences = Preferences(salary_answer_policy="leave_blank")

    plan = FillPlanService().create_plan(form, UserProfile(), preferences)

    assert plan.blocked_items == []
    salary_item = plan.items[0]
    assert salary_item.action == "skip"
    assert salary_item.needs_review is False
    assert "salary policy" in salary_item.reason


def test_salary_policy_uses_profile_preference_with_review_gate() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="salary",
                label="Desired compensation",
                type=FieldType.text,
                required=True,
                selector="#salary",
                sensitive=True,
            )
        ]
    )
    profile = UserProfile(preferences={"salary": "$120,000 base"})
    preferences = Preferences(salary_answer_policy="use_profile")

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    salary_item = plan.items[0]
    assert salary_item.action == "fill"
    assert salary_item.value == "$120,000 base"
    assert salary_item.needs_review is True
    assert salary_item.source_refs == ["profile.preferences.salary"]


def test_missing_fact_policy_can_leave_open_question_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="why_us",
                label="Why do you want to work here?",
                type=FieldType.textarea,
                required=True,
                selector="#why_us",
            )
        ]
    )
    preferences = Preferences(missing_fact_policy="leave_blank")

    plan = FillPlanService().create_plan(form, UserProfile(), preferences)

    assert plan.blocked_items == []
    open_item = plan.items[0]
    assert open_item.action == "skip"
    assert open_item.needs_review is False
    assert "no answer bank or profile fact matched" in open_item.reason


def test_low_confidence_policy_can_leave_open_fact_draft_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="automation_story",
                label="Describe your automation experience",
                type=FieldType.textarea,
                required=True,
                selector="#automation_story",
            )
        ]
    )
    profile = UserProfile(
        experience_facts=[
            Fact(
                title="Automation",
                body="Built local workflow automation for job applications.",
                tags=["automation"],
            )
        ]
    )
    preferences = Preferences(low_confidence_policy="leave_blank")

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    open_item = plan.items[0]
    assert open_item.action == "skip"
    assert open_item.source_refs == []
    assert "low-confidence policy" in open_item.reason
