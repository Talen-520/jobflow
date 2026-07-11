import asyncio
from pathlib import Path

from app.adapters.registry import AdapterRegistry
from app.models.schemas import AnswerBankEntry, DocumentRecord, Preferences, UserProfile
from app.services.fill_plan import FillPlanService


class FakePage:
    def __init__(self, url: str, html: str) -> None:
        self.url = url
        self._html = html

    async def content(self) -> str:
        return self._html


def test_registry_selects_greenhouse_and_extracts_form() -> None:
    async def run() -> None:
        html = Path("tests/fixtures/greenhouse_application.html").read_text()
        page = FakePage("https://boards.greenhouse.io/example/jobs/123", html)
        adapter = await AdapterRegistry().select_for_page(page)
        form = await adapter.extract_form(page)

        assert adapter.name == "greenhouse"
        assert form.ats == "greenhouse"
        assert form.company_name_hint == "Example Robotics"
        assert form.job_title_hint == "Backend Engineer"
        assert {field.field_id for field in form.fields} >= {
            "first_name",
            "last_name",
            "email",
            "resume",
        }

    asyncio.run(run())


def test_registry_selects_lever_and_fill_plan_handles_full_name() -> None:
    async def run() -> None:
        html = Path("tests/fixtures/lever_application.html").read_text()
        page = FakePage("https://jobs.lever.co/example/abc", html)
        adapter = await AdapterRegistry().select_for_page(page)
        form = await adapter.extract_form(page)
        profile = UserProfile(
            identity={
                "first_name": "Tao",
                "last_name": "Hu",
                "email": "tao@example.com",
                "phone": "555-0100",
            },
            links={"linkedin": "https://linkedin.com/in/taohu"},
            documents=[
                DocumentRecord(kind="resume", name="Resume", path="/tmp/resume.pdf")
            ],
            answer_bank=[
                AnswerBankEntry(
                    question_type="general",
                    title="Additional info",
                    body="I build local-first automation tools using React, FastAPI, and Playwright.",
                )
            ],
        )

        plan = FillPlanService().create_plan(form, profile, Preferences())

        assert adapter.name == "lever"
        assert form.ats == "lever"
        assert form.company_name_hint == "Example Analytics"
        assert form.job_title_hint == "Frontend Engineer"
        full_name = next(item for item in plan.items if item.field_id == "name")
        assert full_name.value == "Tao Hu"
        assert full_name.selector == "#name"

    asyncio.run(run())


def test_registry_selects_ashby_workday_and_oracle() -> None:
    async def run() -> None:
        cases = [
            (
                "ashby",
                "https://jobs.ashbyhq.com/example/123/application",
                "tests/fixtures/ashby_application.html",
                {"firstName", "lastName", "email", "resume"},
            ),
            (
                "workday",
                "https://example.wd1.myworkdayjobs.com/External/job/123",
                "tests/fixtures/workday_application.html",
                {"name", "email", "phone", "sponsorship"},
            ),
            (
                "oracle",
                "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience",
                "tests/fixtures/oracle_application.html",
                {"name", "email", "linkedin", "resume"},
            ),
        ]
        for ats, url, fixture, expected_ids in cases:
            html = Path(fixture).read_text()
            page = FakePage(url, html)
            adapter = await AdapterRegistry().select_for_page(page)
            form = await adapter.extract_form(page)

            assert adapter.name == ats
            assert form.ats == ats
            assert {field.field_id for field in form.fields} >= expected_ids

    asyncio.run(run())


def test_adapter_success_detection() -> None:
    async def run() -> None:
        page = FakePage(
            "https://jobs.lever.co/example/abc/thanks",
            "<p>Application submitted. Thank you for applying.</p>",
        )
        adapter = await AdapterRegistry().select_for_page(page)
        result = await adapter.detect_success(page)

        assert adapter.name == "lever"
        assert result.detected is True
        assert "text:application submitted" in result.signals

    asyncio.run(run())
