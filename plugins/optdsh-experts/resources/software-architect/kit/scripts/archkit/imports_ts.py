"""TS/JS import extraction (regex) and best-effort resolution incl. tsconfig paths."""

from __future__ import annotations

import bisect
import json
import posixpath
import re
from dataclasses import dataclass
from typing import Any, Callable

_FROM_RE = re.compile(r"""\b(import|export)\s+(type\s+)?[^'";]*?\bfrom\s*['"]([^'"\n]+)['"]""")
_SIDE_RE = re.compile(r"""\bimport\s*['"]([^'"\n]+)['"]""")
_CALL_RE = re.compile(r"""\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)""")

EXTENSIONS = (".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs")
_JS_TO_TS = {".js": (".ts", ".tsx"), ".jsx": (".tsx",), ".mjs": (".mts",), ".cjs": (".cts",)}
_CONFIG_NAMES = ("tsconfig.json", "jsconfig.json")
_MAX_EXTENDS = 3


@dataclass(frozen=True)
class TsImport:
    spec: str
    line: int
    type_only: bool


def parse_imports(text: str) -> list[TsImport]:
    starts = [0]
    starts.extend(m.end() for m in re.finditer("\n", text))

    def line_of(pos: int) -> int:
        return bisect.bisect_right(starts, pos)

    found: dict[tuple[str, int], TsImport] = {}
    for m in _FROM_RE.finditer(text):
        line = line_of(m.start())
        found[(m.group(3), line)] = TsImport(m.group(3), line, bool(m.group(2)))
    for regex in (_SIDE_RE, _CALL_RE):
        for m in regex.finditer(text):
            line = line_of(m.start())
            found.setdefault((m.group(1), line), TsImport(m.group(1), line, False))
    return sorted(found.values(), key=lambda imp: (imp.line, imp.spec))


def strip_json_comments(text: str) -> str:
    out: list[str] = []
    i, n, in_str = 0, len(text), False
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 1
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
            out.append(ch)
        elif text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        else:
            out.append(ch)
        i += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


@dataclass(frozen=True)
class PathMap:
    base: str
    paths: tuple[tuple[str, tuple[str, ...]], ...]
    has_base_url: bool


class TsResolver:
    def __init__(self, files: set[str], read_text: Callable[[str], str | None]) -> None:
        self._files = files
        self._read = read_text
        self._maps: dict[str, PathMap | None] = {}

    def _exists(self, stem: str) -> str | None:
        stem = posixpath.normpath(stem) if stem else stem
        if not stem or stem.startswith("../") or stem == "..":
            return None
        if stem in self._files:
            return stem
        ext = posixpath.splitext(stem)[1]
        for alt in _JS_TO_TS.get(ext, ()):
            cand = stem[: -len(ext)] + alt
            if cand in self._files:
                return cand
        for ext2 in EXTENSIONS:
            if stem + ext2 in self._files:
                return stem + ext2
        for ext2 in EXTENSIONS:
            cand = f"{stem}/index{ext2}"
            if cand in self._files:
                return cand
        return None

    def _load_config(self, path: str, depth: int) -> dict[str, Any]:
        text = self._read(path)
        if text is None:
            return {}
        try:
            data = json.loads(strip_json_comments(text))
        except ValueError:
            return {}
        if not isinstance(data, dict):
            return {}
        opts = data.get("compilerOptions")
        opts = dict(opts) if isinstance(opts, dict) else {}
        cfg_dir = posixpath.dirname(path)
        if "baseUrl" in opts and isinstance(opts["baseUrl"], str):
            opts["baseUrl"] = posixpath.normpath(posixpath.join(cfg_dir, opts["baseUrl"]))
        ext = data.get("extends")
        if isinstance(ext, str) and ext.startswith(".") and depth < _MAX_EXTENDS:
            parent_path = posixpath.normpath(posixpath.join(cfg_dir, ext))
            if not parent_path.endswith(".json"):
                parent_path += ".json"
            parent = self._load_config(parent_path, depth + 1)
            merged = dict(parent)
            merged.update(opts)
            opts = merged
        opts.setdefault("_dir", cfg_dir)
        return opts

    def _path_map(self, directory: str) -> PathMap | None:
        if directory in self._maps:
            return self._maps[directory]
        result: PathMap | None = None
        for name in _CONFIG_NAMES:
            cand = f"{directory}/{name}" if directory else name
            if cand in self._files:
                opts = self._load_config(cand, 0)
                base_url = opts.get("baseUrl")
                base = base_url if isinstance(base_url, str) else str(opts.get("_dir", directory))
                raw_paths = opts.get("paths")
                pairs: list[tuple[str, tuple[str, ...]]] = []
                if isinstance(raw_paths, dict):
                    for key, targets in raw_paths.items():
                        if isinstance(key, str) and isinstance(targets, list):
                            pairs.append((key, tuple(t for t in targets if isinstance(t, str))))
                result = PathMap("" if base == "." else base, tuple(pairs), isinstance(base_url, str))
                break
        if result is None and directory:
            result = self._path_map(posixpath.dirname(directory))
        self._maps[directory] = result
        return result

    def _resolve_bare(self, src: str, spec: str) -> str | None:
        pmap = self._path_map(posixpath.dirname(src))
        if pmap is None:
            return None
        for key, targets in pmap.paths:
            if "*" in key:
                prefix, _, suffix_ = key.partition("*")
                if not (spec.startswith(prefix) and spec.endswith(suffix_)):
                    continue
                star = spec[len(prefix): len(spec) - len(suffix_) if suffix_ else None]
            elif key == spec:
                star = ""
            else:
                continue
            for target in targets:
                hit = self._exists(posixpath.join(pmap.base, target.replace("*", star)))
                if hit:
                    return hit
        if pmap.has_base_url:
            return self._exists(posixpath.join(pmap.base, spec))
        return None

    def resolve(self, src: str, imp: TsImport) -> list[str]:
        spec = imp.spec.split("?", 1)[0]
        if spec.startswith("."):
            hit = self._exists(posixpath.join(posixpath.dirname(src), spec))
        elif spec.startswith("/") or ":" in spec:
            hit = None
        else:
            hit = self._resolve_bare(src, spec)
        return [hit] if hit and hit != src else []
