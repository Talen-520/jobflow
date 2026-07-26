from __future__ import annotations

import asyncio
import hmac
import os
import secrets
from pathlib import Path
from typing import Any
from uuid import uuid4


class ExtensionPairingError(ValueError):
    pass


class ExtensionDisconnectedError(RuntimeError):
    pass


def load_or_create_pairing_token(path: Path) -> str:
    path = path.expanduser()
    if path.is_file():
        existing = path.read_text(encoding="utf-8").strip()
        if existing:
            os.chmod(path, 0o600)
            return existing

    path.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(18)
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(f"{token}\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    os.chmod(path, 0o600)
    return token


class ExtensionBridge:
    def __init__(
        self,
        pairing_token: str | None = None,
        pairing_token_path: Path | None = None,
    ) -> None:
        self._pairing_token = pairing_token
        self._pairing_token_path = pairing_token_path
        self._socket: Any | None = None
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self.url = ""
        self.title = ""
        self.extension_version = ""
        self.captcha_detected = False
        self.form_detected = False
        self.field_count = 0
        self.ats = ""
        self.form_url = ""

    @property
    def pairing_token(self) -> str:
        if self._pairing_token is None:
            self._pairing_token = (
                load_or_create_pairing_token(self._pairing_token_path)
                if self._pairing_token_path is not None
                else secrets.token_urlsafe(18)
            )
        return self._pairing_token

    @property
    def connected(self) -> bool:
        return self._socket is not None

    def authorize(self, token: str) -> None:
        if not token or not hmac.compare_digest(token, self.pairing_token):
            raise ExtensionPairingError("Invalid Chrome extension pairing token.")

    def attach(self, socket: Any) -> None:
        self._socket = socket

    def detach(self, socket: Any | None = None) -> None:
        if socket is not None and socket is not self._socket:
            return
        self._socket = None
        self.url = ""
        self.title = ""
        self.captcha_detected = False
        self.form_detected = False
        self.field_count = 0
        self.ats = ""
        self.form_url = ""
        for future in self._pending.values():
            if not future.done():
                future.set_exception(
                    ExtensionDisconnectedError("Chrome extension disconnected.")
                )
        self._pending.clear()

    def status(self, include_pairing_token: bool = False) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "url": self.url,
            "title": self.title,
            "extension_version": self.extension_version,
            "captcha_detected": self.captcha_detected,
            "form_detected": self.form_detected,
            "field_count": self.field_count,
            "ats": self.ats,
            "form_url": self.form_url,
            "pairing_token": self.pairing_token if include_pairing_token else "",
        }

    async def request(
        self,
        command: str,
        payload: dict[str, Any] | None = None,
        timeout: float = 15.0,
    ) -> dict[str, Any]:
        if self._socket is None:
            raise ExtensionDisconnectedError(
                "Chrome extension is not connected. Open the JobFlow extension on the application tab."
            )
        request_id = f"req_{uuid4().hex[:16]}"
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._socket.send_json(
                {
                    "type": "command",
                    "request_id": request_id,
                    "command": command,
                    "payload": payload or {},
                }
            )
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError as exc:
            raise TimeoutError(f"Chrome extension command timed out: {command}") from exc
        finally:
            self._pending.pop(request_id, None)

    async def handle_message(self, message: dict[str, Any]) -> None:
        message_type = message.get("type")
        if message_type == "hello":
            tab = message.get("tab") or {}
            self.url = str(tab.get("url") or "")
            self.title = str(tab.get("title") or "")
            self.extension_version = str(message.get("extension_version") or "")
            return
        if message_type == "state":
            self.url = str(message.get("url") or self.url)
            self.title = str(message.get("title") or self.title)
            if "captcha_detected" in message:
                self.captcha_detected = bool(message["captcha_detected"])
            if "form_detected" in message:
                self.form_detected = bool(message["form_detected"])
            if "field_count" in message:
                self.field_count = max(0, int(message["field_count"]))
            if "ats" in message:
                self.ats = str(message["ats"] or "")
            if "form_url" in message:
                self.form_url = str(message["form_url"] or "")
            return
        if message_type != "result":
            return
        request_id = str(message.get("request_id") or "")
        future = self._pending.get(request_id)
        if future is None or future.done():
            return
        if message.get("ok") is False:
            future.set_exception(
                RuntimeError(str(message.get("error") or "Chrome extension command failed."))
            )
            return
        payload = message.get("payload")
        future.set_result(payload if isinstance(payload, dict) else {})
