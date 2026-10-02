"""File import edges and directory-level (module) cycle detection."""

from __future__ import annotations

import posixpath
from collections import deque
from dataclasses import dataclass

from .config import Config
from .files import CPP_EXT, PY_EXT, TS_EXT, FileStore, suffix
from .imports_cpp import CppResolver, parse_includes
from .imports_py import PyResolver
from .imports_py import parse_imports as parse_py
from .imports_ts import TsResolver
from .imports_ts import parse_imports as parse_ts


@dataclass(frozen=True)
class Edge:
    src: str
    dst: str
    line: int
    type_only: bool


@dataclass(frozen=True)
class Cycle:
    modules: tuple[str, ...]
    edges: tuple[Edge, ...]


def module_of(path: str) -> str:
    return posixpath.dirname(path) or "."


class EdgeCollector:
    """Extracts resolved import edges; holds resolvers for one scan."""

    def __init__(self, files: list[str], store: FileStore, cfg: Config) -> None:
        file_set = set(files)
        self._store = store
        self._py = PyResolver(file_set, cfg.python_roots)
        self._ts = TsResolver(file_set, store.text)
        self._cpp = CppResolver(file_set, cfg.cpp_include_dirs)

    def edges_from(self, path: str) -> list[Edge]:
        ext = suffix(path)
        if ext not in PY_EXT and ext not in TS_EXT and ext not in CPP_EXT:
            return []
        text = self._store.text(path)
        if text is None:
            return []
        out: list[Edge] = []
        if ext in PY_EXT:
            for imp in parse_py(text):
                out.extend(Edge(path, d, imp.line, imp.type_only) for d in self._py.resolve(path, imp))
        elif ext in TS_EXT:
            for imp in parse_ts(text):
                out.extend(Edge(path, d, imp.line, imp.type_only) for d in self._ts.resolve(path, imp))
        else:
            for inc in parse_includes(text):
                out.extend(Edge(path, d, inc.line, False) for d in self._cpp.resolve(path, inc))
        return out

    def collect(self, paths: list[str]) -> list[Edge]:
        edges: list[Edge] = []
        for path in paths:
            edges.extend(self.edges_from(path))
        return edges


def _sccs(nodes: list[str], adj: dict[str, set[str]]) -> list[list[str]]:
    """Iterative Tarjan strongly connected components."""
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    result: list[list[str]] = []
    counter = 0
    for start in nodes:
        if start in index:
            continue
        work: list[tuple[str, list[str]]] = [(start, sorted(adj.get(start, ())))]
        index[start] = low[start] = counter
        counter += 1
        stack.append(start)
        on_stack.add(start)
        while work:
            node, pending = work[-1]
            if pending:
                nxt = pending.pop(0)
                if nxt not in index:
                    index[nxt] = low[nxt] = counter
                    counter += 1
                    stack.append(nxt)
                    on_stack.add(nxt)
                    work.append((nxt, sorted(adj.get(nxt, ()))))
                elif nxt in on_stack:
                    low[node] = min(low[node], index[nxt])
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                comp: list[str] = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    comp.append(member)
                    if member == node:
                        break
                if len(comp) > 1:
                    result.append(sorted(comp))
    return result


def _cycle_path(start: str, members: set[str], adj: dict[str, set[str]]) -> list[str]:
    """Shortest path start -> ... -> start inside the component (BFS)."""
    prev: dict[str, str] = {}
    queue = deque([start])
    seen = {start}
    while queue:
        node = queue.popleft()
        for nxt in sorted(adj.get(node, ())):
            if nxt not in members:
                continue
            if nxt == start:
                path = [node]
                while path[-1] != start:
                    path.append(prev[path[-1]])
                return list(reversed(path)) + [start]
            if nxt not in seen:
                seen.add(nxt)
                prev[nxt] = node
                queue.append(nxt)
    return [start, start]


def module_cycles(edges: list[Edge]) -> list[Cycle]:
    """Directory-level cycles; intra-directory and type-only edges are ignored."""
    adj: dict[str, set[str]] = {}
    by_pair: dict[tuple[str, str], list[Edge]] = {}
    for edge in edges:
        if edge.type_only:
            continue
        a, b = module_of(edge.src), module_of(edge.dst)
        if a == b:
            continue
        adj.setdefault(a, set()).add(b)
        by_pair.setdefault((a, b), []).append(edge)
    cycles: list[Cycle] = []
    for comp in _sccs(sorted(adj), adj):
        members = set(comp)
        path = _cycle_path(comp[0], members, adj)
        inner = tuple(
            e for (a, b), es in sorted(by_pair.items()) if a in members and b in members for e in es
        )
        cycles.append(Cycle(tuple(path), inner))
    return cycles


def pair_sample(cycle: Cycle, a: str, b: str) -> Edge | None:
    for edge in cycle.edges:
        if module_of(edge.src) == a and module_of(edge.dst) == b:
            return edge
    return None
