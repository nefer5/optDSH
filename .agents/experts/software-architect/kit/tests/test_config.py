from __future__ import annotations

import tomllib
import unittest
from pathlib import Path

import support  # noqa: F401  (sets sys.path)
from archkit.config import Config, ConfigError, load_config, parse_config

EXAMPLE = Path(support.SCRIPTS).parent / "config" / "architecture.example.toml"


class ConfigTests(unittest.TestCase):
    def test_defaults_when_missing(self) -> None:
        proj = support.TempProject(git=False)
        self.addCleanup(proj.close)
        cfg = load_config(proj.root)
        self.assertEqual(cfg.warn_lines, 400)
        self.assertEqual(cfg.max_lines, 800)
        self.assertEqual(cfg.review_mode, "continue")
        self.assertEqual(cfg.min_changed_files, 4)
        self.assertEqual(cfg.min_changed_lines, 300)
        self.assertTrue(cfg.session_inject)
        self.assertEqual(cfg.plan_dir, ".agents/plans")
        self.assertEqual(cfg.layers, ())
        self.assertIsNone(cfg.source)

    def test_example_matches_defaults(self) -> None:
        with EXAMPLE.open("rb") as fh:
            cfg = parse_config(tomllib.load(fh))
        self.assertEqual(cfg, Config())

    def test_unknown_section_rejected(self) -> None:
        with self.assertRaisesRegex(ConfigError, r"未知配置段 \[limit\]"):
            parse_config({"limit": {"max_lines": 1}})

    def test_unknown_key_rejected(self) -> None:
        with self.assertRaisesRegex(ConfigError, r"\[review\] 未知键 'modes'"):
            parse_config({"review": {"modes": "off"}})

    def test_bad_values(self) -> None:
        with self.assertRaises(ConfigError):
            parse_config({"review": {"mode": "loud"}})
        with self.assertRaises(ConfigError):
            parse_config({"limits": {"max_lines": "800"}})
        with self.assertRaises(ConfigError):
            parse_config({"limits": {"warn_lines": 900, "max_lines": 800}})
        with self.assertRaises(ConfigError):
            parse_config({"session": {"inject": 1}})

    def test_layers_validation(self) -> None:
        cfg = parse_config({"layers": [
            {"name": "app", "paths": ["app/**"], "may_import": ["core"]},
            {"name": "core", "paths": ["core/**"]},
        ]})
        self.assertEqual([l.name for l in cfg.layers], ["app", "core"])
        with self.assertRaisesRegex(ConfigError, "未声明的层"):
            parse_config({"layers": [{"name": "app", "paths": ["a/**"], "may_import": ["x"]}]})
        with self.assertRaisesRegex(ConfigError, "未知键"):
            parse_config({"layers": [{"name": "app", "paths": ["a/**"], "deps": []}]})
        with self.assertRaisesRegex(ConfigError, "重复"):
            parse_config({"layers": [{"name": "a", "paths": ["a"]}, {"name": "a", "paths": ["b"]}]})

    def test_invalid_toml_file(self) -> None:
        proj = support.TempProject(git=False)
        self.addCleanup(proj.close)
        proj.enable("[review\nmode = 1")
        with self.assertRaisesRegex(ConfigError, "不是合法 TOML"):
            load_config(proj.root)


if __name__ == "__main__":
    unittest.main()
