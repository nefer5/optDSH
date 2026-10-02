"""Host hook adapter (thin entry; implementation in archkit/hook.py).

Usage: python arch_hook.py --host codex|claude|dsh --event stop|session-start
Reads the host event JSON on stdin; prints one JSON object or nothing; always exits 0.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from archkit.console import ensure_utf8_stdio  # noqa: E402
from archkit.hook import run_hook  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ensure_utf8_stdio()
    parser = argparse.ArgumentParser(prog="arch_hook", add_help=False)
    parser.add_argument("--host", default="")
    parser.add_argument("--event", default="")
    try:
        args, _unknown = parser.parse_known_args(argv)
    except SystemExit:
        sys.stderr.write("arch_hook: 参数无效，已跳过\n")
        return 0
    return run_hook(args.host, args.event, sys.stdin, sys.stdout, sys.stderr, SCRIPT_DIR)


if __name__ == "__main__":
    sys.exit(main())
