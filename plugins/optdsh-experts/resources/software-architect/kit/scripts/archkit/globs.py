"""Path glob matching on repository-relative POSIX paths.

Semantics (documented in architecture.example.toml):
- ``dir/``      trailing slash: matches any path that has a directory
                component sequence ``dir`` at any depth (``tests/`` matches
                ``tests/a.py`` and ``pkg/tests/a.py``).
- ``name.py``   no slash: matched against the basename at any depth.
- ``src/**/x``  contains a slash: anchored at the root; ``**`` spans
                directories, ``*`` and ``?`` stay within one segment.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


def _segment_regex(pattern: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "*":
            if pattern[i : i + 2] == "**":
                i += 2
                if i < len(pattern) and pattern[i] == "/":
                    i += 1
                    out.append("(?:.*/)?")
                else:
                    out.append(".*")
                continue
            out.append("[^/]*")
        elif ch == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(ch))
        i += 1
    return "".join(out)


@dataclass(frozen=True)
class GlobSet:
    patterns: tuple[str, ...]
    _regex: re.Pattern[str] | None

    @classmethod
    def compile(cls, patterns: list[str] | tuple[str, ...]) -> "GlobSet":
        parts: list[str] = []
        for raw in patterns:
            pat = raw.strip().replace("\\", "/")
            if pat.startswith("./"):
                pat = pat[2:]
            if not pat:
                continue
            if pat.endswith("/"):
                body = _segment_regex(pat.rstrip("/"))
                parts.append(f"(?:^|.*/){body}/.*")
            elif "/" not in pat:
                parts.append(f"(?:^|.*/){_segment_regex(pat)}")
            else:
                parts.append(_segment_regex(pat.lstrip("/")))
        regex = re.compile("^(?:" + "|".join(parts) + ")$") if parts else None
        return cls(tuple(patterns), regex)

    def match(self, path: str) -> bool:
        return bool(self._regex and self._regex.match(path))

    def __bool__(self) -> bool:
        return self._regex is not None


def top_level(path: str) -> str | None:
    """Return the first directory component, or None for root-level files."""
    head, sep, _ = path.partition("/")
    return head if sep else None
