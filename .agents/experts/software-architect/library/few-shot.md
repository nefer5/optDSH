# 架构 few-shot：用前后对比校准判断

这是提示与参考使用方法，不是参数训练。每次只选 1–2 个与当前任务相近的示例；示例中的目录名只是示意，以目标项目已有约定为准。

## 单个示例卡

`任务约束 → 原代码片段 → 问题 → 改后片段或落点表 → 为什么 → 何时可以不改`。

- **任务约束**：档位、级别、允许改动范围。没有这一项，同一段代码的“对错”无法判断。
- **问题**：指向具体行和对应约束（C1–C7，见 [principles.md](principles.md#默认可检查约束)）。
- **何时可以不改**：每个示例必须写；防止把示例当成必须执行的规则。

## 示例 1：入口里的计算与硬编码路径（Python）

**约束**：小工具，L1，允许实施。CSV 汇总脚本已被反复使用，用户要加一个 `--month` 参数。

```python
# report.py
import csv, sys
def main():
    rows = list(csv.DictReader(open("/home/me/data/sales.csv", encoding="utf-8")))
    total = 0
    for r in rows:
        if float(r["amount"]) > 1000:      # magic threshold
            total += float(r["amount"]) * 0.97
    print(f"total={total:.2f}")
```

**问题**：路径与阈值硬编码（C3）；计算写在入口，无法测试（C4/AP-04）。加参数会继续往 `main` 里堆。

**改后**：

| 路径 | 职责 | 新增/修改 |
|---|---|---|
| `report/core.py` | `summarize(rows, *, threshold, rate, month) -> float`，纯函数 | 新增 |
| `report/cli.py` | `argparse`：`--input`、`--month`、`--threshold`；读 CSV 后调用 core | 修改（原 report.py 移入） |
| `tests/test_core.py` | 用内存 `list[dict]` 测 summarize | 新增 |

**为什么**：小工具的最低要求就是入口 / 核心 / 配置三分；参数走命令行即可，不必建配置文件。

**何时可以不改**：只跑一次的脚本——把路径和阈值提到文件顶部常量即可。

## 示例 2：两个配置加载器（Python）

**约束**：长期项目，L1，体检后整改。

```python
# app/server.py
def _load_cfg():
    return tomllib.loads(Path("config.toml").read_text())["server"]
# app/jobs/runner.py
def read_config(path=None):
    path = path or os.environ.get("APP_CONFIG", "config.toml")
    with open(path, "rb") as f:
        return tomllib.load(f)
```

**问题**：同一能力两处实现（C1/AP-02），且行为不同：server 忽略 `APP_CONFIG`，相对 cwd 读取。

**改后**：

```python
# app/config.py — the single owner
@dataclass(frozen=True)
class Settings:
    server_port: int
    job_concurrency: int

def load_settings(path: Path | None = None, env: Mapping[str, str] = os.environ) -> Settings: ...
```

`server.py`、`runner.py` 改为在入口调用一次 `load_settings()` 并把 `Settings` 传下去；ARCHITECTURE.md“新增配置项放哪里”指向 `app/config.py`。

**为什么**：收敛到行为更完整的一份（支持环境变量覆盖），并显式化依赖。

**何时可以不改**：两处读取的是不同文件、不同用途（例如测试夹具专用配置），只需改名避免混淆。

## 示例 3：L0 任务不需要方案（Python）

**约束**：长期项目，用户：“把下载超时从 10 秒改成 30 秒”。

```python
# app/config.py
DEFAULT_TIMEOUT_S = 10
```

**定级**：L0——1 个文件，值已集中在配置模块，无取舍。

**做法**：直接改为 `30`，运行相关测试（如 `pytest tests/test_config.py`），交付一句话：“已把 `app/config.py` 的 `DEFAULT_TIMEOUT_S` 改为 30，相关测试通过。”

**反例**：为此写落点表、计划文件、提出“把超时做成可按域名配置”的扩展建议——这是流程过重和投机泛化。

**何时升级**：搜索发现超时还硬编码在别处（`timeout=10` 出现 3 处）→ 升为 L1，落点表列出收敛位置。

## 示例 4：特性目录互相 import 形成循环（TS）

**约束**：长期项目，L1，arch_scan 报 `ARCH-CYCLE`。

```ts
// src/features/orders/service.ts
import { getUserTier } from "../users/service";
export type Order = { id: string; userId: string; total: number };
// src/features/users/service.ts
import type { Order } from "../orders/service";
import { listOrders } from "../orders/service";
export function getUserTier(id: string) { return listOrders(id).length > 10 ? "gold" : "basic"; }
```

**问题**：orders ↔ users 运行时循环（C2/AP-05）；`Order` 类型定义在服务文件里，迫使 users 依赖 orders 的实现。

**改后**：

| 路径 | 变化 |
|---|---|
| `src/shared/types/order.ts` | 新增：`Order` 类型（仅类型，无运行时代码） |
| `src/features/users/tier.ts` | `getUserTier(orderCount: number)` 改为接收数量，不再 import orders |
| `src/features/orders/service.ts` | 调用 `getUserTier(listOrders(id).length)` |
| `.dependency-cruiser.cjs` | 加 `no-circular` 与 `features-not-to-features` 规则（见 [tooling.md](tooling.md#dependency-cruiser)） |

**为什么**：依赖方向变为 orders → users，共享类型下沉；规则接入后循环不会再悄悄出现。

**何时可以不改**：两个文件属于同一特性且对外是一个整体——合并文件即可，不必新建 shared。

## 示例 5：前后端共享代码经 barrel 泄漏 Node 依赖（TS）

**约束**：多人项目，L2 子任务；前端打包体积突然变大且浏览器报 `fs` 不存在。

```ts
// packages/shared/index.ts
export * from "./validation";
export * from "./db";          // uses node:fs and a DB driver
// apps/web/src/form.ts
import { validateEmail } from "@acme/shared";
```

**问题**：barrel `export *` 让前端间接拉入服务端代码（C6；见 [TS 清单](checklists/typescript-javascript.md) barrel 陷阱）；共享包没有区分运行环境。

**改后**：`packages/shared` 只保留与运行环境无关的代码（校验、类型、常量），`package.json` 用 `exports` 暴露 `./validation`；`db` 移到 `packages/server-core`。eslint-plugin-boundaries 声明 `web` 不得依赖 `server-core`。

**为什么**：共享边界按“能在两端运行”划分，而不是按“两端都用到”。

**何时可以不改**：项目只有服务端，barrel 仅用于缩短 import 路径且无循环和体积问题。

## 示例 6：公开头文件暴露实现细节（C++）

**约束**：长期项目，L1；改一个私有成员导致 40 个文件重编，且下游被迫链接 SQLite。

```cpp
// include/store/store.h
#include <sqlite3.h>
#include "../src/cache.h"
class Store {
 public:
  std::string get(const std::string& key);
 private:
  sqlite3* db_;
  Cache cache_;
};
```

**问题**：公开头 include 第三方头和 `src/` 内部头（C6，include 方向错误）；`target_link_libraries(store PUBLIC sqlite3)` 把实现依赖传播给所有下游。

**改后**：

```cpp
// include/store/store.h
class Store {
 public:
  Store(); ~Store();               // destructor defined in .cpp
  std::string get(const std::string& key);
 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;     // pimpl: sqlite and cache live in store.cpp
};
```

```cmake
target_include_directories(store PUBLIC include PRIVATE src)
target_link_libraries(store PRIVATE SQLite::SQLite3)
```

**为什么**：公开接口稳定后，内部变化不触发下游重编，依赖不外泄。

**何时可以不改**：性能热点的小值类型（pimpl 增加一次间接和堆分配）；仅本目标内部使用的类——只需把头文件移到 `src/`，不必 pimpl。

## 示例 7：过度设计 → 简化（TS）

**约束**：小工具（内部 CLI，把 Markdown 转 HTML），L1，用户抱怨“改一个选项要动 6 个文件”。

```text
src/
  domain/converter/IConverter.ts        // interface, 1 implementation
  domain/converter/ConverterFactory.ts  // returns new MarkdownConverter()
  application/ConvertUseCase.ts         // calls factory, forwards args
  infrastructure/MarkdownConverter.ts
  infrastructure/di/container.ts        // DI container registration
  interfaces/cli/ConvertCommand.ts
```

**问题**：一个实现配接口、工厂、用例、DI 容器（AP-08）；每层只转发，不符合小工具档位“不引入 DI 容器和多层接口”。

**改后**：

| 路径 | 职责 |
|---|---|
| `src/cli.ts` | 参数解析，读文件，调用 convert，写输出 |
| `src/convert.ts` | `convert(markdown: string, opts: ConvertOptions): string` |
| `src/convert.test.ts` | 纯字符串测试 |

**为什么**：真实使用者只有一个；删除 4 层后改选项只动 `convert.ts` 与 `cli.ts`。若将来真有第二种输出格式，再引入注册表（[patterns P4](patterns.md#p4-插件--注册表)）。

**何时可以不改**：这些层是对外发布的 API，已有外部调用者；或已确认下个迭代要接入第二种转换器（写进计划，并说明删除条件）。

## 示例 8：静态对象自动注册插件（C++）

**约束**：长期项目，L1；Release 构建中部分格式“消失”，Debug 正常。

```cpp
// formats/png.cpp
static bool registered = Registry::instance().add("png", &decode_png);
```

**问题**：依赖静态初始化副作用；静态库中未被引用的目标文件会被链接器丢弃，且跨翻译单元初始化顺序未定义（见 [C++ 清单](checklists/cpp.md) ODR/静态初始化）。

**改后**：

```cpp
// formats/register_all.cpp
void register_builtin_formats(Registry& r) {
  r.add("png", &decode_png);
  r.add("jpeg", &decode_jpeg);
}
// apps/viewer/main.cpp
Registry registry;
register_builtin_formats(registry);
```

**为什么**：注册变成可见、可测试的显式调用；无全局单例，测试可构造独立 Registry。

**何时可以不改**：使用对象库（`add_library(... OBJECT ...)`）或 `WHOLE_ARCHIVE` 链接并有测试覆盖“所有格式已注册”，且团队已接受该约定（写入 ADR）。

## 防止示例固化

示例的档位与当前任务不同时，不迁移结构，只迁移判断方法。同一段代码在一次性脚本和长期项目中的结论可以相反。复审以项目约束与扫描/测试结果为准，不以“像示例”为准。
