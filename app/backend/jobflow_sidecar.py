from __future__ import annotations

import multiprocessing
import os

import uvicorn

from app.main import app


def main() -> None:
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.getenv("JOBFLOW_PORT", "8765")),
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
