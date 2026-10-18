"""Line-level helpers: comment/docstring classification per language family."""

from __future__ import annotations

from .files import CPP_EXT, PY_EXT, TS_EXT, suffix

_HASH_EXT = frozenset({".sh", ".bash", ".zsh", ".ps1", ".psm1", ".rb", ".pl", ".toml", ".yaml", ".yml"})
_SLASH_EXT = TS_EXT | CPP_EXT | frozenset({
    ".go", ".rs", ".java", ".kt", ".cs", ".php", ".swift", ".scala", ".vue", ".svelte",
})
_BAT_EXT = frozenset({".bat", ".cmd"})


def _python_mask(lines: list[str]) -> list[bool]:
    mask: list[bool] = []
    closer: str | None = None
    for line in lines:
        stripped = line.lstrip()
        if closer is not None:
            mask.append(True)
            if closer in stripped:
                closer = None
            continue
        if stripped.startswith("#"):
            mask.append(True)
            continue
        body = stripped.lstrip("rRbBuU")
        opener = next((q for q in ('"""', "'''") if body.startswith(q)), None)
        if opener is not None:
            mask.append(True)
            if opener not in body[3:]:
                closer = opener
            continue
        mask.append(False)
    return mask


def _block_mask(lines: list[str], line_marks: tuple[str, ...], start: str, end: str) -> list[bool]:
    mask: list[bool] = []
    in_block = False
    for line in lines:
        stripped = line.lstrip()
        if in_block:
            mask.append(True)
            if end in stripped:
                in_block = False
            continue
        if stripped.startswith(start):
            mask.append(True)
            in_block = end not in stripped[len(start):]
            continue
        mask.append(any(stripped.startswith(m) for m in line_marks))
    return mask


def comment_mask(path: str, lines: list[str]) -> list[bool]:
    """True for lines that are comments or docstrings (best effort)."""
    ext = suffix(path)
    if ext in PY_EXT:
        return _python_mask(lines)
    if ext in _SLASH_EXT:
        return _block_mask(lines, ("//", "*"), "/*", "*/")
    if ext in {".ps1", ".psm1"}:
        return _block_mask(lines, ("#",), "<#", "#>")
    if ext in _HASH_EXT:
        return [ln.lstrip().startswith("#") for ln in lines]
    if ext in _BAT_EXT:
        return [ln.lstrip().lower().startswith(("rem ", "::")) for ln in lines]
    return [False] * len(lines)


def inline_comment_start(path: str, line: str) -> int:
    """Index where a trailing comment starts, or -1 (quotes balanced heuristic)."""
    ext = suffix(path)
    if ext in PY_EXT or ext in _HASH_EXT:
        marker = "#"
    elif ext in _SLASH_EXT:
        marker = "//"
    else:
        return -1
    pos = line.find(marker)
    while pos >= 0:
        before = line[:pos]
        balanced = before.count('"') % 2 == 0 and before.count("'") % 2 == 0
        not_url = marker != "//" or not before.endswith(":")
        if balanced and not_url:
            return pos
        pos = line.find(marker, pos + 1)
    return -1


def count_lines(lines: list[str], mode: str) -> int:
    if mode == "total":
        return len(lines)
    return sum(1 for ln in lines if ln.strip())
