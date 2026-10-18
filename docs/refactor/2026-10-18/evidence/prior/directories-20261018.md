# optDSH 架构图与文件目录对照
日期：2026-10-18。状态：现状已核对；建议为候选，尚未实施。

- [打开当前架构图](current.html)
- [打开建议架构图（未实施）](proposed.html)

这是两张 Archify 交互图：支持浅色/深色、缩放及导出。当前图可点击“来源”查看源码位置。默认视图支持向下滚动；建议先读主线，再看图下的说明卡片。

本轮只新增本目录的可视化交付，没有调整项目实现、运行配置、Study、用户数据或系统功能。按葱哥选择，本次没有调用视觉设计专家。

## 1. 两张图最主要的区别

| 看哪里 | 当前架构 | 建议架构，未实施 |
| :--- | :--- | :--- |
| 程序安装 | 官方 DSH 装在 N06 仓库的 node_modules | 程序安装到研究目录之外，按用户安装即可 |
| 用户配置 | DSH_HOME 指向 N06/data/dsh | DSH_HOME 独立于安装根与研究目录 |
| Profile | 已有 profiles/web，并非缺失 | 保留官方 Profile 格式，完整表达插件组合 |
| 自有插件 | 启动补丁从仓库源码挂载 | 通过独立可安装包与包内 bundle patch 加载 |
| 研究课题 | 放在 N06/STUDYS，部分入口直接认识固定课题 | 会话指定任意研究 workspace，配置与结果就近归属 |
| Canvas | N05 提供编辑器；DSH 插件拥有 BoardStore 等通用业务 | 候选：独立 Canvas 拥有通用文档能力，DSH 只保留宿主适配 |
| 工作台与画板 | 工作台静态 import 画板 transport | 两者可分别安装，缺可选组件不阻断核心功能 |
| 光学后端 | 项目 Python 环境和仓库内脚本 | 可安装执行器，显式接受 workspace、模型与运行配置 |
| 多课题安全 | 同仓库与同实例的现有门禁 | 课题按会话隔离；同一 Zemax 实例仍由执行器统一互斥 |
| 新机安装 | 源码安装不会带上忽略的市场插件 | 发布清单、版本锁及独立安装组合验收 |

“会话与项目关联”是一个职责框，不要求一定新建服务或抽象框架；可以尽量复用官方 sessionController 的 cwd/sessionId，增加必要的光学实例与可选能力关联。它不另建 Agent 循环或第二套官方会话记录。

建议图展示一种明确的候选：**通用画板文档由独立 Canvas 产品管理**。采用共享核心包、由宿主保存文档也是可讨论路线，尚未决定；图中的候选不能当成已确认实施方案。

## 2. 当前文件目录：实际存在的结构

以下是重点目录的摘要，不是递归展开全部依赖、私人文件和历史数据。注释区分开发源码、可重建依赖与应保留数据。

```text
E:/Proj-2026-N06_optDSH/
├─ README.md
├─ AGENTS.md
├─ package.json                         官方 DSH 版本与 plugins workspace 声明
├─ package-lock.json                    根项目依赖锁；不锁定独立 profile 内的市场插件
├─ 启动DSH.cmd
├─ 启动光学工作台.cmd
│
├─ plugins/                             自有插件源码，不等于用户已安装插件目录
│  ├─ optdsh-workbench/                  光学 UI、会话适配、光学 HTTP 代理
│  │  ├─ package.json                   private:true
│  │  ├─ lib/
│  │  ├─ web/
│  │  ├─ config/
│  │  └─ tests/
│  ├─ optdsh-agent-canvas/               目前是“画板业务 + DSH 桥接”
│  │  ├─ lib/boards.js                  BoardStore 与 revision、建议稿、恢复
│  │  ├─ lib/tools.js
│  │  ├─ lib/client.js
│  │  ├─ web/transport.js               接外部 4173 编辑器
│  │  └─ tests/
│  ├─ optdsh-forms/                      研究表单与临时请求
│  ├─ optdsh-experts/                    专家工具与资源适配
│  └─ optdsh-current-info-policy/        资讯查询的提示规则
│
├─ packages/
│  ├─ optics/
│  │  ├─ pyproject.toml
│  │  ├─ requirements.txt
│  │  ├─ src/optdsh_optics/             公共光学实现
│  │  ├─ scripts/                      server / MCP / worker 等入口
│  │  └─ tests/
│  └─ ppt-slidewise/                    PPT 模块，另有安装/运行链
│
├─ config/
│  ├─ dsh.local-policy.yml              通过 ../plugins/... 挂载自有源码
│  ├─ agent-canvas-bridge.json
│  ├─ optics-model.json
│  ├─ optics.example.json
│  └─ optics.local.json                 本机配置，Git 忽略
│
├─ scripts/
│  ├─ setup.ps1                         目前无条件安装光学 Python 与根 npm 依赖
│  ├─ runtime/                          启动、停止、状态、打开入口
│  └─ maintenance/                      检查及维护工具
│
├─ .agents/
│  ├─ skills/                           产品业务 Skill
│  ├─ development-skills/               开发工具入口
│  ├─ experts/                          当前部分入口链接个人 Agent 中心
│  ├─ dsh-presets/                      生成内容，Git 忽略
│  └─ resources/                        生成资源，Git 忽略
│
├─ STUDYS/                              真实研究，与平台源码处于同仓库目录
│  ├─ 2t2rLidar/
│  │  ├─ configs/
│  │  ├─ models/                       商业模型不入 Git
│  │  └─ runs/                         研究证据，不是缓存
│  └─ spectral-lidar/
│
├─ data/                                用户持久数据，Git 忽略
│  ├─ dsh/                             启动器指定的 DSH_HOME
│  │  ├─ profiles/
│  │  │  ├─ web/                       已存在，当前网页使用它
│  │  │  │  ├─ package.json            profile 清单 / 市场插件依赖
│  │  │  │  ├─ cordis.patch.yml         profile 用户覆盖设置
│  │  │  │  ├─ pnpm-lock.yaml
│  │  │  │  ├─ pnpm-workspace.yaml
│  │  │  │  └─ node_modules/           该 profile 的插件依赖
│  │  │  └─ headless/                  同样已存在
│  │  └─ sessions/                     官方会话数据
│  ├─ canvas/boards/                    DSH 画板的当前事实源
│  ├─ workbench/                       工作台会话绑定
│  ├─ forms/                           表单请求
│  └─ optics/                          采集快照、恢复、保存回执
│
├─ .runtime/                            进程、令牌、锁、启动认证记录
├─ logs/                                服务日志
├─ runs/                                平台正式验收证据，不是缓存
├─ docs/
├─ planning/
├─ tests/                               跨模块/真实验收等
├─ examples/
├─ temp/                                一次性开发任务
├─ node_modules/                        可由锁文件重建
└─ .venv/                               项目 Python 环境
```

另一独立项目仍在 `E:/Proj-2026-N05_AgentCanvas/`。当前 DSH 通过其 HTTP 页面嵌入编辑器，**并非直接使用独立 CLI 的收件箱**。该项目已有独立安装器与便携发布路径，本轮没有修改它。

为什么“源码仓库有插件，但新机少了市场插件”：上图的 `plugins/` 会随源码传播，而 `data/dsh/profiles/web/` 被 Git 忽略；它们是两个不同位置，根 setup 又没有重建市场组合。

## 3. 建议的开发源码目录：可以继续一个仓库维护多个包

下方是建议组织，不表示已创建。**源码是否拆成多个 Git 仓库，可以独立决定。** 即便暂时保留 monorepo，也要能把每个包发布给没有源码 checkout 的用户。

```text
optDSH-source/                          仅开发者需要，不放真实研究
├─ README.md
├─ package.json
├─ <根依赖锁文件>
├─ plugins/
│  ├─ optdsh-bundle/                   候选：可分发产品组装，不强制安装全部插件
│  │  ├─ package.json                 dsh.bundle.patch / 依赖 / 宿主兼容范围
│  │  ├─ cordis.patch.yml             仅组装已选择功能；包名加载
│  │  ├─ README.md
│  │  └─ LICENSE
│  ├─ optdsh-workbench/                独立发布，Canvas 为可选能力
│  │  ├─ package.json
│  │  ├─ cordis.patch.yml             插件的安装/加载声明
│  │  ├─ lib/
│  │  ├─ web/
│  │  ├─ config/                      默认模板，不放开发机 local 配置
│  │  ├─ tests/
│  │  ├─ README.md
│  │  └─ LICENSE
│  ├─ optdsh-agent-canvas/             保留熟悉名称，职责收敛为 DSH 薄桥
│  │  ├─ package.json
│  │  ├─ cordis.patch.yml
│  │  ├─ lib/                         认证、会话绑定、工具/消息适配
│  │  ├─ web/                         DSH UI 挂载与协议适配
│  │  ├─ tests/                       握手、重复投递、卸装组合与冲突
│  │  ├─ README.md
│  │  └─ LICENSE
│  ├─ optdsh-forms/                    可消费当前 workspace 的声明式研究配置
│  ├─ optdsh-experts/                  使用可分发公共资源，不要求个人中心 Junction
│  └─ optdsh-current-info-policy/      可选产品行为
│
├─ packages/
│  ├─ optics/
│  │  ├─ pyproject.toml               声明可安装的服务/worker/CLI 入口
│  │  ├─ src/optdsh_optics/
│  │  │  ├─ <服务与CLI入口>
│  │  │  ├─ <连接与实例锁>
│  │  │  ├─ <确定性分析与作业管理>
│  │  │  └─ <run与报告>
│  │  └─ tests/
│  └─ ppt-slidewise/                  可选独立模块，不成为纯平台启动前置
│
├─ config/examples/                   安装示例与 schema，无凭据/本机路径
├─ scripts/runtime/                   薄启动入口，区分安装根、home 与 workspace
├─ packaging/windows/                 候选：安装器、发布清单、升级与卸载归属
├─ examples/study-template/            合成的最小研究模板，非真实商业课题
├─ tests/installation/                候选：基于实际发布产物的安装组合验收
│  ├─ <Windows Sandbox配置与脚本>
│  ├─ <VM验收说明>
│  └─ <离线/受限网络安装用例>
├─ docs/
│  ├─ architecture/                   Archify HTML、源 JSON 与静态导出
│  ├─ installation/                   在线/离线、升级、卸载
│  ├─ plugins/                        可选关系、版本范围、独立安装
│  ├─ workspace/                      任意目录研究与数据归属
│  └─ troubleshooting/
└─ .agents/                           开发协作入口，不成为用户机器强制依赖
```

真正的独立插件包需要：可用的 manifest、包内资源、明确依赖与兼容范围、默认配置、许可证、独立安装说明，以及在干净 Profile 中加载/交互的证据。不能只删除 private:true。

上面的目录名是建议，不是官方规定；`dsh.bundle.patch` 与 Profile 的组装机制才是官方契约。产品组装包也不能通过传递依赖悄悄强制安装所有可选模块。

## 4. 建议的用户安装后目录：与开发源码分开

以下用占位路径表达职责，**不是已经选定的安装位置**。全局可调用可以按用户安装，不一定需要管理员权限。

```text
<平台程序安装位置>/                   例如用户级安装区或固定 npm 安装位置
├─ <固定版本的官方DSH>
├─ <optDSH薄启动入口>
└─ <随安装包交付的公共资源和离线文档>
                                     不放课题、画板、会话、凭据与正式结果

<独立 DSH_HOME>/                     可以是 ~/.dsh，也可显式指定其他位置
├─ profiles/
│  └─ web/                            沿用官方 Profile 格式
│     ├─ package.json                 已选择组合包 + 独立插件依赖
│     ├─ cordis.patch.yml              用户自己的设置
│     ├─ <profile依赖锁文件>
│     └─ node_modules/                用户安装的可选插件及依赖
├─ sessions/                          官方会话事实源，按官方格式保存
└─ <optDSH插件状态目录>/               自有命名空间，名称与位置待确定
   ├─ <工作台绑定与画板投递回执>        不复制第二套会话或Canvas通用文档
   ├─ <光学实例状态与恢复索引>
   ├─ <运行时锁与令牌>                 按真实实例互斥，不按课题各锁各的
   └─ <服务日志>

<AgentCanvas独立安装位置>/            单独升级，不要求N05源码目录
├─ <编辑器与通用画板服务>
├─ <协议与版本能力声明>
└─ <CLI和说明文档>

D:/Research/课题A/                    举例：位置、盘符由用户决定
├─ README.md
├─ AGENTS.md                          本课题规则
├─ study.yaml                         建议：本目录直接作为一个Study入口
├─ .agents/skills/                    只放本课题专用Skill（需要时）
├─ configs/                           研究输入与冻结配置
├─ models/                            商业模型保留在课题内，不随平台发布
├─ runs/                              配置、结果、日志、报告、代码/来源快照
├─ .agent-canvas/                     候选位置：由Canvas管理的文档与历史
└─ reports/                           研究总结与导读

E:/OtherWork/课题B/                   另一任意目录；无需复制DSH与插件
├─ study.yaml
├─ configs/
├─ models/
├─ runs/
└─ .agent-canvas/                     与课题A隔离，数据权威仍为Canvas
```

Canvas 文档放各 workspace 的 `.agent-canvas/` 是这一份目录示例的候选，不是已经批准的迁移路径。也可以由 Canvas 的独立用户数据根保存，workspace 只保存关联；需要在方案阶段决定。无论选哪种，不能同时维护两份可写的权威画板。

`<optDSH插件状态目录>` 是自有产品约定，不是声称官方 DSH 已定义该目录。正式方案应核对官方数据目录扩展方式，避免与宿主升级冲突。

研究目录可以只有一个 Study，也可自行组织多个课题；平台不再要求最外层一定叫 STUDYS，更不能自动寻找某个写死的 2t2rLidar。

## 5. 文件迁移时的归属对照

| 当前内容 | 建议最终归属 | 迁移时应保留 |
| :--- | :--- | :--- |
| 根 node_modules 中的 DSH | 独立平台安装 | 固定版本与重建清单，不迁虚拟链接当安装证明 |
| data/dsh/profiles/web | 独立 DSH_HOME 的对应 Profile | 用户选装/停用、版本、锁文件、已确认豁免 |
| plugins/* 源码 | 开发仓库；用户用独立发布包 | 公共 API、资源、许可证、安装与卸载契约 |
| data/canvas/boards | 候选：Canvas 的唯一文档存储 | boardId、session 关联、revision、建议/提交/冲突记录 |
| data/workbench | 自有插件状态区 | 会话/课题/实例绑定，不另存官方会话历史 |
| STUDYS/<课题> | 任意研究目录 | 模型、配置、附件、来源、相对链接 |
| STUDYS/<课题>/runs | 原课题下继续保留 | 历史包整体、哈希、路径映射；不改写历史结果 |
| .runtime 与 logs | 独立用户状态/运行目录 | 只迁需要保留的恢复信息；过期令牌不作为有效认证 |
| 个人 .agents/experts Junction | 开发者配置；公共资源另打包 | 私人偏好、截图与凭据不得混入公共发布包 |

本轮没有执行此表中的迁移。真实迁移前需备份、记录路径映射与哈希，并验证旧会话、画板和结果仍能恢复。

## 6. 源码依据与验证范围

现状图固定源码身份：`https://github.com/nefer5/optDSH.git`，HEAD `4cb306bf4a1b200adc1b0d9d5dc3358c70c823af`。源码链接选择 local-only。

工作树存在既有未提交改动；本轮核对并用于图中引用的启动器、加载配置、插件主入口、BoardStore、transport、光学服务及架构文档与该 HEAD 一致。没有把用户未提交的内容伪装成该提交的证据。目录里的 ignored 数据位置是当日只读现场核对，不对用户资料做公开源码引用。

关键源码入口：

- `scripts/runtime/start-dsh.ps1:68–91`：项目 Python、DSH_HOME、补丁与 cwd。
- `config/dsh.local-policy.yml:13–43`：Canvas、工作台、Forms、专家与光学 MCP。
- `plugins/optdsh-workbench/lib/index.js:14–28,47–64`：cwd、认证 HTTP 与官方会话。
- `plugins/optdsh-workbench/web/workbench-agent.js:7`：静态 Canvas transport 依赖。
- `plugins/optdsh-agent-canvas/lib/index.js:12–40`：当前根目录限制与 BoardStore。
- `plugins/optdsh-agent-canvas/lib/boards.js:27–45`：实际画板文件读写。
- `plugins/optdsh-agent-canvas/web/transport.js:2–17`：外部编辑器与握手。
- `plugins/optdsh-forms/lib/store.js:38–47`：从 ROOT/STUDYS 读取研究入口。
- `packages/optics/scripts/server.py:11–26` 和 `service.py:54–71`：项目根与 Python worker。
- `docs/architecture.md`：补充模块、PPT、Skills、数据与历史证据的归属。

两张图均为 architecture 类型，保留 candidate.json、HTML、finalize 与 browser-check 回执。实际校验结果和 SHA-256 见 [交付与检查结果](verification.md)。浏览器截图检查与源码结构检查是本轮证据；没有启动 DSH 产品、模型请求或 Zemax，没有做部署可用性验收。

## 7. 阅读后可重点讨论的三个决定

1. 公共插件可继续单仓开发、独立发布，还是同步拆多个源码仓库？前者也能实现安装解耦。
2. Canvas 通用文档最终由独立产品保存在哪里，DSH 侧只保留哪些绑定/回执？
3. 新机发布第一组必须通过哪些安装组合？建议先验证纯平台、仅工作台、仅画板、两者共存，以及两个外部研究目录。

这些问题留作下一步方案讨论，不以本次出图作为重构授权。

