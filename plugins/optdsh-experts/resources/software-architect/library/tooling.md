# 检查工具接入

规则只有被工具判失败才持久有效。本页给各语言最小可用配置；目录名沿用 [patterns.md P1](patterns.md#p1-分层) 的 `entry / infra / core` 示意，按项目实际替换。字段名已按 2026-10 官方文档核对（来源见文末）；版本差异大的工具先看项目锁定版本的文档。

接入原则：

1. **先跑一次再定严重级别**：存量违规多时先设 `warn` 或加忽略清单，新代码 `error`；不一次把整个仓库打红。
2. **接入已有命令**：挂到项目已有的 `test` / `lint` / `validate` 命令里，不另造一套入口。
3. **新增依赖要说明成本**：安装方式、运行耗时、是否进 CI。项目不允许新增依赖时，只用内置 `arch_scan.py` + 测试。

## Python

### import-linter（分层与禁止依赖）

安装：`pip install import-linter`（开发依赖）。运行：`lint-imports`（等价 `import-linter lint`），`--contract <id>` 只跑指定契约。`root_package` 必须可导入（已安装或在当前目录）。

```toml
# pyproject.toml
[tool.importlinter]
root_package = "app"
include_external_packages = true          # needed to forbid third-party packages
exclude_type_checking_imports = true      # ignore `if TYPE_CHECKING:` imports

[[tool.importlinter.contracts]]
id = "layers"
name = "entry > infra > core"
type = "layers"
layers = ["app.entry", "app.infra", "app.core"]   # high -> low

[[tool.importlinter.contracts]]
id = "core-no-io"
name = "core does not use network clients"
type = "forbidden"
source_modules = ["app.core"]
forbidden_modules = ["requests", "httpx"]

[[tool.importlinter.contracts]]
id = "no-cycles"
name = "no cycles between sibling packages"
type = "acyclic_siblings"
ancestors = ["app"]
```

要点：`layers` 包含间接依赖；同层互不依赖用 `"app.a | app.b"`，允许互相依赖用 `"app.a : app.b"`（同一行不能混用）。重复结构用 `containers`，配合 `exhaustive = true` 可防止新增未声明的层。存量例外写 `ignore_imports = ["app.core.x -> app.infra.y"]`，并记录删除条件。其他类型：`independence`（若干模块互不依赖）、`protected`。

### ruff（规则选择）

```toml
[tool.ruff.lint]
select = [
  "E", "F", "I", "B", "UP",
  "TID",      # flake8-tidy-imports: banned-api (TID251), relative imports (TID252)
  "C901",     # complexity
  "PLR2004",  # magic value comparison
  "S105", "S106", "S108",  # hardcoded password / temp path
  "INP001",   # .py file outside a package: catches stray scripts
]

[tool.ruff.lint.mccabe]
max-complexity = 12

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "parents"          # "parents" or "all"

[tool.ruff.lint.flake8-tidy-imports.banned-api]
"os.getenv".msg = "Read environment only in app/config.py"
"os.environ".msg = "Read environment only in app/config.py"

[tool.ruff.lint.per-file-ignores]
"app/config.py" = ["TID251"]
"tests/**" = ["PLR2004", "S105", "S106", "INP001"]
"scripts/**" = ["INP001"]
```

`banned-api` 是“能力只有一个归属”的低成本强制手段（只允许配置模块读环境）。`banned-module-level-imports` 可要求重依赖延迟导入。`ruff analyze graph` 能输出文件级依赖图，可作为没有 import-linter 时的辅助证据。

### pytest

```toml
[tool.pytest.ini_options]     # pytest >= 6; pytest >= 9 also accepts [tool.pytest] with native TOML types
testpaths = ["tests"]
addopts = "-ra"
```

核心逻辑测试不碰真实文件/网络（用内存数据或 `tmp_path`）；需要真实服务的测试单独标记（`-m live`）且默认不跑。

## TypeScript / JavaScript

### dependency-cruiser

安装：`npm i -D dependency-cruiser`；`npx dependency-cruiser --init` 生成带常用规则（循环、孤儿、缺失依赖）的配置。v13 起运行 `npx depcruise src` 会自动找到配置文件。

```js
// .dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "core-not-to-outer",
      comment: "core must not depend on entry or infra",
      severity: "error",
      from: { path: "^src/core/" },
      to: { path: "^src/(entry|infra)/" },
    },
    {
      name: "features-not-to-features",
      severity: "error",
      from: { path: "(^src/features/)([^/]+)/" },
      to: { path: "^$1", pathNot: "$1$2" },
    },
    {
      name: "web-not-to-node",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { dependencyTypes: ["core"] },      // node built-ins such as fs, path
    },
    { name: "no-orphans", severity: "warn", from: { orphan: true, pathNot: "\\.d\\.ts$" }, to: {} },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,               // also count type-only imports
    tsConfig: { fileName: "tsconfig.json" },  // resolve tsconfig paths aliases
  },
};
```

`from`/`to` 的 `path`、`pathNot` 是正则；`$1`、`$2` 引用 `from.path` 的分组。`from: {}` 比 `{ path: ".+" }` 快。

### eslint-plugin-boundaries（元素与依赖策略）

当前主版本 v7：主规则是 `boundaries/dependencies`，选项为 `default` + `policies`；旧名 `boundaries/element-types` 仍可用但已弃用（选项相同）。TS 项目需 `@typescript-eslint/parser` 与 `eslint-import-resolver-typescript`（解析 `paths` 别名）。

```js
// eslint.config.js (flat config)
import boundaries from "eslint-plugin-boundaries";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser },
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "entry", pattern: "src/entry" },
        { type: "infra", pattern: "src/infra" },
        { type: "core", pattern: "src/core" },
      ],
    },
    rules: {
      "boundaries/dependencies": ["error", {
        default: "disallow",
        policies: [
          { from: { element: { type: "entry" } }, allow: { to: { element: { types: { anyOf: ["infra", "core"] } } } } },
          { from: { element: { type: "infra" } }, allow: { to: { element: { type: "core" } } } },
          { from: { element: { type: "core" } }, allow: { to: { element: { type: "core" } } } },
        ],
      }],
      "boundaries/no-unknown-files": "warn",
    },
  },
];
```

元素 `pattern` 匹配目录、不写扩展名，默认从路径右侧部分匹配（`partialMatch: true`）；需要锚定项目根时设 `partialMatch: false`。按特性目录建元素用 `pattern: "features/*"` + `capture: ["featureName"]`。

### ESLint `no-restricted-imports`（无插件的轻量替代）

```js
rules: {
  "no-restricted-imports": ["error", {
    paths: [{ name: "node:fs", message: "File IO belongs to src/infra" }],
    patterns: [
      { group: ["**/features/*/internal/**"], message: "Import features through their index" },
      { regex: "^@app/server(/|$)", message: "Browser code must not import server modules" },
    ],
  }],
}
```

`patterns` 项必须有 `group`（gitignore 风格）或 `regex`（二者不可同用）。适合按目录覆盖：在 flat config 中对 `src/core/**` 单独声明。

### tsc

`npx tsc --noEmit -p tsconfig.json` 作为类型门禁；monorepo 用 project references 时 `tsc -b`。`compilerOptions.paths` 别名需与打包器、测试运行器、dependency-cruiser（`tsConfig`）、eslint resolver 同源，否则检查工具看到的依赖图与运行时不同。

## C++

### CMake 目标边界

```cmake
cmake_minimum_required(VERSION 3.20)
project(app LANGUAGES CXX)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)        # Makefile/Ninja generators only

option(APP_LINT "Run clang-tidy and IWYU with the build" OFF)
if(APP_LINT)                                  # must be set before targets are created
  set(CMAKE_CXX_CLANG_TIDY clang-tidy)
  set(CMAKE_CXX_INCLUDE_WHAT_YOU_USE include-what-you-use)
endif()

add_library(app_core src/core/model.cpp)
target_include_directories(app_core PUBLIC include PRIVATE src/core)
target_compile_features(app_core PUBLIC cxx_std_20)

add_library(app_infra src/infra/sqlite_store.cpp)
target_link_libraries(app_infra PUBLIC app_core PRIVATE SQLite::SQLite3)

add_executable(app apps/app/main.cpp)
target_link_libraries(app PRIVATE app_core app_infra)
```

判定：`PUBLIC` = 本目标的**公开头**需要它；`PRIVATE` = 只有实现文件需要；`INTERFACE` = 本目标不用、使用者需要（纯头库）。`app_core` 不链接 `app_infra` 即是依赖方向的强制：core 包含 infra 头会直接编译失败。不用全局 `include_directories()` / `link_libraries()`，它们抹掉目标边界。Windows 上 Visual Studio 生成器不产出 `compile_commands.json`，需要时用 Ninja。

### clang-tidy

```yaml
# .clang-tidy
Checks: >
  -*,
  bugprone-*,
  misc-header-include-cycle,
  misc-definitions-in-headers,
  misc-include-cleaner,
  misc-use-internal-linkage,
  cppcoreguidelines-avoid-non-const-global-variables,
  readability-magic-numbers,
  modernize-use-override
WarningsAsErrors: 'misc-header-include-cycle,misc-definitions-in-headers'
HeaderFilterRegex: '.*/(include|src)/.*'
```

运行：`run-clang-tidy -p build`（脚本名在部分发行版为 `run-clang-tidy.py`），或打开 `APP_LINT` 随构建运行。子目录 `.clang-tidy` 设 `InheritParentConfig: true` 在父配置上叠加。`HeaderFilterRegex` 控制报告哪些头文件，`ExcludeHeaderFilterRegex` 排除第三方头。

### include-what-you-use

- 随构建：`cmake -G Ninja -DCMAKE_CXX_INCLUDE_WHAT_YOU_USE=include-what-you-use ..`（或上面的 `APP_LINT`）。
- 基于编译数据库：`iwyu_tool.py -p build`；自动修正：把输出交给 `fix_includes.py`，修正后人工复核。
- 第三方库映射：`-Xiwyu --mapping_file=<file>.imp`；必须保留的 include 用 `// IWYU pragma: keep`，转发头用 `// IWYU pragma: export`。

### 编译数据库

`compile_commands.json` 是 clang-tidy、IWYU、clangd 的共同输入，属于构建产物：放在 `build/`，不入库、不手改；需要在根目录给编辑器用时用符号链接或编辑器配置指向 `build/`。

## 接入项目已有命令

| 项目已有入口 | 接入方式 |
|---|---|
| `package.json` | `"check:arch": "depcruise src && eslint . && tsc --noEmit"`，并在 `"test"` 或 CI 里调用 `npm run check:arch` |
| Python 校验脚本 / Makefile / nox / tox | 依次运行 `lint-imports`、`ruff check .`、`pytest`；任一非零即失败 |
| CTest | `add_test(NAME arch_scan COMMAND ${Python3_EXECUTABLE} ${ARCH_KIT_DIR}/scripts/arch_scan.py --root ${CMAKE_SOURCE_DIR})`，`ARCH_KIT_DIR` 默认 `${CMAKE_SOURCE_DIR}/.agents/resources/software-architect/kit`；需先 `find_package(Python3 COMPONENTS Interpreter)` |
| pre-commit | import-linter 用 `language: system`、`pass_filenames: false`；其他工具用官方 hook |

把新增检查写进 ARCHITECTURE.md 的“检查命令”一节（[模板](templates/architecture.md)）。

## 内置 arch_scan.py 的位置

`{{KIT_ROOT}}/scripts/arch_scan.py` 只用 Python 标准库，在任何项目里零安装可运行，覆盖：文件行数、硬编码路径/主机/端口、疑似凭据（脱敏）、顶层布局与根目录脚本、`[[layers]]` 声明的依赖方向、模块级循环（Python ast、TS/JS 相对路径与 tsconfig paths 尽力而为、C++ `#include "..."`）。

- **没有成熟工具时**：它是底线门禁。退出码 1 表示有 error 级发现，可直接挂到测试命令；`--json` 便于 CI 解析。
- **已有成熟工具时**：它是 hook 与审查的快速线索和跨语言统一视图，不替代 import-linter / dependency-cruiser / CMake 目标的精确判定；规则冲突时以成熟工具和项目配置为准。
- **分层声明**：在 `.agents/architecture.toml` 的 `[[layers]]` 中写 `name / paths / may_import`；未声明时只查循环不查方向。阈值、豁免与忽略在同一文件（样例 `{{KIT_ROOT}}/config/architecture.example.toml`）。

## 来源（2026-10-02 核对）

- import-linter：[配置](https://import-linter.readthedocs.io/en/stable/get_started/configure/)、[运行](https://import-linter.readthedocs.io/en/stable/get_started/run/)、[layers](https://import-linter.readthedocs.io/en/stable/contract_types/layers/)、[forbidden](https://import-linter.readthedocs.io/en/stable/contract_types/forbidden/)、[acyclic_siblings](https://import-linter.readthedocs.io/en/stable/contract_types/acyclic_siblings/)
- ruff：[Settings](https://docs.astral.sh/ruff/settings/)（`lint.flake8-tidy-imports`、`lint.mccabe`、`per-file-ignores`）
- pytest：[Configuration](https://docs.pytest.org/en/stable/reference/customize.html)（`[tool.pytest]` 自 9.0，`[tool.pytest.ini_options]` 自 6.0）
- dependency-cruiser：[README](https://github.com/sverweij/dependency-cruiser/blob/main/README.md)、[规则教程](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md)、[规则参考](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)、[选项参考](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md)
- eslint-plugin-boundaries（v7.1）：[README](https://github.com/javierbrea/eslint-plugin-boundaries)、[Rules](https://www.jsboundaries.dev/docs/rules/)、[Elements](https://www.jsboundaries.dev/docs/classification/elements/)、[TypeScript](https://www.jsboundaries.dev/docs/guides/typescript-support/)
- ESLint：[no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports)
- CMake（4.4 文档）：[CMAKE_EXPORT_COMPILE_COMMANDS](https://cmake.org/cmake/help/latest/variable/CMAKE_EXPORT_COMPILE_COMMANDS.html)、[&lt;LANG&gt;_INCLUDE_WHAT_YOU_USE](https://cmake.org/cmake/help/latest/prop_tgt/LANG_INCLUDE_WHAT_YOU_USE.html)、[target_link_libraries](https://cmake.org/cmake/help/latest/command/target_link_libraries.html)
- clang-tidy：[文档](https://clang.llvm.org/extra/clang-tidy/)（`.clang-tidy` 配置项与 `run-clang-tidy`）
- include-what-you-use：[README](https://github.com/include-what-you-use/include-what-you-use/blob/master/README.md)
