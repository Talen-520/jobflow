import asyncio
from pathlib import Path

from app.services.browser_controller import BrowserController


class FakeBridge:
    def __init__(self, url: str, html: str) -> None:
        self.connected = True
        self.url = url
        self.title = ""
        self.captcha_detected = False
        self._html = html

    async def request(self, command: str, payload=None, timeout: float = 15.0):
        assert command == "snapshot"
        return {"snapshots": [{"url": self.url, "html": self._html}]}


def test_browser_controller_inspect_uses_adapter_registry() -> None:
    async def run() -> None:
        controller = BrowserController(FakeBridge(  # type: ignore[arg-type]
            "https://boards.greenhouse.io/example/jobs/123",
            Path("tests/fixtures/greenhouse_application.html").read_text(),
        ))

        form = await controller.inspect()

        assert form.ats == "greenhouse"
        assert any(field.field_id == "first_name" for field in form.fields)

    asyncio.run(run())


def test_browser_success_preserves_original_form_ats_hint() -> None:
    async def run() -> None:
        controller = BrowserController(FakeBridge(  # type: ignore[arg-type]
            "https://example.com/thank-you",
            "<h1>Application complete</h1><p>Thank you for applying.</p>",
        ))

        result = await controller.detect_success(
            company_name_hint="Example Robotics",
            job_title_hint="Backend Engineer",
            ats="greenhouse",
        )

        assert result.detected is True
        assert result.proposed_record is not None
        assert result.proposed_record.company_name == "Example Robotics"
        assert result.proposed_record.job_title == "Backend Engineer"
        assert result.proposed_record.ats == "greenhouse"

    asyncio.run(run())
