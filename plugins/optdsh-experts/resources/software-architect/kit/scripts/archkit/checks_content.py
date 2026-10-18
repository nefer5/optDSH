"""Per-file content checks: ARCH-SIZE, ARCH-HARDCODE, ARCH-SECRET."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from .config import Config
from .files import GENERATED_DIRS, VENDOR_DIRS, in_dirs, is_code, is_lock, is_minified
from .globs import GlobSet, top_level
from .model import ERROR, INFO, WARN, Finding
from .textscan import comment_mask, count_lines, inline_comment_start

# Path bodies stop at whitespace, quotes, ASCII delimiters and full-width CJK punctuation.
_WIN_PATH = re.compile(
    r"(?<![A-Za-z0-9_\\/])[A-Za-z]:[\\/]{1,2}(?=[A-Za-z0-9_.$%~-])"
    r"[^\s\"'<>|*?`,;)\]}\uff08\uff09\uff0c\u3002\uff1b\uff1a\u3001\u201c\u201d]*"
)
_POSIX_HOME = re.compile(r"(?<![\w.~/:\\-])/(?:home|Users)/[A-Za-z0-9._-]+")
_URL = re.compile(r"\bhttps?://[^\s\"'<>`)\]}\\]+")
_IPV4 = re.compile(r"(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w.])")

_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("API key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{20,}")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}")),
    ("GitHub token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("private key", re.compile(r"-{5}BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-{5}")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}")),
)
_ASSIGN_SECRET = re.compile(
    r"(?i)\b(api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|"
    r"auth[_-]?token|token|password|passwd)\b[\"']?\s*[:=]\s*[\"']([^\"'\s]{16,})[\"']"
)
# Cheap per-line prefilters; the precise patterns above run only on hinted lines.
_HARDCODE_HINT = re.compile(r"[A-Za-z]:[\\/]|/home/|/Users/|https?://|\d\.\d{1,3}\.\d")
_SECRET_HINT = re.compile(r"sk-|gh[opusr]_|github_pat_|AKIA|ASIA|BEGIN |xox[abprs]-|AIza|(?i:key|secret|token|passw)")
_PLACEHOLDER_HINTS = ("xxx", "your", "example", "placeholder", "changeme", "dummy", "<", ">",
                      "{", "%(", "***", "...", "env.", "environ")


def redact(value: str) -> str:
    return f"{value[:4]}…（{len(value)} 字符）"


def _looks_placeholder(value: str) -> bool:
    low = value.lower()
    return len(set(value)) < 6 or any(h in low for h in _PLACEHOLDER_HINTS)


@dataclass(frozen=True)
class ContentRules:
    cfg: Config
    allow_paths: GlobSet
    size_exclude: GlobSet
    allow_hosts: frozenset[str]
    scratch: frozenset[str]

    @classmethod
    def from_config(cls, cfg: Config) -> "ContentRules":
        return cls(
            cfg,
            GlobSet.compile(list(cfg.allow_paths)),
            GlobSet.compile(list(cfg.size_exclude)),
            frozenset(h.lower() for h in cfg.allow_hosts),
            frozenset(cfg.scratch_dirs),
        )

    def in_scratch(self, path: str) -> bool:
        return top_level(path) in self.scratch


def check_size(path: str, lines: list[str], rules: ContentRules) -> list[Finding]:
    cfg = rules.cfg
    if (not is_code(path) or is_lock(path) or is_minified(path) or rules.in_scratch(path)
            or in_dirs(path, GENERATED_DIRS | VENDOR_DIRS) or rules.size_exclude.match(path)):
        return []
    n = count_lines(lines, cfg.count)
    unit = "非空行" if cfg.count == "nonblank" else "行"
    if n > cfg.max_lines:
        return [Finding("ARCH-SIZE", ERROR, path, None,
                        f"{n} {unit}，超过上限 {cfg.max_lines}；需要拆分或在方案中给出理由")]
    if n > cfg.warn_lines:
        return [Finding("ARCH-SIZE", WARN, path, None,
                        f"{n} {unit}，超过建议值 {cfg.warn_lines}；考虑按职责拆分")]
    return []


def _short(text: str, limit: int = 60) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _hardcode_line(path: str, no: int, line: str, is_comment: bool, rules: ContentRules) -> list[Finding]:
    out: list[Finding] = []
    cut = inline_comment_start(path, line)

    def commented(pos: int) -> bool:
        return is_comment or (cut >= 0 and pos > cut)

    local_sev_code = WARN if rules.in_scratch(path) else ERROR
    for regex in (_WIN_PATH, _POSIX_HOME):
        for m in regex.finditer(line):
            sev = WARN if commented(m.start()) else local_sev_code
            out.append(Finding("ARCH-HARDCODE", sev, path, no,
                               f"本机绝对路径 `{_short(m.group(0))}`；改为配置、参数或相对项目根解析"))
    url_spans: list[tuple[int, int]] = []
    for m in _URL.finditer(line):
        url_spans.append(m.span())
        try:
            host = (urlsplit(m.group(0)).hostname or "").lower()
        except ValueError:
            continue
        # Dotless hosts ("http://local" URL bases, truncated regex literals) are not deployable endpoints.
        if not host or "." not in host or host in rules.allow_hosts or "{" in m.group(0) or "$" in host:
            continue
        sev = INFO if commented(m.start()) else WARN
        out.append(Finding("ARCH-HARDCODE", sev, path, no,
                           f"硬编码 URL `{_short(m.group(0))}`；服务地址应从配置或环境注入"))
    for m in _IPV4.finditer(line):
        if any(a <= m.start() < b for a, b in url_spans):
            continue
        if any(int(g) > 255 for g in m.groups()) or m.group(0) in rules.allow_hosts:
            continue
        sev = INFO if commented(m.start()) else WARN
        out.append(Finding("ARCH-HARDCODE", sev, path, no,
                           f"硬编码 IP `{m.group(0)}`；主机地址应从配置或环境注入"))
    return out


def check_hardcode(path: str, lines: list[str], only_lines: set[int] | None,
                   rules: ContentRules) -> list[Finding]:
    if (not is_code(path) or is_minified(path) or rules.allow_paths.match(path)
            or in_dirs(path, GENERATED_DIRS | VENDOR_DIRS)):
        return []
    mask = comment_mask(path, lines)
    out: list[Finding] = []
    for idx, line in enumerate(lines, start=1):
        if only_lines is not None and idx not in only_lines:
            continue
        if not _HARDCODE_HINT.search(line):
            continue
        out.extend(_hardcode_line(path, idx, line, mask[idx - 1], rules))
    return out


def check_secret(path: str, lines: list[str], only_lines: set[int] | None) -> list[Finding]:
    if is_lock(path) or is_minified(path):
        return []
    out: list[Finding] = []
    for idx, line in enumerate(lines, start=1):
        if only_lines is not None and idx not in only_lines:
            continue
        if not _SECRET_HINT.search(line):
            continue
        hits: list[tuple[str, str]] = []
        for label, regex in _SECRET_PATTERNS:
            for m in regex.finditer(line):
                value = m.group(0)
                if label == "private key" or not _looks_placeholder(value):
                    hits.append((label, value))
        if not hits:
            for m in _ASSIGN_SECRET.finditer(line):
                if not _looks_placeholder(m.group(2)):
                    hits.append((f"{m.group(1)} 赋值", m.group(2)))
        for label, value in hits:
            out.append(Finding("ARCH-SECRET", ERROR, path, idx,
                               f"疑似凭据（{label}）{redact(value)}；移入环境变量或密钥管理，并轮换已泄露的值"))
    return out
