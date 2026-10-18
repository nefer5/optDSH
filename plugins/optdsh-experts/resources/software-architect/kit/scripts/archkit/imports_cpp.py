"""C/C++ quoted ``#include`` extraction and resolution."""

from __future__ import annotations

import posixpath
import re
from dataclasses import dataclass

_INCLUDE_RE = re.compile(r'^[ \t]*#[ \t]*include[ \t]*"([^"\n]+)"', re.MULTILINE)


@dataclass(frozen=True)
class CppInclude:
    spec: str
    line: int
    type_only: bool = False


def parse_includes(text: str) -> list[CppInclude]:
    out: list[CppInclude] = []
    for m in _INCLUDE_RE.finditer(text):
        out.append(CppInclude(m.group(1).replace("\\", "/"), text.count("\n", 0, m.start()) + 1))
    return out


class CppResolver:
    def __init__(self, files: set[str], include_dirs: tuple[str, ...]) -> None:
        self._files = files
        self._dirs = [d.strip("/") for d in include_dirs if d.strip("/") not in ("", ".")]

    def _hit(self, base: str, spec: str) -> str | None:
        cand = posixpath.normpath(posixpath.join(base, spec)) if base else posixpath.normpath(spec)
        if cand.startswith("..") or cand.startswith("/"):
            return None
        return cand if cand in self._files else None

    def resolve(self, src: str, inc: CppInclude) -> list[str]:
        for base in (posixpath.dirname(src), *self._dirs, ""):
            hit = self._hit(base, inc.spec)
            if hit:
                return [hit] if hit != src else []
        return []
