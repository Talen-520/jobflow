from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol

PROVIDER_ENV_KEYS = {
    "deepseek": "DEEPSEEK_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "custom": "CUSTOM_API_KEY",
}


class CredentialStoreError(RuntimeError):
    pass


class CredentialStore(Protocol):
    storage_name: str

    def get(self, provider: str) -> str | None:
        ...

    def set(self, provider: str, api_key: str) -> None:
        ...

    def delete(self, provider: str) -> None:
        ...


class EnvFileCredentialStore:
    storage_name = "local_env_file"

    def __init__(self, path: Path) -> None:
        self.path = path.expanduser()

    def get(self, provider: str) -> str | None:
        value = self._read().get(self._key(provider), "").strip()
        return value or None

    def set(self, provider: str, api_key: str) -> None:
        values = self._read()
        values[self._key(provider)] = api_key
        self._write(values)

    def delete(self, provider: str) -> None:
        values = self._read()
        values.pop(self._key(provider), None)
        self._write(values)

    def _key(self, provider: str) -> str:
        try:
            return PROVIDER_ENV_KEYS[provider]
        except KeyError as exc:
            raise CredentialStoreError(f"Unsupported AI provider: {provider}") from exc

    def _read(self) -> dict[str, str]:
        if not self.path.is_file():
            return {}
        values: dict[str, str] = {}
        for raw_line in self.path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, raw_value = line.split("=", 1)
            key = key.strip()
            raw_value = raw_value.strip()
            if raw_value.startswith('"'):
                try:
                    values[key] = str(json.loads(raw_value))
                    continue
                except json.JSONDecodeError:
                    pass
            values[key] = raw_value.strip("'")
        return values

    def _write(self, values: dict[str, str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f"{self.path.name}.tmp")
        content = "".join(
            f"{key}={json.dumps(value)}\n" for key, value in sorted(values.items())
        )
        temporary.write_text(content, encoding="utf-8")
        os.chmod(temporary, 0o600)
        temporary.replace(self.path)
        os.chmod(self.path, 0o600)


class MemoryCredentialStore:
    storage_name = "memory"

    def __init__(self) -> None:
        self._values: dict[str, str] = {}

    def get(self, provider: str) -> str | None:
        return self._values.get(provider)

    def set(self, provider: str, api_key: str) -> None:
        self._values[provider] = api_key

    def delete(self, provider: str) -> None:
        self._values.pop(provider, None)
