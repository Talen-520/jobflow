import asyncio
import stat
from pathlib import Path

import pytest

from app.services.extension_bridge import (
    ExtensionBridge,
    ExtensionPairingError,
    load_or_create_pairing_token,
)


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []

    async def send_json(self, payload: dict[str, object]) -> None:
        self.sent.append(payload)


def test_extension_bridge_rejects_wrong_pairing_token() -> None:
    bridge = ExtensionBridge(pairing_token="correct-token")

    with pytest.raises(ExtensionPairingError):
        bridge.authorize("wrong-token")


def test_pairing_token_persists_across_backend_restarts(tmp_path: Path) -> None:
    token_path = tmp_path / "extension-pairing-token"

    first = load_or_create_pairing_token(token_path)
    second = load_or_create_pairing_token(token_path)

    assert first == second
    assert first
    assert stat.S_IMODE(token_path.stat().st_mode) == 0o600


def test_extension_bridge_creates_persistent_token_lazily(tmp_path: Path) -> None:
    token_path = tmp_path / "extension-pairing-token"
    bridge = ExtensionBridge(pairing_token_path=token_path)

    assert not token_path.exists()
    assert bridge.pairing_token
    assert token_path.exists()


def test_extension_bridge_correlates_command_result() -> None:
    async def run() -> None:
        bridge = ExtensionBridge(pairing_token="correct-token")
        socket = FakeSocket()
        bridge.attach(socket)  # type: ignore[arg-type]

        pending = asyncio.create_task(bridge.request("snapshot", timeout=0.5))
        await asyncio.sleep(0)
        command = socket.sent[0]

        await bridge.handle_message(
            {
                "type": "result",
                "request_id": command["request_id"],
                "ok": True,
                "payload": {"snapshots": [{"url": "https://jobs.example.test"}]},
            }
        )

        assert await pending == {
            "snapshots": [{"url": "https://jobs.example.test"}]
        }

    asyncio.run(run())


def test_extension_bridge_tracks_automatic_form_detection() -> None:
    bridge = ExtensionBridge(pairing_token="correct-token")

    asyncio.run(
        bridge.handle_message(
            {
                "type": "state",
                "url": "https://www.avoca.ai/careers",
                "title": "Careers | Avoca AI",
                "form_detected": True,
                "field_count": 11,
                "ats": "ashby",
                "form_url": "https://jobs.ashbyhq.com/avoca/application",
            }
        )
    )

    status = bridge.status()
    assert status["form_detected"] is True
    assert status["field_count"] == 11
    assert status["ats"] == "ashby"
    assert status["form_url"] == "https://jobs.ashbyhq.com/avoca/application"
