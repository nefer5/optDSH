from __future__ import annotations

import unittest

import support
from archkit.config import Config, parse_config
from archkit.graph import Edge, EdgeCollector, module_cycles
from archkit.scan import ScanContext, run_scan


def edges_of(proj: support.TempProject, cfg: Config | None = None) -> set[tuple[str, str]]:
    """Runtime import edges (type-only edges excluded)."""
    ctx = ScanContext.open(proj.root, cfg or Config())
    edges = EdgeCollector(ctx.files, ctx.store, ctx.cfg).collect(ctx.files)
    return {(e.src, e.dst) for e in edges if not e.type_only}


def scan(proj: support.TempProject, cfg: Config | None = None) -> list[tuple[str, str]]:
    ctx = ScanContext.open(proj.root, cfg or Config())
    return [(f.id, f.severity) for f in run_scan(ctx).findings]


class ImportResolutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.proj = support.TempProject(git=True)
        self.addCleanup(self.proj.close)

    def test_python(self) -> None:
        p = self.proj
        p.write("src/app/__init__.py", "")
        p.write("src/app/core/__init__.py", "")
        p.write("src/app/core/model.py", "import json\n")
        p.write("src/app/cli/main.py", "from app.core import model\nfrom ..core.model import X\nimport os\n")
        p.write("src/app/cli/__init__.py", "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from app.core import model\n")
        edges = edges_of(p)
        self.assertIn(("src/app/cli/main.py", "src/app/core/model.py"), edges)
        self.assertNotIn(("src/app/cli/__init__.py", "src/app/core/model.py"), edges)

    def test_typescript(self) -> None:
        p = self.proj
        p.write("tsconfig.json", '{\n // comment\n "compilerOptions": {"baseUrl": ".", "paths": {"@lib/*": ["src/lib/*"]},},\n}\n')
        p.write("src/lib/util.ts", "export const u = 1;\n")
        p.write("src/lib/index.ts", "export * from './util';\n")
        p.write("src/ui/view.tsx", "import { u } from '../lib/util.js';\nimport * as L from '../lib';\n"
                "import x from '@lib/util';\nconst r = require('./helper');\nconst d = import('./lazy');\n"
                "import React from 'react';\n")
        p.write("src/ui/helper.cjs", "module.exports = {};\n")
        p.write("src/ui/lazy.mjs", "export default 1;\n")
        edges = edges_of(p)
        for dst in ("src/lib/util.ts", "src/lib/index.ts", "src/ui/helper.cjs", "src/ui/lazy.mjs"):
            self.assertIn(("src/ui/view.tsx", dst), edges)

    def test_cpp(self) -> None:
        p = self.proj
        p.write("include/core/api.h", "#pragma once\n")
        p.write("src/core/impl.cpp", '#include "core/api.h"\n#include <vector>\n#include "local.h"\n')
        p.write("src/core/local.h", "")
        edges = edges_of(p)
        self.assertIn(("src/core/impl.cpp", "include/core/api.h"), edges)
        self.assertIn(("src/core/impl.cpp", "src/core/local.h"), edges)


class CycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.proj = support.TempProject(git=True)
        self.addCleanup(self.proj.close)

    def test_python_cycle(self) -> None:
        self.proj.write("a/x.py", "from b import y\n")
        self.proj.write("b/y.py", "from a import x\n")
        self.assertIn(("ARCH-CYCLE", "warn"), scan(self.proj))

    def test_ts_cycle_and_type_only_ignored(self) -> None:
        self.proj.write("src/a/x.ts", "import { y } from '../b/y';\n")
        self.proj.write("src/b/y.ts", "import { x } from '../a/x';\n")
        self.assertIn(("ARCH-CYCLE", "warn"), scan(self.proj))
        self.proj.write("src/b/y.ts", "import type { X } from '../a/x';\n")
        self.assertNotIn(("ARCH-CYCLE", "warn"), scan(self.proj))

    def test_cpp_cycle(self) -> None:
        self.proj.write("net/a.h", '#include "../io/b.h"\n')
        self.proj.write("io/b.h", '#include "../net/a.h"\n')
        self.assertIn(("ARCH-CYCLE", "warn"), scan(self.proj))

    def test_same_directory_ignored(self) -> None:
        self.proj.write("pkg/a.py", "from pkg import b\n")
        self.proj.write("pkg/b.py", "from pkg import a\n")
        self.assertNotIn("ARCH-CYCLE", [i for i, _ in scan(self.proj)])

    def test_cycle_path(self) -> None:
        edges = [Edge("a/1.py", "b/1.py", 1, False), Edge("b/1.py", "c/1.py", 2, False),
                 Edge("c/1.py", "a/1.py", 3, False), Edge("c/1.py", "d/1.py", 4, False)]
        cycles = module_cycles(edges)
        self.assertEqual(len(cycles), 1)
        self.assertEqual(cycles[0].modules, ("a", "b", "c", "a"))


class StructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.proj = support.TempProject(git=True)
        self.addCleanup(self.proj.close)

    def test_layers(self) -> None:
        cfg = parse_config({"layers": [
            {"name": "app", "paths": ["app/**"], "may_import": ["core"]},
            {"name": "core", "paths": ["core/**"], "may_import": []},
        ]})
        self.proj.write("app/main.py", "from core import model\n")
        self.proj.write("core/model.py", "X = 1\n")
        self.assertNotIn("ARCH-LAYER", [i for i, _ in scan(self.proj, cfg)])
        self.proj.write("core/model.py", "from app import main\n")
        self.assertIn(("ARCH-LAYER", "error"), scan(self.proj, cfg))

    def test_layout(self) -> None:
        cfg = parse_config({"layout": {"allowed_top_level": ["src", "tests"]}})
        self.proj.write("src/a.py", "")
        self.proj.write(".github/w.yml", "")
        self.proj.write("temp/x.py", "")
        self.assertNotIn("ARCH-LAYOUT", [i for i, _ in scan(self.proj, cfg)])
        self.proj.write("misc/b.py", "")
        self.assertIn(("ARCH-LAYOUT", "warn"), scan(self.proj, cfg))
        self.assertNotIn("ARCH-LAYOUT", [i for i, _ in scan(self.proj)])

    def test_root_script(self) -> None:
        self.proj.write("src/a.py", "")
        self.proj.write("setup.py", "")
        self.proj.commit()
        self.proj.write("run_me.py", "print(1)\n")
        found = scan(self.proj)
        self.assertIn(("ARCH-ROOT-SCRIPT", "warn"), found)
        self.assertEqual(found.count(("ARCH-ROOT-SCRIPT", "warn")), 1)
        cfg = parse_config({"layout": {"root_script_allow": ["setup.py", "run_*.py"]}})
        self.assertNotIn("ARCH-ROOT-SCRIPT", [i for i, _ in scan(self.proj, cfg)])


if __name__ == "__main__":
    unittest.main()
