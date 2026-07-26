from pathlib import Path

from app.services.form_extraction import FormExtractionService


def test_extracts_generic_application_fixture() -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(
        html, url="https://jobs.example.com/frontend"
    )

    assert form.ats == "generic"
    assert form.company_name_hint == "Acme AI"
    assert form.job_title_hint == "Frontend Engineer"
    assert len(form.fields) == 7
    assert form.fields[0].label == "First name"
    assert form.fields[2].type == "email"
    resume = next(field for field in form.fields if field.field_id == "resume")
    assert resume.type == "file"
    assert resume.selector == "#resume"
    assert form.fields[-1].sensitive is True


def test_extracts_css_safe_selector_for_ids_with_special_characters() -> None:
    html = Path("tests/fixtures/lever_application.html").read_text()
    form = FormExtractionService().extract_from_html(html)

    linkedin = next(field for field in form.fields if field.field_id == "urls[LinkedIn]")
    assert linkedin.selector == '[id="urls[LinkedIn]"]'


def test_extracts_radio_controls_as_group_field() -> None:
    html = """
    <form>
      <label for="authorized_yes">Yes</label>
      <input id="authorized_yes" name="authorized" type="radio" value="Yes" />
      <label for="authorized_no">No</label>
      <input id="authorized_no" name="authorized" type="radio" value="No" />
    </form>
    """
    form = FormExtractionService().extract_from_html(html)

    assert len(form.fields) == 1
    radio = form.fields[0]
    assert radio.field_id == "authorized"
    assert radio.type == "radio"
    assert radio.options == ["Yes", "No"]
    assert radio.selector == '[name="authorized"]'
    assert radio.sensitive is True


def test_demographic_option_labels_are_sensitive_without_flagging_company() -> None:
    form = FormExtractionService().extract_from_html(
        """
        <form>
          <label for="company">Current company</label><input id="company" />
          <label for="gender-man">Man</label><input id="gender-man" type="radio" />
          <label for="race-asian">Asian or Asian American</label>
          <input id="race-asian" type="checkbox" />
        </form>
        """,
        url="https://jobs.example.com/apply",
    )

    fields = {field.field_id: field for field in form.fields}
    assert fields["company"].sensitive is False
    assert fields["gender-man"].sensitive is True
    assert fields["race-asian"].sensitive is True
