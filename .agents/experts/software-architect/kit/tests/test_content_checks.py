from __future__ import annotations

import unittest

import support  # noqa: F401
from archkit.checks_content import ContentRules, check_hardcode, check_secret, check_size
from archkit.config import Config, parse_config

RULES = ContentRules.from_config(Config())

# Secret-shaped values are assembled at runtime so this source never contains them.
FAKE_SK = "sk-" + "Ab3dE5gH7jK9mN1pQ3rS5tU7"
FAKE_AKIA = "AKIA" + "QWERTYUIOPASDFGH"
FAKE_PEM = "-----BEGIN " + "RSA PRIVATE KEY-----"
FAKE_VALUE = "Zq8" + "Lm2Xc7Vb4Nn6Hj1Kp"
WIN = "C:" + "\\Users\\bob\\data.csv"
HOME = "/" + "home/bob/data.csv"


class SizeTests(unittest.TestCase):
    def test_warn_and_error(self) -> None:
        warn = check_size("src/a.py", ["x = 1"] * 401, RULES)
        self.assertEqual([(f.id, f.severity) for f in warn], [("ARCH-SIZE", "warn")])
        err = check_size("src/a.py", ["x = 1"] * 801, RULES)
        self.assertEqual(err[0].severity, "error")
        self.assertEqual(check_size("src/a.py", ["x = 1"] * 400, RULES), [])

    def test_nonblank_vs_total(self) -> None:
        lines = ["x = 1", ""] * 300
        self.assertEqual(check_size("a.py", lines, RULES), [])
        total = ContentRules.from_config(parse_config({"limits": {"count": "total"}}))
        self.assertEqual(check_size("a.py", lines, total)[0].severity, "warn")

    def test_skips_docs_locks_generated(self) -> None:
        big = ["x"] * 2000
        for path in ("README.md", "data.json", "package-lock.json", "dist2/x.min.js",
                     "pkg/generated/api.py", "temp/once.py"):
            self.assertEqual(check_size(path, big, RULES), [], path)


class HardcodeTests(unittest.TestCase):
    def sev(self, path: str, line: str) -> list[str]:
        return [f.severity for f in check_hardcode(path, [line], None, RULES)]

    def test_local_paths_are_errors(self) -> None:
        self.assertEqual(self.sev("src/a.py", f'DATA = r"{WIN}"'), ["error"])
        self.assertEqual(self.sev("src/a.ts", f'const d = "{HOME}";'), ["error"])

    def test_url_and_ip_are_warnings(self) -> None:
        self.assertEqual(self.sev("src/a.py", 'URL = "https://api.service.io/v1"'), ["warn"])
        self.assertEqual(self.sev("src/a.cpp", 'auto h = "10.1.2.3";'), ["warn"])

    def test_comments_downgrade(self) -> None:
        self.assertEqual(self.sev("src/a.py", "# see https://docs.service.io/x"), ["info"])
        self.assertEqual(self.sev("src/a.ts", "x(); // https://docs.service.io/x"), ["info"])
        doc = ['"""Module doc.', "", "See https://docs.service.io/x", '"""', 'U = "https://a.service.io"']
        found = check_hardcode("src/a.py", doc, None, RULES)
        self.assertEqual([(f.line, f.severity) for f in found], [(3, "info"), (5, "warn")])
        self.assertEqual(self.sev("src/a.py", f"# old: {WIN}"), ["warn"])

    def test_allowed_and_negative(self) -> None:
        self.assertEqual(self.sev("tests/test_a.py", f'P = r"{WIN}"'), [])
        self.assertEqual(self.sev("docs/x.py", 'U = "https://api.service.io"'), [])
        self.assertEqual(self.sev("src/a.py", 'U = "http://localhost:8080/x"'), [])
        self.assertEqual(self.sev("src/a.py", 'V = "1.2.3"; ratio = a/b'), [])
        self.assertEqual(self.sev("src/a.py", 'U = f"https://{host}/x"'), [])
        self.assertEqual(self.sev("README.md", f"{WIN}"), [])

    def test_regressions_from_real_repos(self) -> None:
        self.assertEqual(self.sev("lib/a.js", "const u = new URL(p, 'http://local');"), [])
        found = check_hardcode("src/a.py", ['P = "' + WIN + '（只读）"'], None, RULES)
        self.assertEqual(len(found), 1, "Windows path must not also match as /Users/...")
        self.assertNotIn("只读", found[0].message)

    def test_only_added_lines(self) -> None:
        lines = [f'A = r"{WIN}"', f'B = r"{WIN}"']
        found = check_hardcode("src/a.py", lines, {2}, RULES)
        self.assertEqual([f.line for f in found], [2])


class SecretTests(unittest.TestCase):
    def test_token_shapes(self) -> None:
        for line in (f'KEY = "{FAKE_SK}"', f"aws = {FAKE_AKIA}", FAKE_PEM, f'api_key = "{FAKE_VALUE}"'):
            found = check_secret("src/a.py", [line], None)
            self.assertEqual([(f.id, f.severity) for f in found], [("ARCH-SECRET", "error")], line)

    def test_redacted(self) -> None:
        found = check_secret("config/app.toml", [f'token = "{FAKE_SK}"'], None)
        self.assertEqual(len(found), 1)
        self.assertNotIn(FAKE_SK, found[0].message)
        self.assertIn(FAKE_SK[:4] + "…", found[0].message)

    def test_placeholders_ignored(self) -> None:
        for line in ('api_key = "your-api-key-goes-here"', 'token = "xxxxxxxxxxxxxxxxxxxx"',
                     'password = os.environ["DB_PASSWORD_VALUE"]', "sk-" + "x" * 30,
                     "'apiKey': '{env:SERVICE_PLAN_API_KEY}'"):
            self.assertEqual(check_secret("src/a.py", [line], None), [], line)


if __name__ == "__main__":
    unittest.main()
