# 文档导航

先读根目录[项目入口](../README.md)和[当前状态](../planning/STATUS.md)。本目录按用途分类；当前运行结论以planning/STATUS.md为准，不从历史设计推断能力已实现。

| 分类 | 用途与入口 |
|---|---|
| governance | 必须遵守的[项目铁律](governance/project-rules.md)、[运行包与配置快照](governance/run-bundles.md)、[开发约定](governance/development.md)、[Codex项目入口](governance/codex-project.md) |
| architecture | [总体架构](architecture/architecture.md)、[背景与范围](architecture/project-brief.md)、[数据契约](architecture/contracts.md)、[Zemax桥接](architecture/m2-optics-bridge.md)、[布尔与性能](architecture/boolean-cuts.md)、[持续会话](architecture/conversations-canvas.md)、[官方会话画板](architecture/canvas-session-boards.md) |
| guides | [启动与认证](guides/local-runtime.md)、[三维操作](guides/viewer-controls.md)、[双视图工作台](guides/workbench-v4.md)、[只读提问](guides/m3-workbench.md)、[Figma评审](guides/figma-workbench.md) |
| workflows | [Tx/Rx装调任务入口](workflows/txrx-tolerance-priority.md)；执行流程以项目Skill为准，输入配置和每次结果放run包 |
| research | [N02复用入口与副作用](research/opt-assist-reuse.md)、[前端开源调研](research/frontend-reuse-research.md)、[AI4Optics/DeepO](research/ai4optics-deepo-review.md)、[来源汇总](research/references.md)；原始讨论放discussions子目录 |
| decisions | [官方Web＋Standard起点决策](decisions/0001-start-with-official-web-standard.md) |
| archive | 旧布局、画板设计和阶段审查，仅供追溯；不作为现行约束 |

## 存放边界

- docs只放长期规范、架构、操作指南和研究资料；新文档进入相应分类，不平铺根目录。
- planning保存当前状态、路线和待办；Skill包保存领域流程及`config/xxx.example.yaml`样例；项目config保存本机工作配置。
- runs保存正式报告、当次配置及证据；artifacts保存服务日志、诊断和历史产物。报告默认HTML，细则见运行包规范。
- 新增或搬移关键约束文档，必须同步AGENTS按需入口、此导航和实际调用方路径；历史run不为文档搬迁而改写。
