from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit


REDACTED = "[redacted]"

_SENSITIVE_KEYS = {
    "answer",
    "answers_snapshot",
    "body",
    "content",
    "current_plan",
    "html",
    "message",
    "notes",
    "path",
    "plan",
    "text",
    "updated_plan",
    "value",
}
_URL_KEYS = {"job_url", "url"}
_EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_PHONE_PATTERN = re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b")
_URL_PATTERN = re.compile(r"https?://[^\s<>'\")]+", re.I)


def redact_event_message(message: str) -> str:
    return _redact_inline_secrets(message)


def redact_event_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return _redact_value(payload)


def _redact_value(value: Any, key: str = "") -> Any:
    normalized_key = key.lower()
    if normalized_key in _SENSITIVE_KEYS:
        return REDACTED
    if normalized_key in _URL_KEYS and isinstance(value, str):
        return _sanitize_url(value)
    if isinstance(value, dict):
        return {
            item_key: _redact_value(item_value, item_key)
            for item_key, item_value in value.items()
        }
    if isinstance(value, list):
        return [_redact_value(item) for item in value]
    if isinstance(value, str):
        return _redact_inline_secrets(value)
    return value


def _redact_inline_secrets(value: str) -> str:
    without_urls = _URL_PATTERN.sub(lambda match: _sanitize_url(match.group(0)), value)
    without_emails = _EMAIL_PATTERN.sub("[email]", without_urls)
    return _PHONE_PATTERN.sub("[phone]", without_emails)


def _sanitize_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return REDACTED
    if not parsed.scheme or not parsed.netloc:
        return _redact_inline_secrets(value)
    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme, host, parsed.path, "", ""))
