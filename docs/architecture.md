# 架构与目录

当前Canvas桥和光学工作台已经统一官方Profile生命周期：源码仍在plugins，发行tgz安装到Home/Profile；不再从app或源码回流。Bundle只给推荐/默认，停用与卸载遵循官方有效配置。目录与操作见[Profile插件](profile-plugins.md)；Forms等其他自有插件尚在逐项收敛。

2026-10-18分支实施：optdsh-bundle负责官方Loader装配、认证记录与可选插件隔离；开发平台已固定官方DSH 0.2.1-rc.2，旧现场保留。程序根、独立Home、workspace分离；新画板在课题.agent-canvas/optdsh/boards。编辑器已独立安装接入；光学正式包含legacy/modern组件，19与2025只读连接已验，18及其他年份未实测。Windows光学后台用同环境pythonw静默运行，状态和脱敏日志在Web高级诊断查看。独立Canvas通用文档协议、正式迁移与沙箱/公司验收仍未完成。累计成果与剩余项见[实施进度](refactor/2026-10-18/implementation.md)；具体决定见[决定入口](refactor/2026-10-18/decisions.md)，发布使用见[安装说明](installation/README.md)。

下文描述重构前现役部署，作为过渡对照；不代表新代码仍要求固定仓库根。


optDSH 使用官方 DSH 0.2.0-rc.2（候选发布版），官方代码由 npm 安装在 node_modules/@deepseek-ai 下；不修改安装包。插件通过 config/dsh.local-policy.yml 加载，专家预设由启动器另挂生成的 Cordis patch。

## 产品模块

| 模块 | 自有内容 | 对外边界 |
|---|---|---|
| plugins/optdsh-workbench | lib适配器、web前端、config指令、tests | 官方会话控制器、3081光学HTTP、画板transport接口 |
| plugins/optdsh-agent-canvas | lib画板状态/工具、web/transport.js、tests | 官方会话；N05的4173嵌入式编辑器 |
| plugins/optdsh-experts | lib原生专家适配、tests | .agents/experts中性定义和生成预设 |
| plugins/optdsh-current-info-policy | 最新资讯查询的静态系统提示 | 官方systemPrompt；时间读数由官方time-context提供，本插件不联网或定时执行 |
| plugins/optdsh-forms | 独立研究背景/临时请求表单、存储、CLI、tests | 官方connection认证；Study声明式文件与data/forms请求；不依赖光学工作台 |
| packages/optics | src公共光学实现、scripts HTTP/MCP/worker、tests、依赖清单 | 本机ZOS-API；不依赖N02源码或虚拟环境 |

插件专属资源从包目录解析，npm依赖按模块解析。项目配置/业务数据通过项目根定位，不能把私有文件打进插件包。根package-lock固定第三方版本；插件独立SemVer，新增接口升MINOR。当前lib为手写源码，不是可删除编译缓存。

工作台/官方Web → 官方3080 → 光学HTTP3081 → 本项目连接封装 → Zemax。
工作台/官方Web → N05画板iframe → 同一transport → 官方3080的唯一BoardStore。

**发布边界**：光学代码和Python环境已经内聚；画板编辑器按用户指示暂保留N05依赖，尚不宣称整个应用完全自包含。N02仅是只读设计参考和来源，不参与运行。

## 文件存放

| 内容 | 位置/生命周期 |
|---|---|
| 日常启动 | 根目录两个cmd薄入口；实现位于scripts/runtime |
| 正式维护工具 | scripts/maintenance；安装入口scripts/setup.ps1 |
| 模块测试 | 所属模块tests；跨模块真实验收tests/live，默认不运行 |
| 平台配置 | config；本机optics.local.json忽略Git |
| 研究配置/编排 | STUDYS/<study>/configs、workflow；公共模块不得导入Study |
| 正式证据 | runs/<workflow>/YYMMDD-NN，或Study内runs；完整随包 |
| DSH会话/设置 | data/dsh（DSH_HOME），必须持久保留 |
| 会话画板/绑定 | data/canvas、data/workbench |
| 光学恢复快照/保存回执 | data/optics；不按临时文件清理 |
| PID/锁/启动令牌 | .runtime；仅在对应服务停止后处理 |
| 服务日志 | logs/dsh、logs/optics；不再作为重新打开认证入口的数据源 |
| 一次性开发脚本与输出 | temp/<任务>/scripts、outputs；不得平铺根目录或再次引入artifacts |
| 历史开发产物 | data/archive/artifacts-20260927；仅保留旧证据，不继续写 |
| 独立AgentCanvas用户内容 | .agent-canvas；不是DSH会话BoardStore，不能误清 |

研究遵循N02的就近原则；配置源位于STUDYS时新run自动归属相应Study。历史run、备份、输入模型不为外观整齐而改写。活动模型仍保留test/zmx旧路径，避免改变正在打开的Zemax文件；新研究模型就近放Study，商业数据不入Git。

## 清理与升级

node_modules/.venv可按锁文件重建；data、研究模型、run不是缓存。临时任务完成后回收自己的沙箱；不得递归删除未知目录。历史旧聊天链路已从运行源码退役，旧聊天数据保存在data/archive。
升级DSH只更新依赖并运行模块/页面回归；验证官方会话、画板、认证、MCP与工具接口。禁止用改node_modules解决适配。

## 重构设计材料（未实施）

2026-10-18已整理[重构设计工作簿](refactor/2026-10-18/index.html)、[目标架构草案](refactor/2026-10-18/design.md)与[决定/待定项](refactor/2026-10-18/decisions.md)。目标是独立安装、可选插件和任意研究workspace；本文件上文仍描述当前实现。具体接口、落点、迁移与验收见[实施计划草案](../.agents/plans/261018-platform-plugin-refactor.md)，尚未开始产品代码或数据迁移。
