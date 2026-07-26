from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Literal

from app.models.schemas import DocumentImportRequest, DocumentRecord


MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
APPLICATION_DOCUMENT_SUFFIXES = {".pdf", ".doc", ".docx", ".rtf", ".txt"}


class DocumentVaultService:
    def __init__(self, vault_path: Path | str) -> None:
        self.vault_path = Path(vault_path)

    def import_document(self, request: DocumentImportRequest) -> DocumentRecord:
        source = Path(request.path).expanduser()
        if not source.exists() or not source.is_file():
            raise FileNotFoundError(str(source))
        self._validate_document(source.name, source.stat().st_size, request.kind)

        self.vault_path.mkdir(parents=True, exist_ok=True)
        document = DocumentRecord(
            kind=request.kind,
            name=request.name or source.name,
        )
        destination = self.vault_path / self._vault_filename(document, source)
        shutil.copy2(source, destination)
        document.path = str(destination.resolve())
        return document

    def import_document_bytes(
        self,
        *,
        content: bytes,
        filename: str,
        kind: Literal["resume", "cover_letter", "other"] = "resume",
        name: str = "",
    ) -> DocumentRecord:
        if not content:
            raise ValueError("Document upload is empty")

        source = Path(filename or name or "document").name
        self._validate_document(source, len(content), kind)
        self.vault_path.mkdir(parents=True, exist_ok=True)
        document = DocumentRecord(
            kind=kind,
            name=name or source,
        )
        destination = self.vault_path / self._vault_filename(document, Path(source))
        destination.write_bytes(content)
        document.path = str(destination.resolve())
        return document

    def delete_document_file(self, document: DocumentRecord) -> bool:
        if not document.path:
            return False
        path = Path(document.path).expanduser()
        try:
            resolved_path = path.resolve()
            resolved_vault = self.vault_path.resolve()
            resolved_path.relative_to(resolved_vault)
        except (FileNotFoundError, ValueError):
            return False

        if not resolved_path.is_file():
            return False
        resolved_path.unlink()
        return True

    def readable_document_path(self, document: DocumentRecord) -> Path:
        if not document.path:
            raise FileNotFoundError(document.id)
        path = Path(document.path).expanduser().resolve()
        try:
            path.relative_to(self.vault_path.resolve())
        except ValueError as exc:
            raise PermissionError("Document is outside the JobFlow vault") from exc
        if not path.is_file():
            raise FileNotFoundError(document.id)
        return path

    def _vault_filename(self, document: DocumentRecord, source: Path) -> str:
        stem = self._slug(document.name or source.stem)
        suffix = source.suffix.lower()
        return f"{document.id}-{stem}{suffix}"

    def _slug(self, value: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-")
        return slug or "document"

    def _validate_document(
        self,
        filename: str,
        size: int,
        kind: Literal["resume", "cover_letter", "other"],
    ) -> None:
        if size > MAX_DOCUMENT_BYTES:
            raise ValueError("Document exceeds the 10 MB local upload limit")
        suffix = Path(filename).suffix.lower()
        if kind in {"resume", "cover_letter"} and suffix not in APPLICATION_DOCUMENT_SUFFIXES:
            allowed = ", ".join(sorted(APPLICATION_DOCUMENT_SUFFIXES))
            raise ValueError(f"Unsupported application document type; use {allowed}")
