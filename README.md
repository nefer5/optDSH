# optDSH

当前版本 **v0.2.0-dev.3 · 重构开发分支，未发布**；当前为本地开发测试版本，尚未正式发布，见[CHANGELOG](CHANGELOG.md)。

面向光学模型的专家—Agent协作工作台：官方DSH会话、三维近似视图、会话画板和独立光学工具。

**过渡说明：新启动器默认使用独立home；旧3080尚未切换，端口占用会保守拒绝接管。独立安装与启动见[说明](docs/installation/README.md)。**

**日常双击根目录 `启动光学工作台.cmd` 或 `启动DSH.cmd`；修改源码后用 `重启DSH.cmd`。启动DSH复用已有进程，重启DSH核验后关闭再拉起。** 首次安装：`pwsh scripts/setup.ps1`。具体前置条件见[运行指南](docs/runtime.md)。

光学模块使用本项目Python环境和连接代码；画板编辑器暂依赖本机N05的4173服务，这是用户指定保留的边界。

| 入口 | 内容 |
|---|---|
| [开发与验证目录](docs/development.md) | 工作树、独立依赖、发布及安装验证 |
| [当前状态](planning/STATUS.md) | 已实测、待验证和下一步 |
| [推荐插件](推荐插件.md) | 市场插件固定版本、安装命令与新机器 Agent 适配检查 |
| [模块和目录](docs/architecture.md) | 官方依赖/插件/公共光学能力/数据分类 |
| [重构设计工作簿](docs/refactor/2026-10-18/index.html) | 现状/目标多视图、已确认决定与实施进度 |
| [文档导航](docs/README.md) | 7个现行主题；旧文档归档ZIP |
| [工作台操作](docs/workbench.md) | 连接、保存、视图、会话与画板 |
| [外部课题目录](docs/workspaces.md) | 任意目录研究，课题资料不随平台源码或发布包分发 |
| [业务Skills](.agents/skills) | 装调公差、画板、Rx收光效率；[参数配置/可视化](.agents/skills/dsh-forms/SKILL.md) |

正式实现：plugins/、packages/；运行入口：scripts/；第三方依赖：node_modules/、.venv/。持久用户数据在data/，服务日志logs/，临时任务temp/；runs保持完整证据包，不能当缓存清理。

PPT制作首版：[ppt-slidewise](docs/ppt-slidewise.md)，独立SlideWise编辑页、项目稿件保存及可编辑PPTX导出。

离线检查：`npm test`。本项目不会因普通刷新而保存Zemax；显式保存按钮点击即授权，具体门禁见工作台说明。

本轮0.2.0-dev.1版本机制见[版本与发布](docs/versioning.md)；切换到新开发目录继续的上下文见[开发接续摘要](docs/handoff/2026-10-18-dev-continuation.md)。
