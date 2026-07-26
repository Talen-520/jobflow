from pathlib import Path

from app.db.database import Database
from app.models.schemas import DocumentRecord, UserProfile
from app.services.legacy_data_migration import migrate_legacy_storage


def test_legacy_migration_merges_missing_fields_and_newer_resume(tmp_path: Path) -> None:
    destination_root = tmp_path / "persistent"
    legacy_root = tmp_path / "legacy"
    destination_vault = destination_root / "vault"
    legacy_vault = legacy_root / "vault"
    destination_vault.mkdir(parents=True)
    legacy_vault.mkdir(parents=True)

    destination_resume = destination_vault / "old-resume.pdf"
    destination_resume.write_bytes(b"old resume")
    legacy_resume = legacy_vault / "new-resume.pdf"
    legacy_resume.write_bytes(b"new resume")

    destination = Database(destination_root / "jobflow.sqlite")
    destination.put_profile(
        UserProfile(
            identity={"first_name": "Saved", "email": "saved@example.com"},
            documents=[
                DocumentRecord(
                    id="doc_old",
                    kind="resume",
                    name="Old Resume",
                    path=str(destination_resume),
                    created_at="2026-01-01T00:00:00Z",
                )
            ],
        )
    )

    legacy = Database(legacy_root / "jobflow.sqlite")
    legacy.put_profile(
        UserProfile(
            identity={"first_name": "", "phone": "555-0100"},
            documents=[
                DocumentRecord(
                    id="doc_new",
                    kind="resume",
                    name="New Resume",
                    path=str(legacy_resume),
                    created_at="2026-02-01T00:00:00Z",
                )
            ],
        )
    )

    assert migrate_legacy_storage(
        legacy_root=legacy_root,
        destination_root=destination_root,
    ) is True

    merged = Database(destination_root / "jobflow.sqlite").get_profile()
    assert merged.identity.first_name == "Saved"
    assert merged.identity.email == "saved@example.com"
    assert merged.identity.phone == "555-0100"
    assert [document.id for document in merged.documents] == ["doc_new"]
    migrated_resume = Path(merged.documents[0].path)
    assert migrated_resume.parent == destination_vault
    assert migrated_resume.read_bytes() == b"new resume"

    assert migrate_legacy_storage(
        legacy_root=legacy_root,
        destination_root=destination_root,
    ) is False
