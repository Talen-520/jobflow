from app.models.schemas import SuccessDetectionRequest
from app.services.success_detection import SuccessDetectionService


def test_detects_success_and_proposes_application_record() -> None:
    result = SuccessDetectionService().detect(
        SuccessDetectionRequest(
            url="https://jobs.example.com/submitted",
            ats="lever",
            company_name_hint="Acme AI",
            job_title_hint="Frontend Engineer",
            html="<h1>Frontend Engineer</h1><p>Thank you for applying.</p>",
        )
    )

    assert result.detected is True
    assert result.proposed_record is not None
    assert result.proposed_record.company_name == "Acme AI"
    assert result.proposed_record.job_title == "Frontend Engineer"
