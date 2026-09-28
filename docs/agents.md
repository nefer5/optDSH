# DSH Harness定制入口

本项目固定`@deepseek-ai/dsh@0.1.5-rc.3`；2026-09-27核对安装包实现、类型声明和同标签官方文档。以下入口属于该版本，不假定master接口稳定。

## 规则作用域：开发指引与产品注入分开

- 根AGENTS约束项目协作并路由专项规则，可能被项目内开发Agent和产品Agent共同读取；不能默认只影响Codex。
- 模块目录AGENTS规定对应实现的开发边界。不同宿主加载目录规则的方式可能不同，不能只因文件存在就宣称产品Agent已加载。
- 工作台config/instructions.md由agent-policy.js仅注入已绑定Agent的作用域；关联会话仍可以处理普通任务，领域规则按本轮实际请求和被操作资源适用，不限制整套Standard工具。
- 只读MCP、保存按钮和副本/原位执行器各有自己的能力与授权边界；不是三种不同权限等级的聊天。真正写入校验仍在执行器，提示词不能替代代码门禁。
- 具体研究参数和H/V约定由领域契约/Study/Skill维护，不注入为平台全局业务假设。

## 从哪里改

- 装配入口：[config/dsh.local-policy.yml](../config/dsh.local-policy.yml)经启动器`--patch`挂载本地插件；保留Standard和官方agent loop。
- 产品适配：[plugins/optdsh-workbench/lib/index.js](../plugins/optdsh-workbench/lib/index.js)，现已有sessionController、按会话基础指令（不改变Standard工具权限）、HTTP/UI和上下文提交。
- 产品常驻规则：[工作台产品指令](../plugins/optdsh-workbench/config/instructions.md)，经[agent-policy.js](../plugins/optdsh-workbench/lib/agent-policy.js)注册到绑定Agent自己的`agent.ctx.systemPrompt.section`，创建/恢复/后绑定都处理；宿主加载时读取，编辑后重载宿主。
- 光学能力：[光学MCP入口](../packages/optics/scripts/mcp.py)及`packages/optics/src/optdsh_optics/`。DSH插件做适配，版本/权限/数据计算由确定性服务保障。
- 业务流程：装调公差、画板及Rx收光效率Skill；[dsh-forms](../.agents/skills/dsh-forms/SKILL.md)负责参数配置插件发现与Study/Skill/完整配置检查分流。开发评测看[模型基线](agents.md)，契约评审看[开发指南](contracts.md)。

## 上下文放在哪里

| 内容 | 入口 | 时机与边界 |
|---|---|---|
| 稳定产品规则 | `agent.ctx.systemPrompt.section({name,order,text})` | 注册一次，每次step组装；本项目光学规则只属于已绑定会话 |
| 会变化的运行状态摘要 | `systemPrompt.context({name,order,text: context => ...})` | 每步求值，框架生成带持久记录的user-role运行上下文快照；回调读已有状态，不在里面直接连接Zemax/追迹 |
| 用户本轮选中对象和问题 | 官方`sessionController.prompt()`的content | 只在显式提交后一起入队，先校验modelId/revision；现有`promptContent()`实现此路径 |
| 步骤准入/输入检查 | `agent/pre-step` waterfall | 可拒绝或替换该step的输入批次；不要丢弃next()的消息与startsRequestSeries等字段 |
| 外部结果通知 | `agent.inject()` | 添入下一被接纳step，不唤醒空闲Agent；`steer()`会唤醒并走下一step，`followup()`排下一turn |
| 大型报告/数组 | 工具结果摘要＋run产物引用 | 不把完整光线数组反复注入提示词；先按业务请求取需要的数据 |

step是一次模型请求及其工具处理周期；一个用户turn可能包含多个step。稳定规则每步组装不等于每步都向历史追加一条相同消息。

本地`dsh-agent-loop/lib/index.js`的`preStep()`顺序是：领取inbox → systemPrompt.assemble → 生成动态context → agent/pre-step → 接纳step。随后解析请求路由/prepareCall并提交模型可见记录。因而在pre-step里临时注册section不能假定会影响同一次已组装的请求；稳定section应提前注册。

工具循环：模型请求 → `tools/pre-execute` → 单调guard → `tools/execute` → `tools/post-execute` → 结果定稿/`tools/result` → 下一step或`agent/turn-stopping` → turn结束。

## Hook开发选什么

原生插件通过`export const inject=[...]`声明服务依赖，在`apply(ctx)`内用`ctx.on(...)`注册事件/中间件；资源用`ctx.effect`绑定生命周期。普通emit观察事件、serial事件和waterfall中间件不是同一种返回协议，应看安装包`lib/types/*.d.ts`，不要凭名称猜签名。

| 需求 | 扩展点 |
|---|---|
| 新建/恢复Agent后设置作用域 | `agent/created`；需要发布前配置则使用创建时setup/preset组合 |
| 每步接纳前校验输入 | `agent/pre-step` |
| 工具权限/专家确认 | `tools/pre-execute`；不可被后续插件放宽的同步约束用`ctx.tools.guard()`；真正写入口仍要服务端再校验 |
| 工具结果检查、补充上下文 | `tools/post-execute` |
| 结果审计/UI通知 | 只读观察`tools/result`或持久`session/event`，不把显示流当最终事实 |
| 判断是否允许自然结束 | `agent/turn-stopping`；只做与当前任务相关的有限检查，避免无限steer/阻塞交付 |

DSH也安装了`dsh-hooks-codex`和`dsh-hooks-claude-code`命令Hook兼容桥，底层仍映射这些原生事件；不是照搬另一宿主所有语义。例如当前Codex桥`configPath`为进程级、加载时读取，工具前只支持阻断，不支持批准或重写。检查项目patch未显式配置这两个桥；安装包存在不等于本项目启用。已有命令Hook迁移可考虑兼容桥，新optDSH能力优先原生插件。

## 本项目下一步建议

沿现有薄插件加小功能：稳定协作规则已接入；动态状态摘要、分析作业通知、版本化写提案仍需逐项实现及验收。不替换agent loop，不恢复旧headless聊天路径，不把鼠标草稿变成自动提示。工具执行完成、Agent回答完成、仿真作业结束分别建模。

验证先测作用域隔离、版本拒绝、取消及事件顺序，再用glm-5.3-flash做真实对话；配置完成、宿主加载、模型按规则行动分别报告。当前基础规则迁移未做GLM模型行为验收。

## 固定版本依据

- [System Prompt](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/core/system-prompt/README.md)
- [Agent API与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/core/agent/README.md)
- [工具执行管线](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/core/tools/README.md)

精确签名以本地`node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`、`dsh-system-prompt/lib/types/index.d.ts`、`dsh-tools/lib/types/`及两个hooks包的类型/实现为准；不要直接修改node_modules。

## 项目专家扩展

[自定义专家](agents.md)已接入官方Agent Preset和Subagent：同一份源定义经分发生成专家会话与委派persona，保留Standard默认；项目插件只注册原生工具并加载资源，不重写Agent循环。


# 开发自定义专家

optDSH 复用 AgentTyvate 的专家源定义与四宿主分发机制。当前只启用视觉设计专家，用于工作台、报告、页面的设计或实际画面评估；同时支持开发宿主与DSH原生专家会话/子Agent；没有新增模型供应商或光学写工具。

## 使用

在本项目聊天中说：

> 调用 visual-designer 视觉设计专家，检查当前光学工作台的视觉层级，先只评估，不改代码。

设计任务可说：

> 请 visual-designer 帮我改进报告视觉，先简短确认需求，需要比较时先给 A/B 小样，选定后再完整实现。

宿主必须支持并发现自定义角色。已有聊天未加载时，在本项目新建会话后核对。若当前宿主没有按角色名调用的工具，主 Agent 明确读取源定义、偏好与参考，按同一规范执行并说明是主 Agent 执行，不能谎称调用了原生专家。

## 文件与同步

[专家中心](../.agents/README.md)是入口；[源规范](../.agents/experts/visual-designer/instructions.md)是唯一正文。角色不固定模型、不提高权限；产品 GLM 测试约束仍有效。保留开工简短沟通、低成本小样、选定后完整实施和实际画面验证。既有用户指示与本任务已确认需求优先，不重复询问。

```powershell
python .agents/development-skills/expert-distribute/scripts/distribute.py
python .agents/development-skills/expert-distribute/scripts/distribute.py --apply
python .agents/development-skills/expert-distribute/scripts/distribute.py --check
```

YAML 选择入口及样例见[分发 Skill](../.agents/development-skills/expert-distribute/SKILL.md)。默认四宿主，支持 only/exclude。脚本拒绝未核对的 CLI 版本、手工漂移、非托管同名文件和越界资源。更新前备份及 SHA-256 收据在 `.agents/.distribution`。这是开发配置维护；正式专家分析与报告仍使用公共 run 包。

开发维护 Skill 独立于 `.agents/skills`，通过 AGENTS.md 显式入口读取，不新增 DSH 业务 Skill。四个宿主的生成角色文件及公共参考副本本地生成且 Git 忽略，克隆后需重新分发。不修改全局角色。源定义通过显式本机链接共享，生成宿主配置仍须执行中心分发。

## 来源与验证边界

来源：本机 AgentTyvate 的 visual-designer 0.4.2、分发脚本及白名单图库；历史适配版0.4.3曾增加光学约束；当前0.7.0以optDSH为通用专家唯一中心，光学约束改按目标项目AGENTS路由，两项目个人偏好已统一。

Codex 格式按[官方自定义 Agent 文档](https://learn.chatgpt.com/docs/agent-configuration/subagents)核对：项目 `.codex/agents/*.toml` 必填 name、description、developer_instructions。OpenCode/Claude 保留源项目已核对的格式，分发时核对实际 CLI 版本。文件分发、宿主发现、真实设计调用分别验收，当前状态见 planning/STATUS.md。


## DSH 网页使用

**直接找专家**：官方Web新建会话，在模式选择器选择“视觉设计专家”（`visual-designer`），再提出设计或评估任务。它以固定版本Standard为基础，保留原生文件、Shell、Skills等能力和宿主权限审批。默认模式仍是Standard；已有产生消息的会话不能切换Preset。

**让主Agent找专家**：在Standard或光学工作台聊天中说“调用视觉设计专家，帮我……”。项目插件向本项目普通会话注入原生 `expert_visual_designer` 委派工具；固定视觉角色，继承父模型，不自动fallback。当前采用 `spawn` 的一次性前台调用，主Agent等结果后转述；子Agent没有父历史，主Agent须提供任务与已确认偏好。需要后续迭代时再次委派，并传递前轮结论。它不是持久化团队聊天入口。

工具和审批沿用DSH；用户已明确撤销光学工作台额外白名单，本接入也不对专家子Agent施加额外工具白名单。原生spawn子会话的审批生命周期遵从上游，无法现场请求批准的动作可能被原生策略拒绝，不提升权限绕过。Zemax版本检查、专家确认、回读与恢复仍是执行器事实约束。

`expert_resource` 的公共素材统一读取`.agents/resources/visual-designer/library/`，与生成指令一致；白名单读取分发包中的resources.json。私有preferences仍读本项目源文件，有限项目规范仍读项目入口。它可按这些边界读取图库、偏好及有限项目规范，不需要把图库全部注入上下文。PNG默认返回元数据，`mode=image` 才经官方attachment服务返回真实图片；必须另验模型图像能力，文字验收不能证明像素理解。完整专家会话也可用原生文件工具处理任务材料。子Agent拥有独立会话和画板，修改主画板时应返回方案给父Agent在主会话应用，不能假定两个画板相同。

## DSH 实现与更新

- 生成目录 `.agents/dsh-presets/visual-designer`：`agent.cordis.yml`保留官方Standard工具组合，仅替换persona；`preset.yml`提供显示信息；`expert.json`供子Agent加载相同正文。
- 项目 `config/dsh.local-policy.yml` 注册Preset根目录与原生spawn实例；`plugins/optdsh-experts` 在属于本项目的主Agent作用域注册委派工具。其他项目不会得到本项目角色委派。
- 修改专家源后运行 `distribute.py --only dsh --apply`，再检查 `--check`。`start-dsh.ps1`在实际新进程启动前同步；同进程复用不会重载旧角色。空闲后重载Host以使插件正文更新，并使用新会话验证；正在进行的会话不自动迁移Preset。
- 新增依赖为零，保持DSH 0.1.5-rc.3；生成文件/本机收据Git忽略，源定义/插件/适配器跟随仓库。

依据：[官方Preset](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/preset/agent-presets/README.md) · [官方委派工具配置](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/subagent/tool-subagent/README.md)。

接线实测中GLM曾对官方委派工具的description/prompt双字段生成重复description，导致调用未闭合。项目工具因此只暴露一个task参数，内部使用官方ctx.subagents.start、spawn提供方及原生结果/取消生命周期；显示标签由适配器固定。此为参数适配，不是自建Agent循环。


# optDSH 模型基线

从仓库根读取 [当前状态](../planning/STATUS.md) 与 [项目背景](architecture.md)，确认当前是在个人合成数据试验还是公司部署。模型原则针对产品运行模型，不限制编写代码的开发 Agent。

近期产品运行验证固定`glm-5.3-flash`，不自动fallback；更换模型须依据用户新指示。本指南为开发工作流，不作为产品Skill。

## 工作方式

- 先确认本次具体模型、端点协议、固定 DSH 版本和允许的数据范围。厂商名不证明能力；未选模型时列明候选选择条件，不擅自消费外部账号。
- 依次验证文本请求、工具调用与结果回传、事件记录；图片输入作为独立能力验证。文本通路可以在无图像能力时继续，不转发到未声明视觉模型。
- 用合成对象查询任务做第一条基线；参照 examples 中的数据与 docs/contracts.md。实际接口未实现时只做设计检查，禁止报告调用成功。
- 比较配置时固定任务、输入模型状态、工具集与预算，记录所有模型切换。不要为使任务通过而隐式升级到顶尖模型。
- 检查模型之外的数据出口，尤其反馈/遥测和工具服务；公司资料仅走获准通道。

## 交付

按任务规模记录：日期、模型及版本、DSH 版本、配置标识、数据来源、步骤、完成/失败证据、人工介入和重复尝试。费用或 token 不可得时标为未知。

正式评测遵循[公共运行包规范](runs-and-reports.md)：`runs/model/YYMMDD-NN/`，实际模型/请求参数快照与证据随包，默认report.html；排除凭据值。对用户给出简洁结论。更新planning/STATUS.md，区分已配置、模拟与实测；不得将密钥、网关秘密或公司数据写入Git。

## 单一权威（2026-09-28）

当前版本0.7.0；源和偏好仅在本仓库维护，AgentTyvate链接引用。多项目命令和恢复说明见[专家中心](../.agents/README.md)；[公共源码边界](../.agents/experts/visual-designer/PUBLICATION.md)区分通用规范、文字来源与私人截图。旧聊天需按宿主重新加载；本轮没有重启DSH或调用模型验收新偏好。
