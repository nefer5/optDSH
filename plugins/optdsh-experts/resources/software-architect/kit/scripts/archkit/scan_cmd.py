"""``arch_scan`` command: resolve root/config, scan, optionally record, print."""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import TextIO

from . import gitio
from .config import ConfigError, load_config
from .report import render_json, render_markdown
from .scan import SCOPE_CHANGED, SCOPE_FULL, ScanContext, run_scan
from .state import REVIEWED, ReviewState

EXIT_OK = 0
EXIT_FINDINGS = 1
EXIT_USAGE = 2


def run_cli(root: str | None, config: str | None, changed: bool, as_json: bool, record: bool,
            out: TextIO | None = None, err: TextIO | None = None, staged: bool = False) -> int:
    out = out or sys.stdout
    err = err or sys.stderr
    started = time.perf_counter()
    try:
        root_path = Path(root).resolve() if root else gitio.resolve_root(Path.cwd())
        if not root_path.is_dir():
            err.write(f"arch_scan: 根目录不存在：{root_path}\n")
            return EXIT_USAGE
        explicit = Path(config).resolve() if config else None
        if staged:
            from .index import open_index
            ctx = open_index(root_path, explicit)
        else:
            cfg = load_config(root_path, explicit)
            ctx = ScanContext.open(root_path, cfg)
        focus = set(ctx.changes.paths()) if changed or staged else None
        result = run_scan(ctx, focus=focus, include_cycles=bool(focus) if staged else True,
                          scope="staged" if staged else SCOPE_CHANGED if changed else SCOPE_FULL)
        record_note: str | None = None
        recorded = False
        if record:
            fp = ctx.changes.fingerprint()
            if fp is None:
                record_note = "当前没有改动，未记录"
            else:
                state = ReviewState.load(root_path)
                state.record(fp, REVIEWED, ctx.changes.tokens())
                state.save()
                recorded = True
                record_note = f"已将改动指纹 {fp[:12]} 记为已审"
        result.elapsed_ms = int((time.perf_counter() - started) * 1000)
    except ConfigError as exc:
        err.write(f"arch_scan: 配置错误：{exc}\n")
        return EXIT_USAGE
    except (gitio.GitError, OSError) as exc:
        err.write(f"arch_scan: 运行失败：{exc}\n")
        return EXIT_USAGE
    except Exception as exc:  # noqa: BLE001 - CLI boundary: report, never traceback-spam
        err.write(f"arch_scan: 内部错误：{type(exc).__name__}: {exc}\n")
        return EXIT_USAGE
    if as_json:
        extra = {"recorded": recorded} if record else None
        out.write(render_json(result, extra) + "\n")
    else:
        out.write(render_markdown(result, record_note) + "\n")
    return EXIT_FINDINGS if result.has_errors() else EXIT_OK
