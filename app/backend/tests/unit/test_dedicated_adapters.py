import asyncio
from pathlib import Path

from app.adapters.ashby import AshbyAdapter
from app.adapters.greenhouse import GreenhouseAdapter
from app.adapters.oracle import OracleAdapter
from app.adapters.workday import WorkdayAdapter
from app.models.schemas import FieldType


class FakePage:
    def __init__(self, url: str, html: str) -> None:
        self.url = url
        self._html = html

    async def content(self) -> str:
        return self._html


def fixture(name: str) -> str:
    return Path(f"tests/fixtures/{name}_application.html").read_text()


def test_greenhouse_owns_combobox_and_success_policy() -> None:
    async def run() -> None:
        adapter = GreenhouseAdapter()
        form = await adapter.extract_form(
            FakePage("https://job-boards.greenhouse.io/example/jobs/1", fixture("greenhouse"))
        )

        authorization = next(field for field in form.fields if field.field_id == "authorization")
        assert authorization.type == FieldType.select
        assert authorization.options == ["Yes", "No"]
        assert authorization.required is True
        assert authorization.selector == "#authorization"

        result = await adapter.detect_success(
            FakePage(
                "https://job-boards.greenhouse.io/example/jobs/1/confirmation",
                "<h1>Application complete</h1><p>We've received your application.</p>",
            )
        )
        assert result.detected is True
        assert any(signal.startswith("greenhouse:") for signal in result.signals)

    asyncio.run(run())


def test_ashby_normalizes_system_fields_and_excludes_recaptcha() -> None:
    async def run() -> None:
        adapter = AshbyAdapter()
        form = await adapter.extract_form(
            FakePage("https://jobs.ashbyhq.com/example/job/application", fixture("ashby"))
        )
        fields = {field.field_id: field for field in form.fields}

        assert {"name", "email", "resume", "work-location", "sponsorship"} <= fields.keys()
        assert fields["name"].selector == '[data-field-path="_systemfield_name"]'
        assert fields["work-location"].type == FieldType.select
        assert fields["sponsorship"].options == ["Yes", "No"]
        assert "g-recaptcha-response" not in fields

    asyncio.run(run())


def test_oracle_filters_traps_and_marks_password_sensitive() -> None:
    async def run() -> None:
        adapter = OracleAdapter()
        form = await adapter.extract_form(
            FakePage("https://example.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience", fixture("oracle"))
        )
        fields = {field.field_id: field for field in form.fields}

        assert fields["email"].selector == '[name="primary-email"]'
        assert fields["password"].sensitive is True
        assert "honey-pot" not in fields
        assert "g-recaptcha-response" not in fields
        assert "legal-disclaimer-checkbox" in fields

    asyncio.run(run())


def test_workday_prefers_data_automation_ids_and_excludes_beecatcher() -> None:
    async def run() -> None:
        adapter = WorkdayAdapter()
        form = await adapter.extract_form(
            FakePage("https://example.wd3.myworkdayjobs.com/job/1/apply", fixture("workday"))
        )
        fields = {field.field_id: field for field in form.fields}

        assert fields["email"].selector == '[data-automation-id="email"]'
        assert fields["sponsorship"].options == ["No", "Yes"]
        assert fields["password"].sensitive is True
        assert "beecatcher" not in fields
        assert form.job_title_hint == "Software Engineer"

    asyncio.run(run())


def test_each_requested_adapter_adds_ats_specific_success_signal() -> None:
    async def run() -> None:
        cases = [
            (
                GreenhouseAdapter(),
                "https://job-boards.greenhouse.io/example/confirmation",
                "We've received your application.",
            ),
            (
                AshbyAdapter(),
                "https://jobs.ashbyhq.com/example/application/submitted",
                "Application submitted successfully.",
            ),
            (
                OracleAdapter(),
                "https://example.fa.ocs.oraclecloud.com/apply/confirmation",
                "Your application was submitted.",
            ),
            (
                WorkdayAdapter(),
                "https://example.myworkdayjobs.com/job/1/apply/confirmation",
                "You've successfully submitted your application.",
            ),
        ]
        for adapter, url, phrase in cases:
            result = await adapter.detect_success(FakePage(url, f"<p>{phrase}</p>"))
            assert result.detected is True
            assert any(signal.startswith(f"{adapter.name}:") for signal in result.signals)
            assert result.proposed_record is not None
            assert result.proposed_record.ats == adapter.name

    asyncio.run(run())
