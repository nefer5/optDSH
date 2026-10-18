"""Meaningful file lifecycle checks; fixtures stay under ignored temp/."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import tomllib
import unittest

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
SCRIPT = ROOT / ".agents/development-skills/expert-distribute/scripts/distribute.py"
spec = importlib.util.spec_from_file_location("expert_distribution", SCRIPT)
dist = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dist)

ARCH = "software-architect"
HOOK_SPEC = {"schema_version": 1, "hooks": [
    {"event": "SessionStart", "matcher": "startup|resume|clear|compact", "script": "scripts/arch_hook.py", "args": ["--event", "session-start"], "timeout": 10, "status": "Architecture context"},
    {"event": "Stop", "script": "scripts/arch_hook.py", "args": ["--event", "stop"], "timeout": 30, "status": "Architecture review check"}]}


class ExpertDistributionTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "temp").mkdir(exist_ok=True)
        self.sandbox = tempfile.TemporaryDirectory(prefix="expert-", dir=ROOT / "temp")
        self.addCleanup(self.sandbox.cleanup)
        self.base = Path(self.sandbox.name)
        self.source = self.base / "source"
        self.source.mkdir()
        shutil.copytree(ROOT / ".agents/experts/visual-designer", self.source / "experts/visual-designer")
        shutil.copy2(ROOT / ".agents/distribution.json", self.source / "distribution.json")
        self.write_architect()
        self.product = self.base / "product"
        self.product.mkdir()
        template = self.product / "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml"
        template.parent.mkdir(parents=True)
        shutil.copy2(ROOT / "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml", template)
        self.initial_snapshot = self.snapshot()
        self.versions = {k: v["verified_cli_version"] for k, v in json.loads((self.source / "distribution.json").read_text())["targets"].items()}

    def write_architect(self, **overrides):
        """Neutral fixture for the second expert; independent of the real library/kit."""
        folder = self.source / "experts" / ARCH
        if folder.exists():
            shutil.rmtree(folder)
        manifest = {"schema_version": 2, "files": ["library/START.md", "kit/README.md", "kit/scripts/arch_hook.py", "kit/config/architecture.example.toml", "kit/hooks/spec.json"],
                    "skills": ["kit/skills/arch-plan"], "hooks": "kit/hooks/spec.json"}
        files = {
            "agent.json": json.dumps({"name": ARCH, "title": "软件架构专家", "version": "0.1.0", "description": "架构夹具"}, ensure_ascii=False),
            "instructions.md": "# 架构夹具\n\n先读 `{{RESOURCE_ROOT}}/START.md`，需要证据时运行 `{{KIT_ROOT}}/scripts/arch_hook.py`。\n",
            "library/START.md": "# 索引\n\n扫描器：`{{KIT_ROOT}}/scripts/arch_hook.py`；模板：`{{RESOURCE_ROOT}}/templates`。\n",
            "kit/README.md": "资料见 `{{RESOURCE_ROOT}}/START.md`。\n",
            "kit/scripts/arch_hook.py": "# {{KIT_ROOT}} stays verbatim in code\nprint('fixture')\n",
            "kit/config/architecture.example.toml": "[project]\ntier = 1\n",
            "kit/hooks/spec.json": json.dumps(HOOK_SPEC),
            "kit/skills/arch-plan/SKILL.md": "---\nname: arch-plan\ndescription: 夹具技能\n---\n\n运行 `{{KIT_ROOT}}/scripts/arch_hook.py`。\n",
            "kit/skills/arch-plan/references/levels.md": "L0 / L1 / L2\n",
            "kit/tests/test_hidden.py": "raise SystemExit(1)\n",
            "preferences.md": "private preference\n",
            "resources.json": json.dumps(manifest),
        }
        files.update(overrides)
        for relative, text in files.items():
            if text is None:
                continue
            (folder / relative).parent.mkdir(parents=True, exist_ok=True)
            (folder / relative).write_text(text, encoding="utf-8")

    def run_export(self, expert="visual-designer", targets=dist.NAMES, root=None, **kwargs):
        with redirect_stdout(io.StringIO()):
            return dist.distribute(self.source, root or self.product, expert, list(targets), self.versions, **kwargs)

    def run_yaml(self, content, *extra):
        from unittest.mock import patch
        path = self.base / "selection.yaml"
        path.write_text(content, encoding="utf-8")
        with patch("sys.argv", [str(SCRIPT), "--config", str(path), "--project-root", str(self.product), *extra]), patch.object(dist, "SOURCE", self.source), patch.object(dist, "probe", side_effect=lambda n, project_root=None: self.versions[n]), redirect_stdout(io.StringIO()):
            return dist.main()

    def read_json(self, relative):
        return json.loads((self.product / relative).read_text(encoding="utf-8"))

    def snapshot(self):
        return {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in self.product.rglob("*") if p.is_file() and "backups" not in p.parts}

    # --- existing lifecycle guarantees -------------------------------------------------

    def test_yaml_selects_one_host_and_check_is_repeatable(self):
        config = "expert: visual-designer\nonly: claude\n"
        self.assertEqual(self.run_yaml(config, "--apply"), 0)
        self.assertTrue((self.product / ".claude/agents/visual-designer.md").is_file())
        self.assertFalse((self.product / ".codex").exists())
        self.assertEqual(self.run_yaml(config, "--check"), 0)

    def test_yaml_rejects_invalid_input_before_any_write(self):
        for config in ("unknown: value", "expert: 123", "expert: ''", "expert: ../escape", "expert: visual-designer\nonly: codex\nexclude: claude", "expert: visual-designer\nonly: missing", "expert: visual-designer\nexpert: duplicate", "expert: visual-designer,visual-designer"):
            self.assertEqual(self.run_yaml(config, "--apply"), 2)
            self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_yaml_rejects_ambiguous_cli_selection(self):
        self.assertEqual(self.run_yaml("expert: visual-designer", "--only", "codex", "--apply"), 2)
        self.assertEqual(self.run_yaml("expert: visual-designer", "--expert", ARCH, "--apply"), 2)
        self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_public_export_excludes_private_data_and_keeps_linked_text(self):
        exporter_path = ROOT / "plugins/optdsh-experts/scripts/export-public.py"
        spec = importlib.util.spec_from_file_location("public_export", exporter_path)
        exporter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(exporter)
        output = self.base / "public"
        manifest = exporter.export_public(output, self.source / "experts/visual-designer")
        self.assertFalse(list(output.rglob("*.png")))
        self.assertFalse(list(output.rglob("preferences.md")))
        self.assertFalse((output / "private").exists())
        self.assertTrue((output / "preferences.example.md").exists())
        self.assertTrue((output / "library/collections/product-ui/README.md").exists())
        for name, record in manifest["files"].items():
            self.assertEqual(dist.digest((output / name).read_bytes()), record["sha256"])
        with self.assertRaises(FileExistsError):
            exporter.export_public(output)

    def test_fleet_preflight_prevents_partial_writes_on_later_conflict(self):
        from unittest.mock import patch
        import sys
        sys.path.insert(0, str(ROOT / "packages/optics/src"))
        second = self.base / "second"
        (second / ".claude/agents").mkdir(parents=True)
        (second / ".claude/agents/visual-designer.md").write_text("hand-written")
        config = self.base / "fleet.yaml"
        config.write_text("projects:\n  - path: product\n    hosts: claude\n  - path: second\n    hosts: claude\n")
        with patch.object(dist, "SOURCE", self.source), patch.object(dist, "probe", side_effect=lambda n, project_root=None: self.versions[n]):
            with self.assertRaises(ValueError):
                dist.distribute_fleet(config, expert=f"{ARCH},visual-designer", apply=True)
        self.assertEqual(self.snapshot(), self.initial_snapshot)
        self.assertEqual((second / ".claude/agents/visual-designer.md").read_text(), "hand-written")

    def test_public_clone_can_distribute_text_without_private_screenshots(self):
        minimal = self.base / "text-source"
        shutil.copytree(self.source, minimal, ignore=shutil.ignore_patterns("*.png", "private", "preferences.md"))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(dist.distribute(minimal, self.product, "visual-designer", ["claude"], self.versions, apply=True), 0)
        self.assertFalse(list(self.product.rglob("*.png")))
        self.assertTrue((self.product / ".agents/resources/visual-designer/library/START.md").exists())

    def test_preview_is_read_only(self):
        self.assertEqual(self.run_export("all"), 0)
        self.assertEqual(self.snapshot(), self.initial_snapshot)
        self.assertEqual(self.run_export("all", check=True), 1)
        self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_three_formats_preserve_complete_prompt_and_current_claude_fields(self):
        self.assertEqual(self.run_export(apply=True), 0)
        source = (self.source / "experts/visual-designer/instructions.md").read_text(encoding="utf-8").strip()
        codex = tomllib.loads((self.product / ".codex/agents/visual-designer.toml").read_text(encoding="utf-8"))
        source = source.replace("{{RESOURCE_ROOT}}", ".agents/resources/visual-designer/library")
        self.assertEqual(codex["developer_instructions"], source)
        for tool, expected in [("claude", {"name", "description", "model"}), ("opencode", {"description", "mode"})]:
            text = (self.product / f".{tool}/agents/visual-designer.md").read_text(encoding="utf-8")
            frontmatter = text.split("---", 2)[1].strip()
            fields = {line.split(": ", 1)[0]: json.loads(line.split(": ", 1)[1]) for line in frontmatter.splitlines()}
            self.assertEqual(set(fields), expected)
            self.assertTrue(text.endswith(source + "\n"))
        self.assertEqual(self.run_export(check=True), 0)

    def test_dsh_preset_and_subagent_share_the_same_persona(self):
        import yaml
        import copy
        class CordisLoader(yaml.SafeLoader):
            pass
        CordisLoader.add_constructor("tag:yaml.org,2002:js", lambda loader, node: loader.construct_scalar(node))
        standard = yaml.load((self.product / "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml").read_text(encoding="utf-8"), Loader=CordisLoader)
        self.assertEqual(self.run_export("all", apply=True), 0)
        for name, title in (("visual-designer", "视觉设计专家"), (ARCH, "软件架构专家")):
            folder = self.product / ".agents/dsh-presets" / name
            rows = yaml.load((folder / "agent.cordis.yml").read_text(encoding="utf-8"), Loader=CordisLoader)
            declaration = rows[0]["insert"][0]
            self.assertEqual(declaration["name"], "@deepseek-ai/dsh-agent-preset")
            self.assertEqual((declaration["config"]["id"], declaration["config"]["name"]), (name, title))
            plugins = declaration["config"]["plugins"]
            persona = next(r["config"]["prefix"] for r in plugins if r.get("id") == "persona")
            packet = json.loads((folder / "expert.json").read_text(encoding="utf-8"))
            self.assertEqual(persona, packet["persona"])
            self.assertEqual(packet["title"], title)
            self.assertIn(f"expert={name}", persona)
            self.assertEqual(packet["upstreamVersion"], self.versions["dsh"])
            self.assertIn(title, (folder / "preset.yml").read_text(encoding="utf-8"))
            # Preserve the complete installed upstream stack, including versions
            # where cwd/time context moved out of the persona's old suffix.
            expected = copy.deepcopy(standard[0]["insert"][0]["config"]["plugins"])
            next(r["config"] for r in expected if r.get("id") == "persona")["prefix"] = persona
            self.assertEqual(plugins, expected)
            self.assertTrue(any(r.get("id") == "tool-pwsh" for r in plugins))

    def test_idempotent_apply_preserves_all_files(self):
        self.run_export("all", apply=True)
        before = self.snapshot()
        self.run_export("all", apply=True)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.run_export("all", check=True), 0)

    def test_update_backs_up_previous_bytes(self):
        self.run_export(apply=True)
        target = self.product / ".claude/agents/visual-designer.md"
        old = target.read_bytes()
        prompt = self.source / "experts/visual-designer/instructions.md"
        with prompt.open("a", encoding="utf-8") as stream:
            stream.write('\n新测试要求：保留 "引用" 和 \\ 路径符号。\n')
        self.assertEqual(self.run_export(check=True), 1)
        self.assertEqual(self.run_export(apply=True), 0)
        backups = list((self.product / ".agents/.distribution/backups").glob("*-claude.md"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), old)
        self.assertEqual(self.run_export(check=True), 0)

    def test_unmanaged_collision_prevents_partial_apply(self):
        target = self.product / ".claude/agents/visual-designer.md"
        target.parent.mkdir(parents=True)
        target.write_text("user-owned", encoding="utf-8")
        self.assertEqual(self.run_export("all", apply=True), 2)
        self.assertEqual(target.read_text(), "user-owned")
        self.assertFalse((self.product / ".codex").exists())
        self.assertFalse((self.product / f".claude/agents/{ARCH}.md").exists())

    def test_manual_drift_is_preserved(self):
        self.run_export(apply=True)
        target = self.product / ".claude/agents/visual-designer.md"
        target.write_text("local edit", encoding="utf-8")
        self.assertEqual(self.run_export(apply=True), 2)
        self.assertEqual(target.read_text(), "local edit")

    def test_unknown_version_prevents_writes(self):
        self.versions["opencode"] = "2.0.0"
        self.assertEqual(self.run_export("all", apply=True), 2)
        self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_targets_and_paths(self):
        self.assertEqual(dist.select(exclude="opencode"), ["codex", "claude", "dsh"])
        for args in ({"only": ""}, {"only": "unknown"}, {"exclude": "codex,opencode,claude,dsh"}):
            with self.assertRaises(ValueError):
                dist.select(**args)
        with self.assertRaises(ValueError):
            dist.load_source(self.source, "../escape")
        with self.assertRaises(ValueError):
            dist.contained(self.product, "../outside")
        self.assertEqual(dist.resolve_experts(self.source, "all"), [ARCH, "visual-designer"])
        for bad in ("", "a,,b", "x,x", "../escape"):
            with self.assertRaises(ValueError):
                dist.resolve_experts(self.source, bad)

    def test_public_resources_arrive_but_preferences_do_not(self):
        self.assertEqual(self.run_export("all", apply=True), 0)
        exported = self.product / ".agents/resources/visual-designer"
        self.assertTrue((exported / "library/START.md").is_file())
        source_image = self.source / "experts/visual-designer/library/styles/minimal/01-dark.png"
        if source_image.exists():
            self.assertEqual(source_image.read_bytes(), (exported / "library/styles/minimal/01-dark.png").read_bytes())
        manifest = json.loads((exported / "resources.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema_version"], 2)
        self.assertEqual(set(manifest["files"]), {p.relative_to(exported).as_posix() for p in (exported / "library").rglob("*") if p.is_file()})
        self.assertFalse((exported / "START.md").exists())
        self.assertFalse(list(self.product.rglob("preferences.md")))
        for name in ("visual-designer", ARCH):
            prompt = (self.product / f".codex/agents/{name}.toml").read_text(encoding="utf-8")
            self.assertNotIn(f"experts/{name}/preferences.md", prompt)
            self.assertNotIn(str(self.source), prompt)

    def test_resource_drift_blocks_all_updates(self):
        self.run_export(apply=True)
        exported = self.product / ".agents/resources/visual-designer/library/START.md"
        exported.write_text("user revised", encoding="utf-8")
        target = self.product / ".codex/agents/visual-designer.toml"
        old = target.read_bytes()
        with (self.source / "experts/visual-designer/instructions.md").open("a", encoding="utf-8") as stream:
            stream.write("\nNew brief\n")
        self.assertEqual(self.run_export(apply=True), 2)
        self.assertEqual(target.read_bytes(), old)
        self.assertEqual(exported.read_text(), "user revised")

    def test_manifest_cannot_export_preferences(self):
        manifest = self.source / "experts/visual-designer/resources.json"
        manifest.write_text(json.dumps({"schema_version": 2, "files": ["preferences.md"]}))
        with self.assertRaises(ValueError):
            self.run_export(apply=True)
        self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_every_catalog_image_and_link_is_present(self):
        import hashlib
        import re
        library = self.source / "experts/visual-designer/library"
        catalog = json.loads((library / "catalog.json").read_text(encoding="utf-8"))
        for item in catalog["items"]:
            if (library / item["file"]).exists():
                self.assertEqual(hashlib.sha256((library / item["file"]).read_bytes()).hexdigest(), item["sha256"])
            self.assertTrue((library / item["notes"]).is_file())
        for doc in library.rglob("*.md"):
            for ref in re.findall(r'\]\(([^)]+)\)', doc.read_text(encoding="utf-8")):
                if "://" not in ref and not ref.endswith(".png"):
                    self.assertTrue((doc.parent / ref.split("#")[0]).is_file(), f"{doc}: {ref}")

    # --- title, schema 2, kit, skills, hooks, fleet -----------------------------------

    def test_title_is_required_metadata(self):
        self.write_architect(**{"agent.json": json.dumps({"name": ARCH, "version": "0.1.0", "description": "x"})})
        with self.assertRaises(ValueError):
            self.run_export(ARCH)
        self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_schema2_ships_kit_but_not_tests_and_replaces_placeholders_in_markdown(self):
        self.assertEqual(self.run_export(ARCH, apply=True), 0)
        pack = self.product / f".agents/resources/{ARCH}"
        self.assertEqual({p.relative_to(pack).as_posix() for p in pack.rglob("*") if p.is_file()},
                         {"resources.json", "library/START.md", "kit/README.md", "kit/scripts/arch_hook.py", "kit/config/architecture.example.toml", "kit/hooks/spec.json"})
        prompt = tomllib.loads((self.product / f".codex/agents/{ARCH}.toml").read_text(encoding="utf-8"))["developer_instructions"]
        start = (pack / "library/START.md").read_text(encoding="utf-8")
        kit_readme = (pack / "kit/README.md").read_text(encoding="utf-8")
        for text in (prompt, start):
            self.assertIn(f".agents/resources/{ARCH}/kit/scripts/arch_hook.py", text)
            self.assertNotIn("{{", text)
        self.assertIn(f".agents/resources/{ARCH}/library/templates", start)
        self.assertIn(f".agents/resources/{ARCH}/library/START.md", kit_readme)
        self.assertIn("{{KIT_ROOT}}", (pack / "kit/scripts/arch_hook.py").read_text(encoding="utf-8"))  # code ships verbatim
        self.assertEqual(self.run_export(ARCH, check=True), 0)

    def test_manifest_and_kit_text_are_validated_before_writes(self):
        base = json.loads((self.source / f"experts/{ARCH}/resources.json").read_text())
        library_only = {"schema_version": 2, "files": ["library/START.md"]}
        cases = [
            {"resources.json": json.dumps({**base, "schema_version": 1})},
            {"resources.json": json.dumps({**base, "files": [*base["files"], "kit/tests/test_hidden.py"]})},
            {"resources.json": json.dumps({**base, "files": [*base["files"], "library/tool.py"]}), "library/tool.py": "x = 1\n"},
            {"resources.json": json.dumps({**base, "skills": ["kit/scripts"]})},
            {"resources.json": json.dumps({**base, "hooks": "kit/hooks/other.json"})},
            {"kit/scripts/arch_hook.py": "ROOT = 'C:\\\\Users\\\\someone'\n"},
            {"kit/skills/arch-plan/SKILL.md": "---\nname: other\n---\n"},
            {"kit/hooks/spec.json": json.dumps({"schema_version": 1, "hooks": [{"event": "Stop", "script": "scripts/missing.py"}]})},
            {"kit/hooks/spec.json": json.dumps({"schema_version": 1, "hooks": [{"event": "Stop", "script": "scripts/arch_hook.py", "args": ["a b"]}]})},
            {"resources.json": json.dumps(library_only), "instructions.md": "`{{KIT_ROOT}}`\n"},  # placeholder without kit files
            {"resources.json": json.dumps(library_only), "instructions.md": "plain\n"},  # library START.md uses {{KIT_ROOT}}
        ]
        for overrides in cases:
            self.write_architect(**overrides)
            with self.assertRaises(ValueError, msg=str(overrides)):
                self.run_export(ARCH, apply=True)
            self.assertEqual(self.snapshot(), self.initial_snapshot)

    def test_skills_use_shared_and_claude_layouts(self):
        self.assertEqual(self.run_export(ARCH, targets=["claude"], apply=True), 0)
        claude = self.product / ".claude/skills/arch-plan"
        self.assertTrue((claude / "references/levels.md").is_file())
        self.assertIn(f".agents/resources/{ARCH}/kit/scripts/arch_hook.py", (claude / "SKILL.md").read_text(encoding="utf-8"))
        self.assertFalse((self.product / ".agents/skills").exists())
        self.assertEqual(self.run_export(ARCH, targets=["codex"], apply=True), 0)
        shared = self.product / ".agents/skills/arch-plan"
        self.assertEqual((shared / "SKILL.md").read_bytes(), (claude / "SKILL.md").read_bytes())
        # A skill folder owned by the project, not the distributor, is never overwritten.
        other = self.base / "other"
        (other / ".agents/skills/arch-plan").mkdir(parents=True)
        (other / ".agents/skills/arch-plan/SKILL.md").write_text("project skill")
        self.assertEqual(self.run_export(ARCH, targets=["opencode"], root=other, apply=True), 2)
        self.assertEqual((other / ".agents/skills/arch-plan/SKILL.md").read_text(), "project skill")

    def write_user_hooks(self):
        codex = {"description": "user", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo user-stop"}]}]}}
        claude = {"permissions": {"allow": ["Bash(ls)"]}, "hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo user-pre"}]}]}}
        for relative, value in ((".codex/hooks.json", codex), (".claude/settings.local.json", claude)):
            (self.product / relative).parent.mkdir(parents=True, exist_ok=True)
            (self.product / relative).write_text(json.dumps(value, indent=4), encoding="utf-8")
        return codex, claude

    def test_hook_merge_keeps_user_content_and_is_idempotent(self):
        codex_user, claude_user = self.write_user_hooks()
        self.assertEqual(self.run_export(ARCH, targets=["codex", "claude", "dsh"], apply=True), 0)
        codex = self.read_json(".codex/hooks.json")
        self.assertEqual(codex["description"], "user")
        self.assertEqual(codex["hooks"]["Stop"][0], codex_user["hooks"]["Stop"][0])
        handler = codex["hooks"]["Stop"][1]["hooks"][0]
        script = (self.product.resolve() / f".agents/resources/{ARCH}/kit/scripts/arch_hook.py").as_posix()
        self.assertEqual(handler["commandWindows"], f"python {script} --event stop --host codex")
        self.assertEqual(handler["command"], f"python3 {script} --event stop --host codex")
        self.assertEqual((handler["timeout"], handler["statusMessage"]), (30, "Architecture review check"))
        self.assertEqual(codex["hooks"]["SessionStart"][0]["matcher"], "startup|resume|clear|compact")
        claude = self.read_json(".claude/settings.local.json")
        self.assertEqual(claude["permissions"], claude_user["permissions"])
        self.assertEqual(claude["hooks"]["PreToolUse"], claude_user["hooks"]["PreToolUse"])
        exec_form = claude["hooks"]["Stop"][0]["hooks"][0]
        self.assertEqual(exec_form["args"], [f"${{CLAUDE_PROJECT_DIR}}/.agents/resources/{ARCH}/kit/scripts/arch_hook.py", "--event", "stop", "--host", "claude"])
        self.assertIn(exec_form["command"], ("python", "python3"))
        dsh = self.read_json(f".agents/dsh-hooks/{ARCH}.json")
        self.assertTrue(dsh["hooks"]["Stop"][0]["hooks"][0]["command"].endswith(f"{script} --event stop --host dsh"))
        self.assertEqual(len(list((self.product / ".agents/.distribution/backups").glob("*-hooks.json"))), 2)
        before = self.snapshot()
        self.assertEqual(self.run_export(ARCH, targets=["codex", "claude", "dsh"], apply=True), 0)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.run_export(ARCH, targets=["codex", "claude", "dsh"], check=True), 0)

    def test_user_hook_edits_are_free_but_managed_edits_conflict(self):
        self.write_user_hooks()
        targets = ["codex", "claude"]
        self.assertEqual(self.run_export(ARCH, targets=targets, apply=True), 0)
        path = self.product / ".codex/hooks.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["hooks"]["Stop"][0]["hooks"][0]["command"] = "echo user-changed"
        path.write_text(json.dumps(document), encoding="utf-8")
        spec = json.loads(json.dumps(HOOK_SPEC))
        spec["hooks"][1]["timeout"] = 45
        self.write_architect(**{"kit/hooks/spec.json": json.dumps(spec)})
        self.assertEqual(self.run_export(ARCH, targets=targets, apply=True), 0)
        document = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(document["hooks"]["Stop"][0]["hooks"][0]["command"], "echo user-changed")
        self.assertEqual(document["hooks"]["Stop"][1]["hooks"][0]["timeout"], 45)
        document["hooks"]["Stop"][1]["hooks"][0]["timeout"] = 5  # hand edit of a managed handler
        path.write_text(json.dumps(document), encoding="utf-8")
        edited = path.read_bytes()
        claude_before = (self.product / ".claude/settings.local.json").read_bytes()
        self.write_architect()
        self.assertEqual(self.run_export(ARCH, targets=targets, apply=True), 2)
        self.assertEqual(path.read_bytes(), edited)
        self.assertEqual((self.product / ".claude/settings.local.json").read_bytes(), claude_before)

    def test_unreceipted_marked_handler_is_a_conflict(self):
        path = self.product / ".codex/hooks.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": f"python .agents/resources/{ARCH}/kit/x.py"}]}]}}))
        before = path.read_bytes()
        self.assertEqual(self.run_export(ARCH, targets=["codex"], apply=True), 2)
        self.assertEqual(path.read_bytes(), before)

    def test_removing_expert_hooks_keeps_user_entries(self):
        codex_user, claude_user = self.write_user_hooks()
        self.assertEqual(self.run_export(ARCH, targets=["codex", "claude"], apply=True), 0)
        manifest = json.loads((self.source / f"experts/{ARCH}/resources.json").read_text())
        manifest.pop("hooks")
        self.write_architect(**{"resources.json": json.dumps(manifest)})
        self.assertEqual(self.run_export(ARCH, targets=["codex", "claude"], apply=True), 0)
        self.assertEqual(self.read_json(".codex/hooks.json"), codex_user)
        self.assertEqual(self.read_json(".claude/settings.local.json"), claude_user)
        self.assertEqual(self.run_export(ARCH, targets=["codex", "claude"], check=True), 0)

    def test_hook_paths_must_be_shell_neutral(self):
        spaced = self.base / "with space"
        spaced.mkdir()
        with self.assertRaises(ValueError):
            self.run_export(ARCH, targets=["codex"], root=spaced, apply=True)
        self.assertEqual(list(spaced.iterdir()), [])
        self.assertEqual(self.run_export(ARCH, targets=["claude"], root=spaced, apply=True), 0)  # exec form needs no quoting

    def test_two_experts_share_hook_files_without_touching_each_other(self):
        spec = {"schema_version": 1, "hooks": [{"event": "Stop", "script": "scripts/v.py", "args": [], "timeout": 5}]}
        vd = self.source / "experts/visual-designer"
        manifest = json.loads((vd / "resources.json").read_text(encoding="utf-8"))
        manifest.update(files=[*manifest["files"], "kit/scripts/v.py", "kit/hooks/spec.json"], hooks="kit/hooks/spec.json")
        (vd / "kit/scripts").mkdir(parents=True)
        (vd / "kit/hooks").mkdir()
        (vd / "kit/scripts/v.py").write_text("print(1)\n")
        (vd / "kit/hooks/spec.json").write_text(json.dumps(spec))
        (vd / "resources.json").write_text(json.dumps(manifest), encoding="utf-8")
        self.assertEqual(self.run_export("all", targets=["codex"], apply=True), 0)
        stop = self.read_json(".codex/hooks.json")["hooks"]["Stop"]
        self.assertEqual(len(stop), 2)
        self.assertEqual(self.run_export("all", targets=["codex"], check=True), 0)

    def test_multi_expert_fleet_writes_every_project(self):
        from unittest.mock import patch
        import sys
        sys.path.insert(0, str(ROOT / "packages/optics/src"))
        second = self.base / "second"
        second.mkdir()
        config = self.base / "fleet.yaml"
        config.write_text("projects:\n  - path: product\n    hosts: codex,claude\n  - path: second\n    hosts: claude\n")
        with patch.object(dist, "SOURCE", self.source), patch.object(dist, "probe", side_effect=lambda n, project_root=None: self.versions[n]), redirect_stdout(io.StringIO()):
            self.assertEqual(dist.distribute_fleet(config, expert="all", apply=True), 0)
            self.assertEqual(dist.distribute_fleet(config, expert="visual-designer,software-architect", check=True), 0)
        for root in (self.product, second):
            for name in ("visual-designer", ARCH):
                self.assertTrue((root / f".claude/agents/{name}.md").is_file())
            self.assertTrue((root / ".claude/skills/arch-plan/SKILL.md").is_file())
        self.assertTrue((self.product / ".agents/skills/arch-plan/SKILL.md").is_file())
        self.assertFalse((second / ".agents/skills").exists())


if __name__ == "__main__":
    unittest.main()
