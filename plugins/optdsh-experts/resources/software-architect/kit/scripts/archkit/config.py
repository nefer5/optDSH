"""Load and validate ``.agents/architecture.toml`` with conservative defaults.

Unknown sections or keys are rejected so that typos never silently disable
a rule.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CONFIG_RELPATH = ".agents/architecture.toml"

TIERS = ("one-off", "small-tool", "long-term", "multi-agent")
COUNT_MODES = ("nonblank", "total")
REVIEW_MODES = ("continue", "notify", "off")

DEFAULT_SCRATCH_DIRS = ["temp", "tmp", "scratch"]
DEFAULT_ROOT_SCRIPT_ALLOW = [
    "setup.py", "conftest.py", "noxfile.py", "manage.py", "fabfile.py",
    "*.config.js", "*.config.cjs", "*.config.mjs", "*.config.ts", "*.config.mts",
    ".*rc.js", ".*rc.cjs", "Gruntfile.js", "gulpfile.js", "build.rs",
]
DEFAULT_ALLOW_PATHS = [
    "tests/", "test/", "docs/", "config/", "examples/", "fixtures/",
    "*.md", "*.toml", "*.json", "*.yaml", "*.yml", "*.example.*",
]
DEFAULT_ALLOW_HOSTS = [
    "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
    "example.com", "example.org", "example.net", "www.w3.org", "json-schema.org",
]


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Layer:
    name: str
    paths: tuple[str, ...]
    may_import: tuple[str, ...]


@dataclass(frozen=True)
class Config:
    tier: str = "long-term"
    name: str = ""
    allowed_top_level: tuple[str, ...] = ()
    scratch_dirs: tuple[str, ...] = tuple(DEFAULT_SCRATCH_DIRS)
    root_script_allow: tuple[str, ...] = tuple(DEFAULT_ROOT_SCRIPT_ALLOW)
    warn_lines: int = 400
    max_lines: int = 800
    count: str = "nonblank"
    size_exclude: tuple[str, ...] = ()
    allow_paths: tuple[str, ...] = tuple(DEFAULT_ALLOW_PATHS)
    allow_hosts: tuple[str, ...] = tuple(DEFAULT_ALLOW_HOSTS)
    layers: tuple[Layer, ...] = ()
    ignore_globs: tuple[str, ...] = ()
    python_roots: tuple[str, ...] = (".", "src")
    cpp_include_dirs: tuple[str, ...] = ("include",)
    review_mode: str = "continue"
    min_changed_files: int = 4
    min_changed_lines: int = 300
    session_inject: bool = True
    plan_dir: str = ".agents/plans"
    source: str | None = field(default=None, compare=False)


# section -> key -> (Config field, kind, choices)
_SCHEMA: dict[str, dict[str, tuple[str, str, tuple[str, ...] | None]]] = {
    "project": {"tier": ("tier", "str", TIERS), "name": ("name", "str", None)},
    "layout": {
        "allowed_top_level": ("allowed_top_level", "list", None),
        "scratch_dirs": ("scratch_dirs", "list", None),
        "root_script_allow": ("root_script_allow", "list", None),
    },
    "limits": {
        "warn_lines": ("warn_lines", "int", None),
        "max_lines": ("max_lines", "int", None),
        "count": ("count", "str", COUNT_MODES),
        "exclude": ("size_exclude", "list", None),
    },
    "hardcode": {
        "allow_paths": ("allow_paths", "list", None),
        "allow_hosts": ("allow_hosts", "list", None),
    },
    "ignore": {"globs": ("ignore_globs", "list", None)},
    "imports": {
        "python_roots": ("python_roots", "list", None),
        "cpp_include_dirs": ("cpp_include_dirs", "list", None),
    },
    "review": {
        "mode": ("review_mode", "str", REVIEW_MODES),
        "min_changed_files": ("min_changed_files", "int", None),
        "min_changed_lines": ("min_changed_lines", "int", None),
    },
    "session": {"inject": ("session_inject", "bool", None)},
    "plan": {"dir": ("plan_dir", "str", None)},
}
_LAYER_KEYS = ("name", "paths", "may_import")


def _coerce(where: str, kind: str, value: Any, choices: tuple[str, ...] | None) -> Any:
    if kind == "str":
        if not isinstance(value, str):
            raise ConfigError(f"{where} 应为字符串，实际为 {type(value).__name__}")
        if choices and value not in choices:
            raise ConfigError(f"{where} = {value!r} 无效，可选值：{', '.join(choices)}")
        return value
    if kind == "int":
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ConfigError(f"{where} 应为非负整数，实际为 {value!r}")
        return value
    if kind == "bool":
        if not isinstance(value, bool):
            raise ConfigError(f"{where} 应为 true/false，实际为 {value!r}")
        return value
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ConfigError(f"{where} 应为字符串数组")
    return tuple(value)


def _parse_layers(raw: Any) -> tuple[Layer, ...]:
    if not isinstance(raw, list):
        raise ConfigError("layers 应写成 [[layers]] 表数组")
    layers: list[Layer] = []
    for idx, item in enumerate(raw):
        where = f"[[layers]] 第 {idx + 1} 项"
        if not isinstance(item, dict):
            raise ConfigError(f"{where} 应为表")
        unknown = sorted(set(item) - set(_LAYER_KEYS))
        if unknown:
            raise ConfigError(f"{where} 含未知键：{', '.join(unknown)}；允许：{', '.join(_LAYER_KEYS)}")
        if "name" not in item or "paths" not in item:
            raise ConfigError(f"{where} 缺少必填键 name 或 paths")
        name = _coerce(f"{where}.name", "str", item["name"], None)
        paths = _coerce(f"{where}.paths", "list", item["paths"], None)
        may = _coerce(f"{where}.may_import", "list", item.get("may_import", []), None)
        if not name or not paths:
            raise ConfigError(f"{where} 的 name 与 paths 不能为空")
        layers.append(Layer(name, paths, may))
    names = [layer.name for layer in layers]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        raise ConfigError(f"layers 名称重复：{', '.join(dupes)}")
    for layer in layers:
        missing = [m for m in layer.may_import if m not in names]
        if missing:
            raise ConfigError(f"layer {layer.name!r} 的 may_import 引用了未声明的层：{', '.join(missing)}")
    return tuple(layers)


def parse_config(data: dict[str, Any], source: str | None = None) -> Config:
    values: dict[str, Any] = {}
    for section, body in data.items():
        if section == "layers":
            values["layers"] = _parse_layers(body)
            continue
        spec = _SCHEMA.get(section)
        if spec is None:
            allowed = ", ".join([*_SCHEMA, "layers"])
            raise ConfigError(f"未知配置段 [{section}]；允许：{allowed}")
        if not isinstance(body, dict):
            raise ConfigError(f"[{section}] 应为表")
        for key, value in body.items():
            if key not in spec:
                raise ConfigError(f"[{section}] 未知键 {key!r}；允许：{', '.join(spec)}")
            fname, kind, choices = spec[key]
            values[fname] = _coerce(f"[{section}].{key}", kind, value, choices)
    cfg = Config(source=source, **values)
    if cfg.warn_lines > cfg.max_lines:
        raise ConfigError(f"[limits] warn_lines ({cfg.warn_lines}) 不能大于 max_lines ({cfg.max_lines})")
    return cfg


def load_config(root: Path, explicit: Path | None = None) -> Config:
    """Load ``explicit`` or ``<root>/.agents/architecture.toml``; defaults when absent."""
    path = explicit if explicit is not None else root / CONFIG_RELPATH
    if not path.is_file():
        if explicit is not None:
            raise ConfigError(f"配置文件不存在：{path}")
        return Config()
    try:
        with path.open("rb") as fh:
            data = tomllib.load(fh)
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path.name} 不是合法 TOML：{exc}") from exc
    try:
        return parse_config(data, source=str(path))
    except ConfigError as exc:
        raise ConfigError(f"{path.name}: {exc}") from exc
