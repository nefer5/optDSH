from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import unittest

import support

WIN = "D:" + "\\work\\file.txt"


class StagedTests(unittest.TestCase):
    def setUp(self):
        self.proj = support.TempProject()
        self.addCleanup(self.proj.close)
        self.proj.write("src/app/core.py", "X = 1\n")
        self.proj.commit()

    def staged(self):
        return self.proj.scan_json("--staged")

    def test_partial_staging_reads_index_not_worktree(self):
        self.proj.write("src/app/core.py", f'P = r"{WIN}"\n')
        self.proj.git("add", "src/app/core.py")
        self.proj.write("src/app/core.py", "P = 1\n")
        code, data = self.staged()
        self.assertEqual(code, 1)
        self.assertEqual(data["scope"], "staged")
        self.assertEqual(data["findings"][0]["id"], "ARCH-HARDCODE")
        self.assertEqual(self.proj.scan_json("--changed")[0], 0)

    def test_unstaged_and_untracked_excluded(self):
        self.proj.write("src/app/core.py", "X = 2\n")
        self.proj.git("add", "src/app/core.py")
        self.proj.write("src/app/core.py", f'P = r"{WIN}"\n')
        self.proj.write("untracked.py", f'P = r"{WIN}"\n')
        code, data = self.staged()
        self.assertEqual((code, data["findings"]), (0, []))
        self.assertEqual(data["summary"]["changed_files"], 1)

    def test_empty_index_diff_does_not_write_review_state(self):
        self.proj.enable("[review]\nmode = 'continue'\n")
        before = self.proj.git("status", "--porcelain")
        code, data = self.staged()
        self.assertEqual((code, data["findings"]), (0, []))
        self.assertIsNone(data["fingerprint"])
        self.assertEqual(self.proj.git("status", "--porcelain"), before)
        self.assertFalse((self.proj.root / ".git/software-architect").exists())

    def test_staged_config_not_worktree_config(self):
        self.proj.enable("[layout]\nallowed_top_level = ['src']\n")
        self.proj.git("add", ".agents/architecture.toml")
        self.proj.enable("[layout]\nallowed_top_level = ['src', 'other']\n")
        self.proj.write("other/new.py", "X = 1\n")
        self.proj.git("add", "other/new.py")
        _, data = self.staged()
        self.assertIn("ARCH-LAYOUT", [f["id"] for f in data["findings"]])
        self.assertEqual(data["summary"]["config"], "index:.agents/architecture.toml")

    def test_initial_commit_and_spaces_and_unicode(self):
        proj = support.TempProject()
        self.addCleanup(proj.close)
        path = "src/空 格.py"
        proj.write(path, f'P = r"{WIN}"\n')
        proj.git("add", path)
        proj.write(path, "P = 1\n")
        code, data = proj.scan_json("--staged")
        self.assertEqual(code, 1)
        self.assertEqual(data["findings"][0]["path"], path)

    def test_deletion_is_not_read_from_worktree(self):
        self.proj.git("rm", "src/app/core.py")
        self.proj.write("src/app/core.py", f'P = r"{WIN}"\n')
        code, data = self.staged()
        self.assertEqual((code, data["findings"]), (0, []))
        self.assertEqual(data["summary"]["changed_files"], 1)

    def test_index_dependencies_and_cycles(self):
        self.proj.write("src/a/one.py", "from b.two import X\nX = 1\n")
        self.proj.write("src/b/two.py", "from a.one import X\n")
        self.proj.git("add", "src")
        self.proj.write("src/b/two.py", "X = 1\n")
        _, data = self.staged()
        self.assertIn("ARCH-CYCLE", [f["id"] for f in data["findings"]])

    def test_alternate_git_index_inherited(self):
        alternate = self.proj.base / "alternate-index"
        self.proj.env["GIT_INDEX_FILE"] = str(alternate)
        self.proj.git("read-tree", "HEAD")
        self.proj.write("src/app/core.py", f'P = r"{WIN}"\n')
        self.proj.git("add", "src/app/core.py")
        self.proj.write("src/app/core.py", "P = 1\n")
        self.assertEqual(self.staged()[0], 1)
        self.proj.env.pop("GIT_INDEX_FILE")
        self.assertIsNone(self.staged()[1]["fingerprint"])

    def test_advisory_reports_error_and_never_blocks(self):
        self.proj.write("src/app/core.py", f'P = r"{WIN}"\n')
        self.proj.git("add", "src/app/core.py")
        entry = support.SCRIPTS / "arch_commit.py"
        result = subprocess.run([sys.executable, str(entry)], cwd=self.proj.root,
                                env=self.proj.env, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0)
        self.assertIn("ARCH-HARDCODE", result.stdout)
        self.assertEqual(result.stdout.count("[架构提交检查]"), 1)
        self.proj.enable("[unknown]\nbad = 1\n")
        self.proj.git("add", ".agents/architecture.toml")
        result = subprocess.run([sys.executable, str(entry)], cwd=self.proj.root,
                                env=self.proj.env, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0)
        self.assertIn("未完成", result.stderr)

    def test_staged_record_and_changed_are_rejected(self):
        self.assertEqual(self.proj.scan("--staged", "--record")[0], 2)
        self.assertEqual(self.proj.scan("--staged", "--changed")[0], 2)


if __name__ == "__main__":
    unittest.main()
