"""Render scan results as concise Chinese markdown or JSON."""

from __future__ import annotations

import json
from typing import Any

from .model import ERROR, INFO, WARN, Finding, ScanResult

MAX_MD_ROWS = 40
_SEV_LABEL = {ERROR: "错误", WARN: "警告", INFO: "提示"}
_SCOPE_LABEL = {"full": "全量", "changed": "改动", "staged": "暂存区"}


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_json(result: ScanResult, extra: dict[str, Any] | None = None) -> str:
    data = result.to_dict()
    if extra:
        data.update(extra)
    return json.dumps(data, ensure_ascii=False, indent=2)


def render_markdown(result: ScanResult, record_note: str | None = None) -> str:
    s = result.summary()
    scope = _SCOPE_LABEL.get(result.scope, result.scope)
    lines = [
        f"## 架构扫描（{scope}）",
        "",
        f"- 根目录：`{result.root}`",
        f"- 配置：{'`' + s['config'] + '`' if s['config'] else '内置默认值'}",
        f"- 检查文件 {s['files_scanned']} 个；改动文件 {s['changed_files']} 个；耗时 {s['elapsed_ms']} ms",
        f"- 结果：错误 {s['error']}，警告 {s['warn']}，提示 {s['info']}",
    ]
    if result.fingerprint:
        lines.append(f"- 改动指纹：`{result.fingerprint[:12]}`")
    for note in s["notes"]:
        lines.append(f"- 说明：{note}")
    if record_note:
        lines.append(f"- 记录：{record_note}")
    shown = [f for f in sorted(result.findings, key=Finding.sort_key) if f.severity != INFO]
    if s["by_id"]:
        lines.append("- 分类：" + "，".join(f"{k} {v}" for k, v in s["by_id"].items()))
    lines.append("")
    if not shown:
        lines.append("未发现错误或警告。" if not s["info"] else f"未发现错误或警告（另有 {s['info']} 条提示，见 `--json`）。")
        return "\n".join(lines)
    lines += ["| 级别 | 检查 | 位置 | 说明 |", "|---|---|---|---|"]
    for f in shown[:MAX_MD_ROWS]:
        loc = f"{f.path}:{f.line}" if f.line else f.path
        lines.append(f"| {_SEV_LABEL.get(f.severity, f.severity)} | {f.id} | `{_cell(loc)}` | {_cell(f.message)} |")
    rest = len(shown) - MAX_MD_ROWS
    if rest > 0 or s["info"]:
        lines.append("")
        lines.append(f"另有 {max(rest, 0)} 条错误/警告与 {s['info']} 条提示未列出，完整结果用 `--json`。")
    return "\n".join(lines)
