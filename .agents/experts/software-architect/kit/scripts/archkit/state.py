"""Persistent review state: flagged/reviewed fingerprints and the last snapshot."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import gitio

STATE_DIRNAME = "software-architect"
STATE_FILENAME = "state.json"
MAX_ENTRIES = 50
FLAGGED = "flagged"
REVIEWED = "reviewed"


def state_path(root: Path) -> Path:
    git_dir = gitio.absolute_git_dir(root)
    if git_dir is not None:
        return git_dir / STATE_DIRNAME / STATE_FILENAME
    digest = hashlib.sha256(str(root.resolve()).lower().encode("utf-8")).hexdigest()[:16]
    return Path(tempfile.gettempdir()) / STATE_DIRNAME / digest / STATE_FILENAME


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class ReviewState:
    path: Path
    root: str
    entries: list[dict[str, Any]] = field(default_factory=list)
    snapshot: dict[str, str] = field(default_factory=dict)

    @classmethod
    def load(cls, root: Path) -> "ReviewState":
        path = state_path(root)
        state = cls(path, root.as_posix())
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return state
        if not isinstance(data, dict):
            return state
        entries = data.get("entries")
        if isinstance(entries, list):
            state.entries = [e for e in entries if isinstance(e, dict) and isinstance(e.get("fingerprint"), str)]
        snap = data.get("snapshot")
        if isinstance(snap, dict) and snap.get("root") == state.root and isinstance(snap.get("files"), dict):
            state.snapshot = {str(k): str(v) for k, v in snap["files"].items()}
        return state

    def status_of(self, fingerprint: str) -> str | None:
        for entry in reversed(self.entries):
            if entry.get("fingerprint") == fingerprint:
                return str(entry.get("status"))
        return None

    def record(self, fingerprint: str, status: str, files: dict[str, str], signals: int = 0) -> None:
        self.entries = [e for e in self.entries if e.get("fingerprint") != fingerprint]
        self.entries.append({"fingerprint": fingerprint, "status": status, "time": _now(), "signals": signals})
        self.entries = self.entries[-MAX_ENTRIES:]
        self.snapshot = dict(files)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "entries": self.entries,
            "snapshot": {"root": self.root, "files": self.snapshot},
        }
        fd, tmp = tempfile.mkstemp(dir=str(self.path.parent), prefix=".state-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, indent=1)
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
