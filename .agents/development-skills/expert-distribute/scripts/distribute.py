"""Project-scoped native agent export. Standard library; dry-run by default."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tomllib
import uuid

SOURCE = Path(__file__).resolve().parents[3]
NAMES = ("codex", "opencode", "claude", "dsh")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def contained(root, relative):
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Path leaves project: {relative}")
    for part in (path, *path.parents):
        if part == root:
            break
        if part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction()):
            raise ValueError(f"Linked destination not supported: {relative}")
    length = len(str(path).encode("utf-16-le")) // 2
    if length > 220:
        raise ValueError(f"Path exceeds 220 UTF-16 units: {relative}")
    if length > 180:
        print(f"WARNING: long path: {relative}", file=sys.stderr)
    return path


def load_source(source, expert):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", expert):
        raise ValueError("Invalid expert name")
    folder = contained(source, f"experts/{expert}")
    raw_meta = contained(source, f"experts/{expert}/agent.json").read_bytes()
    body = contained(source, f"experts/{expert}/instructions.md").read_text(encoding="utf-8").strip()
    meta = json.loads(raw_meta)
    if set(meta) != {"name", "version", "description"}:
        raise ValueError("agent.json must contain name, version, description only")
    if meta["name"] != expert or not all(isinstance(v, str) and v.strip() for v in meta.values()) or not body:
        raise ValueError("Incomplete expert definition")
    if not re.fullmatch(r"\d+\.\d+\.\d+", meta["version"]):
        raise ValueError("Expert version must be numeric x.y.z")
    # Public agent exports must be self-contained and neutral.
    if re.search(r"agenttyvate|tyvate|(?<![a-z])[a-z]:[\\/]", body, re.I):
        raise ValueError("Public instructions contain control identity or a local absolute path")
    registry = json.loads((source / "distribution.json").read_text(encoding="utf-8"))
    if registry["schema_version"] != 1 or set(registry["targets"]) != set(NAMES):
        raise ValueError("Unsupported distribution registry")
    return meta, body, registry["targets"], digest(raw_meta + b"\0" + body.encode())


def render(meta, body, target):
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    header = f"Generated expert {meta['name']} v{meta['version']}; edit the central definition, then redistribute."
    if target["format"] == "codex-toml":
        result = (f"# {header}\nname = {quote(meta['name'])}\n"
                  f"description = {quote(meta['description'])}\n"
                  f"developer_instructions = {quote(body)}\n")
        tomllib.loads(result)
    else:
        fields = {"name": meta["name"], "description": meta["description"]}
        if target["format"] == "opencode-v1":
            fields.pop("name")  # v1 derives the ID from the filename.
            fields["mode"] = "subagent"
        elif target["format"] == "claude-code":
            fields["model"] = "inherit"
        else:
            raise ValueError("Unsupported host format")
        frontmatter = "\n".join(f"{key}: {quote(value)}" for key, value in fields.items())
        result = f"---\n{frontmatter}\n---\n\n<!-- {header} -->\n\n{body}\n"
    return result.encode("utf-8")


def load_resources(source, expert):
    """Only explicit library files are public. Never recursively copy the expert."""
    folder = contained(source, f"experts/{expert}")
    manifest_path = contained(folder, "resources.json")
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files")
    if manifest.get("schema_version") != 1 or not isinstance(files, list) or not files or len(set(files)) != len(files):
        raise ValueError("Invalid public resource manifest")
    resources = []
    for relative in files:
        if not isinstance(relative, str) or "\\" in relative:
            raise ValueError("Invalid resource path")
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts or path.parts[0] != "library" or path.suffix not in {".md", ".json", ".png", ".html"}:
            raise ValueError(f"Resource outside public library: {relative}")
        resource_path = contained(folder, relative)
        # Third-party screenshots are local-only and may be absent in a public clone.
        if path.suffix == ".png" and not resource_path.exists():
            continue
        data = resource_path.read_bytes()
        if path.suffix == ".png":
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError(f"Invalid PNG: {relative}")
        else:
            public_text = data.decode("utf-8")
            if re.search(r"agenttyvate|tyvate|(?<![a-z])[a-z]:[\\/]", public_text, re.I):
                raise ValueError(f"Control identity/path in public resource: {relative}")
        resources.append((path.as_posix(), data))
    # Ship the same allowlist with the generated pack; consumers don't need the
    # editable source tree to locate public library assets.
    public_manifest = {**manifest, "files": [name for name, _ in resources]}
    manifest_bytes = manifest_path.read_bytes() if public_manifest == manifest else (json.dumps(public_manifest, ensure_ascii=False, indent=2) + "\n").encode()
    resources.append(("resources.json", manifest_bytes))
    if sum(len(data) for _, data in resources) > 20 * 1024 * 1024:
        raise ValueError("Public resource pack exceeds 20 MiB; curate before distributing")
    return resources


def dsh_outputs(meta, body, target):
    # Preserve upstream Cordis tags and plugin scopes verbatim; change only persona.
    template = SOURCE.parent / "node_modules/@deepseek-ai/dsh-agent-presets/presets/standard/agent.cordis.yml"
    standard = template.read_text(encoding="utf-8")
    expected = "    prefix: >-\n      You are a coding agent powered by the {{model}} model."
    if standard.count(expected) != 1:
        raise ValueError("Pinned DSH Standard persona signature changed")
    persona = body + "\n\nDSH入口：参考资料优先用 expert_resource 工具读取，resource=START.md 获取索引，resource=preferences.md 获取本项目偏好。图片需用 image 模式实际读取；无法处理图片时明确视觉未验证。"
    composition = standard.replace(expected, "    prefix: " + json.dumps(persona, ensure_ascii=False))
    base = f"{target['directory']}/{meta['name']}"
    packet = {**meta, "persona": persona, "upstreamVersion": target["verified_cli_version"], "standardSha256": digest(template.read_bytes())}
    return [(f"{base}/agent.cordis.yml", composition.encode()),
            (f"{base}/preset.yml", ("name: 视觉设计专家\ndescription: " + json.dumps(meta["description"], ensure_ascii=False) + "\n").encode()),
            (f"{base}/expert.json", (json.dumps(packet, ensure_ascii=False, indent=2) + "\n").encode())]


def probe(name):
    if name == "dsh":
        return json.loads((SOURCE.parent / "node_modules/@deepseek-ai/dsh/package.json").read_text(encoding="utf-8"))["version"]
    executable = shutil.which(name)
    if not executable:
        return "missing"
    result = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=20)
    match = re.search(r"\b\d+\.\d+\.\d+\b", result.stdout)
    return match.group() if result.returncode == 0 and match else "unknown"


def select(only=None, exclude=None):
    if only is not None and exclude is not None:
        raise ValueError("--only and --exclude are mutually exclusive")
    raw = only if only is not None else exclude
    chosen = set(raw.split(",")) if raw is not None else set()
    if chosen - set(NAMES):
        raise ValueError(f"Unknown/empty target; choose {', '.join(NAMES)}")
    result = [n for n in NAMES if (n in chosen if only is not None else n not in chosen)]
    if not result:
        raise ValueError("Empty distribution target set")
    return result


def prepare(source, root, expert, targets, versions):
    root = root.resolve()
    if not root.is_dir() or root == Path.home().resolve() or root == root.parent:
        raise ValueError("Choose an existing project directory, not a home or drive root")
    meta, body, registry, source_hash = load_source(source, expert)
    resources = load_resources(source, expert)
    resource_root = f".agents/resources/{expert}"
    if "{{RESOURCE_ROOT}}" in body and not resources:
        raise ValueError("Instructions reference a missing public resource pack")
    body = body.replace("{{RESOURCE_ROOT}}", resource_root + "/library")
    if (root / f".agents/experts/{expert}").resolve() == (source / f"experts/{expert}").resolve() and (source / f"experts/{expert}/preferences.md").is_file():
        body += f"\n\n已连接的统一偏好文件：`.agents/experts/{expert}/preferences.md`。开始前按需读取；它是本机共享偏好，不嵌入公共包；其中项目限定条目只对对应项目生效。"
    source_hash = digest((source_hash + "".join(relative + digest(data) for relative, data in resources)).encode())
    state_path = contained(root, ".agents/.distribution/state.json")
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"schema_version": 1, "files": {}}
    if state.get("schema_version") != 1 or not isinstance(state.get("files"), dict):
        raise ValueError("Unsupported distribution state")
    rows = []
    for name in targets:
        target = registry[name]
        outputs = dsh_outputs(meta, body, target) if name == "dsh" else [(f"{target['directory']}/{expert}{target['extension']}", render(meta, body, target))]
        for relative, data in outputs:
            path = contained(root, relative)
            before = path.read_bytes() if path.exists() else None
            prior = state["files"].get(relative)
            conflict = before is not None and (not prior or digest(before) != prior.get("sha256"))
            action = "conflict" if conflict else "create" if before is None else "unchanged" if before == data else "update"
            rows.append(dict(target=name, relative=relative, path=path, data=data, before=before,
                             action=action, version=versions[name], expected=target["verified_cli_version"],
                             source_sha256=source_hash, expert_version=meta["version"]))
    resource_prefix = resource_root + "/"
    wanted = {resource_prefix + relative for relative, _ in resources}
    stale = [key for key in state["files"] if key.startswith(resource_prefix) and key not in wanted]
    if stale:
        raise ValueError("Previously managed resources omitted from manifest; reconcile safely first: " + ", ".join(stale))
    for relative, data in resources:
        relative = resource_prefix + relative
        path = contained(root, relative)
        before = path.read_bytes() if path.exists() else None
        prior = state["files"].get(relative)
        conflict = before is not None and (not prior or digest(before) != prior.get("sha256"))
        action = "conflict" if conflict else "create" if before is None else "unchanged" if before == data else "update"
        rows.append(dict(target="resources", relative=relative, path=path, data=data, before=before,
                         action=action, version="shared", expected="shared",
                         source_sha256=source_hash, expert_version=meta["version"]))
    return state_path, state, rows


@contextmanager
def writer_lock(root):
    lock_path = contained(root, ".agents/.distribution/writer.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as lock:
        if lock.tell() == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock, fcntl.LOCK_UN)


def atomic_write(root, path, data):
    contained(root, str(path.relative_to(root)))
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = contained(root, str(path.relative_to(root)) + ".tmp")
    # Preserve stale temporary files from a failed write for inspection.
    with temporary.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def distribute(source, root, expert, targets, versions, apply=False, check=False):
    root = root.resolve()
    # Preflight without side effects before acquiring a persistent lock file.
    state_path, state, rows = prepare(source, root, expert, targets, versions)
    blocked = any(r["action"] == "conflict" or r["version"] != r["expected"] for r in rows)
    if apply and not blocked:
        with writer_lock(root):
            state_path, state, rows = prepare(source, root, expert, targets, versions)
            if any(r["action"] == "conflict" for r in rows):
                raise ValueError("Target changed before apply; nothing written")
            for row in rows:
                if row["action"] == "unchanged":
                    continue
                if row["before"] is not None:
                    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
                    backup = contained(root, f".agents/.distribution/backups/{stamp}-{uuid.uuid4().hex[:8]}-{row['target']}{row['path'].suffix}")
                    atomic_write(root, backup, row["before"])
                atomic_write(root, row["path"], row["data"])
                state["files"][row["relative"]] = {
                    "sha256": digest(row["data"]), "source_sha256": row["source_sha256"],
                    "expert_version": row["expert_version"], "host_version": row["version"]}
            if any(r["action"] != "unchanged" for r in rows):
                atomic_write(root, state_path, (json.dumps(state, ensure_ascii=False, indent=2) + "\n").encode())
    for row in rows:
        version_status = "ok" if row["version"] == row["expected"] else f"unverified (expected {row['expected']})"
        print(f"{row['target']}: {row['action']} | {row['version']} {version_status} | {row['path']}")
    if blocked:
        print("Blocked: version mismatch or unmanaged/drifted target; no files written.")
        return 2
    if check and any(r["action"] != "unchanged" for r in rows):
        return 1
    print("Applied; run --check next. Runtime loading remains unverified." if apply else "Checked." if check else "Preview only; use --apply to write.")
    return 0


def distribute_fleet(path, expert="visual-designer", apply=False, check=False):
    sys.path.insert(0, str(SOURCE.parent / "packages/optics/src"))
    from optdsh_optics.config_io import load_config
    config = load_config(path)
    if set(config) != {"projects"} or not isinstance(config["projects"], list) or not config["projects"]:
        raise ValueError("Fleet requires a non-empty projects list")
    plans, seen = [], set()
    for item in config["projects"]:
        if not isinstance(item, dict) or set(item) != {"path", "hosts"} or not isinstance(item["path"], str) or not item["path"].strip() or not isinstance(item["hosts"], str):
            raise ValueError("Each fleet project requires path and comma-separated hosts")
        root = (Path(path).resolve().parent / item["path"]).resolve()
        if root in seen:
            raise ValueError("Duplicate fleet project")
        seen.add(root)
        targets = select(only=item["hosts"])
        versions = {n: probe(n) for n in targets}
        _, _, rows = prepare(SOURCE, root, expert, targets, versions)
        if any(r["action"] == "conflict" or r["version"] != r["expected"] for r in rows):
            raise ValueError(f"Fleet preflight blocked at {root}; no project written")
        plans.append((root, targets, versions))
    # Preflight every destination before the first mutation; later I/O failures
    # remain recoverable through each destination's receipts and backups.
    return max(distribute(SOURCE, root, expert, targets, versions, apply, check) for root, targets, versions in plans)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expert", default="visual-designer")
    parser.add_argument("--project-root", type=Path, default=SOURCE.parent)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--check", action="store_true")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--only")
    scope.add_argument("--exclude")
    parser.add_argument("--config", type=Path, help="YAML selection: expert, only or exclude")
    parser.add_argument("--fleet", type=Path, help="YAML projects list for central multi-project distribution")
    args = parser.parse_args()
    try:
        if args.fleet:
            if args.config or args.only or args.exclude or args.project_root != SOURCE.parent:
                raise ValueError("--fleet cannot combine with config, host or project selection")
            return distribute_fleet(args.fleet, args.expert, args.apply, args.check)
        if args.config:
            sys.path.insert(0, str(SOURCE.parent / "packages/optics/src"))
            from optdsh_optics.config_io import load_config
            config = load_config(args.config)
            if set(config) - {"expert", "only", "exclude"} or "expert" not in config:
                raise ValueError("Config requires expert and allows only/exclude")
            if not all(isinstance(v, str) and v.strip() for v in config.values()):
                raise ValueError("Config values must be non-empty strings")
            if args.only is not None or args.exclude is not None or args.expert != "visual-designer":
                raise ValueError("Do not combine YAML selection with CLI selection")
            args.expert = config["expert"]
            args.only, args.exclude = config.get("only"), config.get("exclude")
        targets = select(args.only, args.exclude)
        return distribute(SOURCE, args.project_root, args.expert, targets,
                          {n: probe(n) for n in targets}, args.apply, args.check)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
