"""Git hook lifecycle and removal of legacy Agent Stop handlers."""
import json
from pathlib import Path
import subprocess
import unittest

import test_expert_distribution as fixture_module

ARCH = fixture_module.ARCH
HOOK_SPEC = fixture_module.HOOK_SPEC
dist = fixture_module.dist


class GitHookTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_module.ExpertDistributionTests(methodName="runTest")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.product
        self.source = self.fixture.source

    def git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.root, capture_output=True,
                                text=True, encoding="utf-8", errors="replace")
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout + result.stderr

    def init_git(self):
        self.git("init", "-q")
        self.git("config", "core.autocrlf", "false")
        self.git("config", "user.name", "test")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "commit.gpgsign", "false")

    def update_source(self):
        folder = self.source / "experts" / ARCH
        manifest = json.loads((folder / "resources.json").read_text())
        manifest["files"].append("kit/scripts/arch_commit.py")
        manifest["git_hooks"] = {"pre-commit": "kit/scripts/arch_commit.py"}
        (folder / "resources.json").write_text(json.dumps(manifest))
        (folder / "kit/scripts/arch_commit.py").write_text("print('[fixture pre-commit]')\nraise SystemExit(1)\n")
        (folder / "kit/hooks/spec.json").write_text(json.dumps({"schema_version": 1, "hooks": HOOK_SPEC["hooks"][:1]}))

    def export(self, **kwargs):
        return self.fixture.run_export(ARCH, root=self.root, **kwargs)

    def test_migration_removes_only_architect_stop_and_preserves_permissions(self):
        self.init_git()
        codex_user, claude_user = self.fixture.write_user_hooks()
        self.assertEqual(self.export(apply=True), 0)
        self.update_source()
        self.assertEqual(self.export(apply=True), 0)
        codex = json.loads((self.root / ".codex/hooks.json").read_text())
        self.assertEqual(codex["hooks"]["Stop"], codex_user["hooks"]["Stop"])
        claude = json.loads((self.root / ".claude/settings.local.json").read_text())
        self.assertEqual(claude["permissions"], claude_user["permissions"])
        self.assertNotIn("Stop", claude["hooks"])
        dsh = json.loads((self.root / f".agents/dsh-hooks/{ARCH}.json").read_text())
        self.assertEqual(set(dsh["hooks"]), {"SessionStart"})
        self.assertTrue((self.root / f".opencode/agents/{ARCH}.md").is_file())
        self.assertFalse((self.root / ".opencode/hooks.json").exists())
        before = self.fixture.snapshot()
        self.assertEqual(self.export(apply=True), 0)
        self.assertEqual(self.fixture.snapshot(), before)
        self.assertEqual(self.export(check=True), 0)

    def test_actual_git_commit_invokes_once_and_is_advisory(self):
        self.root = self.fixture.base / "repo with 空格"
        self.root.mkdir()
        self.init_git()
        self.update_source()
        self.assertEqual(self.export(targets=["claude"], apply=True), 0)
        (self.root / "code.py").write_text("X = 1\n")
        self.git("add", "code.py")
        result = self.git("commit", "-m", "fixture")
        self.assertEqual(result.count("[fixture pre-commit]"), 1)
        self.assertEqual(self.git("log", "-1", "--format=%s").strip(), "fixture")

    def test_existing_unmanaged_hook_is_preserved_and_preflight_blocks_writes(self):
        self.init_git()
        self.update_source()
        path = self.root / ".git/hooks/pre-commit"
        original = b"#!/bin/sh\necho user-hook\nexit 7\n"
        path.write_bytes(original)
        self.assertEqual(self.export(apply=True), 2)
        self.assertEqual(path.read_bytes(), original)
        self.assertFalse((self.root / ".agents").exists())

    def test_custom_hooks_path_is_not_changed(self):
        self.init_git()
        self.update_source()
        self.git("config", "core.hooksPath", "my-hooks")
        with self.assertRaisesRegex(ValueError, "custom hooksPath"):
            self.export(apply=True)
        self.assertEqual(self.git("config", "--get", "core.hooksPath").strip(), "my-hooks")
        self.assertFalse((self.root / ".agents").exists())

    def test_managed_git_hook_edit_is_a_conflict(self):
        self.init_git()
        self.update_source()
        self.assertEqual(self.export(apply=True), 0)
        path = self.root / ".git/hooks/pre-commit"
        changed = path.read_bytes() + b"# user change\n"
        path.write_bytes(changed)
        self.assertEqual(self.export(apply=True), 2)
        self.assertEqual(path.read_bytes(), changed)

    def test_non_git_package_exports_without_git_hook(self):
        self.update_source()
        self.assertEqual(self.export(apply=True), 0)
        self.assertFalse((self.root / ".git").exists())

    def test_git_manifest_rejects_unshipped_or_unsupported_hooks(self):
        folder = self.source / "experts" / ARCH
        manifest = json.loads((folder / "resources.json").read_text())
        for hooks in ({"post-commit": "kit/scripts/arch_hook.py"}, {"pre-commit": "kit/scripts/missing.py"}):
            manifest["git_hooks"] = hooks
            (folder / "resources.json").write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                self.export(apply=True)


if __name__ == "__main__":
    unittest.main()
