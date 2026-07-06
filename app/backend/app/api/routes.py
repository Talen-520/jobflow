from __future__ import annotations

from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import HTMLResponse

from app.db.database import Database
from app.models.schemas import (
    AnswerBankEntry,
    AnswerBankSaveRequest,
    AutomationEvent,
    ApplicationDeleteResult,
    ApplicationRecord,
    ApplyFillPlanRequest,
    BrowserState,
    BrowserOpenRequest,
    ChatAdjustResult,
    DataExport,
    DocumentDeleteResult,
    DocumentRecord,
    ChatAdjustRequest,
    DocumentImportRequest,
    EventHistoryClearResult,
    FillResult,
    FillPlan,
    FillPlanRequest,
    FillPlanReviewRequest,
    FillPlanReviewResult,
    FormSchema,
    HealthResponse,
    InspectRequest,
    OpenAnswerDraft,
    OpenAnswerDraftRequest,
    Preferences,
    PromptContextPreview,
    SuccessDetectionRequest,
    SuccessDetectionResult,
    UserProfile,
)
from app.services.browser_controller import BrowserController
from app.services.ai_orchestrator import OpenAnswerOrchestrator
from app.services.chat_adjustment import ChatAdjustmentService
from app.services.document_vault import DocumentVaultService
from app.services.event_bus import EventBus
from app.services.fill_plan import FillPlanService
from app.services.fill_plan_review import FillPlanReviewService
from app.services.form_extraction import FormExtractionService
from app.services.demo_pages import DEMO_APPLICATION_HTML, DEMO_SUBMITTED_HTML
from app.services.prompt_context import PromptContextService
from app.services.success_detection import SuccessDetectionService

router = APIRouter()


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_browser(request: Request) -> BrowserController:
    return request.app.state.browser


def get_vault(request: Request) -> DocumentVaultService:
    return request.app.state.vault


def get_event_bus(request: Request) -> EventBus:
    return request.app.state.event_bus


def publish_event(
    event_bus: EventBus,
    db: Database | None,
    event_type: str,
    message: str,
    status: str = "info",
    payload: dict[str, Any] | None = None,
) -> None:
    event = event_bus.publish(
        event_type=event_type,
        message=message,
        status=status,  # type: ignore[arg-type]
        payload=payload,
    )
    if db is not None:
        db.log_event(event_type, event.model_dump(mode="json"))


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/demo/application", response_class=HTMLResponse)
def demo_application_page() -> HTMLResponse:
    return HTMLResponse(DEMO_APPLICATION_HTML)


@router.get("/demo/submitted", response_class=HTMLResponse)
def demo_submitted_page() -> HTMLResponse:
    return HTMLResponse(DEMO_SUBMITTED_HTML)


@router.post("/demo/submitted", response_class=HTMLResponse)
def demo_submitted_post() -> HTMLResponse:
    return HTMLResponse(DEMO_SUBMITTED_HTML)


@router.get("/events/history", response_model=list[AutomationEvent])
def list_event_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: Database = Depends(get_database),
) -> list[AutomationEvent]:
    return db.list_automation_events(limit)


@router.delete("/events/history", response_model=EventHistoryClearResult)
def clear_event_history(db: Database = Depends(get_database)) -> EventHistoryClearResult:
    return EventHistoryClearResult(deleted_count=db.clear_automation_events())


@router.websocket("/events")
async def events_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    event_bus: EventBus = websocket.app.state.event_bus
    try:
        async for event in event_bus.listen():
            await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        return


@router.get("/profile", response_model=UserProfile)
def get_profile(db: Database = Depends(get_database)) -> UserProfile:
    return db.get_profile()


@router.put("/profile", response_model=UserProfile)
def put_profile(profile: UserProfile, db: Database = Depends(get_database)) -> UserProfile:
    return db.put_profile(profile)


@router.post("/profile/answer-bank", response_model=AnswerBankEntry)
def save_answer_bank_entry(
    request: AnswerBankSaveRequest,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> AnswerBankEntry:
    profile = db.get_profile()
    entry = AnswerBankEntry(
        question_type=request.question_type or "general",
        title=request.title or "Reviewed answer",
        body=request.body,
        tags=request.tags,
    )
    profile.answer_bank.append(entry)
    saved = UserProfile.model_validate(profile.model_dump(mode="json"))
    db.put_profile(saved)
    publish_event(
        event_bus,
        db,
        "profile.answer_saved",
        "Saved reusable answer to the local answer bank.",
        "success",
        {
            "answer_id": entry.id,
            "question_type": entry.question_type,
            "tag_count": len(entry.tags),
        },
    )
    return entry


@router.get("/preferences", response_model=Preferences)
def get_preferences(db: Database = Depends(get_database)) -> Preferences:
    return db.get_preferences()


@router.put("/preferences", response_model=Preferences)
def put_preferences(
    preferences: Preferences, db: Database = Depends(get_database)
) -> Preferences:
    return db.put_preferences(preferences)


@router.get("/applications", response_model=list[ApplicationRecord])
def list_applications(db: Database = Depends(get_database)) -> list[ApplicationRecord]:
    return db.list_applications()


@router.post("/applications", response_model=ApplicationRecord)
def create_application(
    record: ApplicationRecord,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> ApplicationRecord:
    saved = db.create_application(record)
    publish_event(
        event_bus,
        db,
        "application.saved",
        f"Saved application record for {saved.company_name or 'unknown company'}.",
        "success",
        {"application_id": saved.id, "company_name": saved.company_name},
    )
    return saved


@router.get("/applications/{record_id}", response_model=ApplicationRecord)
def get_application(
    record_id: str, db: Database = Depends(get_database)
) -> ApplicationRecord:
    try:
        return db.get_application(record_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Application not found") from exc


@router.patch("/applications/{record_id}", response_model=ApplicationRecord)
def patch_application(
    record_id: str,
    patch: dict[str, Any],
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> ApplicationRecord:
    try:
        updated = db.patch_application(record_id, patch)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Application not found") from exc
    publish_event(
        event_bus,
        db,
        "application.updated",
        f"Updated application record for {updated.company_name or 'unknown company'}.",
        "success",
        {"application_id": updated.id, "company_name": updated.company_name},
    )
    return updated


@router.delete("/applications/{record_id}", response_model=ApplicationDeleteResult)
def delete_application(
    record_id: str,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> ApplicationDeleteResult:
    try:
        deleted = db.delete_application(record_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Application not found") from exc
    publish_event(
        event_bus,
        db,
        "application.deleted",
        f"Deleted application record for {deleted.company_name or 'unknown company'}.",
        "warning",
        {"application_id": deleted.id, "company_name": deleted.company_name},
    )
    return ApplicationDeleteResult(id=deleted.id)


@router.post("/documents/import", response_model=DocumentRecord)
def import_document(
    request: DocumentImportRequest,
    db: Database = Depends(get_database),
    vault: DocumentVaultService = Depends(get_vault),
    event_bus: EventBus = Depends(get_event_bus),
) -> DocumentRecord:
    profile = db.get_profile()
    try:
        document = vault.import_document(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document path not found") from exc
    profile.documents.append(document)
    saved = UserProfile.model_validate(profile.model_dump(mode="json"))
    db.put_profile(saved)
    publish_event(
        event_bus,
        db,
        "document.imported",
        f"Imported {document.name} into the local vault.",
        "success",
        {"document_id": document.id, "kind": document.kind},
    )
    return document


@router.delete("/documents/{document_id}", response_model=DocumentDeleteResult)
def delete_document(
    document_id: str,
    db: Database = Depends(get_database),
    vault: DocumentVaultService = Depends(get_vault),
    event_bus: EventBus = Depends(get_event_bus),
) -> DocumentDeleteResult:
    profile = db.get_profile()
    document = next((item for item in profile.documents if item.id == document_id), None)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    profile.documents = [item for item in profile.documents if item.id != document_id]
    saved = UserProfile.model_validate(profile.model_dump(mode="json"))
    db.put_profile(saved)
    file_deleted = vault.delete_document_file(document)
    publish_event(
        event_bus,
        db,
        "document.deleted",
        f"Deleted {document.name or 'document'} from the local vault.",
        "warning",
        {
            "document_id": document.id,
            "kind": document.kind,
            "file_deleted": file_deleted,
        },
    )
    return DocumentDeleteResult(id=document.id, file_deleted=file_deleted)


@router.get("/data/export", response_model=DataExport)
def export_data(db: Database = Depends(get_database)) -> DataExport:
    return DataExport(
        profile=db.get_profile(),
        preferences=db.get_preferences(),
        applications=db.list_applications(),
    )


@router.post("/data/import", response_model=DataExport)
def import_data(payload: DataExport, db: Database = Depends(get_database)) -> DataExport:
    db.put_profile(payload.profile)
    db.put_preferences(payload.preferences)
    for record in payload.applications:
        try:
            db.get_application(record.id)
            db.patch_application(record.id, record.model_dump(mode="json"))
        except KeyError:
            db.create_application(record)
    return export_data(db)


@router.post("/browser/start", response_model=BrowserState)
async def browser_start(
    browser: BrowserController = Depends(get_browser),
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> BrowserState:
    state = await browser.start()
    publish_event(
        event_bus,
        db,
        "browser.started",
        "Controlled browser started." if state.status != "error" else state.message,
        "success" if state.status != "error" else "error",
        state.model_dump(mode="json"),
    )
    return state


@router.post("/browser/open", response_model=BrowserState)
async def browser_open(
    request: BrowserOpenRequest,
    browser: BrowserController = Depends(get_browser),
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> BrowserState:
    publish_event(
        event_bus,
        db,
        "browser.opening",
        f"Opening {request.url}",
        "running",
        {"url": str(request.url)},
    )
    state = await browser.open(str(request.url))
    publish_event(
        event_bus,
        db,
        "browser.opened",
        state.message or f"Browser opened: {state.url}",
        "success" if state.status != "error" else "error",
        state.model_dump(mode="json"),
    )
    return state


@router.post("/browser/stop", response_model=BrowserState)
async def browser_stop(
    browser: BrowserController = Depends(get_browser),
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> BrowserState:
    state = await browser.stop()
    publish_event(
        event_bus,
        db,
        "browser.stopped",
        "Controlled browser stopped.",
        "info",
        state.model_dump(mode="json"),
    )
    return state


@router.post("/automation/inspect", response_model=FormSchema)
async def inspect_form(
    request: InspectRequest,
    browser: BrowserController = Depends(get_browser),
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> FormSchema:
    if not request.html:
        try:
            form = await browser.inspect()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    else:
        form = FormExtractionService().extract_from_html(
            html=request.html,
            url=request.url,
            ats=request.ats,
        )
    publish_event(
        event_bus,
        db,
        "automation.inspected",
        f"Found {len(form.fields)} fields on {form.ats}.",
        "success",
        {"field_count": len(form.fields), "ats": form.ats, "url": form.url},
    )
    return form


@router.post("/automation/create-fill-plan", response_model=FillPlan)
def create_fill_plan(
    request: FillPlanRequest,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> FillPlan:
    plan = FillPlanService().create_plan(
        form=request.form,
        profile=db.get_profile(),
        preferences=db.get_preferences(),
    )
    publish_event(
        event_bus,
        db,
        "automation.plan_created",
        f"{len(plan.items)} fields planned, {len(plan.blocked_items)} blocked.",
        "success",
        {"planned_count": len(plan.items), "blocked_count": len(plan.blocked_items)},
    )
    return plan


@router.post("/automation/draft-open-answer", response_model=OpenAnswerDraft)
def draft_open_answer(
    request: OpenAnswerDraftRequest,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> OpenAnswerDraft:
    draft = OpenAnswerOrchestrator().draft(
        request=request,
        profile=db.get_profile(),
        preferences=db.get_preferences(),
    )
    publish_event(
        event_bus,
        db,
        "automation.open_answer_drafted",
        (
            f"Drafted open answer from {len(draft.source_refs)} source refs."
            if draft.source_refs
            else "No matching sources found for open answer."
        ),
        "success" if draft.source_refs else "warning",
        {
            "source_refs": draft.source_refs,
            "fallback_used": draft.fallback_used,
            "needs_review": draft.needs_review,
        },
    )
    return draft


@router.get("/automation/context-preview", response_model=PromptContextPreview)
def prompt_context_preview(db: Database = Depends(get_database)) -> PromptContextPreview:
    return PromptContextService().build_preview(
        profile=db.get_profile(),
        preferences=db.get_preferences(),
    )


@router.post("/automation/apply-fill-plan", response_model=FillResult)
async def apply_fill_plan(
    request: ApplyFillPlanRequest,
    browser: BrowserController = Depends(get_browser),
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> FillResult:
    try:
        result = await browser.apply_fill_plan(
            request.plan,
            form=request.form,
            dry_run=request.dry_run,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    publish_event(
        event_bus,
        db,
        "automation.fill_applied",
        (
            f"Filled {result.filled_count}; {result.review_count} need review; "
            f"{result.error_count} errors."
        ),
        "success" if result.error_count == 0 else "warning",
        result.model_dump(mode="json"),
    )
    return result


@router.post("/automation/review-field", response_model=FillPlanReviewResult)
def review_fill_plan_field(
    request: FillPlanReviewRequest,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> FillPlanReviewResult:
    try:
        result = FillPlanReviewService().review(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    publish_event(
        event_bus,
        db,
        "automation.field_reviewed",
        result.message,
        "success",
        {
            "field_id": result.field_id,
            "decision": result.decision,
        },
    )
    return result


@router.post("/automation/pause")
def pause_automation(
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> dict[str, str]:
    publish_event(event_bus, db, "automation.paused", "Automation paused.", "warning")
    return {"status": "paused"}


@router.post("/automation/resume")
def resume_automation(
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> dict[str, str]:
    publish_event(event_bus, db, "automation.resumed", "Automation resumed.", "running")
    return {"status": "resumed"}


@router.post("/automation/chat-adjust", response_model=ChatAdjustResult)
def chat_adjust(
    request: ChatAdjustRequest,
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> ChatAdjustResult:
    result = ChatAdjustmentService().adjust(
        request=request,
        profile=db.get_profile(),
        preferences=db.get_preferences(),
    )
    publish_event(
        event_bus,
        db,
        "automation.chat_adjusted",
        f"Parsed chat adjustment as {result.command}.",
        "info",
        result.model_dump(mode="json"),
    )
    return result


@router.post("/automation/detect-success", response_model=SuccessDetectionResult)
async def detect_success(
    request: SuccessDetectionRequest,
    browser: BrowserController = Depends(get_browser),
    db: Database = Depends(get_database),
    event_bus: EventBus = Depends(get_event_bus),
) -> SuccessDetectionResult:
    if not request.html:
        try:
            result = await browser.detect_success(
                company_name_hint=request.company_name_hint,
                job_title_hint=request.job_title_hint,
                ats=request.ats,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    else:
        result = SuccessDetectionService().detect(request)
    publish_event(
        event_bus,
        db,
        "automation.success_detected",
        (
            f"Success detected at {round(result.confidence * 100)}% confidence."
            if result.detected
            else "No success page detected yet."
        ),
        "success" if result.detected else "info",
        result.model_dump(mode="json"),
    )
    return result
