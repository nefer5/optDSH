# optDSH

当前版本 **v0.1.1 · 功能预览**；本轮结构重整尚未发布新版本，见[CHANGELOG](CHANGELOG.md)。

面向光学模型的专家—Agent协作工作台：官方DSH会话、三维近似视图、会话画板和独立光学工具。

**日常双击根目录 `启动光学工作台.cmd` 或 `启动DSH.cmd`。** 首次安装：`pwsh scripts/setup.ps1`。具体前置条件见[运行指南](docs/runtime.md)。

光学模块使用本项目Python环境和连接代码；画板编辑器暂依赖本机N05的4173服务，这是用户指定保留的边界。

| 入口 | 内容 |
|---|---|
| [当前状态](planning/STATUS.md) | 已实测、待验证和下一步 |
| [模块和目录](docs/architecture.md) | 官方依赖/插件/公共光学能力/数据分类 |
| [文档导航](docs/README.md) | 7个现行主题；旧文档归档ZIP |
| [工作台操作](docs/workbench.md) | 连接、保存、视图、会话与画板 |
| [研究区](STUDYS/README.md) | 模型、配置和研究run就近组织 |
| [业务Skills](.agents/skills) | 装调公差、画板、Rx收光效率；[参数配置/可视化](.agents/skills/dsh-forms/SKILL.md) |

正式实现：plugins/、packages/；运行入口：scripts/；第三方依赖：node_modules/、.venv/。持久用户数据在data/，服务日志logs/，临时任务temp/；runs保持完整证据包，不能当缓存清理。

PPT制作首版：[ppt-slidewise](docs/ppt-slidewise.md)，独立SlideWise编辑页、项目稿件保存及可编辑PPTX导出。

离线检查：`npm test`。本项目不会因普通刷新而保存Zemax；显式保存按钮点击即授权，具体门禁见工作台说明。
