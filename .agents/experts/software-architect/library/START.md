# 软件架构专家参考包

角色行为以 instructions.md 为准；本包提供判定依据、样例、工具配置和模板。文中 `{{RESOURCE_ROOT}}` 指本参考包目录，`{{KIT_ROOT}}` 指本专家 kit 目录（分发到项目后分别位于 `.agents/resources/software-architect/library` 与 `.agents/resources/software-architect/kit`）。**按任务只读 1–3 个文件**，不通读。参考是推理样本，不是必须套用的结构；目标项目的 AGENTS.md、ARCHITECTURE.md、`.agents/architecture.toml` 与本次指示优先。

## 最小开工卡

1. **定级**：L0 / L1 / L2（判定信号见 [principles.md](principles.md#任务分级-l0l1l2)），一句话写理由。L0 不读本包其余文件，直接做。
2. **定档**：一次性脚本 / 小工具 / 长期项目 / 多人多 Agent（见 [principles.md](principles.md#项目规模分档)）。档位决定“最低要求”和“不需要做的事”。
3. **找证据**：搜已有实现；需要依赖或硬编码证据时运行 `{{KIT_ROOT}}/scripts/arch_scan.py`（`--changed` 只看本次改动）。扫描结果与人工推断分开写。

## 读取路线

| 任务 | 先读 | 按需再读 |
|---|---|---|
| L1 变更方案 | [模板 change-plan](templates/change-plan.md) | 对应语言清单 |
| L2 新模块/子系统设计 | [principles](principles.md)、[patterns](patterns.md) | [计划模板 plan](templates/plan.md)、[few-shot](few-shot.md) |
| 体检 / 提交检查复核 / `arch-review` | [anti-patterns](anti-patterns.md)、[报告模板](templates/review-report.md) | 对应语言清单 |
| 约束落地（立规矩） | [tooling](tooling.md)、[ARCHITECTURE 模板](templates/architecture.md) | [ADR 模板](templates/adr.md) |
| 判断“是否过度设计” | [principles 分档](principles.md#项目规模分档)、[few-shot 示例 7](few-shot.md#示例-7过度设计--简化ts) | [anti-patterns 投机泛化](anti-patterns.md#ap-08-过度抽象投机泛化) |
| 某语言细节 | 该语言清单 | [tooling](tooling.md) 中该语言一节 |

## 文件用途

| 文件 | 用途 |
|---|---|
| [principles.md](principles.md) | 规模分档的最低要求与“不需要做的事”；L0/L1/L2 判定信号、升级条件；默认约束的判定方法 |
| [patterns.md](patterns.md) | 7 个常用结构模式：适用 / 不适用 / 最小形态 / Python·TS·C++ 落点 |
| [anti-patterns.md](anti-patterns.md) | 10 条反模式：症状 / 检测信号（含扫描发现 id、grep 线索）/ 危害 / 改法 / 何时可以不改 |
| [few-shot.md](few-shot.md) | 8 组前后对比，含“过度设计→简化”和“L0 不需要方案” |
| [tooling.md](tooling.md) | import-linter、ruff、pytest；dependency-cruiser、eslint-plugin-boundaries、tsc；CMake、clang-tidy、IWYU 的最小配置与接入 |
| [checklists/python.md](checklists/python.md) | Python 可勾选清单 |
| [checklists/typescript-javascript.md](checklists/typescript-javascript.md) | TS/JS 可勾选清单（ESM/CJS、barrel、别名、前后端共享） |
| [checklists/cpp.md](checklists/cpp.md) | C++ 可勾选清单（头/实现分离、include 方向、pimpl、ODR、CMake 目标） |
| [templates/architecture.md](templates/architecture.md) | 项目 ARCHITECTURE.md 模板 |
| [templates/adr.md](templates/adr.md) | 简短架构决策记录 |
| [templates/change-plan.md](templates/change-plan.md) | 变更方案六项（与 instructions.md 一致） |
| [templates/plan.md](templates/plan.md) | L2 计划文件：任务、落点、接口、验证、完成标记 |
| [templates/review-report.md](templates/review-report.md) | 体检报告：结论、保留优点、问题表、整改顺序 |

## 扫描器速查

`python {{KIT_ROOT}}/scripts/arch_scan.py [--root DIR] [--config PATH] [--changed|--staged] [--json]`；Windows 上 `python` 不可用时试 `py -3`。退出码 0 = 无 error 级发现，1 = 有 error 级发现，2 = 用法或内部错误。

| 发现 id | 含义 | 相关条目 |
|---|---|---|
| `ARCH-SIZE` | 文件超过行数阈值 | [AP-01 上帝文件](anti-patterns.md#ap-01-上帝文件) |
| `ARCH-HARDCODE` | 绝对路径、主机、端口等硬编码 | [AP-03](anti-patterns.md#ap-03-硬编码路径与魔法值) |
| `ARCH-SECRET` | 疑似凭据（输出已脱敏） | [AP-03](anti-patterns.md#ap-03-硬编码路径与魔法值) |
| `ARCH-LAYOUT` | 顶层目录不在允许列表 | [AP-09](anti-patterns.md#ap-09-一次性脚本混入正式模块) |
| `ARCH-ROOT-SCRIPT` | 根目录平铺脚本 | [AP-09](anti-patterns.md#ap-09-一次性脚本混入正式模块) |
| `ARCH-LAYER` | 违反 `[[layers]]` 声明的依赖方向 | [AP-05](anti-patterns.md#ap-05-循环依赖与反向依赖) |
| `ARCH-CYCLE` | 模块级循环依赖 | [AP-05](anti-patterns.md#ap-05-循环依赖与反向依赖) |

扫描器是无外部依赖的底线检查，不替代成熟工具；工具接入见 [tooling.md](tooling.md#内置-arch_scanpy-的位置)。
