from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from app.db.database import Database
from app.models.schemas import DocumentRecord, UserProfile


MIGRATION_MARKER = ".legacy-storage-v1.json"


def migrate_legacy_storage(*, legacy_root: Path, destination_root: Path) -> bool:
    legacy_root = legacy_root.expanduser().resolve()
    destination_root = destination_root.expanduser().resolve()
    legacy_db_path = legacy_root / "jobflow.sqlite"
    destination_db_path = destination_root / "jobflow.sqlite"
    marker_path = destination_root / MIGRATION_MARKER

    if legacy_root == destination_root or marker_path.exists() or not legacy_db_path.is_file():
        return False

    destination_root.mkdir(parents=True, exist_ok=True)
    if destination_db_path.is_file():
        backup_path = destination_root / "jobflow.pre-legacy-merge.sqlite"
        if not backup_path.exists():
            shutil.copy2(destination_db_path, backup_path)

    destination = Database(destination_db_path)
    legacy = Database(legacy_db_path)
    merged_profile = _merge_profile(
        destination.get_profile(),
        legacy.get_profile(),
        destination_root / "vault",
    )
    destination.put_profile(merged_profile)

    if not _state_exists(destination, "preferences_state") and _state_exists(
        legacy, "preferences_state"
    ):
        destination.put_preferences(legacy.get_preferences())

    existing_application_ids = {
        application.id for application in destination.list_applications()
    }
    for application in legacy.list_applications():
        if application.id not in existing_application_ids:
            destination.create_application(application)

    marker_path.write_text(
        json.dumps(
            {
                "legacy_root": str(legacy_root),
                "destination_root": str(destination_root),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return True


def _state_exists(database: Database, table: str) -> bool:
    with database.connect() as connection:
        row = connection.execute(
            f"select 1 from {table} where id = 'main'"
        ).fetchone()
    return row is not None


def _merge_profile(
    destination: UserProfile,
    legacy: UserProfile,
    destination_vault: Path,
) -> UserProfile:
    destination_data = destination.model_dump(mode="json", exclude={"documents"})
    legacy_data = legacy.model_dump(mode="json", exclude={"documents"})
    merged_data = _merge_missing(destination_data, legacy_data)
    merged_data["documents"] = [
        document.model_dump(mode="json")
        for document in _merge_documents(
            destination.documents,
            legacy.documents,
            destination_vault,
        )
    ]
    return UserProfile.model_validate(merged_data)


def _merge_missing(destination: Any, legacy: Any) -> Any:
    if isinstance(destination, dict) and isinstance(legacy, dict):
        merged = dict(destination)
        for key, legacy_value in legacy.items():
            if key not in merged:
                merged[key] = legacy_value
            else:
                merged[key] = _merge_missing(merged[key], legacy_value)
        return merged
    if isinstance(destination, list) and isinstance(legacy, list):
        merged = list(destination)
        existing_ids = {
            item.get("id") for item in merged if isinstance(item, dict) and item.get("id")
        }
        for item in legacy:
            item_id = item.get("id") if isinstance(item, dict) else None
            if item_id and item_id in existing_ids:
                continue
            if item not in merged:
                merged.append(item)
        return merged
    return legacy if _is_empty(destination) and not _is_empty(legacy) else destination


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _merge_documents(
    destination: list[DocumentRecord],
    legacy: list[DocumentRecord],
    destination_vault: Path,
) -> list[DocumentRecord]:
    destination_vault.mkdir(parents=True, exist_ok=True)
    result: list[DocumentRecord] = []
    for kind in ("resume", "cover_letter"):
        candidates = [
            document
            for document in [*destination, *legacy]
            if document.kind == kind and _document_exists(document)
        ]
        if candidates:
            selected = max(candidates, key=lambda document: document.created_at)
            result.append(_copy_document(selected, destination_vault))

    seen_ids = {document.id for document in result}
    for document in [*destination, *legacy]:
        if document.kind in {"resume", "cover_letter"} or document.id in seen_ids:
            continue
        if _document_exists(document):
            result.append(_copy_document(document, destination_vault))
            seen_ids.add(document.id)
    return result


def _document_exists(document: DocumentRecord) -> bool:
    return bool(document.path) and Path(document.path).expanduser().is_file()


def _copy_document(document: DocumentRecord, destination_vault: Path) -> DocumentRecord:
    source = Path(document.path).expanduser().resolve()
    try:
        source.relative_to(destination_vault.resolve())
        return document
    except ValueError:
        pass
    destination = destination_vault / f"{document.id}-{source.name}"
    if not destination.exists() or destination.stat().st_mtime < source.stat().st_mtime:
        shutil.copy2(source, destination)
    migrated = document.model_copy(deep=True)
    migrated.path = str(destination.resolve())
    return migrated
