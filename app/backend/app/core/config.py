from __future__ import annotations

import os
import sys
from pathlib import Path


def default_app_data_root() -> Path:
    configured = os.getenv("JOBFLOW_DATA_DIR")
    if configured:
        return Path(configured).expanduser()
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library/Application Support/com.jobflow.desktop"
    if os.name == "nt":
        return Path(os.getenv("APPDATA", home / "AppData/Roaming")) / "com.jobflow.desktop"
    return Path(os.getenv("XDG_DATA_HOME", home / ".local/share")) / "com.jobflow.desktop"


class Settings:
    def __init__(self) -> None:
        backend_root = Path(__file__).resolve().parents[2]
        self.legacy_data_root = backend_root / "data"
        data_root = default_app_data_root()
        self.data_root = data_root
        self.db_path = Path(os.getenv("JOBFLOW_DB_PATH", data_root / "jobflow.sqlite"))
        self.vault_path = Path(os.getenv("JOBFLOW_VAULT_PATH", data_root / "vault"))
        self.secrets_path = Path(os.getenv("JOBFLOW_ENV_PATH", data_root / ".env"))
        self.pairing_token_path = Path(
            os.getenv("JOBFLOW_PAIRING_TOKEN_PATH", data_root / "extension-pairing-token")
        )
        self.extension_api_origin = os.getenv(
            "JOBFLOW_EXTENSION_API_ORIGIN", "http://127.0.0.1:8765"
        ).rstrip("/")
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")


settings = Settings()
