"""Shared data types for findings and scan results."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ERROR = "error"
WARN = "warn"
INFO = "info"
SEVERITY_ORDER: dict[str, int] = {ERROR: 0, WARN: 1, INFO: 2}

CHECK_IDS: tuple[str, ...] = (
    "ARCH-SIZE",
    "ARCH-HARDCODE",
    "ARCH-SECRET",
    "ARCH-LAYOUT",
    "ARCH-ROOT-SCRIPT",
    "ARCH-LAYER",
    "ARCH-CYCLE",
)


@dataclass(frozen=True)
class Finding:
    id: str
    severity: str
    path: str
    line: int | None
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "path": self.path,
            "line": self.line,
            "message": self.message,
        }

    def sort_key(self) -> tuple[int, str, str, int]:
        return (SEVERITY_ORDER.get(self.severity, 9), self.id, self.path, self.line or 0)


@dataclass
class ScanResult:
    root: str
    scope: str
    findings: list[Finding]
    fingerprint: str | None
    files_scanned: int
    changed_files: int
    elapsed_ms: int
    config_path: str | None
    notes: list[str] = field(default_factory=list)

    def count(self, severity: str) -> int:
        return sum(1 for f in self.findings if f.severity == severity)

    def has_errors(self) -> bool:
        return any(f.severity == ERROR for f in self.findings)

    def summary(self) -> dict[str, Any]:
        by_id: dict[str, int] = {}
        for f in self.findings:
            by_id[f.id] = by_id.get(f.id, 0) + 1
        return {
            "error": self.count(ERROR),
            "warn": self.count(WARN),
            "info": self.count(INFO),
            "by_id": dict(sorted(by_id.items())),
            "files_scanned": self.files_scanned,
            "changed_files": self.changed_files,
            "elapsed_ms": self.elapsed_ms,
            "config": self.config_path,
            "notes": list(self.notes),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "scope": self.scope,
            "findings": [f.to_dict() for f in sorted(self.findings, key=Finding.sort_key)],
            "summary": self.summary(),
            "fingerprint": self.fingerprint,
        }
