"""Project-scoped native agent export. Standard library; dry-run by default."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tomllib
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from git_hooks import hook_row

SOURCE = Path(__file__).resolve().parents[3]
NAMES = ("codex", "opencode", "claude", "dsh")
NAME = r"[a-z0-9]+(?:-[a-z0-9]+)*"
# Public exports must be self-contained and neutral: no control identity or local absolute path.
PRIVATE_TEXT = re.compile(r"agenttyvate|tyvate|(?<![a-z])[a-z]:[\\/]", re.I)
LIBRARY_SUFFIXES = {".md", ".json", ".png", ".html"}
KIT_SUFFIXES = LIBRARY_SUFFIXES | {".py", ".toml"}
MAX_PACK_BYTES = 20 * 1024 * 1024
# Events supported by Codex hooks, Claude Code hooks and the DSH Claude Code bridge alike.
HOOK_EVENTS = ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop")
# Tokens that parse identically in PowerShell, cmd.exe and POSIX sh without quoting.
SHELL_SAFE = re.compile(r"[A-Za-z0-9_./:=+-]+")
# Skill folders shared by Codex, OpenCode and DSH; Claude Code reads its own folder.
SHARED_SKILL_HOSTS = {"codex", "opencode", "dsh"}


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


def public_text(data, label):
    text = data.decode("utf-8")
    if PRIVATE_TEXT.search(text):
        raise ValueError(f"Control identity/path in public text: {label}")
    return text


def load_source(source, expert):
    if not re.fullmatch(NAME, expert):
        raise ValueError("Invalid expert name")
    contained(source, f"experts/{expert}")
    raw_meta = contained(source, f"experts/{expert}/agent.json").read_bytes()
    body = contained(source, f"experts/{expert}/instructions.md").read_text(encoding="utf-8").strip()
    meta = json.loads(raw_meta)
    if not isinstance(meta, dict) or set(meta) != {"name", "title", "version", "description"}:
        raise ValueError("agent.json must contain name, title, version, description only")
    if meta["name"] != expert or not all(isinstance(v, str) and v.strip() for v in meta.values()) or not body:
        raise ValueError("Incomplete expert definition")
    if not re.fullmatch(r"\d+\.\d+\.\d+", meta["version"]):
        raise ValueError("Expert version must be numeric x.y.z")
    public_text((body + meta["title"] + meta["description"]).encode(), f"{expert} instructions")
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


def pack_path(relative):
    """Validate one schema-2 manifest path: library/ or kit/ only, never kit/tests/."""
    if not isinstance(relative, str) or "\\" in relative or not relative:
        raise ValueError("Invalid resource path")
    path = PurePosixPath(relative)
    if path.is_absolute() or any(part in ("..", ".", "__pycache__") for part in path.parts) or len(path.parts) < 2:
        raise ValueError(f"Resource outside public pack: {relative}")
    allowed = {"library": LIBRARY_SUFFIXES, "kit": KIT_SUFFIXES}.get(path.parts[0])
    if allowed is None or path.suffix not in allowed or path.parts[:2] == ("kit", "tests"):
        raise ValueError(f"Resource outside public pack: {relative}")
    return path


def read_pack_file(file, relative):
    if file.is_symlink() or (hasattr(file, "is_junction") and file.is_junction()):
        raise ValueError(f"Linked source file not supported: {relative}")
    data = file.read_bytes()
    if relative.endswith(".png"):
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(f"Invalid PNG: {relative}")
    else:
        public_text(data, relative)  # .py/.toml kit files get the same neutrality check.
    return data


def load_skill(folder, relative):
    path = PurePosixPath(relative) if isinstance(relative, str) else None
    if path is None or "\\" in relative or len(path.parts) != 3 or path.parts[:2] != ("kit", "skills") or not re.fullmatch(NAME, path.parts[2]):
        raise ValueError(f"Skill must be kit/skills/<name>: {relative}")
    root = contained(folder, relative)
    if not root.is_dir():
        raise ValueError(f"Missing skill folder: {relative}")
    files = []
    for file in sorted(root.rglob("*")):
        inner = file.relative_to(root).as_posix()
        if "__pycache__" in file.relative_to(root).parts:
            continue
        if file.is_symlink() or (hasattr(file, "is_junction") and file.is_junction()):
            raise ValueError(f"Linked skill content not supported: {relative}/{inner}")
        if file.is_dir():
            continue
        if file.suffix not in KIT_SUFFIXES:
            raise ValueError(f"Unsupported skill file type: {relative}/{inner}")
        files.append((inner, read_pack_file(file, f"{relative}/{inner}")))
    skill = dict(files).get("SKILL.md")
    name = path.parts[2]
    if skill is None or not re.match(rf"---\r?\n(?:.*\r?\n)*?name:\s*['\"]?{re.escape(name)}['\"]?\s*\r?\n", skill.decode("utf-8")):
        raise ValueError(f"Skill needs SKILL.md frontmatter name: {name}")
    return name, files


def load_hook_spec(data, shipped, relative):
    spec = json.loads(data)
    if not isinstance(spec, dict) or set(spec) != {"schema_version", "hooks"} or spec["schema_version"] != 1 or not isinstance(spec["hooks"], list) or not spec["hooks"]:
        raise ValueError(f"Invalid hook spec: {relative}")
    entries = []
    for item in spec["hooks"]:
        if not isinstance(item, dict) or not {"event", "script"} <= set(item) or set(item) - {"event", "matcher", "script", "args", "timeout", "status"}:
            raise ValueError(f"Invalid hook entry in {relative}")
        if item["event"] not in HOOK_EVENTS:
            raise ValueError(f"Unsupported hook event: {item['event']}")
        script = item["script"]
        if not isinstance(script, str) or not script.endswith(".py") or f"kit/{script}" not in shipped:
            raise ValueError(f"Hook script must be a shipped kit .py file: {script}")
        pack_path(f"kit/{script}")
        args = item.get("args", [])
        if not isinstance(args, list) or not all(isinstance(a, str) and SHELL_SAFE.fullmatch(a) for a in args):
            raise ValueError("Hook args must be shell-neutral tokens")
        timeout = item.get("timeout")
        if timeout is not None and (type(timeout) is not int or not 1 <= timeout <= 600):
            raise ValueError("Hook timeout must be 1..600 seconds")
        matcher, status = item.get("matcher"), item.get("status")
        if matcher is not None:
            if not isinstance(matcher, str) or not matcher:
                raise ValueError("Hook matcher must be a non-empty string")
            re.compile(matcher)
        if status is not None and (not isinstance(status, str) or not status.strip()):
            raise ValueError("Hook status must be a non-empty string")
        entries.append(dict(event=item["event"], matcher=matcher, script=script, args=args, timeout=timeout, status=status))
    return entries


def load_resources(source, expert):
    """Only explicit schema-2 library/kit files are public. Never recursively copy the expert."""
    pack = {"resources": [], "skills": {}, "hooks": None, "git_hooks": {}}
    folder = contained(source, f"experts/{expert}")
    manifest_path = contained(folder, "resources.json")
    if not manifest_path.exists():
        return pack
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files") if isinstance(manifest, dict) else None
    if (not isinstance(manifest, dict) or set(manifest) - {"schema_version", "files", "skills", "hooks", "git_hooks"} or manifest.get("schema_version") != 2
            or not isinstance(files, list) or not files or len(set(map(str, files))) != len(files)):
        raise ValueError("Invalid public resource manifest; schema_version 2 required")
    resources = []
    for relative in files:
        path = pack_path(relative)
        resource_path = contained(folder, relative)
        # Third-party screenshots are local-only and may be absent in a public clone.
        if path.suffix == ".png" and not resource_path.exists():
            continue
        resources.append((relative, read_pack_file(resource_path, relative)))
    skills = manifest.get("skills", [])
    if not isinstance(skills, list) or len(set(map(str, skills))) != len(skills):
        raise ValueError("Manifest skills must be a list of unique kit/skills/<name> folders")
    for relative in skills:
        name, skill_files = load_skill(folder, relative)
        pack["skills"][name] = skill_files
    if "hooks" in manifest:
        relative = manifest["hooks"]
        shipped = dict(resources)
        if not isinstance(relative, str) or not relative.startswith("kit/") or not relative.endswith(".json") or relative not in shipped:
            raise ValueError("Manifest hooks must name a shipped kit/*.json spec")
        pack["hooks"] = load_hook_spec(shipped[relative], shipped, relative)
    git_hooks = manifest.get("git_hooks", {})
    if not isinstance(git_hooks, dict) or set(git_hooks) - {"pre-commit"}:
        raise ValueError("git_hooks only supports a pre-commit script")
    for event, script in git_hooks.items():
        if not isinstance(script, str) or not script.startswith("kit/scripts/") or not script.endswith(".py") or script not in dict(resources):
            raise ValueError("Git hook script must be a shipped kit/scripts/*.py file")
        pack["git_hooks"][event] = script
    # Ship the same allowlist with the generated pack; consumers don't need the
    # editable source tree to locate public library and kit assets.
    public_manifest = {**manifest, "files": [name for name, _ in resources]}
    manifest_bytes = manifest_path.read_bytes() if public_manifest == manifest else (json.dumps(public_manifest, ensure_ascii=False, indent=2) + "\n").encode()
    resources.append(("resources.json", manifest_bytes))
    total = sum(len(d) for _, d in resources) + sum(len(d) for files in pack["skills"].values() for _, d in files)
    if total > MAX_PACK_BYTES:
        raise ValueError("Public resource pack exceeds 20 MiB; curate before distributing")
    pack["resources"] = resources
    return pack


def substitute(text, pack, expert, label):
    """Replace pack placeholders; refuse placeholders whose target is not shipped."""
    root = f".agents/resources/{expert}"
    for token, prefix in (("{{RESOURCE_ROOT}}", "library"), ("{{KIT_ROOT}}", "kit")):
        if token in text:
            if not any(name.startswith(prefix + "/") for name, _ in pack["resources"]):
                raise ValueError(f"{label} references {token} but the pack ships no {prefix}/ files")
            text = text.replace(token, f"{root}/{prefix}")
    return text


def dsh_outputs(meta, body, target):
    # Preserve upstream Cordis tags and plugin scopes verbatim; change only persona.
    template = SOURCE.parent / "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml"
    standard = template.read_text(encoding="utf-8")
    expected = "              prefix: You are a coding agent powered by the {{model}} model."
    if standard.count(expected) != 1:
        raise ValueError("Pinned DSH Standard persona signature changed")
    name, title = meta["name"], meta["title"]
    persona = body + (f"\n\nDSH入口：参考资料优先用 expert_resource 工具读取（expert={name}），resource=START.md 获取索引，"
                      "resource=preferences.md 获取本项目偏好，kit 文件用 resource=kit/<路径>。PNG 需用 mode=image 实际读取；无法处理图片时明确视觉未验证。")
    if standard.count("    - id: preset-standard\n") != 1 or standard.count("        id: standard\n") != 1:
        raise ValueError("Pinned DSH Standard preset declaration changed")
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    composition = standard.replace(expected, "              prefix: " + quote(persona))
    composition = composition.replace("    - id: preset-standard\n", f"    - id: preset-{name}\n")
    composition = composition.replace("        id: standard\n", f"        id: {name}\n        name: {quote(title)}\n        description: {quote(meta['description'])}\n")
    base = f"{target['directory']}/{name}"
    packet = {**meta, "persona": persona, "upstreamVersion": target["verified_cli_version"], "standardSha256": digest(template.read_bytes())}
    return [(f"{base}/agent.cordis.yml", composition.encode()),
            (f"{base}/preset.yml", f"name: {quote(title)}\ndescription: {quote(meta['description'])}\n".encode()),
            (f"{base}/expert.json", (json.dumps(packet, ensure_ascii=False, indent=2) + "\n").encode())]


def hook_groups(host, root, expert, entries):
    """Render the spec for one host as Claude-Code-style {event: [matcher groups]}.

    Command forms (verified 2026-10-02):
    - Codex: `commandWindows` overrides `command` on Windows (learn.chatgpt.com/docs/hooks.md).
      codex-rs/hooks/src/engine/command_runner.rs runs it through the session shell
      (PowerShell `-Command`) or, without one, `%COMSPEC% /C "<command>"`; embedded quotes
      break the cmd wrap (openai/codex#38168). Hence an unquoted absolute script path made of
      shell-neutral characters, valid in both shells. Commands run in the session cwd, which
      may be a subdirectory, so a relative script path would be unreliable.
    - Claude Code: exec form (`args`, since 2.1.139) spawns `python` directly with no shell,
      so `${CLAUDE_PROJECT_DIR}` (the session's project root) is substituted per argument and
      needs no quoting on Windows (code.claude.com/docs/en/hooks, "Exec form and shell form").
    - DSH: @deepseek-ai/dsh-hooks-claude-code reads only the shell-form `command` string,
      ignores `args`, and runs it via ctx.shell (dsh-pwsh-local `pwsh -NoProfile -Command`
      on Windows, bash -c elsewhere) with cwd and CLAUDE_PROJECT_DIR set to the session
      workspace. Its config is process-wide, so the command points at the absolute kit
      script distributed into this project; the script decides per session cwd whether the
      calling project enabled it.
    Python is `python` on Windows and `python3` elsewhere; kit scripts are stdlib only.
    """
    windows = os.name == "nt"
    script_prefix = f".agents/resources/{expert}/kit/"
    groups = {}
    for entry in entries:
        argv = [*entry["args"], "--host", host]
        if host == "claude":
            handler = {"type": "command", "command": "python" if windows else "python3",
                       "args": ["${CLAUDE_PROJECT_DIR}/" + script_prefix + entry["script"], *argv]}
        else:
            script = (root / (script_prefix + entry["script"])).as_posix()
            if not SHELL_SAFE.fullmatch(script):
                raise ValueError(f"Hook script path needs shell quoting; use a project path without spaces: {script}")
            tail = " ".join([script, *argv])
            if host == "codex":
                handler = {"type": "command", "command": f"python3 {tail}", "commandWindows": f"python {tail}"}
            else:
                handler = {"type": "command", "command": f"{'python' if windows else 'python3'} {tail}"}
        if entry["timeout"] is not None:
            handler["timeout"] = entry["timeout"]
        if entry["status"] is not None:
            handler["statusMessage"] = entry["status"]
        group = {"matcher": entry["matcher"]} if entry["matcher"] else {}
        groups.setdefault(entry["event"], []).append({**group, "hooks": [handler]})
    return groups


def is_managed(handler, marker):
    # Ownership marker: every handler this distributor writes references its own script
    # under `.agents/resources/<expert>/kit/` (command, commandWindows or args). Users'
    # hooks and other experts' hooks never match, so merges leave them untouched.
    if not isinstance(handler, dict):
        return False
    args = handler.get("args") if isinstance(handler.get("args"), list) else []
    return any(isinstance(v, str) and marker in v.replace("\\", "/") for v in (handler.get("command"), handler.get("commandWindows"), *args))


def split_managed(document, marker):
    """Return (document without this expert's handlers, managed fragment)."""
    hooks = document.get("hooks")
    if hooks is None:
        return document, []
    if not isinstance(hooks, dict):
        raise ValueError("hooks must be an object")
    fragment, rest, removed = [], {}, False
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            rest[event] = groups
            continue
        kept = []
        for group in groups:
            handlers = group.get("hooks") if isinstance(group, dict) else None
            if not isinstance(handlers, list) or not any(is_managed(h, marker) for h in handlers):
                kept.append(group)
                continue
            removed = True
            fragment += [{"event": event, "matcher": group.get("matcher"), "handler": h} for h in handlers if is_managed(h, marker)]
            others = [h for h in handlers if not is_managed(h, marker)]
            if others:
                kept.append({**group, "hooks": others})
        if kept or not groups:
            rest[event] = kept
    result = dict(document)
    if rest or not removed:
        result["hooks"] = rest
    else:
        result.pop("hooks")
    return result, fragment


def fragment_of(groups):
    return [{"event": event, "matcher": group.get("matcher"), "handler": handler}
            for event, items in groups.items() for group in items for handler in group["hooks"]]


def fragment_digest(fragment):
    return digest("\n".join(sorted(json.dumps(item, sort_keys=True, ensure_ascii=False) for item in fragment)).encode())


def merged_row(root, state, relative, expert, groups):
    """Structured merge into a shared host file; ownership is tracked per expert fragment."""
    path = contained(root, relative)
    before = path.read_bytes() if path.exists() else None
    key = f"{relative}#{expert}"
    prior = state["files"].get(key)
    desired = fragment_of(groups)
    if prior is None and not desired:
        return None  # Nothing owned or wanted here; never parse or touch the file.
    try:
        document = json.loads(before.decode("utf-8")) if before is not None else {}
        if not isinstance(document, dict):
            raise ValueError("not an object")
        base, current = split_managed(document, f".agents/resources/{expert}/kit/")
    except (ValueError, UnicodeDecodeError):
        return dict(relative=relative, key=key, path=path, data=before, before=before, action="conflict", record={})
    desired_hash = fragment_digest(desired)
    # A missing receipt with existing marked handlers, or a fragment edited since the last
    # write, is a conflict: never overwrite hand-edited managed hooks. A deleted file is
    # recreated like any other missing generated file.
    if before is not None and ((prior is None and current) or (prior is not None and prior.get("managed_sha256") != fragment_digest(current))):
        action, data = "conflict", before
    elif fragment_digest(current) == desired_hash:
        action, data = "unchanged", before
    else:
        merged = dict(base)
        hooks = dict(merged.get("hooks", {}))
        for event, items in groups.items():
            hooks[event] = [*hooks.get(event, []), *items]
        if hooks or "hooks" in merged:
            merged["hooks"] = hooks
        data = (json.dumps(merged, ensure_ascii=False, indent=2) + "\n").encode()
        action = "create" if before is None else "update"
    return dict(relative=relative, key=key, path=path, data=data, before=before, action=action, record={"managed_sha256": desired_hash})


def prepare(source, root, expert, targets, versions):
    root = root.resolve()
    if not root.is_dir() or root == Path.home().resolve() or root == root.parent:
        raise ValueError("Choose an existing project directory, not a home or drive root")
    meta, body, registry, source_hash = load_source(source, expert)
    pack = load_resources(source, expert)
    resource_root = f".agents/resources/{expert}"
    # Placeholders resolve in every distributed Markdown text (instructions, library,
    # kit and skill .md); .py/.toml/.json payloads ship verbatim.
    resources = [(relative, substitute(data.decode("utf-8"), pack, expert, relative).encode("utf-8") if relative.endswith(".md") else data)
                 for relative, data in pack["resources"]]
    body = substitute(body, pack, expert, f"{expert} instructions")
    if (root / f".agents/experts/{expert}").resolve() == (source / f"experts/{expert}").resolve() and (source / f"experts/{expert}/preferences.md").is_file():
        body += f"\n\n已连接的统一偏好文件：`.agents/experts/{expert}/preferences.md`。开始前按需读取；它是本机共享偏好，不嵌入公共包；其中项目限定条目只对对应项目生效。"
    skills = {name: [(inner, substitute(data.decode(), pack, expert, f"skill {name}/{inner}").encode() if inner.endswith(".md") else data)
                     for inner, data in files] for name, files in pack["skills"].items()}
    shipped = resources + [(f"skills/{n}/{i}", d) for n, files in skills.items() for i, d in files]
    source_hash = digest((source_hash + "".join(relative + digest(data) for relative, data in shipped)).encode())
    state_path = contained(root, ".agents/.distribution/state.json")
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"schema_version": 1, "files": {}}
    if state.get("schema_version") != 1 or not isinstance(state.get("files"), dict):
        raise ValueError("Unsupported distribution state")
    rows = []

    def add(target, relative, data, version="shared", expected="shared"):
        path = contained(root, relative)
        before = path.read_bytes() if path.exists() else None
        prior = state["files"].get(relative)
        # Unmanaged, hand-edited, or owned by another expert (e.g. same skill name): keep it.
        conflict = before is not None and (not prior or digest(before) != prior.get("sha256") or prior.get("expert", expert) != expert)
        action = "conflict" if conflict else "create" if before is None else "unchanged" if before == data else "update"
        rows.append(dict(expert=expert, target=target, relative=relative, key=relative, path=path, data=data, before=before,
                         action=action, version=version, expected=expected, record={},
                         source_sha256=source_hash, expert_version=meta["version"]))

    def stale(prefix, wanted, owned_only=False):
        found = [k for k, v in state["files"].items() if k.startswith(prefix) and k not in wanted
                 and (not owned_only or v.get("expert") == expert)]
        if found:
            raise ValueError("Previously managed files omitted from source; reconcile safely first: " + ", ".join(found))

    for name in targets:
        target = registry[name]
        outputs = dsh_outputs(meta, body, target) if name == "dsh" else [(f"{target['directory']}/{expert}{target['extension']}", render(meta, body, target))]
        for relative, data in outputs:
            add(name, relative, data, versions[name], target["verified_cli_version"])
    stale(resource_root + "/", {f"{resource_root}/{relative}" for relative, _ in resources})
    for relative, data in resources:
        add("resources", f"{resource_root}/{relative}", data)
    layouts = []
    if SHARED_SKILL_HOSTS & set(targets):
        layouts.append(("skills", ".agents/skills", "shared", "shared"))
    if "claude" in targets:
        layouts.append(("claude-skills", ".claude/skills", versions["claude"], registry["claude"]["verified_cli_version"]))
    for label, folder, version, expected in layouts:
        stale(folder + "/", {f"{folder}/{n}/{i}" for n, files in skills.items() for i, _ in files}, owned_only=True)
        for skill_name, files in skills.items():
            for inner, data in files:
                add(label, f"{folder}/{skill_name}/{inner}", data, version, expected)
    hooks = pack["hooks"] or []
    if "dsh" in targets:
        relative = f".agents/dsh-hooks/{expert}.json"
        if hooks:
            document = {"hooks": hook_groups("dsh", root, expert, hooks)}
            add("dsh-hooks", relative, (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode(), versions["dsh"], registry["dsh"]["verified_cli_version"])
        else:
            stale(relative, set())
    for host, relative in (("codex", ".codex/hooks.json"), ("claude", ".claude/settings.local.json")):
        if host not in targets:
            continue
        row = merged_row(root, state, relative, expert, hook_groups(host, root, expert, hooks))
        if row:
            rows.append({**row, "expert": expert, "target": f"{host}-hooks", "version": versions[host],
                         "expected": registry[host]["verified_cli_version"], "source_sha256": source_hash, "expert_version": meta["version"]})
    for script in pack["git_hooks"].values():
        row = hook_row(root, state, expert, script, contained, digest)
        if row:
            rows.append({**row, "expert": expert, "source_sha256": source_hash, "expert_version": meta["version"]})
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


def resolve_experts(source, selection):
    """`all` means every expert folder with an agent.json; otherwise a comma list."""
    if isinstance(selection, (list, tuple)):
        names = list(selection)
    elif selection == "all":
        folder = source / "experts"
        names = sorted(p.name for p in folder.iterdir() if p.is_dir() and re.fullmatch(NAME, p.name) and (p / "agent.json").is_file()) if folder.is_dir() else []
    else:
        names = str(selection).split(",")
    if not names or len(set(names)) != len(names) or not all(re.fullmatch(NAME, n) for n in names):
        raise ValueError("Invalid, empty or duplicate expert selection")
    return names


def is_blocked(rows):
    return any(r["action"] == "conflict" or r["version"] != r["expected"] for r in rows)


def write_rows(root, state_path, state, rows):
    for row in rows:
        if row["action"] == "unchanged":
            continue
        if row["before"] is not None:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            backup = contained(root, f".agents/.distribution/backups/{stamp}-{uuid.uuid4().hex[:8]}-{row['target']}{row['path'].suffix}")
            atomic_write(root, backup, row["before"])
        atomic_write(root, row["path"], row["data"])
        if row["target"] == "git-hooks":
            row["path"].chmod(row["path"].stat().st_mode | 0o111)
        state["files"][row["key"]] = {
            "sha256": digest(row["data"]), **row["record"], "expert": row["expert"],
            "source_sha256": row["source_sha256"], "expert_version": row["expert_version"], "host_version": row["version"]}
    if any(r["action"] != "unchanged" for r in rows):
        atomic_write(root, state_path, (json.dumps(state, ensure_ascii=False, indent=2) + "\n").encode())


def distribute(source, root, expert, targets, versions, apply=False, check=False):
    root = root.resolve()
    experts = resolve_experts(source, expert)
    # Preflight every expert without side effects before acquiring a persistent lock file.
    rows = [row for name in experts for row in prepare(source, root, name, targets, versions)[2]]
    blocked = is_blocked(rows)
    if apply and not blocked:
        with writer_lock(root):
            rows = []
            for name in experts:
                # Re-read after the previous expert's writes so shared hook files merge in sequence.
                state_path, state, expert_rows = prepare(source, root, name, targets, versions)
                if any(r["action"] == "conflict" for r in expert_rows):
                    raise ValueError(f"Target changed before apply; stopped before writing {name}")
                write_rows(root, state_path, state, expert_rows)
                rows += expert_rows
    for row in rows:
        version_status = "ok" if row["version"] == row["expected"] else f"unverified (expected {row['expected']})"
        print(f"{row['expert']}/{row['target']}: {row['action']} | {row['version']} {version_status} | {row['path']}")
    if blocked:
        print("Blocked: version mismatch or unmanaged/drifted target; no files written.")
        return 2
    if check and any(r["action"] != "unchanged" for r in rows):
        return 1
    print("Applied; run --check next. Runtime loading remains unverified." if apply else "Checked." if check else "Preview only; use --apply to write.")
    return 0


def distribute_fleet(path, expert="all", apply=False, check=False):
    sys.path.insert(0, str(SOURCE.parent / "packages/optics/src"))
    from optdsh_optics.config_io import load_config
    config = load_config(path)
    if set(config) != {"projects"} or not isinstance(config["projects"], list) or not config["projects"]:
        raise ValueError("Fleet requires a non-empty projects list")
    experts = resolve_experts(SOURCE, expert)
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
        rows = [row for name in experts for row in prepare(SOURCE, root, name, targets, versions)[2]]
        if is_blocked(rows):
            raise ValueError(f"Fleet preflight blocked at {root}; no project written")
        plans.append((root, targets, versions))
    # Preflight every destination and expert before the first mutation; later I/O
    # failures remain recoverable through each destination's receipts and backups.
    return max(distribute(SOURCE, root, experts, targets, versions, apply, check) for root, targets, versions in plans)


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expert", help="expert name, comma list or all (default: all)")
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
            return distribute_fleet(args.fleet, args.expert or "all", args.apply, args.check)
        if args.config:
            sys.path.insert(0, str(SOURCE.parent / "packages/optics/src"))
            from optdsh_optics.config_io import load_config
            config = load_config(args.config)
            if set(config) - {"expert", "only", "exclude"} or "expert" not in config:
                raise ValueError("Config requires expert and allows only/exclude")
            if not all(isinstance(v, str) and v.strip() for v in config.values()):
                raise ValueError("Config values must be non-empty strings")
            if args.only is not None or args.exclude is not None or args.expert is not None:
                raise ValueError("Do not combine YAML selection with CLI selection")
            args.expert = config["expert"]
            args.only, args.exclude = config.get("only"), config.get("exclude")
        targets = select(args.only, args.exclude)
        return distribute(SOURCE, args.project_root, args.expert or "all", targets,
                          {n: probe(n) for n in targets}, args.apply, args.check)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
