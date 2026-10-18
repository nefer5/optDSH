# optDSH 重构设计工作簿

日期：2026-10-18。状态：**设计已确认，首轮分支实施阶段完成；整个重构未全部完成。**

从[统一可视化页面](index.html)开始阅读。按“当前情况 / 优化建议”切换，查看架构、安装流程、画板时序、数据归属、源码组织及安装布局。

| 内容 | 权威入口 |
| :--- | :--- |
| 本聊天的需求、概念澄清和讨论记录 | [discussion.md](discussion.md) |
| 用户方向与未决技术提议 | [decisions.md](decisions.md) |
| 目标架构、接口、数据及迁移边界 | [design.md](design.md) |
| 当前/目标源码和安装目录 | [directories.md](directories.md) |
| 用户确认的C4前三层关注与分析约定 | [c4-perspective.md](c4-perspective.md) |
| L2重构计划与各任务阶段状态 | [正式计划位置](../../../.agents/plans/261018-platform-plugin-refactor.md) |
| 本地干净安装与换机部署验证 | [Windows沙箱专项](windows-validation.md)，未启用/未执行 |
| 图源、SHA、浏览器和视觉检查边界 | [verification.md](verification.md) |
| 原调研快照 | [evidence/prior/research-20261013.md](evidence/prior/research-20261013.md) |

当前运行事实仍以[STATUS](../../../planning/STATUS.md)与[现行架构](../../architecture.md)为入口，本目录不把目标方案冒充已实现。图中省略的实现细节见设计稿，图形检查不等于新机部署或真实光学验证。

所有diagram.html均由Archify生成，可独立打开。各目录保留candidate.json、交付与浏览器回执；最新有效证据索引见verification.md。源码目录树与安装布局由统一页面原生HTML表达，不伪称Archify已有文件树模式。

原重构文档交付没有更改产品源码、运行配置、真实研究输入/结果、个人Agent中心或系统功能，没有启动真实模型/Zemax，也没有提交推送。随后用户另行授权的C4方法沉淀见[c4-perspective.md](c4-perspective.md)：补充本目录、LLM Wiki与用户中心架构专家说明，不构成产品重构实施。

首轮实现与未完成项见[实施摘要](implementation.md)及[测试汇总](evidence/implementation/receipt.json)。历史“未实施”记录按当时阶段理解，不覆盖新的决定和进度。
