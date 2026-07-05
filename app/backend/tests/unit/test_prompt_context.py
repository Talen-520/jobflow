from app.models.schemas import AnswerBankEntry, Fact, Preferences, UserProfile
from app.services.prompt_context import PromptContextService


def test_prompt_context_preview_lists_only_saved_sources() -> None:
    profile = UserProfile(
        identity={
            "first_name": "Tao",
            "last_name": "Hu",
            "email": "tao@example.com",
        },
        work_authorization={
            "country": "US",
            "authorized": True,
            "requires_sponsorship": False,
        },
        preferences={"salary": "$120,000 base", "empty_note": ""},
        experience_facts=[
            Fact(
                id="fact_automation",
                title="Automation",
                body="Built local workflow automation tools.",
                tags=["automation"],
            )
        ],
        answer_bank=[
            AnswerBankEntry(
                id="answer_motivation",
                question_type="motivation",
                title="AI motivation",
                body="I like practical AI tools.",
            )
        ],
    )
    preferences = Preferences(salary_answer_policy="use_profile")

    preview = PromptContextService().build_preview(profile, preferences)

    source_refs = {source.source_ref for source in preview.sources}
    assert "profile.identity.email" in source_refs
    assert "profile.work_authorization.authorized" in source_refs
    assert "profile.work_authorization.requires_sponsorship" in source_refs
    assert "profile.preferences.salary" in source_refs
    assert "experience_facts.fact_automation" in source_refs
    assert "answer_bank.answer_motivation" in source_refs
    assert "profile.preferences.empty_note" not in source_refs
    assert preview.source_count == len(preview.sources)
    assert any("Do not invent" in rule for rule in preview.system_rules)
    assert "Final submit: manual_only" in preview.preference_summary
    assert "profile.identity.email" in preview.generated_prompt
    assert "profile.preferences.empty_note" not in preview.generated_prompt


def test_prompt_context_marks_sensitive_sources() -> None:
    profile = UserProfile(
        identity={"phone": "555-0100"},
        work_authorization={"authorized": False},
        preferences={"relocation": "Open to Seattle"},
    )

    preview = PromptContextService().build_preview(profile, Preferences())

    sensitive_refs = {
        source.source_ref for source in preview.sources if source.sensitive
    }
    assert "profile.identity.phone" in sensitive_refs
    assert "profile.work_authorization.authorized" in sensitive_refs
    assert "profile.preferences.relocation" in sensitive_refs
