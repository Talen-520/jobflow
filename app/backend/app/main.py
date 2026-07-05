from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.db.database import Database
from app.services.browser_controller import BrowserController
from app.services.document_vault import DocumentVaultService
from app.services.event_bus import EventBus


def create_app(db_path: str | Path | None = None) -> FastAPI:
    app = FastAPI(title="JobFlow Local API", version="0.1.0")
    resolved_db_path = Path(db_path or settings.db_path)
    app.state.database = Database(resolved_db_path)
    app.state.browser = BrowserController()
    app.state.event_bus = EventBus()
    vault_path = settings.vault_path if db_path is None else resolved_db_path.parent / "vault"
    app.state.vault = DocumentVaultService(vault_path)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:1420",
            "http://127.0.0.1:1420",
            "tauri://localhost",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
