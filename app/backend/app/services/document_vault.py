from __future__ import annotations

import re
import shutil
from pathlib import Path

from app.models.schemas import DocumentImportRequest, DocumentRecord


class DocumentVaultService:
    def __init__(self, vault_path: Path | str) -> None:
        self.vault_path = Path(vault_path)

    def import_document(self, request: DocumentImportRequest) -> DocumentRecord:
        source = Path(request.path).expanduser()
        if not source.exists() or not source.is_file():
            raise FileNotFoundError(str(source))

        self.vault_path.mkdir(parents=True, exist_ok=True)
        document = DocumentRecord(
            kind=request.kind,
            name=request.name or source.name,
        )
        destination = self.vault_path / self._vault_filename(document, source)
        shutil.copy2(source, destination)
        document.path = str(destination.resolve())
        return document

    def _vault_filename(self, document: DocumentRecord, source: Path) -> str:
        stem = self._slug(document.name or source.stem)
        suffix = source.suffix.lower()
        return f"{document.id}-{stem}{suffix}"

    def _slug(self, value: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-")
        return slug or "document"
