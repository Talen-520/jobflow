from __future__ import annotations

import os
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        backend_root = Path(__file__).resolve().parents[2]
        data_root = backend_root / "data"
        self.db_path = Path(os.getenv("JOBFLOW_DB_PATH", data_root / "jobflow.sqlite"))
        self.vault_path = Path(os.getenv("JOBFLOW_VAULT_PATH", data_root / "vault"))
        self.browser_user_data_path = Path(
            os.getenv("JOBFLOW_BROWSER_USER_DATA_PATH", data_root / "browser-profile")
        )
        self.browser_headless = os.getenv("JOBFLOW_BROWSER_HEADLESS", "false").lower() == "true"
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")


settings = Settings()
