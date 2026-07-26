import json

import httpx

from app.models.schemas import (
    AnswerBankEntry,
    Fact,
    OpenAnswerDraftRequest,
    Preferences,
    UserProfile,
)
from app.services.ai_orchestrator import (
    GeminiGenerateClient,
    OpenAICompatibleGenerateClient,
    OpenAnswerOrchestrator,
    create_generate_client,
)
from app.services.credential_store import MemoryCredentialStore


class FakeGenerateClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def generate(self, prompt: str, schema: dict[str, object]) -> str:
        assert "Use only the source facts" in prompt
        assert schema["type"] == "object"
        return json.dumps(self.payload)


def test_open_answer_uses_supported_model_output() -> None:
    profile = UserProfile(
        answer_bank=[
            AnswerBankEntry(
                id="answer_motivation",
                question_type="motivation",
                body="I enjoy building practical local AI tools.",
                tags=["ai", "automation"],
            )
        ]
    )
    service = OpenAnswerOrchestrator(
        FakeGenerateClient(
            {
                "answer": "I enjoy building practical local AI tools.",
                "source_refs": ["answer_bank.answer_motivation"],
                "unsupported_claims": [],
            }
        )
    )

    draft = service.draft(
        OpenAnswerDraftRequest(
            question="Why are you interested in this AI automation role?",
            question_type="motivation",
            use_model=True,
        ),
        profile,
        Preferences(),
    )

    assert draft.fallback_used is False
    assert draft.needs_review is True
    assert draft.source_refs == ["answer_bank.answer_motivation"]


def test_open_answer_can_use_detected_company_and_role_as_validated_context() -> None:
    service = OpenAnswerOrchestrator(
        FakeGenerateClient(
            {
                "answer": "I am interested in the Agent Engineer role at Avoca.",
                "source_refs": [
                    "form.context.company_name",
                    "form.context.job_title",
                ],
                "unsupported_claims": [],
            }
        )
    )

    draft = service.draft(
        OpenAnswerDraftRequest(
            question="Why do you want to work here?",
            question_type="company_interest",
            context_facts={
                "company_name": "Avoca",
                "job_title": "Agent Engineer",
            },
            use_model=True,
        ),
        UserProfile(),
        Preferences(),
    )

    assert draft.answer == "I am interested in the Agent Engineer role at Avoca."
    assert draft.fallback_used is False
    assert draft.source_refs == [
        "form.context.company_name",
        "form.context.job_title",
    ]


def test_open_answer_rejects_unsupported_model_sources() -> None:
    profile = UserProfile(
        experience_facts=[
            Fact(
                id="fact_local_ai",
                title="Local AI",
                body="Built local AI workflow tools.",
                tags=["ai", "automation"],
            )
        ]
    )
    service = OpenAnswerOrchestrator(
        FakeGenerateClient(
            {
                "answer": "I led a team of 20 at a Fortune 100 company.",
                "source_refs": ["experience_facts.missing"],
                "unsupported_claims": [],
            }
        )
    )

    draft = service.draft(
        OpenAnswerDraftRequest(
            question="Tell us about your AI automation experience.",
            keywords=["local", "ai", "automation"],
            use_model=True,
        ),
        profile,
        Preferences(),
    )

    assert draft.fallback_used is True
    assert "Built local AI workflow tools." in draft.answer
    assert "Fortune 100" not in draft.answer
    assert draft.source_refs == ["experience_facts.fact_local_ai"]


def test_open_answer_returns_review_state_when_no_sources_match() -> None:
    draft = OpenAnswerOrchestrator().draft(
        OpenAnswerDraftRequest(question="Describe your Kubernetes experience."),
        UserProfile(),
        Preferences(),
    )

    assert draft.answer == ""
    assert draft.needs_review is True
    assert draft.source_refs == []
    assert draft.reason == "No matching user-provided facts were found."


def test_openai_compatible_client_sends_strict_schema_without_defaults() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["authorization"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": '{"answer":"ok","source_refs":[],"unsupported_claims":[]}'}}
                ]
            },
        )

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    client = OpenAICompatibleGenerateClient(
        base_url="https://api.openai.com/v1",
        model="gpt-5.6-terra",
        api_key="secret",
        strict_schema=True,
        http_client=http_client,
    )
    schema = {
        "type": "object",
        "properties": {"answer": {"type": "string", "default": ""}},
    }

    assert '"answer":"ok"' in client.generate("prompt", schema)
    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["authorization"] == "Bearer secret"
    body = captured["body"]
    response_schema = body["response_format"]["json_schema"]["schema"]  # type: ignore[index]
    assert response_schema["required"] == ["answer"]
    assert "default" not in response_schema["properties"]["answer"]


def test_gemini_client_sends_response_schema_and_api_key_header() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["key"] = request.headers["x-goog-api-key"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": '{"answer":"ok"}' }]}}
                ]
            },
        )

    client = GeminiGenerateClient(
        base_url="https://generativelanguage.googleapis.com",
        model="gemini-3.5-flash",
        api_key="gemini-secret",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert client.generate("prompt", {"type": "object"}) == '{"answer":"ok"}'
    assert captured["url"].endswith(
        "/v1beta/models/gemini-3.5-flash:generateContent"
    )
    assert captured["key"] == "gemini-secret"
    assert captured["body"]["generationConfig"]["responseMimeType"] == "application/json"  # type: ignore[index]


def test_orchestrator_uses_provider_preferences_and_key_store() -> None:
    credentials = MemoryCredentialStore()
    credentials.set("deepseek", "deepseek-secret")
    preferences = Preferences(
        ai_provider="deepseek",
        ai_model="deepseek-v4-flash",
        ai_base_url="https://api.deepseek.com",
    )

    client = create_generate_client(preferences, credentials.get("deepseek"))

    assert isinstance(client, OpenAICompatibleGenerateClient)
    assert client.model == "deepseek-v4-flash"
    assert client.strict_schema is False


def test_orchestrator_falls_back_when_remote_provider_has_no_key() -> None:
    profile = UserProfile(
        experience_facts=[
            Fact(
                id="fact_local_ai",
                title="Local AI",
                body="Built local AI workflow tools.",
                tags=["ai"],
            )
        ]
    )
    draft = OpenAnswerOrchestrator(
        credential_store=MemoryCredentialStore()
    ).draft(
        OpenAnswerDraftRequest(
            question="Describe your AI experience.",
            keywords=["local"],
            use_model=True,
        ),
        profile,
        Preferences(ai_provider="openai", ai_model="gpt-5.6-terra"),
    )

    assert draft.fallback_used is True
    assert "Built local AI workflow tools." in draft.answer
