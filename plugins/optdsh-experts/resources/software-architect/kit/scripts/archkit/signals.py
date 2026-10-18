"""Decide whether a change set deserves an architecture review reminder."""

from __future__ import annotations

from dataclasses import dataclass

from .changes import NEW_STATUSES, ChangeSet
from .files import is_lock
from .globs import top_level
from .model import ERROR, Finding
from .scan import ScanContext, run_scan

MAX_SIGNALS_SHOWN = 5
_ERROR_IDS = ("ARCH-SECRET", "ARCH-HARDCODE", "ARCH-LAYER")


@dataclass(frozen=True)
class Signal:
    kind: str
    text: str


def delta_paths(changes: ChangeSet, snapshot: dict[str, str]) -> list[str]:
    """Changed paths whose state differs from the last flagged/reviewed snapshot."""
    return sorted(p for p, token in changes.tokens().items() if snapshot.get(p) != token)


def new_top_dirs(ctx: ScanContext, paths: list[str]) -> list[str]:
    candidates = {t for t in (top_level(p) for p in paths) if t}
    scratch = set(ctx.cfg.scratch_dirs)
    entries = ctx.changes.entries
    out: list[str] = []
    for top in sorted(candidates):
        if top.startswith(".") or top in scratch:
            continue
        under = [p for p in ctx.files if p.startswith(top + "/")]
        if under and all(p in entries and entries[p].status in NEW_STATUSES for p in under):
            out.append(top)
    return out


def _finding_text(f: Finding) -> str:
    loc = f"{f.path}:{f.line}" if f.line else f.path
    return f"{f.id} {loc} {f.message.split('；', 1)[0]}"


def review_signals(ctx: ScanContext, delta: list[str]) -> list[Signal]:
    if not delta:
        return []
    cfg = ctx.cfg
    result = run_scan(ctx, focus=set(delta), include_cycles=False)
    signals: list[Signal] = []
    for f in result.findings:
        if f.severity == ERROR and f.id in _ERROR_IDS:
            signals.append(Signal(f.id, _finding_text(f)))
    for f in result.findings:
        if f.id == "ARCH-SIZE" and f.severity == ERROR:
            signals.append(Signal(f.id, _finding_text(f)))
    for f in result.findings:
        if f.id == "ARCH-ROOT-SCRIPT" and f.severity != "info":
            signals.append(Signal(f.id, f"根目录新增脚本 {f.path}"))
    for top in new_top_dirs(ctx, delta):
        signals.append(Signal("new-top-dir", f"新增顶层目录 {top}/"))
    entries = ctx.changes.entries
    n_files = len(delta)
    if cfg.min_changed_files and n_files >= cfg.min_changed_files:
        signals.append(Signal("files", f"本轮改动 {n_files} 个文件（阈值 {cfg.min_changed_files}）"))
    n_lines = sum(entries[p].added + entries[p].deleted for p in delta if not is_lock(p))
    if cfg.min_changed_lines and n_lines >= cfg.min_changed_lines:
        signals.append(Signal("lines", f"增删约 {n_lines} 行（阈值 {cfg.min_changed_lines}）"))
    return signals
