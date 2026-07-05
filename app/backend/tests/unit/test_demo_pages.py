from app.services.demo_pages import DEMO_APPLICATION_HTML, DEMO_SUBMITTED_HTML
from app.services.form_extraction import FormExtractionService
from app.services.success_detection import SuccessDetectionService
from app.models.schemas import SuccessDetectionRequest


def test_demo_application_extracts_representative_fields() -> None:
    form = FormExtractionService().extract_from_html(
        DEMO_APPLICATION_HTML,
        url="http://127.0.0.1:8765/demo/application",
    )

    field_ids = {field.field_id for field in form.fields}
    assert {
        "first_name",
        "last_name",
        "email",
        "resume",
        "motivation",
        "sponsorship",
        "authorized",
        "salary",
    }.issubset(field_ids)
    assert next(field for field in form.fields if field.field_id == "resume").type == "file"
    assert next(field for field in form.fields if field.field_id == "sponsorship").sensitive


def test_demo_submitted_page_detects_success() -> None:
    result = SuccessDetectionService().detect(
        SuccessDetectionRequest(
            url="http://127.0.0.1:8765/demo/submitted",
            html=DEMO_SUBMITTED_HTML,
            ats="generic",
        )
    )

    assert result.detected is True
    assert result.proposed_record is not None
    assert result.proposed_record.company_name == "JobFlow Demo Co"
    assert result.proposed_record.job_title == "Frontend Engineer"
