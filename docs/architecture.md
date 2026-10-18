# 当前架构与目录

当前产品开发版 **0.2.0-dev.24**；官方DSH固定 **0.2.1-rc.2**。已新增Forms原生YAML编辑器、画板共享右栏与统一安装。四视图已按dev.21产品资源、官方专家与图形安装实现更新，各图源码版本见图源JSON。交互图见[当前架构页面](architecture/index.html)，剩余工作见[优先级](../planning/ROADMAP.md)。

## 图怎么看

- 运行关系：用户、官方Agent会话、插件、独立编辑器、光学服务和Zemax如何协作，接近C4容器/组件关注视角。
- 源码包边界：这些职责由scripts、packages、plugins承担，属于代码组织映射；目录树不等于完整C4代码视图。
- Skills与专家：官方技能发现、Profile声明Preset、官方spawn派工与公共资源适配。
- 安装与数据：程序、共享Home、任意课题和StateRoot分别放什么，属于部署与数据归属视角。

四张图都描述当前实现；未来建议只在[路线图](../planning/ROADMAP.md)中列出，不画成已运行的能力。图源、源码范围和自动校验回执随图保留。

## 模块与边界

| 模块 | 实际职责 | 当前边界 |
|---|---|---|
| 官方DSH | Web、Standard循环、会话、模型、认证及Profile | 唯一会话事实源，不修改node_modules |
| packages/optdsh-bundle | 组装、版本、能力状态、启动配置 | 不恢复用户停用/卸载的画板桥或工作台 |
| plugins/optdsh-agent-canvas | 会话画板工具、提交/建议、BoardStore与编辑器桥接 | 官方Profile生命周期；通用文档权威仍在桥内，尚未完全独立 |
| 独立AgentCanvas | 独立安装的编辑器、共享AgentPanel/诊断组件及宿主适配 | CLI/独立页面/DSH复用同一运行包；不依赖N05源码；跨宿主存储协议尚未统一 |
| plugins/optdsh-workbench | 模型视图、同会话聊天、光学代理和服务管理 | 官方Profile生命周期；缺服务不影响基础平台 |
| packages/optics | 可安装CLI/HTTP/MCP、版本连接、身份/实例锁与确定性分析 | legacy/modern复用组件；19和2025只读已验，其他版本及业务另验 |
| plugins/optdsh-forms | 原生工具/随包Skill、通用YAML侧栏、会话回投及prepared Run | 官方Profile生命周期；维护/Run分离和幂等，编辑不运行Zemax |
| optdsh-experts / 产品资源 | 官方专家Preset、官方派工、参考资源与随包Skills | Experts官方Profile生命周期；公共资源不依赖用户中心；可选共享导出仍待做 |

## 开发源码组织

```text
optDSH源码/
├── plugins/                    # 工作台、画板桥、表单、专家等源码
├── packages/                   # Bundle、光学公共包、PPT模块
├── scripts/runtime/            # 开发CMD与安装版共用的生命周期实现
├── scripts/maintenance/        # 版本、打包、检查、文档构建
├── packaging/windows/          # 安装、选装、校验和迁移工具
├── tests/                      # 跨包安装测试；真实业务默认不执行
├── config/                     # 可分发示例，私人配置忽略Git
├── .agents/skills/             # 开发技能；产品Skills已归所属包
├── packages/optics/skills/     # 光学工作流，npm资源包随发行版安装
├── packages/ppt-slidewise/skills/ # PPT产品Skill与运行代码同包
├── plugins/*/skills/           # Canvas/Forms产品Skill
├── plugins/optdsh-experts/resources/ # 固定版本公共文本基线
├── planning/                   # 当前状态、优先级和里程碑
└── docs/                       # 现行说明、架构图、验证及历史归档
```

源码不建立STUDYS；具体课题背景、专用Skill、模型、配置和完整run归任意外部workspace。

## 安装与持久数据

以下是普通用户安装时的默认规则，不是本机开发预览的路径快照。`~` 在本机展开为 `C:/Users/admin`；在其他电脑展开为该用户的主目录。InstallRoot 是软件程序，Home 是产品资料柜，用户 `.agents` 是跨工具共享资源，Workspace 是具体工程。

| 名称 | 默认值或选择方式 | 内容与边界 |
|---|---|---|
| InstallRoot | CLI安装器必填；图形向导建议`%LOCALAPPDATA%/Programs/optDSH/<版本>`，可修改 | 官方DSH运行依赖、Bundle、启动脚本等；不是用户另装的全局DSH，也不要求完整开发源码 |
| 独立Home / DSH_HOME | `~/.optdsh`；本机为 `C:/Users/admin/.optdsh`，可指定其他位置 | Profile、会话与设置；安装器要求在InstallRoot之外，同一Home可供多个课题共用 |
| StateRoot | `<Home>/state/<Profile>`；默认Profile为`web` | 插件数据、日志与运行状态；可显式另选，不必每个课题建一个Home |
| 用户共享根 / DSH_AGENTS_HOME | `~/.agents`；本机为 `C:/Users/admin/.agents` | 全局共享Skills与AGENTS；不因更换DSH_HOME自动迁移到Home里面 |
| Workspace | 安装/启动时可指定；未指定时取当前工作目录 | 官方Web可再选择其他课题；不要求置于InstallRoot或Home下面 |
| AgentCanvas安装区 | 接入已有兼容安装，或新装时显式选择目录 | 独立程序，和DSH桥分别管理；不是课题画板数据目录 |

```text
<InstallRoot>/                 # 版本化程序：官方DSH、Bundle、运行脚本
  node_modules/               # 官方DSH及程序依赖；选装包也可能位于Home的Profile
~/.optdsh/                     # 默认独立Home；可另选，不能放入InstallRoot
  AGENTS.md                   # 可选：本产品范围的用户规则
  skills/<技能>/SKILL.md       # 可选：本产品专用、跨课题可发现
  profiles/web/                # 官方Profile的包、bundle选择和用户patch
  config/                      # canvas.json、程序管理的optics.json
  state/web/                   # 默认StateRoot，也可显式另选
    data/                      # 绑定、快照、恢复与回执
    logs/                      # Web可读的光学启动日志等
    .runtime/                  # PID、令牌、锁；不随包
~/.agents/                     # 用户共享根；与上面的Home并列
  AGENTS.md                   # 可选：跨工具共享规则
  skills/<技能>/SKILL.md       # 跨工具共享技能
  experts/                    # 用户中心约定；并非官方DSH自动发现专家的通用入口
<独立AgentCanvas安装区>/       # 编辑器程序，与桥分开升级
<任意课题>/                   # 无须放在平台旁边
  .agent-canvas/optdsh/boards/  # 当前DSH会话画板
  AGENTS.md                   # 当前课题规则
  .agents/skills/              # 当前课题专用技能
  .dsh/skills/                 # 当前课题的DSH专用技能入口
  configs/ models/ runs/       # 由具体课题约定，不是平台强制模板
```

### Skills与AGENTS如何发现（当前机制）

以下来自当前安装的官方DSH `0.2.1-rc.2`：`dsh-skill-filesystem`的`roots(cwd)`与`dsh-agent-instructions`的用户/项目规则发现实现。它们是已实现的默认机制，不代表每项资源已经在干净用户环境中验收。

| 资源 | 发现位置 | 生效范围 |
|---|---|---|
| 课题Skills | 按当前会话cwd识别的项目根下`.dsh/skills/`、`.agents/skills/` | 当前项目；不会顺便扫描另一个源码仓库 |
| 产品专用Skills | `<DSH_HOME>/skills/`，默认`~/.optdsh/skills/` | 使用该Home的课题 |
| 用户全局Skills | `<DSH_AGENTS_HOME>/skills/`，默认`~/.agents/skills/` | 使用同一共享根的Agent；各宿主仍按自身协议加载 |
| 显式/随包Skills | 配置`customSkillDirs`、`bundledSkillDir`或插件向`ctx.skills`注册 | 按实际配置或启用的插件；不等于自动扫描整个InstallRoot |
| 用户AGENTS | `<DSH_HOME>/AGENTS.md`及`<DSH_AGENTS_HOME>/AGENTS.md` | 产品范围与共享范围分别加载；相同内容有去重 |
| 项目规则 | 当前项目根至cwd的`AGENTS.md`，默认也识别`CLAUDE.md`及对应local文件 | 当前项目及其子目录；不是读取所有磁盘上的AGENTS |

`DSH_AGENTS_HOME`缺省仍指向用户`.agents`；显式配置的`agentsHome`优先于该环境变量。启动器把选定产品Home传给`DSH_HOME`，不会把操作系统用户主目录改成Home。专家角色通过官方Profile声明Preset注册，参考资料从所属包读取；AGENTS只提供规则，不是专家发现目录。

### 专家与Skills：官方机制及产品装配

`AGENTS.md`是规则手册，不定义或注册专家。官方Preset注册表不扫描专家目录；通过Profile/Bundle声明`dsh-agent-preset`行，再由官方派工工具选择Preset。

| 对象 | 当前实现 | 作用域与状态 |
|---|---|---|
| 光学Skills | `packages/optics/skills`，以`optdsh-optics-skills`资源包安装；Bundle挂载官方文件系统Provider | 随产品跨课题发现，空共享根已有离线发现/正文/资源路径验证 |
| PPT Skill | 与`optdsh-ppt-slidewise`运行包一起安装，由官方Provider发现 | 根据安装位置解析CLI，稿件归当前课题 |
| Canvas/Forms Skill | 由各自插件的官方Provider/Skills注册服务提供 | 跟随插件生命周期，停用插件不由源码回流 |
| 专家公共基线 | `plugins/optdsh-experts/resources`固定快照，明确白名单与SHA256 | 不含私人偏好、截图或本机中心链接；用户全局.agents保持不变 |
| 专家定义 | Experts Bundle声明两位官方Preset，Profile管理整组 | 已接入官方注册；不再扫描`.agents/dsh-presets` |
| 专家派工 | 官方`dsh-tool-subagent`绑定专家Preset，复用`spawn` | 保留`expert_visual_designer`和`expert_software_architect`名称，异步完成通知；不再使用旧`subagents.start`包装 |
| 资源适配 | `expert_resource`读取包内清单文件，校验当前真实Agent及路径边界 | 外部课题可用；课题AGENTS/README由官方文件工具读取，不限定源码cwd |

开发与安装共用包内资源入口。不会把整个源码`.agents/skills`注入所有产品会话；同名用户/课题Skill按官方优先级覆盖随包资源。Skills目录仍须满足`<root>/<name>/SKILL.md`，只发现一层；目录可见不等于模型已实际调用。

### 发布结构与剩余项

发布流程按组件npm pack生成固定版本资源；CLI与图形向导复用安装器。程序安装、Home、用户共享根、课题分别保留；图形向导在本机浏览器显示，不新增系统服务、不改默认浏览器或全局PATH。Node需用户安装，光学Python环境与Zemax仍独立准备。

已实现产品Skills随包、官方专家装配及本地安装向导；本轮运行验收详情见[资源与安装验证](verification/product-resources-dev21.md)。可选跨宿主共享导出、用户修改冲突/升级回执、完整升级恢复矩阵、Sandbox/公司新机和正式公开发布仍是后续项。专家Preset包含固定官方Standard组合快照，升级DSH时需重新生成并验证，不能假定自动继承未来Standard变更。

当前源码仅用于开发，不再要求用户复制源码根的`.agents`来获得产品能力。详细资源边界见[资源布局](agent-resource-layout.md)。源码证据：`packages/optdsh-bundle/lib/product-skills.mjs`、`plugins/optdsh-experts/cordis.patch.yml`、`plugins/optdsh-experts/lib/{index,core}.js`、`packaging/windows/{install,install-gui}.ps1`。

## 安装端口与卸载边界

| 模块 | 首选端口 | 实际配置与共享关系 |
|---|---|---|
| 官方DSH Web | 3080 | 安装探测后自动避让；Launcher与运行入口读最终配置 |
| 独立AgentCanvas | 4173 | 未选组件不分配；仅同一兼容安装可复用，其他服务占用则另选 |
| 光学HTTP服务 | 3081 | 选工作台时预分配；配置端口不连接Zemax，实际启动仍需Python及配置 |
| PPT服务 | 3314 | 按安装配置运行，健康信息校验数据归属，不误复用其他课题 |
| Forms、Experts、桥和工作台界面 | 共用Web | 无独立TCP端口；MCP stdio也不分配TCP端口 |
| 安装/卸载向导 | 临时随机端口 | 仅本机浏览器会话，区别于产品常驻服务 |

安装器记录实际选择到PORTS.md、Home/config/ports.json与安装回执；预检/配置/运行证据分开。程序、Profile和状态目录各自分离，可并排测试，但不是沙盒隔离。默认不写全局PATH或.agents，不允许安装时复用正在写入的Home。

卸载向导列出主程序、自有Profile插件与日志的实际路径，用户选择后核验执行。课题没有删除选项，且所有登记课题路径与回收范围重叠时拒绝操作。Home会话/配置、模型/画板/结果、全局.agents及独立Canvas保留；随包safe-delete提供可恢复回收，执行器移到临时目录后卸载自身，避免文件锁。详情见[安装卸载说明](installation/README.md)。

## 生命周期与验证

画板桥/工作台/Forms/Experts通过官方Profile安装、启停、升级和卸载；源码改动要显式打包升级安装副本。光学后台由Web显式启动，Windows使用同环境pythonw静默运行，状态和脱敏日志在高级诊断；打开/轮询不连接Zemax，保存独立授权。

[Profile操作](profile-plugins.md) · [安装与数据](installation/README.md) · [实测摘要](../planning/STATUS.md) · [已确认决定](decisions.md) · [历史归档](archive/README.md)
