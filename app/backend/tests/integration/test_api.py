import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import (
    AnswerBankEntry,
    ApplicationRecord,
    BlockedItem,
    DocumentRecord,
    Fact,
    FillPlan,
    FillPlanItem,
    Preferences,
    UserProfile,
)


def test_profile_form_fill_plan_and_success_flow(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))

    assert client.get("/health").json()["status"] == "ok"
    assert client.post("/browser/stop").json()["status"] == "stopped"
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4 test resume")

    profile = UserProfile(
        identity={
            "first_name": "Tao",
            "last_name": "Hu",
            "email": "tao@example.com",
            "phone": "555-0100",
        },
        documents=[
            DocumentRecord(kind="resume", name="Resume", path=str(resume))
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
    resume_item = next(item for item in plan["items"] if item["field_id"] == "resume")
    assert resume_item["action"] == "upload"
    assert resume_item["value"] == str(resume.resolve())
    assert any(item["field_id"] == "sponsorship" for item in plan["blocked_items"])

    chat_response = client.post(
        "/automation/chat-adjust",
        json={
            "field_id": "motivation",
            "message": "make it shorter",
            "current_plan": plan,
        },
    )
    assert chat_response.status_code == 200
    adjusted = chat_response.json()
    assert adjusted["command"] == "shorten"
    assert adjusted["updated_plan"]["items"]

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


def test_demo_pages_are_served_for_manual_qa(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))

    application_response = client.get("/demo/application")
    assert application_response.status_code == 200
    assert "data-jobflow-demo=\"application\"" in application_response.text
    assert "Submit application manually" in application_response.text

    submitted_get_response = client.get("/demo/submitted")
    assert submitted_get_response.status_code == 200
    assert "Application submitted" in submitted_get_response.text

    submitted_post_response = client.post("/demo/submitted")
    assert submitted_post_response.status_code == 200
    assert "Thank you for applying" in submitted_post_response.text


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

    import_client = TestClient(create_app(tmp_path / "imported.sqlite"))
    import_response = import_client.post("/data/import", json=exported)
    assert import_response.status_code == 200
    imported = import_response.json()
    assert imported["profile"]["documents"][0]["id"] == document["id"]
    assert imported["applications"][0]["company_name"] == "Acme AI"
    assert imported["profile"]["answer_bank"][0]["id"] == "answer_default"


def test_prompt_context_preview_endpoint(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))
    profile = UserProfile(
        identity={"email": "tao@example.com"},
        work_authorization={"authorized": True},
        answer_bank=[
            AnswerBankEntry(
                id="answer_default",
                question_type="motivation",
                body="I build local AI workflow tools.",
            )
        ],
    )
    preferences = Preferences(missing_fact_policy="leave_blank")
    assert client.put("/profile", json=profile.model_dump(mode="json")).status_code == 200
    assert (
        client.put("/preferences", json=preferences.model_dump(mode="json")).status_code
        == 200
    )

    response = client.get("/automation/context-preview")

    assert response.status_code == 200
    preview = response.json()
    source_refs = {source["source_ref"] for source in preview["sources"]}
    assert "profile.identity.email" in source_refs
    assert "profile.work_authorization.authorized" in source_refs
    assert "answer_bank.answer_default" in source_refs
    assert "Missing fact policy: leave_blank" in preview["preference_summary"]
    assert "Do not invent" in preview["generated_prompt"]


def test_review_field_endpoint_updates_fill_plan(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="motivation",
                value="Built local AI workflow tools.",
                confidence=0.72,
                needs_review=True,
                source_refs=["experience_facts.fact_automation"],
            )
        ],
        blocked_items=[
            BlockedItem(field_id="salary", reason="Sensitive field requires review")
        ],
    )

    response = client.post(
        "/automation/review-field",
        json={
            "field_id": "salary",
            "decision": "edit",
            "value": "$120,000 base",
            "current_plan": plan.model_dump(mode="json"),
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "updated"
    assert result["decision"] == "edit"
    assert result["updated_plan"]["blocked_items"] == []
    item = result["updated_plan"]["items"][-1]
    assert item["field_id"] == "salary"
    assert item["source_refs"] == ["user.review.salary"]


def test_application_detail_and_patch(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))
    record = ApplicationRecord(
        company_name="Acme AI",
        job_title="Frontend Engineer",
        job_url="https://jobs.example.com/frontend",
        ats="greenhouse",
        notes="Initial note",
    )
    create_response = client.post("/applications", json=record.model_dump(mode="json"))
    assert create_response.status_code == 200
    created = create_response.json()

    detail_response = client.get(f"/applications/{created['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["job_title"] == "Frontend Engineer"

    patch_response = client.patch(
        f"/applications/{created['id']}",
        json={"status": "archived", "notes": "Followed up by email."},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["status"] == "archived"
    assert patched["notes"] == "Followed up by email."

    missing_response = client.get("/applications/app_missing")
    assert missing_response.status_code == 404


def test_events_websocket_replays_recent_events(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))

    pause_response = client.post("/automation/pause")
    assert pause_response.status_code == 200

    with client.websocket_connect("/events") as websocket:
        event = websocket.receive_json()

    assert event["event_type"] == "automation.paused"
    assert event["status"] == "warning"
    assert event["message"] == "Automation paused."


def test_chat_adjustment_event_redacts_user_text_and_plan_values(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "jobflow.sqlite"))
    plan = FillPlan(
        items=[
            FillPlanItem(
                field_id="motivation",
                value="Private long answer about a personal project and tao@example.com",
                needs_review=True,
                source_refs=["answer_bank.private"],
            )
        ]
    )

    response = client.post(
        "/automation/chat-adjust",
        json={
            "field_id": "motivation",
            "message": "make it shorter and remember tao@example.com",
            "current_plan": plan.model_dump(mode="json"),
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == "make it shorter and remember tao@example.com"

    with client.websocket_connect("/events") as websocket:
        event = websocket.receive_json()

    serialized_event = json.dumps(event)
    assert event["event_type"] == "automation.chat_adjusted"
    assert event["message"] == "Parsed chat adjustment as shorten."
    assert event["payload"]["message"] == "[redacted]"
    assert event["payload"]["updated_plan"] == "[redacted]"
    assert "tao@example.com" not in serialized_event
    assert "Private long answer" not in serialized_event
