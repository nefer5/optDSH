# 交接:DSH 架构审查 hook 循环投递问题

创建:2026-10-02。状态:**原Stop自动续轮机制已退役；轻量方案实施完成，宿主生效范围见下文**。本文档自包含,处理者不需要原会话上下文。

## 2026-10-02 用户确认的替代设计

- 会话开始/恢复注入架构规范；不扫描仓库、不维护已审状态。
- Git pre-commit检查真实暂存区一次，默认仅报告、不阻断、不调用模型。
- 用户通过arch-review明确请求深入审查或整改；不要求--record。
- Codex/Claude/DSH的架构Stop handler由分发器移除；新脚本对宿主缓存的旧stop命令直接静默，不读payload/Git/状态。OpenCode没有原命令hook，更新专家/技能并共用仓库Git hook。
- optDSH是唯一源，版本0.2.0；按已登记清单同步optDSH四宿主、AgentTyvate三宿主。历史state.json与AgentTyvate的off止血配置保留，新方案不依赖它们。
- 原始开发会话839行压缩日志及19轮概要已核对；当时是“提醒一次”的设计意图，没有Git提交hook。本次计划与验收入口：[轻量化实施计划](../.agents/plans/261002-architecture-trigger-simplification.md)。

**源码修正**：当前DSH桥接的默认continue走block/reason → deny → agent.steer(user message)；systemMessage被忽略。下文“状态分叉”“投递不消费”是现场时期的待验证假设，不能当已证明根因；本次通过取消Stop扫描/续轮消除这条循环路径，不宣称已经证实具体旧故障原因。

以下保留旧现场和备选方案作追溯，不再作为当前实施指引。当前宿主配置/加载与验收结果见planning/STATUS及实施计划。

## 一、问题现象

AgentTyvate 项目(E:\AgentTyvate)在 DSH Web 端使用时,software-architect kit 的 Stop hook 审查提醒从 2026-10-02 19:44 触发起,**同一文本逐轮重复投递 25+ 轮**,以普通用户消息形态出现。事实:

- 19:44 首次触发是合法的(当时确有未审改动:25 error / 25 warn,全部 ARCH-HARDCODE,位于 projects/canvas、projects/ppt 冻结的 Run 测试资料)。
- 19:46 完成审查并运行 `arch_scan.py --changed --record`,指纹 `9f14e8d6ef4a` 写入 `E:/AgentTyvate/.git/software-architect/state.json`,状态 `reviewed`。
- 此后每轮仍收到逐字相同的提醒。审查结论本身无争议:`sk-S…` 信号是 Vite 构建产物文件名哈希前缀(`sk-SK-C5VTKIMK-Df0PbH4e.js`),**误报**;硬编码路径全部在冻结 Run 资料内,无需架构调整。

验证范围修正(用户确认,2026-10-02):上述循环现场来自 DSH Web 端,不是 DSH 桌面端。Codex 中的架构 hook 尚未实测,是否存在同类问题未知;后续优化需覆盖公共逻辑,并分别验证各宿主,不能将 Web 端现场结论直接当作 Codex 的已知故障。

## 二、排查结论(证据 → 推断)

| # | 检查 | 结果 | 推断 |
|---|---|---|---|
| 1 | `.git/software-architect/state.json` | 指纹保持 `reviewed`,从未被 `flagged` 覆盖 | 宿主执行环境**没有**写这份文件(若写了,`flagged` 会覆盖) |
| 2 | 本机模拟:`'{"cwd":"E:\\AgentTyvate"}' \| python arch_hook.py --host dsh --event stop` | 输出为空,静默正确 | CLI 环境下逻辑与状态读取均正常 |
| 3 | roampal 记忆库(chroma.sqlite3 全文检索"架构审查提醒") | 0 命中 | 排除记忆插件重放 |
| 4 | hook 注册点 | `E:\Proj-2026-N06_optDSH\.agents\dsh-hooks\software-architect.json`,Stop → `arch_hook.py --event stop --host dsh` | 无 `--root` 参数,root 取 payload cwd;执行环境是 DSH 宿主进程 |

**根因(两个叠加,主次待源码确认)**:

1. **状态分叉**:archkit `state_path()`(kit/scripts/archkit/state.py)优先 `git rev-parse --absolute-git-dir` → `.git/software-architect/state.json`,失败回退 `%TEMP%\software-architect\<项目路径哈希>\state.json`。宿主沙箱环境的 git 可用性/TEMP 与 CLI 不同 → 状态落到会话内不可见的另一份 → 宿主每轮判定"未审"重新提醒。用户 TEMP 无回退文件,回退发生在宿主自己的环境。
2. **投递不消费**:DSH 把 Stop hook 返回的 `systemMessage` 作为下一轮用户内容投递后未清除/去重,放大为逐轮循环。哪个是主因(宿主每轮 TEMP 都不同 vs 纯消息重放)需读 optDSH hook 执行源码确认。

## 三、止血(已生效,2026-10-02 20:05)

新建 `E:\AgentTyvate\.agents\architecture.toml`:

```toml
[review]
mode = "off"
```

已模拟验证 hook 静默。**注意**:键必须写在 `[review]` 段下且名为 `mode`(合法段:project, layout, limits, hardcode, ignore, imports, review, session, plan, layers);顶层 `review_mode` 会报 ConfigError。根治合并后删除此文件或改回 `mode = "continue"`。

另:该轮审查已用 `--record` 标记(指纹 `9f14e8d6ef4a` = reviewed),仓库侧无需重审。经验卡已建:`~/.agents/experience/dsh-arch-review-hook.md`(索引已更新)。

## 四、根治备选方案

### A. archkit 侧:状态文件项目内固定路径(推荐先做,小改)

- 改动:`state.py` 的 `state_path()` 改为 `<root>/.agents/.arch-review-state.json`(gitignore),不再依赖 git-dir/TEMP;所有执行环境天然同状态。
- 位置:唯一源 `E:\Proj-2026-N06_optDSH\.agents\resources\software-architect\kit\scripts\archkit\state.py`,改后经 expert-distribute 重新分发到 AgentTyvate。
- 兼容:首次运行时若旧位置有 state,做一次迁移或直接以新文件为准(建议后者,简单)。
- 量级:约 10-20 行 + 分发,arch-plan 定级约 L1~L2;kit 自带 51 个单元测试需同步补。
- 残留:不解决投递重放,但宿主读到 reviewed 后每轮返回空,循环自然消失。

### B. DSH 侧:systemMessage 一次性消费(治投递层)

- 预期行为:Stop hook 的 systemMessage 投递一次后即清除;或同一指纹/同一文本去重。
- 需读 optDSH harness 的 hook 执行与消息投递源码定位;范围比 A 大,建议单独立项。
- 顺带确认:宿主执行 hook 时 `git` 是否可用、TEMP 指向哪里(可先在 hook 命令里临时加一行环境探测输出验证)。

### C. 兜底(不推荐单独作为方案)

提交 AgentTyvate 未提交改动使改动集为空,hook 无信号。会混入大量他人/其他轮的 WIP,仅在 A/B 都无法及时做时考虑。

### 建议顺序

A(立即,解循环)→ B(立项,修投递语义)→ 删除止血配置恢复 `continue` → 按 DSH hook 冒烟流程回归(SessionStart 注入 + Stop 一次触发一次投递)。

## 五、关键文件索引

**原始会话记录**(DSH 会话投影缓存,JSON 投影格式,读 `record.rows.turnOutline.val.turns` 的 prompt/response):

| 会话 | session id | 记录文件 | 内容 |
|---|---|---|---|
| 架构专家开发会话("约束GPT代码架构设计规范") | `819147d7-13ac-4a66-bef2-a53e1e9a7dc8` | `E:\Proj-2026-N06_optDSH\data\dsh\storages\session_projcache\sessions\session-819147d7-13ac-4a66-bef2-a53e1e9a7dc8.json` | B 包(扫描器+hook 脚本)、C 包(DSH 分发接入)的设计与验收讨论,19 轮;hook 设计意图以 T10、T13、T17 为主 |
| 循环 bug 现场会话("分析创建技能的技能规则") | `5c50a428-f4f3-4c3b-8efe-9748a5e198f6` | 同目录 `session-5c50a428-f4f3-4c3b-8efe-9748a5e198f6.json` | 问题现象与排查全程,提醒重放的原文序列在此会话内 |

| 文件 | 作用 |
|---|---|
| `optDSH/.agents/dsh-hooks/software-architect.json` | hook 注册(SessionStart + Stop) |
| `optDSH/.agents/resources/software-architect/kit/scripts/arch_hook.py` | 宿主入口(thin) |
| `.../kit/scripts/archkit/hook.py` | handle_stop 主逻辑:L112-134 |
| `.../kit/scripts/archkit/state.py` | 状态存储,L23-28 state_path 回退逻辑(问题核心) |
| `.../kit/scripts/archkit/config.py` | `[review] mode` 配置解析 |
| `AgentTyvate/.git/software-architect/state.json` | CLI 侧已审状态(reviewed) |
| `AgentTyvate/.agents/architecture.toml` | 止血开关(根治后移除) |
| `~/.agents/experience/dsh-arch-review-hook.md` | 经验卡(含排查全记录) |

## 六、开放问题

1. 宿主沙箱内 `git` 可用性、实际 TEMP 路径(未实测,进入 optDSH 源码/宿主日志后确认)。
2. DSH 对 Stop `systemMessage` 的投递语义(重放 or 每轮重新执行 hook)——决定 B 的修法。
3. `--record` 的"已审"语义在改动集继续演化后是否需要按文件粒度细化(当前整集指纹,新改动会重新触发,这是设计内行为)。
