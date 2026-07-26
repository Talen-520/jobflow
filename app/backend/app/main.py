from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.db.database import Database
from app.services.browser_controller import BrowserController
from app.services.credential_store import (
    CredentialStore,
    EnvFileCredentialStore,
    MemoryCredentialStore,
)
from app.services.document_vault import DocumentVaultService
from app.services.event_bus import EventBus
from app.services.extension_bridge import ExtensionBridge
from app.services.legacy_data_migration import migrate_legacy_storage


def create_app(
    db_path: str | Path | None = None,
    credential_store: CredentialStore | None = None,
) -> FastAPI:
    app = FastAPI(title="JobFlow Local API", version="0.1.0")
    resolved_db_path = Path(db_path or settings.db_path)
    if os.getenv("JOBFLOW_MIGRATE_LEGACY", "false").lower() == "true":
        migrate_legacy_storage(
            legacy_root=settings.legacy_data_root,
            destination_root=resolved_db_path.parent,
        )
    app.state.database = Database(resolved_db_path)
    data_root = resolved_db_path.parent
    pairing_token_path = (
        settings.pairing_token_path
        if db_path is None
        else data_root / "extension-pairing-token"
    )
    app.state.extension_bridge = ExtensionBridge(pairing_token_path=pairing_token_path)
    app.state.browser = BrowserController(app.state.extension_bridge)
    app.state.event_bus = EventBus()
    app.state.credential_store = credential_store or (
        EnvFileCredentialStore(settings.secrets_path)
        if db_path is None
        else MemoryCredentialStore()
    )
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
