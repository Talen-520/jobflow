from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl, field_validator


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str = "jobflow-backend"


class Identity(BaseModel):
    first_name: str = ""
    last_name: str = ""
    preferred_name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    address: str = ""


class Links(BaseModel):
    linkedin: str = ""
    github: str = ""
    portfolio: str = ""


class WorkAuthorization(BaseModel):
    country: str = ""
    authorized: bool | None = None
    requires_sponsorship: bool | None = None
    notes: str = ""


class Fact(BaseModel):
    id: str = Field(default_factory=lambda: new_id("fact"))
    title: str = ""
    body: str = ""
    tags: list[str] = Field(default_factory=list)
    source: str = "user"


class DocumentRecord(BaseModel):
    id: str = Field(default_factory=lambda: new_id("doc"))
    kind: Literal["resume", "cover_letter", "other"] = "resume"
    name: str = ""
    path: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentDeleteResult(BaseModel):
    id: str
    status: Literal["deleted"] = "deleted"
    file_deleted: bool = False


class AnswerBankEntry(BaseModel):
    id: str = Field(default_factory=lambda: new_id("answer"))
    question_type: str = "general"
    title: str = ""
    body: str = ""
    tags: list[str] = Field(default_factory=list)


class AnswerBankSaveRequest(BaseModel):
    question_type: str = "general"
    title: str = ""
    body: str
    tags: list[str] = Field(default_factory=list)

    @field_validator("question_type", "title", "body")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("body")
    @classmethod
    def body_required(cls, value: str) -> str:
        if not value:
            raise ValueError("Answer body is required.")
        return value

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        return [tag.strip() for tag in value if tag.strip()]


class UserProfile(BaseModel):
    identity: Identity = Field(default_factory=Identity)
    links: Links = Field(default_factory=Links)
    work_authorization: WorkAuthorization = Field(default_factory=WorkAuthorization)
    education: list[Fact] = Field(default_factory=list)
    experience_facts: list[Fact] = Field(default_factory=list)
    project_facts: list[Fact] = Field(default_factory=list)
    skill_facts: list[Fact] = Field(default_factory=list)
    documents: list[DocumentRecord] = Field(default_factory=list)
    answer_bank: list[AnswerBankEntry] = Field(default_factory=list)
    preferences: dict[str, Any] = Field(default_factory=dict)


class Preferences(BaseModel):
    final_submission_mode: Literal["manual_only"] = "manual_only"
    fill_sensitive_fields: bool = False
    fill_eeo_fields: bool = False
    ai_provider: Literal["ollama", "deepseek", "openai", "gemini", "custom"] = "ollama"
    ai_model: str = "llama3.1:8b"
    ai_api_key: str = ""
    ai_base_url: str = ""
    open_answer_style: str = "concise_professional"
    open_answer_max_words: int = 180
    salary_answer_policy: Literal["ask_user", "leave_blank", "use_profile"] = "ask_user"
    relocation_policy: Literal["ask_user", "leave_blank", "use_profile"] = "ask_user"
    missing_fact_policy: Literal["ask_user", "leave_blank"] = "ask_user"
    low_confidence_policy: Literal["pause", "leave_blank"] = "pause"


class FieldType(str, Enum):
    text = "text"
    email = "email"
    tel = "tel"
    textarea = "textarea"
    select = "select"
    radio = "radio"
    checkbox = "checkbox"
    file = "file"
    hidden = "hidden"
    unknown = "unknown"


class FormField(BaseModel):
    field_id: str
    label: str = ""
    type: FieldType = FieldType.unknown
    required: bool = False
    options: list[str] = Field(default_factory=list)
    placeholder: str = ""
    helper_text: str = ""
    selector: str = ""
    sensitive: bool = False


class FormSchema(BaseModel):
    url: str = ""
    ats: str = "generic"
    company_name_hint: str = ""
    job_title_hint: str = ""
    fields: list[FormField] = Field(default_factory=list)


class FillPlanItem(BaseModel):
    field_id: str
    action: Literal["fill", "select", "check", "upload", "skip"] = "fill"
    value: str | bool | None = ""
    selector: str = ""
    confidence: float = 0.0
    needs_review: bool = False
    source_refs: list[str] = Field(default_factory=list)
    reason: str = ""

    @field_validator("confidence")
    @classmethod
    def confidence_range(cls, value: float) -> float:
        return max(0.0, min(1.0, value))


class BlockedItem(BaseModel):
    field_id: str
    reason: str


class FillPlan(BaseModel):
    form_id: str = Field(default_factory=lambda: new_id("form"))
    items: list[FillPlanItem] = Field(default_factory=list)
    blocked_items: list[BlockedItem] = Field(default_factory=list)


class FillResultItem(BaseModel):
    field_id: str
    status: Literal["filled", "skipped", "needs_review", "blocked", "error"]
    reason: str = ""


class FillResult(BaseModel):
    status: Literal["applied", "dry_run", "blocked", "error"] = "dry_run"
    filled_count: int = 0
    skipped_count: int = 0
    review_count: int = 0
    error_count: int = 0
    items: list[FillResultItem] = Field(default_factory=list)


class ApplyFillPlanRequest(BaseModel):
    plan: FillPlan
    form: FormSchema | None = None
    dry_run: bool = False


class BrowserState(BaseModel):
    status: Literal["started", "stopped", "not_started", "opened", "error"]
    url: str = ""
    message: str = ""


class AutomationEvent(BaseModel):
    id: str = Field(default_factory=lambda: new_id("evt"))
    event_type: str
    status: Literal["info", "running", "success", "warning", "error"] = "info"
    message: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EventHistoryClearResult(BaseModel):
    status: Literal["cleared"] = "cleared"
    deleted_count: int = 0


class SuccessDetection(BaseModel):
    confidence: float = 0.0
    signals: list[str] = Field(default_factory=list)


class ApplicationRecord(BaseModel):
    id: str = Field(default_factory=lambda: new_id("app"))
    company_name: str = ""
    job_title: str = ""
    application_date: date = Field(default_factory=date.today)
    job_url: str = ""
    ats: str = "generic"
    status: Literal["draft", "applied", "archived"] = "applied"
    resume_document_id: str = ""
    cover_letter_document_id: str = ""
    answers_snapshot: dict[str, Any] = Field(default_factory=dict)
    success_detection: SuccessDetection = Field(default_factory=SuccessDetection)
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ApplicationDeleteResult(BaseModel):
    id: str
    status: Literal["deleted"] = "deleted"


class SuccessDetectionResult(BaseModel):
    detected: bool
    confidence: float
    signals: list[str] = Field(default_factory=list)
    proposed_record: ApplicationRecord | None = None


class ToolCallRecord(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    source_refs: list[str] = Field(default_factory=list)
    result_count: int = 0


class OpenAnswerDraftRequest(BaseModel):
    question: str
    question_type: str = "general"
    keywords: list[str] = Field(default_factory=list)
    max_words: int | None = None
    use_model: bool = False


class OpenAnswerDraft(BaseModel):
    answer: str = ""
    source_refs: list[str] = Field(default_factory=list)
    needs_review: bool = True
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    model_used: str = ""
    fallback_used: bool = True
    unsupported_claims: list[str] = Field(default_factory=list)
    reason: str = ""


class PromptContextSource(BaseModel):
    source_ref: str
    category: str
    label: str
    value: str
    sensitive: bool = False


class PromptContextPreview(BaseModel):
    source_count: int = 0
    system_rules: list[str] = Field(default_factory=list)
    preference_summary: list[str] = Field(default_factory=list)
    sources: list[PromptContextSource] = Field(default_factory=list)
    generated_prompt: str = ""


class InspectRequest(BaseModel):
    url: str = ""
    html: str = ""
    ats: str | None = None


class FillPlanRequest(BaseModel):
    form: FormSchema


class FillPlanReviewRequest(BaseModel):
    field_id: str
    decision: Literal["accept", "edit", "leave_blank"]
    current_plan: FillPlan
    form: FormSchema | None = None
    value: str | bool | None = None


class FillPlanReviewResult(BaseModel):
    status: Literal["updated"] = "updated"
    field_id: str
    decision: Literal["accept", "edit", "leave_blank"]
    updated_plan: FillPlan
    message: str = ""


class ChatAdjustRequest(BaseModel):
    field_id: str | None = None
    message: str
    current_plan: FillPlan | None = None


class ChatAdjustResult(BaseModel):
    status: Literal["parsed"]
    field_id: str | None = None
    command: Literal["review", "leave_blank", "shorten", "use_fact"] = "review"
    message: str
    updated_plan: FillPlan | None = None
    source_refs: list[str] = Field(default_factory=list)


class SuccessDetectionRequest(BaseModel):
    url: str = ""
    html: str = ""
    ats: str = "generic"
    company_name_hint: str = ""
    job_title_hint: str = ""


class BrowserOpenRequest(BaseModel):
    url: HttpUrl


class DocumentImportRequest(BaseModel):
    kind: Literal["resume", "cover_letter", "other"] = "resume"
    name: str
    path: str


class DataExport(BaseModel):
    profile: UserProfile
    preferences: Preferences
    applications: list[ApplicationRecord] = Field(default_factory=list)
