from pathlib import Path

from app.models.schemas import (
    AnswerBankEntry,
    DocumentRecord,
    Fact,
    Preferences,
    UserProfile,
)
from app.services.fill_plan import FillPlanService
from app.services.form_extraction import FormExtractionService


def test_fill_plan_uses_only_profile_and_answer_bank_sources() -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(html)
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
                path="/Users/taohu/resume.pdf",
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

    motivation_item = next(item for item in plan.items if item.field_id == "motivation")
    assert motivation_item.needs_review is True
    assert motivation_item.source_refs[0].startswith("answer_bank.")
    assert "repetitive manual work" in str(motivation_item.value)

    blocked_ids = {item.field_id for item in plan.blocked_items}
    assert "sponsorship" in blocked_ids
