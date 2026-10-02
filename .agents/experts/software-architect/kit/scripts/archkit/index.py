"""Read-only Git index view: staged blobs, configuration and changes vs HEAD.

No checkout, temporary snapshot or review state; GIT_INDEX_FILE is inherited.
Blob reads are batched and capped before loading binary/large objects.
"""

from __future__ import annotations

import tomllib
from pathlib import Path

from . import gitio
from .changes import ChangeEntry, ChangeSet, DELETED, _diff_added_lines, _parse_name_status, _parse_numstat
from .config import CONFIG_RELPATH, Config, ConfigError, parse_config
from .files import BINARY_SNIFF_BYTES, MAX_FILE_BYTES, CPP_EXT, PY_EXT, TS_EXT, FileFilter, FileStore, basename, suffix
from .scan import ScanContext


class IndexStore(FileStore):
    def __init__(self, root: Path, objects: dict[str, str]) -> None:
        super().__init__(root)
        self.objects = objects

    def prefetch(self, paths: list[str]) -> None:
        pending = [p for p in paths if p not in self._cache and p in self.objects]
        if not pending:
            return
        oids = sorted({self.objects[p] for p in pending})
        query = ("\n".join(oids) + "\n").encode("ascii")
        sizes = gitio.run_git(self.root, ["cat-file", "--batch-check"], input=query)
        allowed = []
        for line in (sizes or b"").splitlines():
            cols = line.split()
            if len(cols) == 3 and cols[1] == b"blob" and int(cols[2]) <= MAX_FILE_BYTES:
                allowed.append(cols[0].decode("ascii"))
        contents: dict[str, str | None] = {}
        if allowed:
            raw = gitio.run_git(self.root, ["cat-file", "--batch"],
                                input=("\n".join(allowed) + "\n").encode("ascii")) or b""
            pos = 0
            for oid in allowed:
                end = raw.index(b"\n", pos)
                header = raw[pos:end].split()
                if len(header) != 3 or header[0].decode("ascii") != oid or header[1] != b"blob":
                    raise gitio.GitError("Unexpected index blob response")
                size = int(header[2])
                data = raw[end + 1:end + 1 + size]
                if len(data) != size:
                    raise gitio.GitError("Truncated index blob response")
                pos = end + 2 + size
                text = None if b"\0" in data[:BINARY_SNIFF_BYTES] else data.decode("utf-8", "replace")
                contents[oid] = text.lstrip("\ufeff") if text is not None else None
        for path in pending:
            self._cache[path] = contents.get(self.objects[path])
            if self._cache[path] is None:
                self.skipped.add(path)

    def _load(self, path: str) -> str | None:
        self.prefetch([path])
        return self._cache.get(path)


def index_objects(root: Path) -> dict[str, str]:
    objects = {}
    raw = gitio.run_git(root, ["ls-files", "--stage", "-z"]) or b""
    for entry in raw.split(b"\0"):
        if not entry:
            continue
        meta, path = entry.split(b"\t", 1)
        mode, oid, stage = meta.split()
        if stage != b"0":
            raise gitio.GitError("Unmerged index: architecture check skipped")
        # Symlinks and submodules are not source text; never follow worktree links.
        if mode in (b"100644", b"100755"):
            objects[path.decode("utf-8", "replace")] = oid.decode("ascii")
    return objects


def index_config(root: Path, store: IndexStore, explicit: Path | None) -> Config:
    relative = CONFIG_RELPATH
    if explicit is not None:
        try:
            relative = explicit.relative_to(root).as_posix()
        except ValueError as exc:
            raise ConfigError("--staged 的配置必须位于项目 Git index 内") from exc
    if relative not in store.objects:
        if explicit is not None:
            raise ConfigError(f"配置未暂存：{relative}")
        return Config()
    text = store.text(relative)
    if text is None:
        raise ConfigError(f"暂存配置无法作为文本读取：{relative}")
    try:
        return parse_config(tomllib.loads(text), source=f"index:{relative}")
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"暂存配置不是合法 TOML：{relative}") from exc


def open_index(root: Path, explicit: Path | None = None) -> ScanContext:
    if not gitio.is_repo(root):
        raise gitio.GitError("--staged requires a Git repository")
    objects = index_objects(root)
    store = IndexStore(root, objects)
    cfg = index_config(root, store, explicit)
    flt = FileFilter.from_config(cfg, root)
    files = sorted(p for p in objects if flt.accepts(p))
    common = ["--cached", "--no-renames", "--relative", "-z"]
    status = _parse_name_status(gitio.run_git(root, ["diff", "--name-status", *common]) or b"")
    counts = _parse_numstat(gitio.run_git(root, ["diff", "--numstat", *common]) or b"")
    entries = {}
    for path, st in status.items():
        if flt.accepts(path) and (path in objects or st == DELETED):
            added, deleted = counts.get(path, (0, 0))
            entries[path] = ChangeEntry(path, st, added, deleted, objects.get(path, ""))
    changes = ChangeSet(root, entries, gitio.has_head(root), _diff_added_lines(root, staged=True))
    ctx = ScanContext(root, cfg, True, files, store, changes)
    if entries:
        # Dependencies resolve against the index, including unchanged modules/configs.
        # Two Git batch calls instead of spawning Git separately for every file.
        graph_text = {p for p in ctx.graph_files() if suffix(p) in PY_EXT | TS_EXT | CPP_EXT
                      or basename(p) in ("tsconfig.json", "jsconfig.json")}
        store.prefetch(sorted(graph_text | set(changes.existing_paths())))
    return ctx
