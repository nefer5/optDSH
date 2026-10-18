# optDSH

当前版本 **v0.2.0-dev.22 · 重构开发版，未正式发布**。基于官方DSH的光学协作平台，保留官方Web、Agent循环与会话，通过可选插件接入画板、光学工作台和专家能力。

先看[当前架构四视图](docs/architecture/index.html)、[当前状态](planning/STATUS.md)和[剩余工作优先级](planning/ROADMAP.md)。

本地发行包提供`安装optDSH.exe`图形向导（备用CMD），产品Skills与公共专家基线随包；无需复制源码.agents。当前为待人工核验的开发版，安装/验证范围见当前状态。

## 使用与开发

- 普通用户：[安装、选装与升级](docs/installation/README.md) → [运行入口](docs/runtime.md) → [工作台使用](docs/workbench.md)。
- 开发者：根AGENTS → [开发与验证](docs/development.md) → [版本、Git推送与交付](docs/versioning.md)。
- 纯平台需要用户安装Node>=24；光学另需Python及声明依赖、Zemax/许可证。运行环境不随包，普通用户不必另装PowerShell7。
- 研究课题可在任意外部workspace；源码、程序、独立Home、验证现场和真实课题分开。

开发机双击“启动DSH.cmd”复用已有Host；平台源码变化用“重启DSH.cmd”。“启动光学工作台.cmd”只打开已启用工作台。画板桥/工作台源码变化须显式打包并升级Profile，普通重启不覆盖用户开关。

光学后台在Web连接窗口显式启动，Windows静默运行，状态和日志在高级诊断。打开/轮询不连接Zemax；探测、确认与保存分别操作。画板编辑器独立安装，支持[已有安装或全新本地包](docs/installation/canvas.md)。

## 文档导航

| 主题 | 入口 |
|---|---|
| 当前运行、源码包与安装布局 | [交互架构页](docs/architecture/index.html)、[架构正文](docs/architecture.md) |
| 已确认决定与剩余优先级 | [决定](docs/decisions.md)、[路线图](planning/ROADMAP.md) |
| 安装与官方Profile插件 | [安装](docs/installation/README.md)、[Profile](docs/profile-plugins.md)、[推荐插件](推荐插件.md) |
| 课题/公共技能边界与专家 | [workspace](docs/workspaces.md)、[Agent开发](docs/agents.md) |
| 真实光学约束与运行包 | [契约](docs/contracts.md)、[报告](docs/runs-and-reports.md) |
| 全部现行说明与归档恢复 | [文档导航](docs/README.md)、[历史ZIP/哈希](docs/archive/README.md) |

代码归plugins/、packages/；运行脚本归scripts/runtime，交付工具归packaging/windows。node_modules/.venv可重建，Home、模型、课题、日志和凭据不随源码推送。发布目录是安装产物，验证目录是本机现场，均不作为Git源码目录。

离线验证：`npm test`；版本检查：`npm run version:check`。真实模型、Zemax追迹/保存与tests/live按任务另行授权。Sandbox和公司实机尚未验收，完整重构未全部完成。

源码远程：https://github.com/nefer5/optDSH 。本轮推送开发分支供备份和审阅；正式Release安装包、主分支合并和公开npm按后续决定。
