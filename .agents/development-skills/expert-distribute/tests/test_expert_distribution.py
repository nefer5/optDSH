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


class ExpertDistributionTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "temp").mkdir(exist_ok=True)
        self.sandbox = tempfile.TemporaryDirectory(prefix="expert-", dir=ROOT / "temp")
        self.addCleanup(self.sandbox.cleanup)
        self.base = Path(self.sandbox.name)
        self.source = self.base / "source"
        self.source.mkdir()
        shutil.copytree(ROOT / ".agents/experts", self.source / "experts")
        shutil.copy2(ROOT / ".agents/distribution.json", self.source / "distribution.json")
        self.product = self.base / "product"
        self.product.mkdir()
        self.versions = {k: v["verified_cli_version"] for k, v in json.loads((self.source / "distribution.json").read_text())["targets"].items()}

    def run_export(self, **kwargs):
        with redirect_stdout(io.StringIO()):
            return dist.distribute(self.source, self.product, "visual-designer", list(dist.NAMES), self.versions, **kwargs)

    def run_yaml(self, content, *extra):
        from unittest.mock import patch
        path = self.base / "selection.yaml"
        path.write_text(content, encoding="utf-8")
        with patch("sys.argv", [str(SCRIPT), "--config", str(path), "--project-root", str(self.product), *extra]), patch.object(dist, "probe", side_effect=lambda n: self.versions[n]), redirect_stdout(io.StringIO()):
            return dist.main()

    def test_yaml_selects_one_host_and_check_is_repeatable(self):
        config = "expert: visual-designer\nonly: claude\n"
        self.assertEqual(self.run_yaml(config, "--apply"), 0)
        self.assertTrue((self.product / ".claude/agents/visual-designer.md").is_file())
        self.assertFalse((self.product / ".codex").exists())
        self.assertEqual(self.run_yaml(config, "--check"), 0)

    def test_yaml_rejects_invalid_input_before_any_write(self):
        for config in ("unknown: value", "expert: 123", "expert: ''", "expert: ../escape", "expert: visual-designer\nonly: codex\nexclude: claude", "expert: visual-designer\nonly: missing", "expert: visual-designer\nexpert: duplicate"):
            self.assertEqual(self.run_yaml(config, "--apply"), 2)
            self.assertEqual(list(self.product.iterdir()), [])

    def test_yaml_rejects_ambiguous_cli_selection(self):
        self.assertEqual(self.run_yaml("expert: visual-designer", "--only", "codex", "--apply"), 2)
        self.assertEqual(list(self.product.iterdir()), [])

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
        with patch.object(dist,"SOURCE",self.source), patch.object(dist,"probe",side_effect=lambda n:self.versions[n]):
            with self.assertRaises(ValueError):
                dist.distribute_fleet(config,apply=True)
        self.assertEqual(list(self.product.iterdir()), [])
        self.assertEqual((second / ".claude/agents/visual-designer.md").read_text(),"hand-written")

    def test_public_clone_can_distribute_text_without_private_screenshots(self):
        minimal = self.base / "text-source"
        shutil.copytree(self.source, minimal, ignore=shutil.ignore_patterns("*.png", "private", "preferences.md"))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(dist.distribute(minimal,self.product,"visual-designer",["claude"],self.versions,apply=True),0)
        self.assertFalse(list(self.product.rglob("*.png")))
        self.assertTrue((self.product / ".agents/resources/visual-designer/library/START.md").exists())

    def test_preview_is_read_only(self):
        self.assertEqual(self.run_export(), 0)
        self.assertEqual(list(self.product.iterdir()), [])
        self.assertEqual(self.run_export(check=True), 1)
        self.assertEqual(list(self.product.iterdir()), [])

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
        class CordisLoader(yaml.SafeLoader):
            pass
        CordisLoader.add_constructor("tag:yaml.org,2002:js", lambda loader, node: loader.construct_scalar(node))
        self.assertEqual(self.run_export(apply=True), 0)
        folder = self.product / ".agents/dsh-presets/visual-designer"
        rows = yaml.load((folder / "agent.cordis.yml").read_text(encoding="utf-8"), Loader=CordisLoader)
        declaration = rows[0]["insert"][0]
        self.assertEqual(declaration["name"], "@deepseek-ai/dsh-agent-preset")
        self.assertEqual(declaration["config"]["id"], "visual-designer")
        rows = declaration["config"]["plugins"]
        persona = next(r["config"]["prefix"] for r in rows if r.get("id") == "persona")
        packet = json.loads((folder / "expert.json").read_text(encoding="utf-8"))
        self.assertEqual(persona, packet["persona"])
        self.assertEqual(packet["upstreamVersion"], self.versions["dsh"])
        self.assertIn("{{cwd}}", next(r["config"]["suffix"] for r in rows if r.get("id") == "persona"))
        self.assertTrue(any(r.get("id") == "tool-pwsh" for r in rows))

    def test_idempotent_apply_preserves_all_files(self):
        self.run_export(apply=True)
        before = {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in self.product.rglob("*") if p.is_file()}
        self.run_export(apply=True)
        after = {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in self.product.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

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
        self.assertEqual(self.run_export(apply=True), 2)
        self.assertEqual(target.read_text(), "user-owned")
        self.assertFalse((self.product / ".codex").exists())

    def test_manual_drift_is_preserved(self):
        self.run_export(apply=True)
        target = self.product / ".claude/agents/visual-designer.md"
        target.write_text("local edit", encoding="utf-8")
        self.assertEqual(self.run_export(apply=True), 2)
        self.assertEqual(target.read_text(), "local edit")

    def test_unknown_version_prevents_writes(self):
        self.versions["opencode"] = "2.0.0"
        self.assertEqual(self.run_export(apply=True), 2)
        self.assertEqual(list(self.product.iterdir()), [])

    def test_targets_and_paths(self):
        self.assertEqual(dist.select(exclude="opencode"), ["codex", "claude", "dsh"])
        for args in ({"only": ""}, {"only": "unknown"}, {"exclude": "codex,opencode,claude,dsh"}):
            with self.assertRaises(ValueError):
                dist.select(**args)
        with self.assertRaises(ValueError):
            dist.load_source(self.source, "../escape")
        with self.assertRaises(ValueError):
            dist.contained(self.product, "../outside")

    def test_public_resources_arrive_but_preferences_do_not(self):
        self.assertEqual(self.run_export(apply=True), 0)
        exported = self.product / ".agents/resources/visual-designer"
        self.assertTrue((exported / "library/START.md").is_file())
        source_image = self.source / "experts/visual-designer/library/styles/minimal/01-dark.png"
        if source_image.exists():
            self.assertEqual(source_image.read_bytes(), (exported / "library/styles/minimal/01-dark.png").read_bytes())
        manifest=json.loads((exported/"resources.json").read_text(encoding="utf-8"))
        self.assertEqual(set(manifest["files"]),{p.relative_to(exported).as_posix() for p in (exported/"library").rglob("*") if p.is_file()})
        self.assertFalse((exported/"START.md").exists())
        self.assertFalse(list(self.product.rglob("preferences.md")))
        prompt = (self.product / ".codex/agents/visual-designer.toml").read_text(encoding="utf-8")
        self.assertNotIn("experts/visual-designer/preferences.md", prompt)
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
        manifest.write_text(json.dumps({"schema_version": 1, "files": ["preferences.md"]}))
        with self.assertRaises(ValueError):
            self.run_export(apply=True)
        self.assertEqual(list(self.product.iterdir()), [])

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


if __name__ == "__main__":
    unittest.main()
