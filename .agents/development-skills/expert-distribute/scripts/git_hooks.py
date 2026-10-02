"""Repository-local Git hook exports; never replace an unmanaged hook or config.

Return rows consumed by the distributor's existing backup/receipt/write pipeline.
Non-Git export directories remain useful packages; linked worktree hook locations
and custom core.hooksPath require explicit integration instead of outside writes.
"""
from __future__ import annotations

import os
from pathlib import Path
import shlex
import subprocess


def git_text(root, *args):
    result = subprocess.run(["git", *args], cwd=root, capture_output=True, timeout=20,
                            encoding="utf-8", errors="replace")
    return result.stdout.strip() if result.returncode == 0 else None


def hook_row(root, state, expert, script, contained, digest):
    """One owned pre-commit wrapper, independent of the selected Agent host."""
    if git_text(root, "rev-parse", "--show-toplevel") != str(root).replace("\\", "/"):
        # Git emits native paths on some platforms; compare as resolved paths too.
        top = git_text(root, "rev-parse", "--show-toplevel")
        if not top or Path(top).resolve() != root.resolve():
            return None
    if git_text(root, "config", "--get", "core.hooksPath") is not None:
        raise ValueError("Git hook integration requires default hooksPath; custom hooksPath is preserved")
    git_dir = Path(git_text(root, "rev-parse", "--absolute-git-dir") or "")
    if not git_dir.is_relative_to(root):
        raise ValueError("Git hook directory is outside project (worktree); explicit integration required")
    relative = (git_dir / "hooks/pre-commit").relative_to(root).as_posix()
    path = contained(root, relative)
    before = path.read_bytes() if path.exists() else None
    # Git starts pre-commit at the worktree root and preserves GIT_INDEX_FILE.
    # Fixed shell quoting handles project spaces without interpolating user text.
    command = shlex.quote(f".agents/resources/{expert}/{script}")
    interpreter = "python" if os.name == "nt" else "python3"
    data = (f"#!/bin/sh\n# Managed expert {expert}; edit source and redistribute.\n"
            f"{interpreter} {command}\nexit 0\n").encode("utf-8")
    prior = state["files"].get(relative)
    conflict = before is not None and (not prior or prior.get("expert") != expert
                                       or digest(before) != prior.get("sha256"))
    action = "conflict" if conflict else "create" if before is None else "unchanged" if before == data else "update"
    return dict(relative=relative, key=relative, path=path, data=data, before=before,
                action=action, record={}, target="git-hooks", version="shared", expected="shared")
