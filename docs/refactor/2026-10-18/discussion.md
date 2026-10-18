# 讨论沉淀：平台、插件与研究工作区重构

日期：2026-10-18。范围：整理本聊天10月13日至18日的调研与当日讨论；当前仅文档设计，不实施重构。

## 用户提出的问题与目标

公司部署暴露出开发机状态与发布内容不一致：源码下载后市场插件没有同步，部分代码或环境适配有问题。研究课题和平台源码同在一个目录，使平台难以像通用Agent工具一样安装一次、在任意目录使用。

用户明确期望：平台独立安装；研究课题位于任意workspace；AgentCanvas独立安装和发布，DSH中只保留薄桥；光学工作台作为可选独立插件；插件按官方机制组织，可各自开源安装；发布包包含安装/使用/架构说明和Archify图；在Windows干净环境验证换机安装。

本轮已授权：项目内建文档目录、补充多类型图、做统一页面、设计目标架构、整理重构计划、记录共享日志并按Codex会话补记。**没有授权执行产品重构、迁移真实数据、安装系统组件、重启服务、真实模型或Zemax验收，也未要求提交推送。**

## 已澄清的概念

| 概念 | 本聊天采用的解释 | 容易误解之处 |
| :--- | :--- | :--- |
| DSH平台 | 官方Agent循环、会话、工具、权限及插件组装 | 关联光学工作台不代表所有普通任务都受光学资源门禁限制 |
| Plugin | 提供具体能力的插件 | 源码放plugins目录不等于已经能独立发布安装 |
| Bundle | 可分发的组装包，声明包内patch | 不是强制名为bundles的目录；一个npm包也可同时提供插件实现 |
| Profile | 用户选择的Bundle、依赖与覆盖配置 | 用什么工具与组合；不是正在研究哪个课题 |
| DSH_HOME | 官方用户数据根，可覆盖默认~/.dsh | 通常供同一用户多个项目共用；不是整个用户主目录，也不必每课题复制 |
| Workspace | 当前会话处理的研究目录 | 平台安装位置不应被当成workspace |
| Canvas文档权威 | 画板内容、revision、历史与恢复的唯一可写来源 | 同一画板不能由DSH与Canvas两套store同时权威写入 |

现场已确认：当前项目**已有**data/dsh/profiles/web与headless。启动器把DSH_HOME指定到仓库data/dsh，是官方支持的配置方式。问题不是当时“没建Profiles”或“没有用官方机制”，而是产品启动和自有插件仍把安装根、用户资料根与研究cwd绑定在一起。

官方dsh-base、dsh-web-app已经是Bundle；建议中的optdsh-bundle尚未实现。Bundle源码可在开发仓库，安装后通常在安装依赖或profile的node_modules里；profile清单保存选择，不复制另一份组装源码。

## 为什么需要多个视图

此前仅生成了两张architecture图，分别描述现状和建议，两张是同一种图型，并未覆盖安装过程、提交先后与数据权威。

| 要说明的内容 | 合适的表达 |
| :--- | :--- |
| 谁与谁协作、可选与必需边界 | 架构总览 |
| 新电脑安装、缺依赖、失败处理 | 安装流程图 |
| 保存草稿、显式提交、校验、投递、确认 | 画板提交时序图 |
| 输入、真正读写者、持久位置和使用者 | 数据归属/数据流图 |
| 模块、可发布包、目录与文件的对应 | 源码目录树＋职责/依赖表 |
| 程序、用户数据、课题、Canvas、实例状态 | 安装与数据布局 |

三类视图（运行、源码、部署数据）是要回答的内容；Archify五种图型（architecture/workflow/sequence/dataflow/lifecycle）是表达方式，不要求每次都出五种或固定三张。

C4是系统上下文、容器、组件、代码的观察层级，不是要求画四张，也不等同Archify。源码目录树不等于C4代码视图；代码视图更偏单个重要组件内部的类、接口、函数。Archify本机版没有专门的文件树模式，因此目录组织采用原生HTML树与Markdown，和关系图用同一模块名称关联。

## 调研发现与证据界限

- 启动器固定仓库cwd和DSH_HOME，启动前依赖项目Python与专家分发；工作台/画板对会话cwd检查为仓库根。
- 自有插件已有模块归属，但仍为private workspace、相对源码patch加载；工作台静态import画板transport，尚不满足独装。
- 独立AgentCanvas有发布基础；当前DSH桥却仍拥有BoardStore、建议稿与通用绘图业务。
- 市场插件位于忽略的data/profile，setup不会重建；这解释一类新机缺口，不足以归因公司全部bug。
- 光学Python已摆脱N02运行依赖，但入口、worker、Skill与个别Study路径仍绑定仓库；editable安装不证明wheel完整可用。
- Windows Sandbox适合干净安装冒烟，持久VM适合固定版本/升级恢复，最终公司策略与许可证仍需公司实机。

历史快照在[evidence/prior](evidence/prior/research-20261013.md)保留。原始调研中的本机Sandbox Disabled是10月13日观察，不在10月18日凭旧记录宣称当前功能生效。所有目标图均标草案/未实施。

## 已确认与待确认分开

用户方向和授权见[decisions.md](decisions.md)，目标设计见[design.md](design.md)。Canvas的具体存储目录、是否拆多个Git仓库、Node是否随安装包、首版目标兼容矩阵等是待确认技术提议，不能从“请把方案设计出来”推导成已批准迁移。

本次沿用“不调用视觉设计专家，由主Agent使用Archify完成”的明确选择。专业架构文档复核和可独立的图稿/日志核对按架构技能分工，不构成产品代码实施。

## 后续使用方式

先在[统一页面](index.html)按现状/建议对照，看清边界和缺口；再审阅[目标设计](design.md)与[重构计划草案](../../../.agents/plans/261018-platform-plugin-refactor.md)。只有设计确认并取得具体实施授权后，才开始计划中的代码、数据和系统操作。

## 官方参考

- [DSH架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md)
- [DSH Profile/Bundle](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.zh.md#profiles)
- [C4图形层级](https://c4model.com/diagrams)
- [C4代码视图](https://c4model.com/diagrams/code)
- [Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)

网上master与本机固定rc.2可能不同；实现事实以本轮核对的项目源码和固定提交为准。本文是讨论记录，不重复维护现役使用指南。
