from pathlib import Path

from app.services.credential_store import EnvFileCredentialStore


def test_env_file_credentials_persist_without_keychain(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    first = EnvFileCredentialStore(env_path)

    first.set("openai", "test-key-with-$-and-spaces")

    second = EnvFileCredentialStore(env_path)
    assert second.get("openai") == "test-key-with-$-and-spaces"
    assert second.storage_name == "local_env_file"
    assert env_path.stat().st_mode & 0o777 == 0o600

    second.delete("openai")
    assert EnvFileCredentialStore(env_path).get("openai") is None
