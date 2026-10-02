"""Repository-structure checks: ARCH-LAYOUT, ARCH-ROOT-SCRIPT, ARCH-LAYER, ARCH-CYCLE."""

from __future__ import annotations

from .config import Config, Layer
from .files import suffix
from .globs import GlobSet, top_level
from .graph import Cycle, Edge, pair_sample
from .model import ERROR, INFO, WARN, Finding

ROOT_SCRIPT_EXT = frozenset({
    ".py", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".ps1", ".psm1", ".sh", ".bash",
    ".zsh", ".bat", ".cmd", ".c", ".cc", ".cpp", ".cxx", ".rb", ".pl", ".lua", ".go", ".rs",
})


def check_layout(paths: list[str], cfg: Config) -> list[Finding]:
    """Undeclared top-level directories among ``paths`` (warn)."""
    if not cfg.allowed_top_level:
        return []
    allowed = GlobSet.compile([p.strip("/") for p in (*cfg.allowed_top_level, *cfg.scratch_dirs)])
    tops = sorted({t for t in (top_level(p) for p in paths) if t})
    return [
        Finding("ARCH-LAYOUT", WARN, f"{t}/", None,
                f"顶层目录 `{t}/` 未在 [layout] allowed_top_level 中声明；归入已有目录或先更新约束")
        for t in tops
        if not t.startswith(".") and not allowed.match(t)
    ]


def check_root_scripts(paths: list[str], new_paths: set[str], cfg: Config,
                       report_existing: bool) -> list[Finding]:
    allow = GlobSet.compile(list(cfg.root_script_allow))
    out: list[Finding] = []
    for path in paths:
        if "/" in path or suffix(path) not in ROOT_SCRIPT_EXT or allow.match(path):
            continue
        if path in new_paths:
            out.append(Finding("ARCH-ROOT-SCRIPT", WARN, path, None,
                               "仓库根目录新增脚本；正式入口归入 scripts/ 或所属模块，一次性脚本放 scratch 目录"))
        elif report_existing:
            out.append(Finding("ARCH-ROOT-SCRIPT", INFO, path, None, "仓库根目录已有脚本（存量，仅提示）"))
    return out


class LayerMap:
    def __init__(self, layers: tuple[Layer, ...]) -> None:
        self._layers = [(layer, GlobSet.compile(list(layer.paths))) for layer in layers]
        self._cache: dict[str, Layer | None] = {}

    def __bool__(self) -> bool:
        return bool(self._layers)

    def layer_of(self, path: str) -> Layer | None:
        if path not in self._cache:
            self._cache[path] = next((ly for ly, gs in self._layers if gs.match(path)), None)
        return self._cache[path]


def check_layers(edges: list[Edge], cfg: Config) -> list[Finding]:
    lmap = LayerMap(cfg.layers)
    if not lmap:
        return []
    out: list[Finding] = []
    for edge in edges:
        src, dst = lmap.layer_of(edge.src), lmap.layer_of(edge.dst)
        if src is None or dst is None or src.name == dst.name or dst.name in src.may_import:
            continue
        allowed = "、".join(src.may_import) or "无"
        out.append(Finding("ARCH-LAYER", ERROR, edge.src, edge.line,
                           f"层 `{src.name}` 依赖了 `{dst.name}`（{edge.dst}）；"
                           f"允许依赖：{allowed}。调整依赖方向或经公开接口转接"))
    return out


def check_cycles(cycles: list[Cycle], focus: set[str] | None) -> list[Finding]:
    out: list[Finding] = []
    for cycle in cycles:
        if focus is not None and not any(e.src in focus or e.dst in focus for e in cycle.edges):
            continue
        mods = list(cycle.modules)
        chain = " → ".join(f"{m}/" if m != "." else "./" for m in mods)
        samples: list[str] = []
        for a, b in zip(mods, mods[1:]):
            edge = pair_sample(cycle, a, b)
            if edge:
                samples.append(f"{edge.src}:{edge.line} → {edge.dst}")
        sample_text = "；".join(samples[:3])
        first = pair_sample(cycle, mods[0], mods[1]) if len(mods) > 1 else None
        out.append(Finding("ARCH-CYCLE", WARN, first.src if first else mods[0], first.line if first else None,
                           f"目录级循环依赖：{chain}（示例：{sample_text}）；抽出共享部分或反转一侧依赖"))
    return out


