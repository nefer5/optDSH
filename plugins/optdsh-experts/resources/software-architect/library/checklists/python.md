# Python 架构清单

按档位取用：一次性脚本只看“配置与硬编码”前两项；小工具看前四组；长期项目及以上全看。每项不满足时写明位置与理由，不凑数。

## 布局与入口

- [ ] 正式代码在一个包内（`src/<pkg>/` 或 `<pkg>/`），有 `__init__.py`；根目录不平铺 `.py`（`ARCH-ROOT-SCRIPT`、ruff `INP001`）。
- [ ] 入口唯一且可列举：`<pkg>/__main__.py`、`<pkg>/cli.py` 或 `[project.scripts]`；入口只做参数解析、加载配置、装配、映射退出码。
- [ ] 模块顶层无副作用：import 时不读文件、不连网络、不解析 `sys.argv`；执行代码放在 `if __name__ == "__main__":` 或入口函数中。
- [ ] 一次性脚本在项目约定的 scratch/temp 目录，正式模块不 import 它们。
- [ ] 单文件 >400 行已评估拆分，>800 行有书面理由（`ARCH-SIZE`）。

## 依赖与边界

- [ ] 依赖方向与 ARCHITECTURE.md 一致；`core` 不 import `cli`/`infra`（import-linter `layers` 或 `ARCH-LAYER`）。
- [ ] 无模块级循环（`ARCH-CYCLE`、import-linter `acyclic_siblings`）；没有用函数内 import 掩盖循环。
- [ ] 仅类型用途的 import 放在 `if TYPE_CHECKING:` 下，但方向仍符合分层。
- [ ] 不跨包 import `_private` 名称或其他包的内部子模块；跨包只用其 `__init__` 导出的接口。
- [ ] 第三方依赖在 `pyproject.toml` 声明；重型依赖只在边界层 import。
- [ ] 没有持续膨胀的 `utils.py`；通用函数按主题分文件，业务函数回到所属模块。

## 配置与硬编码

- [ ] 无本机绝对路径；路径由参数/配置给出，或以 `Path(__file__).resolve().parents[n]` / 项目根为基准（`ARCH-HARDCODE`）。
- [ ] 凭据只从环境变量或密钥管理读取，样例文件用占位符（`ARCH-SECRET`、ruff `S105/S106`）。
- [ ] 配置有单一加载点（如 `config.py` 的 `load_settings()`），优先级：默认 < 文件 < 环境 < 参数；核心代码不读 `os.environ`（ruff `banned-api`）。
- [ ] 阈值、超时、模型名是命名常量或配置项，同一含义的字面量不出现两处（ruff `PLR2004`）。
- [ ] 配置文件用 `tomllib`/JSON 等标准格式，提供 `*.example.*` 样例入库。

## IO 与测试

- [ ] 文件、网络、数据库、子进程集中在 `infra`/边界模块；核心函数接收数据或可调用对象。
- [ ] 核心逻辑测试不依赖真实文件或服务；需要文件时用 `tmp_path`。
- [ ] 测试目录与包结构对应，有一条统一命令（如 `pytest`）；live/慢测试单独标记且默认不跑。
- [ ] 新增约束已接入校验命令（`lint-imports`、`ruff check`、`arch_scan.py`）。
- [ ] 生成文件（`*_pb2.py`、迁移脚本输出）不手改，来源命令写在 ARCHITECTURE.md。

## 常见陷阱

- [ ] 可变默认参数（`def f(x=[])`）与模块级可变全局状态。
- [ ] 相对 cwd 的路径：`open("data.csv")` 在不同启动目录行为不同。
- [ ] `sys.path.insert` 拼路径导入——应改为正确的包结构或可编辑安装。
- [ ] 同名模块遮蔽标准库或第三方库（`json.py`、`logging.py`、`types.py`）。
- [ ] `from x import *` 让依赖不可见；`__all__` 与实际公开接口不一致。
- [ ] 为“可替换”给只有一个实现的类加 `ABC`/`Protocol`（见 AP-08）。
- [ ] 在库代码中调用 `logging.basicConfig()` 或 `sys.exit()`——只应出现在入口。
