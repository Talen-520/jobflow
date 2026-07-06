from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.schemas import AutomationEvent, ApplicationRecord, Preferences, UserProfile


class Database:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self) -> None:
        with self.connect() as db:
            db.execute(
                """
                create table if not exists profile_state (
                    id text primary key,
                    payload text not null,
                    updated_at text not null
                )
                """
            )
            db.execute(
                """
                create table if not exists preferences_state (
                    id text primary key,
                    payload text not null,
                    updated_at text not null
                )
                """
            )
            db.execute(
                """
                create table if not exists applications (
                    id text primary key,
                    payload text not null,
                    created_at text not null,
                    updated_at text not null
                )
                """
            )
            db.execute(
                """
                create table if not exists automation_events (
                    id integer primary key autoincrement,
                    event_type text not null,
                    payload text not null,
                    created_at text not null
                )
                """
            )

    def get_profile(self) -> UserProfile:
        row = self._get_state("profile_state")
        if not row:
            profile = UserProfile()
            self.put_profile(profile)
            return profile
        return UserProfile.model_validate_json(row["payload"])

    def put_profile(self, profile: UserProfile) -> UserProfile:
        self._put_state("profile_state", profile.model_dump(mode="json"))
        return profile

    def get_preferences(self) -> Preferences:
        row = self._get_state("preferences_state")
        if not row:
            preferences = Preferences()
            self.put_preferences(preferences)
            return preferences
        return Preferences.model_validate_json(row["payload"])

    def put_preferences(self, preferences: Preferences) -> Preferences:
        self._put_state("preferences_state", preferences.model_dump(mode="json"))
        return preferences

    def list_applications(self) -> list[ApplicationRecord]:
        with self.connect() as db:
            rows = db.execute(
                "select payload from applications order by updated_at desc"
            ).fetchall()
        return [ApplicationRecord.model_validate_json(row["payload"]) for row in rows]

    def create_application(self, record: ApplicationRecord) -> ApplicationRecord:
        now = datetime.now(timezone.utc)
        record.created_at = record.created_at or now
        record.updated_at = now
        payload = record.model_dump(mode="json")
        with self.connect() as db:
            db.execute(
                """
                insert into applications (id, payload, created_at, updated_at)
                values (?, ?, ?, ?)
                """,
                (
                    record.id,
                    json.dumps(payload),
                    record.created_at.isoformat(),
                    record.updated_at.isoformat(),
                ),
            )
        return record

    def patch_application(self, record_id: str, patch: dict[str, Any]) -> ApplicationRecord:
        current = self.get_application(record_id)
        data = current.model_dump(mode="json")
        data.update(patch)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        updated = ApplicationRecord.model_validate(data)
        with self.connect() as db:
            db.execute(
                "update applications set payload = ?, updated_at = ? where id = ?",
                (
                    json.dumps(updated.model_dump(mode="json")),
                    updated.updated_at.isoformat(),
                    record_id,
                ),
            )
        return updated

    def get_application(self, record_id: str) -> ApplicationRecord:
        with self.connect() as db:
            row = db.execute(
                "select payload from applications where id = ?", (record_id,)
            ).fetchone()
        if row is None:
            raise KeyError(record_id)
        return ApplicationRecord.model_validate_json(row["payload"])

    def delete_application(self, record_id: str) -> ApplicationRecord:
        current = self.get_application(record_id)
        with self.connect() as db:
            db.execute("delete from applications where id = ?", (record_id,))
        return current

    def log_event(self, event_type: str, payload: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                """
                insert into automation_events (event_type, payload, created_at)
                values (?, ?, ?)
                """,
                (
                    event_type,
                    json.dumps(payload),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def list_automation_events(self, limit: int = 100) -> list[AutomationEvent]:
        safe_limit = max(1, min(limit, 200))
        with self.connect() as db:
            rows = db.execute(
                """
                select payload from automation_events
                order by id desc
                limit ?
                """,
                (safe_limit,),
            ).fetchall()
        return [AutomationEvent.model_validate_json(row["payload"]) for row in rows]

    def clear_automation_events(self) -> int:
        with self.connect() as db:
            cursor = db.execute("delete from automation_events")
        return max(cursor.rowcount, 0)

    def _get_state(self, table: str) -> sqlite3.Row | None:
        with self.connect() as db:
            return db.execute(f"select payload from {table} where id = 'main'").fetchone()

    def _put_state(self, table: str, payload: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                f"""
                insert into {table} (id, payload, updated_at)
                values ('main', ?, ?)
                on conflict(id) do update set payload = excluded.payload,
                updated_at = excluded.updated_at
                """,
                (json.dumps(payload), datetime.now(timezone.utc).isoformat()),
            )
