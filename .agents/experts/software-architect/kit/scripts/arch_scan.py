"""Architecture scanner CLI (thin entry; implementation in archkit/).

Usage: python arch_scan.py [--root DIR] [--config PATH] [--changed|--staged] [--json] [--record]
Exit codes: 0 no error-level findings, 1 error-level findings, 2 usage/internal error.
--record always records the fingerprint of the current change set vs HEAD, with or
without --changed (legacy manual bookkeeping; no automatic hook uses it).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from archkit.console import ensure_utf8_stdio  # noqa: E402
from archkit.scan_cmd import run_cli  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="arch_scan", description="确定性架构扫描（ARCH-* 检查）")
    parser.add_argument("--root", help="项目根目录；默认 cwd 所在 git 顶层，非 git 时为 cwd")
    parser.add_argument("--config", help="配置文件；默认 <root>/.agents/architecture.toml")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--changed", action="store_true", help="只检查相对 HEAD 的改动与未跟踪文件")
    scope.add_argument("--staged", action="store_true", help="只检查 Git index 准备提交的内容与改动")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument(
        "--record", action="store_true",
        help="把当前改动指纹（相对 HEAD 的改动集，与是否带 --changed 无关）记为已审；无改动时不记录",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    ensure_utf8_stdio()
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.staged and args.record:
        parser.error("--staged 不维护已审状态，不能与 --record 同用")
    return run_cli(args.root, args.config, args.changed, args.json, args.record, staged=args.staged)


if __name__ == "__main__":
    sys.exit(main())
