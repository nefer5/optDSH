"""Scan orchestration: discover files, compute changes, run all ARCH-* checks."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from . import gitio
from .changes import ChangeSet, compute_changes
from .checks_content import ContentRules, check_hardcode, check_secret, check_size
from .checks_structure import check_cycles, check_layers, check_layout, check_root_scripts
from .config import Config
from .files import GENERATED_DIRS, VENDOR_DIRS, FileFilter, FileStore, in_dirs, list_files
from .globs import top_level
from .graph import EdgeCollector, module_cycles
from .model import Finding, ScanResult

SCOPE_FULL = "full"
SCOPE_CHANGED = "changed"


@dataclass
class ScanContext:
    root: Path
    cfg: Config
    is_git: bool
    files: list[str]
    store: FileStore
    changes: ChangeSet

    @classmethod
    def open(cls, root: Path, cfg: Config) -> "ScanContext":
        is_git = gitio.is_repo(root)
        flt = FileFilter.from_config(cfg, root)
        files = list_files(root, flt, is_git)
        store = FileStore(root)
        changes = compute_changes(root, files, flt, store, is_git)
        return cls(root, cfg, is_git, files, store, changes)

    def graph_files(self) -> list[str]:
        scratch = set(self.cfg.scratch_dirs)
        return [
            p for p in self.files
            if top_level(p) not in scratch and not in_dirs(p, GENERATED_DIRS | VENDOR_DIRS)
        ]


def _content_findings(ctx: ScanContext, targets: list[str], focus: bool) -> list[Finding]:
    rules = ContentRules.from_config(ctx.cfg)
    out: list[Finding] = []
    for path in targets:
        lines = ctx.store.lines(path)
        if lines is None:
            continue
        only = ctx.changes.added_lines(path) if focus else None
        out.extend(check_size(path, lines, rules))
        out.extend(check_hardcode(path, lines, only, rules))
        out.extend(check_secret(path, lines, only))
    return out


def run_scan(ctx: ScanContext, focus: set[str] | None = None, include_cycles: bool = True,
             scope: str | None = None) -> ScanResult:
    """Run checks. ``focus`` limits per-file checks and reported edges to those paths."""
    started = time.perf_counter()
    file_set = set(ctx.files)
    targets = ctx.files if focus is None else sorted(p for p in focus if p in file_set)
    findings = _content_findings(ctx, targets, focus is not None)
    findings.extend(check_layout(targets, ctx.cfg))
    new_paths = set(ctx.changes.new_paths())
    findings.extend(check_root_scripts(targets, new_paths, ctx.cfg, report_existing=focus is None))

    graph_files = ctx.graph_files()
    collector = EdgeCollector(ctx.files, ctx.store, ctx.cfg)
    need_all = include_cycles or focus is None
    all_edges = collector.collect(graph_files) if need_all else []
    if focus is None:
        layer_edges = all_edges
    elif need_all:
        layer_edges = [e for e in all_edges if e.src in focus]
    else:
        graph_set = set(graph_files)
        layer_edges = collector.collect([p for p in targets if p in graph_set])
    findings.extend(check_layers(layer_edges, ctx.cfg))
    if include_cycles:
        findings.extend(check_cycles(module_cycles(all_edges), focus))

    notes: list[str] = []
    if ctx.store.skipped:
        notes.append(f"跳过 {len(ctx.store.skipped)} 个大文件（>1 MiB）或二进制文件")
    if not ctx.is_git:
        notes.append("非 git 目录：改动集视全部文件为新增")
    elif not ctx.changes.has_baseline:
        notes.append("仓库尚无提交：改动集视全部文件为新增")
    elapsed = int((time.perf_counter() - started) * 1000)
    return ScanResult(
        root=ctx.root.as_posix(),
        scope=scope or (SCOPE_FULL if focus is None else SCOPE_CHANGED),
        findings=findings,
        fingerprint=ctx.changes.fingerprint(),
        files_scanned=len(targets),
        changed_files=len(ctx.changes.entries),
        elapsed_ms=elapsed,
        config_path=ctx.cfg.source,
        notes=notes,
    )
