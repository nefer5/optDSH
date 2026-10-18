"""Change set relative to HEAD: status, line counts, added lines, fingerprint."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from . import gitio
from .files import FileFilter, FileStore, MAX_FILE_BYTES

ADDED = "added"
MODIFIED = "modified"
DELETED = "deleted"
UNTRACKED = "untracked"
NEW_STATUSES = frozenset({ADDED, UNTRACKED})

_STATUS_MAP = {"A": ADDED, "M": MODIFIED, "D": DELETED, "T": MODIFIED, "U": MODIFIED}
_HUNK_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")
_GIT_Q = ["-c", "core.quotepath=false"]


@dataclass(frozen=True)
class ChangeEntry:
    path: str
    status: str
    added: int
    deleted: int
    sha: str


@dataclass
class ChangeSet:
    root: Path
    entries: dict[str, ChangeEntry]
    has_baseline: bool
    _added_lines: dict[str, set[int]] | None = field(default=None, repr=False)

    def paths(self) -> list[str]:
        return sorted(self.entries)

    def existing_paths(self) -> list[str]:
        return [p for p in self.paths() if self.entries[p].status != DELETED]

    def new_paths(self) -> list[str]:
        return [p for p in self.paths() if self.entries[p].status in NEW_STATUSES]

    def fingerprint(self) -> str | None:
        return fingerprint_of({p: (e.status, e.sha) for p, e in self.entries.items()})

    def tokens(self) -> dict[str, str]:
        """Per-path ``status:sha`` tokens, stored as the review snapshot."""
        return {p: f"{e.status}:{e.sha}" for p, e in self.entries.items()}

    def added_lines(self, path: str) -> set[int] | None:
        """Added line numbers for a modified file; None means every line is new."""
        entry = self.entries.get(path)
        if entry is None or entry.status != MODIFIED or not self.has_baseline:
            return None
        if self._added_lines is None:
            self._added_lines = _diff_added_lines(self.root)
        return self._added_lines.get(path, set())


def fingerprint_of(items: dict[str, tuple[str, str]]) -> str | None:
    if not items:
        return None
    digest = hashlib.sha256()
    for path in sorted(items):
        status, sha = items[path]
        digest.update(f"{path}\t{status}\t{sha}\n".encode("utf-8"))
    return digest.hexdigest()


def file_sha(full: Path) -> str:
    try:
        with full.open("rb") as fh:
            return hashlib.file_digest(fh, "sha256").hexdigest()
    except OSError:
        return ""


def _line_count(store: FileStore, path: str) -> int:
    text = store.text(path)
    return 0 if text is None else len(text.splitlines())


def _diff_added_lines(root: Path, staged: bool = False) -> dict[str, set[int]]:
    raw = gitio.run_git(
        root,
        [*_GIT_Q, "diff", "-U0", "--no-color", "--no-ext-diff", "--no-textconv",
         "--no-renames", "--relative", *( ["--cached"] if staged else ["HEAD"])],
        check=False,
    )
    result: dict[str, set[int]] = {}
    current: set[int] | None = None
    for line in (raw or b"").decode("utf-8", "replace").splitlines():
        if line.startswith("+++ "):
            target = line[4:].strip().strip('"')
            current = None
            if target != "/dev/null" and target.startswith("b/"):
                current = result.setdefault(target[2:], set())
            continue
        match = _HUNK_RE.match(line)
        if match and current is not None:
            start = int(match.group(1))
            count = int(match.group(2)) if match.group(2) is not None else 1
            current.update(range(start, start + count))
    return result


def _parse_name_status(raw: bytes) -> dict[str, str]:
    parts = gitio.split_z(raw)
    out: dict[str, str] = {}
    for i in range(0, len(parts) - 1, 2):
        out[parts[i + 1]] = _STATUS_MAP.get(parts[i][:1], MODIFIED)
    return out


def _parse_numstat(raw: bytes) -> dict[str, tuple[int, int]]:
    out: dict[str, tuple[int, int]] = {}
    for record in gitio.split_z(raw):
        cols = record.split("\t", 2)
        if len(cols) != 3:
            continue
        added = int(cols[0]) if cols[0].isdigit() else 0
        deleted = int(cols[1]) if cols[1].isdigit() else 0
        out[cols[2]] = (added, deleted)
    return out


def _all_new(root: Path, files: list[str], store: FileStore) -> dict[str, ChangeEntry]:
    return {
        p: ChangeEntry(p, ADDED, _line_count(store, p), 0, file_sha(root / p))
        for p in files
    }


def compute_changes(
    root: Path, files: list[str], flt: FileFilter, store: FileStore, is_git: bool
) -> ChangeSet:
    """Changes vs HEAD; repos without commits and non-git trees count all files as added."""
    if not is_git or not gitio.has_head(root):
        return ChangeSet(root, _all_new(root, files, store), has_baseline=False)
    common = ["--no-renames", "--relative", "-z", "HEAD"]
    status = _parse_name_status(gitio.run_git(root, [*_GIT_Q, "diff", "--name-status", *common]) or b"")
    numstat = _parse_numstat(gitio.run_git(root, [*_GIT_Q, "diff", "--numstat", *common]) or b"")
    untracked = gitio.split_z(
        gitio.run_git(root, [*_GIT_Q, "ls-files", "--others", "--exclude-standard", "-z"]) or b""
    )
    entries: dict[str, ChangeEntry] = {}
    for path, st in status.items():
        if not flt.accepts(path):
            continue
        added, deleted = numstat.get(path, (0, 0))
        sha = "" if st == DELETED else file_sha(root / path)
        entries[path] = ChangeEntry(path, st, added, deleted, sha)
    for path in untracked:
        full = root / path
        if path in entries or not flt.accepts(path) or not full.is_file():
            continue
        lines = _line_count(store, path) if full.stat().st_size <= MAX_FILE_BYTES else 0
        entries[path] = ChangeEntry(path, UNTRACKED, lines, 0, file_sha(full))
    return ChangeSet(root, entries, has_baseline=True)
