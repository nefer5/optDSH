"""Thin wrapper around the git CLI. All git subprocess calls go through here."""

from __future__ import annotations

import subprocess
from pathlib import Path

GIT_TIMEOUT_S = 20


class GitError(RuntimeError):
    pass


def run_git(cwd: Path, args: list[str], check: bool = True, input: bytes | None = None) -> bytes | None:
    """Run git and return raw stdout; None when git fails and check is False."""
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            stdin=subprocess.DEVNULL if input is None else None,
            input=input,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=GIT_TIMEOUT_S,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        if check:
            raise GitError(f"git {' '.join(args)} failed: {exc}") from exc
        return None
    if proc.returncode != 0:
        if check:
            msg = proc.stderr.decode("utf-8", "replace").strip()
            raise GitError(f"git {' '.join(args)} failed: {msg}")
        return None
    return proc.stdout


def git_text(cwd: Path, args: list[str]) -> str | None:
    out = run_git(cwd, args, check=False)
    return None if out is None else out.decode("utf-8", "replace").strip()


def toplevel(cwd: Path) -> Path | None:
    text = git_text(cwd, ["rev-parse", "--show-toplevel"])
    return Path(text) if text else None


def absolute_git_dir(cwd: Path) -> Path | None:
    text = git_text(cwd, ["rev-parse", "--absolute-git-dir"])
    return Path(text) if text else None


def is_repo(cwd: Path) -> bool:
    return git_text(cwd, ["rev-parse", "--is-inside-work-tree"]) == "true"


def has_head(cwd: Path) -> bool:
    return run_git(cwd, ["rev-parse", "--verify", "-q", "HEAD"], check=False) is not None


def split_z(raw: bytes) -> list[str]:
    return [p for p in raw.decode("utf-8", "replace").split("\0") if p]


def resolve_root(start: Path) -> Path:
    """Git top level of ``start`` when inside a work tree, else ``start``."""
    top = toplevel(start)
    return (top or start).resolve()
