"""Shared helpers for kit tests: temporary git repositories and CLI runners."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

# In-process tests also run git: never let it discover a repository above the temp dir.
os.environ.setdefault("GIT_CEILING_DIRECTORIES", str(Path(tempfile.gettempdir()).resolve()))

SCAN = SCRIPTS / "arch_scan.py"
HOOK = SCRIPTS / "arch_hook.py"


def isolated_env(tmp_parent: Path) -> dict[str, str]:
    env = dict(os.environ)
    # Stop git from discovering a repository above the temp directory.
    env["GIT_CEILING_DIRECTORIES"] = str(tmp_parent)
    env["PYTHONIOENCODING"] = "utf-8"
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
        env.pop(key, None)
    return env


class TempProject:
    """A throwaway project directory, optionally a git repository."""

    def __init__(self, git: bool = True) -> None:
        # Windows scanners may briefly lock files; a failed cleanup must not fail a test.
        self._tmp = tempfile.TemporaryDirectory(prefix="archkit-test-", ignore_cleanup_errors=True)
        self.base = Path(self._tmp.name).resolve()
        self.root = self.base / "proj"
        self.root.mkdir()
        self.env = isolated_env(self.base)
        if git:
            self.git("init", "-q")
            self.git("config", "core.autocrlf", "false")
            self.git("config", "user.name", "test")
            self.git("config", "user.email", "test@example.com")
            self.git("config", "commit.gpgsign", "false")

    def close(self) -> None:
        self._tmp.cleanup()

    def git(self, *args: str) -> str:
        proc = subprocess.run(["git", *args], cwd=self.root, env=self.env, capture_output=True,
                              text=True, encoding="utf-8", check=True)
        return proc.stdout

    def write(self, rel: str, text: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        return path

    def commit(self, message: str = "c") -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)

    def enable(self, toml: str = "") -> None:
        self.write(".agents/architecture.toml", toml)

    def scan(self, *args: str) -> tuple[int, str, str]:
        proc = subprocess.run([sys.executable, str(SCAN), *args], cwd=self.root, env=self.env,
                              capture_output=True, text=True, encoding="utf-8")
        return proc.returncode, proc.stdout, proc.stderr

    def scan_json(self, *args: str) -> tuple[int, dict[str, Any]]:
        code, out, err = self.scan("--json", *args)
        if code == 2:
            raise AssertionError(f"scan failed: {err}")
        return code, json.loads(out)

    def hook(self, host: str, event: str, payload: dict[str, Any] | None = None,
             raw: str | None = None) -> tuple[int, str, str]:
        if raw is None:
            data = {"cwd": str(self.root), "hook_event_name": event}
            data.update(payload or {})
            raw = json.dumps(data)
        proc = subprocess.run([sys.executable, str(HOOK), "--host", host, "--event", event],
                              cwd=self.root, env=self.env, input=raw, capture_output=True,
                              text=True, encoding="utf-8")
        return proc.returncode, proc.stdout, proc.stderr


def ids(result: dict[str, Any], check_id: str | None = None) -> list[dict[str, Any]]:
    findings = result["findings"]
    return [f for f in findings if check_id is None or f["id"] == check_id]
