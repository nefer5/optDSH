"""Git pre-commit advisory. Scan the index once; never block or call a model."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from archkit.console import ensure_utf8_stdio

SCAN_TIMEOUT_S = 30


def main() -> int:
    ensure_utf8_stdio()
    try:
        result = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("arch_scan.py")), "--staged"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=SCAN_TIMEOUT_S,
            encoding="utf-8", errors="replace",
        )
        print("[架构提交检查] 暂存区检查一次；仅报告，不阻断提交。")
        if result.stdout:
            print(result.stdout.rstrip())
        if result.returncode == 2:
            print("检查未完成：" + result.stderr.strip(), file=sys.stderr)
        elif result.returncode == 1:
            print("请由当前 Agent 结合上述证据判断；需要深入审查或整改时使用 arch-review。")
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"[架构提交检查] 未完成（{type(exc).__name__}）；本 hook 不阻断提交。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
