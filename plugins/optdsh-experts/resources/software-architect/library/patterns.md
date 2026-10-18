# 常用结构模式

每个模式先看“不适用场景”。模式是为当前问题服务的最小结构，不是档位升级的奖励；小工具通常只需要 P1 的三分 + P6 配置注入。

## P1 分层

- **适用**：长期项目；有明确的“输入/装配 → 业务规则 → 存储/外部系统”方向；多个入口共享同一业务逻辑。
- **不适用**：一次性脚本；只有一个函数链的小工具（三分即可，不必叫“层”）；层间每次调用都只是转发（说明分错了）。
- **最小形态**：三部分 `entry`（CLI/HTTP/UI，装配）、`core`（纯逻辑、数据结构）、`infra`（文件、网络、数据库）。依赖方向 `entry → infra → core`、`entry → core`：`core` 不 import 任何一方；`infra` 只 import `core` 的类型或端口；由 `entry` 把 `infra` 实现传给 `core`。在线性分层工具中按 `entry, infra, core`（高 → 低）声明。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `src/app/cli.py`、`src/app/core/`、`src/app/infra/`；import-linter `layers` 契约 |
| TS | `src/entry/`、`src/core/`、`src/infra/`；dependency-cruiser 规则 `core-not-to-outer`（[tooling.md](tooling.md#dependency-cruiser)） |
| C++ | `apps/tool/main.cpp`、`libs/core/`（`app_core` 目标）、`libs/infra/`（`app_infra` 目标，`PRIVATE` 链接第三方库） |

## P2 端口与适配器（六边形）

- **适用**：核心逻辑需要在测试中替换外部系统；同一能力已有或确定将有 ≥2 种外部实现（本地文件/云存储、真实服务/模拟器）。
- **不适用**：只有一个外部实现且测试可用临时目录解决；团队不熟悉、收益只是“更规范”。
- **最小形态**：核心定义一个窄接口（端口，1–3 个方法），适配器实现它，入口负责选择并注入。不必给每个依赖都建端口，只给“需要替换的那个”建。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `core/ports.py` 中 `class BlobStore(Protocol): def read(self, key: str) -> bytes: ...`；`infra/local_store.py` 实现；测试用内存字典实现 |
| TS | `core/ports.ts` 中 `export interface BlobStore { read(key: string): Promise<Uint8Array> }`；`infra/fsStore.ts` 实现 |
| C++ | `libs/core/include/core/blob_store.h` 中纯虚类或模板参数概念；`libs/infra/src/fs_blob_store.cpp` 实现；核心目标不链接 infra 目标 |

## P3 管道（Pipeline）

- **适用**：数据按固定阶段依次变换（读取 → 清洗 → 计算 → 输出）；需要单独测试或重跑某一阶段；批处理、ETL、报告生成。
- **不适用**：阶段之间强交互、需要回溯；只有两步；为“可配置阶段顺序”而做但实际顺序从不变。
- **最小形态**：每个阶段是纯函数 `Input -> Output`，阶段间传显式数据结构；编排函数按顺序调用。只有出现第二种阶段组合时才把阶段列表做成数据。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `pipeline/stages.py`（`def clean(rows: list[Row]) -> list[Row]`）、`pipeline/run.py`（编排 + IO） |
| TS | `pipeline/stages.ts` 导出纯函数；`pipeline/run.ts` 编排；类型在 `pipeline/types.ts` |
| C++ | `libs/pipeline/` 中每阶段一个函数，阶段数据用值类型 `struct`；编排在应用目标 |

## P4 插件 / 注册表

- **适用**：已有 ≥2 个同类实现且会继续增加（格式转换器、命令、检查规则）；新增实现不应修改中心代码；第三方或其他 Agent 要独立添加。
- **不适用**：只有 1 个实现；实现集合固定且很少变化（`dict` 或 `switch` 就够）；需要动态发现但没有发布/安装机制。
- **最小形态**：一个显式注册表（字典或数组）+ 统一接口；注册写在一个地方（显式列表）优于隐式扫描目录。动态发现（entry points、目录扫描）只在跨包分发时使用。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `formats/__init__.py` 中 `REGISTRY: dict[str, Converter] = {"csv": CsvConverter(), ...}`；跨包时再用 `importlib.metadata.entry_points(group=...)` |
| TS | `formats/registry.ts` 中 `export const converters = { csv, json } satisfies Record<string, Converter>` |
| C++ | `registry.cpp` 中显式 `register_all()` 函数；避免依赖静态对象构造自动注册（见 [cpp 清单](checklists/cpp.md) 静态初始化陷阱） |

## P5 命令 / CLI 装配

- **适用**：一个工具有多个子命令；入口需要解析参数、读配置、组装依赖后调用核心。
- **不适用**：单命令脚本——`argparse` 几行即可，不需要命令类层级。
- **最小形态**：入口文件只做三件事：解析参数 → 构造配置与依赖 → 调用核心函数并把结果/错误映射为输出与退出码。每个子命令一个处理函数，核心逻辑不 import CLI 库。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `app/__main__.py` 或 `app/cli.py`：`argparse` 子命令 → `core.run_x(cfg)`；`pyproject.toml` 的 `[project.scripts]` 指向 `app.cli:main` |
| TS | `src/cli.ts`（`#!/usr/bin/env node`，`package.json` 的 `bin`）只解析参数；`src/commands/<name>.ts` 每命令一个处理函数 |
| C++ | `apps/tool/main.cpp` 解析参数、构造对象、调用 `core::run`；捕获异常映射退出码 |

## P6 配置注入

- **适用**：任何档位只要有路径、URL、端口、阈值、模型名、密钥。
- **不适用**：真正的常量（数学常数、协议字段名）；一次性脚本中可以只用顶部常量。
- **最小形态**：一个配置数据结构 + 一个加载函数（默认值 < 配置文件 < 环境变量 < 命令行），在入口加载一次后作为参数向下传；核心代码不读环境变量、不找配置文件。密钥只从环境或密钥管理读取，配置样例用占位符。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `app/config.py`：`@dataclass(frozen=True) class Settings`、`def load_settings(argv, env) -> Settings`（`tomllib` 读文件）；`config.example.toml` 入库 |
| TS | `src/config.ts`：类型 + `loadConfig(env = process.env)`，用 schema 校验（如项目已有 zod）；浏览器代码只接收构建期注入的公开值 |
| C++ | `struct Config` + `Config load_config(const std::filesystem::path&)` 在应用层；库目标通过构造参数接收所需字段，不读环境 |

## P7 门面（Facade）

- **适用**：子系统内部有多个模块，外部只需要 1–3 个操作；要阻止外部依赖内部细节；准备替换内部实现。
- **不适用**：门面只是一对一转发每个内部函数（等于没有边界）；子系统本身只有一个文件。
- **最小形态**：子系统的公开入口文件只导出少量函数/类型，内部模块不被外部 import；用工具规则保证（import-linter `forbidden`、boundaries 规则、CMake `PRIVATE` 头文件目录）。
- **落点**：

| 语言 | 落点示意 |
|---|---|
| Python | `billing/__init__.py` 导出 `charge()`、`Invoice`，内部模块带 `_` 前缀或放 `billing/_impl/` |
| TS | `features/billing/index.ts` 只导出公开 API；**注意 barrel 陷阱**：不要 `export *` 全部内部文件（见 [TS 清单](checklists/typescript-javascript.md)） |
| C++ | `libs/billing/include/billing/billing.h` 为公开头；内部头放 `libs/billing/src/`，`target_include_directories(billing PUBLIC include PRIVATE src)` |

## 组合建议

| 档位 | 常见组合 |
|---|---|
| 小工具 | P5 入口装配 + P6 配置注入 + 核心纯函数 |
| 长期项目 | P1 分层 + P6 + 需要替换外部系统处用 P2；批处理部分用 P3 |
| 多人/多 Agent | 上述 + 每个子系统 P7 门面 + 工具强制边界；同类扩展点多时用 P4 |
