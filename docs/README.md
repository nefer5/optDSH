# 文档入口

日常使用先看根 README；Agent 先看根 AGENTS。当前能力和限制仅维护在 planning/STATUS.md。

| 需要了解什么 | 唯一现行入口 |
|---|---|
| 模块归属、依赖、文件应放哪里 | [架构与目录](architecture.md) |
| 安装、启动、认证、恢复、日志 | [运行指南](runtime.md) |
| 铁律、权限、配置与备份边界 | [工程规则](rules.md) |
| 模型身份、坐标、快照、几何/布尔 | [光学契约](contracts.md) |
| 工作台操作、会话、画板、保存 | [工作台](workbench.md) |
| Skill、专家、Harness扩展、模型基线 | [Agent开发](agents.md) |
| 一次运行的配置/结果/报告/证据 | [运行包与报告](runs-and-reports.md) |

旧文档与重整前planning完整保存在 [历史ZIP](archive/20260927-before-restructure.zip)，不作为当前入口。新增说明优先归入上述平台主题，不为每次修改新增一篇阶段文档。

具体研究目标、指标口径和对象配置归对应Study及业务Skill，平台docs不重复维护光学分析流程。

领域契约单独分区：[2t2rLidar术语与H/V约定](2t2rLidar/README.md)。这里只维护跨模型可复用的概念、方向和映射要求，不重新承载研究执行流程；具体对象、零位和采样参数仍在Study配置。
