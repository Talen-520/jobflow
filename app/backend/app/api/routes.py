from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.database import Database
from app.models.schemas import (
    ApplicationRecord,
    ApplyFillPlanRequest,
    BrowserState,
    BrowserOpenRequest,
    DataExport,
    DocumentRecord,
    ChatAdjustRequest,
    DocumentImportRequest,
    FillResult,
    FillPlan,
    FillPlanRequest,
    FormSchema,
    HealthResponse,
    InspectRequest,
    OpenAnswerDraft,
    OpenAnswerDraftRequest,
    Preferences,
    SuccessDetectionRequest,
    SuccessDetectionResult,
    UserProfile,
)
from app.services.browser_controller import BrowserController
from app.services.ai_orchestrator import OpenAnswerOrchestrator
from app.services.document_vault import DocumentVaultService
from app.services.fill_plan import FillPlanService
from app.services.form_extraction import FormExtractionService
from app.services.success_detection import SuccessDetectionService

router = APIRouter()


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_browser(request: Request) -> BrowserController:
    return request.app.state.browser


def get_vault(request: Request) -> DocumentVaultService:
    return request.app.state.vault


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/profile", response_model=UserProfile)
def get_profile(db: Database = Depends(get_database)) -> UserProfile:
    return db.get_profile()


@router.put("/profile", response_model=UserProfile)
def put_profile(profile: UserProfile, db: Database = Depends(get_database)) -> UserProfile:
    return db.put_profile(profile)


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
    record: ApplicationRecord, db: Database = Depends(get_database)
) -> ApplicationRecord:
    return db.create_application(record)


@router.patch("/applications/{record_id}", response_model=ApplicationRecord)
def patch_application(
    record_id: str, patch: dict[str, Any], db: Database = Depends(get_database)
) -> ApplicationRecord:
    try:
        return db.patch_application(record_id, patch)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Application not found") from exc


@router.post("/documents/import", response_model=DocumentRecord)
def import_document(
    request: DocumentImportRequest,
    db: Database = Depends(get_database),
    vault: DocumentVaultService = Depends(get_vault),
) -> DocumentRecord:
    profile = db.get_profile()
    try:
        document = vault.import_document(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document path not found") from exc
    profile.documents.append(document)
    saved = UserProfile.model_validate(profile.model_dump(mode="json"))
    db.put_profile(saved)
    return document


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
async def browser_start(browser: BrowserController = Depends(get_browser)) -> BrowserState:
    return await browser.start()


@router.post("/browser/open", response_model=BrowserState)
async def browser_open(
    request: BrowserOpenRequest, browser: BrowserController = Depends(get_browser)
) -> BrowserState:
    return await browser.open(str(request.url))


@router.post("/browser/stop", response_model=BrowserState)
async def browser_stop(browser: BrowserController = Depends(get_browser)) -> BrowserState:
    return await browser.stop()


@router.post("/automation/inspect", response_model=FormSchema)
async def inspect_form(
    request: InspectRequest, browser: BrowserController = Depends(get_browser)
) -> FormSchema:
    if not request.html:
        try:
            return await browser.inspect()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    return FormExtractionService().extract_from_html(
        html=request.html,
        url=request.url,
        ats=request.ats,
    )


@router.post("/automation/create-fill-plan", response_model=FillPlan)
def create_fill_plan(
    request: FillPlanRequest, db: Database = Depends(get_database)
) -> FillPlan:
    return FillPlanService().create_plan(
        form=request.form,
        profile=db.get_profile(),
        preferences=db.get_preferences(),
    )


@router.post("/automation/draft-open-answer", response_model=OpenAnswerDraft)
def draft_open_answer(
    request: OpenAnswerDraftRequest,
    db: Database = Depends(get_database),
) -> OpenAnswerDraft:
    return OpenAnswerOrchestrator().draft(
        request=request,
        profile=db.get_profile(),
        preferences=db.get_preferences(),
    )


@router.post("/automation/apply-fill-plan", response_model=FillResult)
async def apply_fill_plan(
    request: ApplyFillPlanRequest, browser: BrowserController = Depends(get_browser)
) -> FillResult:
    try:
        return await browser.apply_fill_plan(
            request.plan,
            form=request.form,
            dry_run=request.dry_run,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/automation/pause")
def pause_automation() -> dict[str, str]:
    return {"status": "paused"}


@router.post("/automation/resume")
def resume_automation() -> dict[str, str]:
    return {"status": "resumed"}


@router.post("/automation/chat-adjust")
def chat_adjust(request: ChatAdjustRequest) -> dict[str, object]:
    message = request.message.lower()
    command = "review"
    if "leave" in message and "blank" in message:
        command = "leave_blank"
    elif "short" in message:
        command = "shorten"
    elif "use" in message:
        command = "use_fact"
    return {
        "status": "parsed",
        "field_id": request.field_id,
        "command": command,
        "message": request.message,
    }


@router.post("/automation/detect-success", response_model=SuccessDetectionResult)
async def detect_success(
    request: SuccessDetectionRequest, browser: BrowserController = Depends(get_browser)
) -> SuccessDetectionResult:
    if not request.html:
        try:
            return await browser.detect_success(
                company_name_hint=request.company_name_hint,
                job_title_hint=request.job_title_hint,
                ats=request.ats,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SuccessDetectionService().detect(request)
