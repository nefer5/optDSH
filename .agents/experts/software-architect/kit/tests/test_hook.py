from __future__ import annotations

import io
import json
import unittest
from unittest import mock

import support
from archkit import hook, gitio

HOSTS = ("codex", "claude", "dsh")


class HookTests(unittest.TestCase):
    def setUp(self):
        self.proj = support.TempProject()
        self.addCleanup(self.proj.close)
        self.proj.write("src/app/core.py", "X = 1\n")
        self.proj.commit()

    def test_disabled_project_silent(self):
        for host in HOSTS:
            self.assertEqual(self.proj.hook(host, "session-start")[:2], (0, ""))

    def test_legacy_stop_never_reads_payload_config_git_or_state(self):
        self.proj.enable("[review]\ninvalid = 1\n")
        for host in HOSTS:
            stdout, stderr = io.StringIO(), io.StringIO()
            stdin = mock.Mock()
            stdin.read.side_effect = AssertionError("Stop must not read payload")
            with mock.patch.object(hook, "handle", side_effect=AssertionError("Stop must not dispatch")), mock.patch.object(gitio, "run_git", side_effect=AssertionError("No Git")):
                self.assertEqual(hook.run_hook(host, "stop", stdin, stdout, stderr, support.SCRIPTS), 0)
            self.assertEqual((stdout.getvalue(), stderr.getvalue()), ("", ""))
            self.assertIsNone(hook.handle(host, "stop", {}, support.SCRIPTS))
        self.assertFalse((self.proj.root / ".git/software-architect/state.json").exists())

    def test_session_start_all_hosts_without_git(self):
        self.proj.enable()
        self.proj.write("ARCHITECTURE.md", "# arch\n")
        with mock.patch.object(gitio, "run_git", side_effect=AssertionError("SessionStart must not use Git")):
            for host in HOSTS:
                result = hook.handle(host, "session-start", {"cwd": str(self.proj.root)}, support.SCRIPTS)
                spec = result["hookSpecificOutput"]
                self.assertEqual(spec["hookEventName"], "SessionStart")
                text = spec["additionalContext"]
                self.assertLessEqual(len(text), 400)
                for needle in ("软件架构专家", "arch-plan", "arch-review", "暂存区", "临时脚本", "L0", "L1", "L2", "ARCHITECTURE.md"):
                    self.assertIn(needle, text)
        for host in HOSTS:
            code, out, _ = self.proj.hook(host, "session-start")
            self.assertEqual(code, 0)
            json.loads(out)

    def test_session_injection_disabled(self):
        self.proj.enable("[session]\ninject = false\n")
        self.assertEqual(self.proj.hook("dsh", "session-start")[:2], (0, ""))

    def test_subdirectory_and_repository_boundary(self):
        self.proj.enable()
        subdir = self.proj.root / "src/app"
        self.assertEqual(hook.project_root({"cwd": str(subdir)}), self.proj.root)
        self.proj.write("nested/.git", "gitdir: ignored\n")
        nested = self.proj.root / "nested"
        self.assertFalse(hook.is_enabled(hook.project_root({"cwd": str(nested)})))

    def test_session_error_is_one_line_and_nonblocking(self):
        self.proj.enable("[session]\nnope = 1\n")
        code, out, err = self.proj.hook("claude", "session-start")
        self.assertEqual((code, out), (0, ""))
        self.assertEqual(len(err.strip().splitlines()), 1)

    def test_bad_payload_and_args(self):
        for raw in ("", "not json", "[1,2]"):
            self.assertEqual(self.proj.hook("codex", "session-start", raw=raw)[0], 0)
        self.assertEqual(self.proj.hook("vim", "stop")[:2], (0, ""))

    def test_legacy_stop_all_modes_repeated_without_output(self):
        for mode in ("continue", "notify", "off"):
            self.proj.enable(f'[review]\nmode = "{mode}"\n')
            for host in HOSTS:
                for _ in range(3):
                    self.assertEqual(self.proj.hook(host, "stop"), (0, "", ""))


if __name__ == "__main__":
    unittest.main()
