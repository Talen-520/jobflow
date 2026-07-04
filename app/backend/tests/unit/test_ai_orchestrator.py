import json

from app.models.schemas import (
    AnswerBankEntry,
    Fact,
    OpenAnswerDraftRequest,
    Preferences,
    UserProfile,
)
from app.services.ai_orchestrator import OpenAnswerOrchestrator


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
