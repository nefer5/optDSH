"""Python import extraction (ast) and resolution to repository files."""

from __future__ import annotations

import ast
import posixpath
import sys
from dataclasses import dataclass

_STDLIB = frozenset(getattr(sys, "stdlib_module_names", ()))


@dataclass(frozen=True)
class PyImport:
    module: str
    names: tuple[str, ...]
    level: int
    line: int
    type_only: bool


def _is_type_checking(test: ast.expr) -> bool:
    if isinstance(test, ast.Name):
        return test.id == "TYPE_CHECKING"
    return isinstance(test, ast.Attribute) and test.attr == "TYPE_CHECKING"


_BLOCK_FIELDS = ("body", "orelse", "finalbody", "handlers", "cases")


def _child_statements(node: ast.AST) -> list[ast.AST]:
    """Statement-level children only; imports never live inside expressions."""
    out: list[ast.AST] = []
    for name in _BLOCK_FIELDS:
        value = getattr(node, name, None)
        if isinstance(value, list):
            out.extend(v for v in value if isinstance(v, ast.AST))
    return out


def parse_imports(text: str) -> list[PyImport]:
    if "import" not in text:
        return []
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError, RecursionError):
        return []
    found: list[PyImport] = []
    stack: list[tuple[ast.AST, bool]] = [(tree, False)]
    while stack:
        node, typed = stack.pop()
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.append(PyImport(alias.name, (), 0, node.lineno, typed))
            continue
        if isinstance(node, ast.ImportFrom):
            names = tuple(a.name for a in node.names if a.name != "*")
            found.append(PyImport(node.module or "", names, node.level, node.lineno, typed))
            continue
        if isinstance(node, ast.If) and _is_type_checking(node.test):
            stack.extend((child, True) for child in node.body)
            stack.extend((child, typed) for child in node.orelse)
            continue
        stack.extend((child, typed) for child in _child_statements(node))
    return sorted(found, key=lambda imp: imp.line)


def _join(base: str, parts: list[str]) -> str:
    return "/".join([base, *parts]) if base else "/".join(parts)


class PyResolver:
    """Resolve imports against the file set; never touches the filesystem."""

    def __init__(self, files: set[str], roots: tuple[str, ...]) -> None:
        self._files = files
        self._dirs: set[str] = set()
        for path in files:
            parent = posixpath.dirname(path)
            while parent and parent not in self._dirs:
                self._dirs.add(parent)
                parent = posixpath.dirname(parent)
        self._roots = [("" if r in (".", "./", "") else r.strip("/")) for r in roots]

    def _module_file(self, base: str, parts: list[str]) -> str | None:
        if not parts:
            init = _join(base, ["__init__.py"])
            return init if init in self._files else None
        stem = _join(base, parts)
        for cand in (stem + ".py", stem + ".pyi", stem + "/__init__.py", stem + "/__init__.pyi"):
            if cand in self._files:
                return cand
        return None

    def _deepest(self, base: str, parts: list[str]) -> str | None:
        for n in range(len(parts), 0, -1):
            hit = self._module_file(base, parts[:n])
            if hit:
                return hit
        return None

    def _has_top(self, base: str, top: str) -> bool:
        stem = _join(base, [top])
        return stem in self._dirs or stem + ".py" in self._files or stem + ".pyi" in self._files

    def _bases(self, src: str) -> list[str]:
        bases: list[str] = []
        parent = posixpath.dirname(src)
        while True:
            bases.append(parent)
            if not parent:
                break
            parent = posixpath.dirname(parent)
        for root in self._roots:
            if root not in bases:
                bases.append(root)
        return bases

    def _targets(self, base: str, parts: list[str], names: tuple[str, ...]) -> list[str]:
        out: list[str] = []
        for name in names:
            sub = self._module_file(base, [*parts, name])
            if sub:
                out.append(sub)
        if len(out) < len(names) or not names:
            hit = self._deepest(base, parts) if parts else self._module_file(base, [])
            if hit:
                out.append(hit)
        return out

    def resolve(self, src: str, imp: PyImport) -> list[str]:
        parts = [p for p in imp.module.split(".") if p]
        if imp.level > 0:
            base = posixpath.dirname(src)
            for _ in range(imp.level - 1):
                if not base:
                    return []
                base = posixpath.dirname(base)
            targets = self._targets(base, parts, imp.names)
        else:
            if not parts or parts[0] in _STDLIB:
                return []
            targets = []
            for base in self._bases(src):
                if self._has_top(base, parts[0]):
                    targets = self._targets(base, parts, imp.names)
                    break
        return sorted({t for t in targets if t != src})
