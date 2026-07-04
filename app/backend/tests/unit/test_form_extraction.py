from pathlib import Path

from app.services.form_extraction import FormExtractionService


def test_extracts_generic_application_fixture() -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(
        html, url="https://jobs.example.com/frontend"
    )

    assert form.ats == "generic"
    assert len(form.fields) == 7
    assert form.fields[0].label == "First name"
    assert form.fields[2].type == "email"
    assert form.fields[-1].sensitive is True
