from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import (
    AnswerBankEntry,
    ApplicationRecord,
    DocumentRecord,
    Fact,
    UserProfile,
)


def test_profile_form_fill_plan_and_success_flow(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))

    assert client.get("/health").json()["status"] == "ok"
    assert client.post("/browser/stop").json()["status"] == "stopped"

    profile = UserProfile(
        identity={
            "first_name": "Tao",
            "last_name": "Hu",
            "email": "tao@example.com",
            "phone": "555-0100",
        },
        documents=[
            DocumentRecord(kind="resume", name="Resume", path="/tmp/resume.pdf")
        ],
        answer_bank=[
            AnswerBankEntry(
                question_type="motivation",
                title="Motivation",
                body="I like practical AI tooling for repetitive workflows.",
            )
        ],
    )
    put_response = client.put("/profile", json=profile.model_dump(mode="json"))
    assert put_response.status_code == 200

    html = Path("tests/fixtures/generic_application.html").read_text()
    inspect_response = client.post(
        "/automation/inspect",
        json={"url": "https://jobs.example.com/frontend", "html": html},
    )
    assert inspect_response.status_code == 200
    form = inspect_response.json()
    assert len(form["fields"]) == 7

    plan_response = client.post("/automation/create-fill-plan", json={"form": form})
    assert plan_response.status_code == 200
    plan = plan_response.json()
    assert any(item["field_id"] == "email" for item in plan["items"])
    assert any(item["field_id"] == "sponsorship" for item in plan["blocked_items"])

    fill_response = client.post(
        "/automation/apply-fill-plan",
        json={"plan": plan, "form": form, "dry_run": True},
    )
    assert fill_response.status_code == 200
    fill_result = fill_response.json()
    assert fill_result["status"] == "dry_run"
    assert fill_result["filled_count"] >= 3
    assert any(item["status"] == "blocked" for item in fill_result["items"])

    success_response = client.post(
        "/automation/detect-success",
        json={
            "url": "https://jobs.example.com/submitted",
            "html": "<p>Application submitted. Thank you for applying.</p>",
            "ats": "generic",
            "company_name_hint": "Acme AI",
            "job_title_hint": "Frontend Engineer",
        },
    )
    assert success_response.status_code == 200
    success = success_response.json()
    assert success["detected"] is True
    assert success["proposed_record"]["company_name"] == "Acme AI"


def test_document_import_open_answer_and_data_export(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))
    resume = tmp_path / "resume.txt"
    resume.write_text("Resume content", encoding="utf-8")

    profile = UserProfile(
        answer_bank=[
            AnswerBankEntry(
                id="answer_default",
                question_type="motivation",
                body="I like practical AI tooling for repetitive workflows.",
                tags=["ai", "automation"],
            )
        ],
        project_facts=[
            Fact(
                id="project_forms",
                title="Form automation",
                body="Built a local form automation prototype.",
                tags=["forms", "automation"],
            )
        ],
    )
    assert client.put("/profile", json=profile.model_dump(mode="json")).status_code == 200

    document_response = client.post(
        "/documents/import",
        json={"kind": "resume", "name": "Main Resume", "path": str(resume)},
    )
    assert document_response.status_code == 200
    document = document_response.json()
    assert document["name"] == "Main Resume"
    assert Path(document["path"]).exists()
    assert Path(document["path"]).parent == tmp_path / "vault"

    draft_response = client.post(
        "/automation/draft-open-answer",
        json={
            "question": "Why are you interested in AI automation?",
            "question_type": "motivation",
            "keywords": ["ai", "automation"],
        },
    )
    assert draft_response.status_code == 200
    draft = draft_response.json()
    assert draft["needs_review"] is True
    assert draft["fallback_used"] is True
    assert "repetitive workflows" in draft["answer"]
    assert "answer_bank.answer_default" in draft["source_refs"]

    record = ApplicationRecord(company_name="Acme AI", job_title="Frontend Engineer")
    assert client.post("/applications", json=record.model_dump(mode="json")).status_code == 200

    export_response = client.get("/data/export")
    assert export_response.status_code == 200
    exported = export_response.json()
    assert exported["profile"]["documents"][0]["id"] == document["id"]
    assert exported["applications"][0]["company_name"] == "Acme AI"
