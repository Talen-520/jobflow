from __future__ import annotations

from app.services.event_bus import EventBus


def test_event_bus_redacts_sensitive_payload_and_sanitizes_urls() -> None:
    event = EventBus().publish(
        "automation.test",
        "Opening https://user:pass@jobs.example.com/apply?token=secret#frag for tao@example.com",
        payload={
            "url": "https://jobs.example.com/apply?token=secret#frag",
            "value": "Private field value",
            "message": "Use my salary and tao@example.com",
            "updated_plan": {"items": [{"field_id": "motivation", "value": "Private answer"}]},
            "proposed_record": {
                "company_name": "Acme AI",
                "job_url": "https://jobs.example.com/apply?session=secret",
            },
        },
    )

    dumped = str(event.model_dump(mode="json"))

    assert event.message == "Opening https://jobs.example.com/apply for [email]"
    assert event.payload["url"] == "https://jobs.example.com/apply"
    assert event.payload["value"] == "[redacted]"
    assert event.payload["message"] == "[redacted]"
    assert event.payload["updated_plan"] == "[redacted]"
    assert event.payload["proposed_record"]["company_name"] == "Acme AI"
    assert event.payload["proposed_record"]["job_url"] == "https://jobs.example.com/apply"
    assert "secret" not in dumped
    assert "Private field value" not in dumped
    assert "Private answer" not in dumped
