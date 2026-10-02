"""SessionStart context only; legacy Stop calls are unconditional no-ops.

Stdout carries one JSON object or nothing. No scan, Git subprocess, review state,
blocking decision or automatic continuation is performed by this module.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, TextIO

from .config import CONFIG_RELPATH, Config, load_config

EVENT_STOP = "stop"
EVENT_SESSION_START = "session-start"
HOSTS = ("codex", "claude", "dsh")
EVENTS = (EVENT_STOP, EVENT_SESSION_START)
KIT_RELPATH = ".agents/resources/software-architect/kit"
ARCH_DOC = "ARCHITECTURE.md"
CONTEXT_LIMIT = 400


def parse_payload(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text) if text.strip() else {}
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def is_enabled(root: Path) -> bool:
    return (root / KIT_RELPATH).is_dir() or (root / CONFIG_RELPATH).is_file()


def project_root(payload: dict[str, Any]) -> Path:
    cwd = payload.get("cwd")
    start = Path(cwd) if isinstance(cwd, str) and cwd and Path(cwd).is_dir() else Path(os.getcwd())
    start = start.resolve()
    for candidate in (start, *start.parents):
        if is_enabled(candidate):
            return candidate
        if (candidate / ".git").exists():
            break  # Never inherit another project's expert above a repository boundary.
    return start


def build_session_context(root: Path, cfg: Config) -> str:
    present = [name for name in (ARCH_DOC, CONFIG_RELPATH) if (root / name).is_file()]
    constraints = ("项目约束见 " + " 与 ".join(present) + "。" if present else
                   "遵循单一归属、依赖向下、配置注入，不写本机路径与凭据。")
    text = (
        "本项目提供软件架构专家。编码先按 arch-plan 定级：L0 直接做；L1 给文件落点表；"
        f"L2 先设计确认，再写计划（{cfg.plan_dir}）。"
        "新模块、入口与跨模块改动先明确归属和依赖；临时脚本放项目指定临时目录。"
        f"{constraints}"
        "Git 提交前自动检查暂存区一次，结果仅报告；需要深入审查或整改时使用 arch-review，"
        "可委派 software-architect。不在每轮结束自动扫描或续轮。"
    )
    return text if len(text) <= CONTEXT_LIMIT else text[:CONTEXT_LIMIT - 1] + "…"


def handle(host: str, event: str, payload: dict[str, Any], script_dir: Path) -> dict[str, Any] | None:
    if event == EVENT_STOP:
        return None  # Old cached host configurations are harmless before reloading.
    root = project_root(payload)
    if not is_enabled(root):
        return None
    cfg = load_config(root)
    if event == EVENT_SESSION_START and cfg.session_inject:
        return {"hookSpecificOutput": {"hookEventName": "SessionStart",
                                       "additionalContext": build_session_context(root, cfg)}}
    return None


def run_hook(host: str, event: str, stdin: TextIO, stdout: TextIO, stderr: TextIO,
             script_dir: Path) -> int:
    try:
        if host not in HOSTS or event not in EVENTS:
            stderr.write(f"arch_hook: 不支持的 host/event：{host}/{event}\n")
            return 0
        if event == EVENT_STOP:
            return 0  # Even stdin/root/config are untouched on legacy Stop.
        try:
            payload = parse_payload(stdin.read())
        except (OSError, ValueError):
            payload = {}
        output = handle(host, event, payload, script_dir)
        if output is not None:
            stdout.write(json.dumps(output, ensure_ascii=False) + "\n")
            stdout.flush()
    except Exception as exc:
        stderr.write(f"arch_hook: 已跳过（{type(exc).__name__}: {str(exc)[:200]}）\n")
    return 0
