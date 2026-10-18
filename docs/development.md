# 开发、交付与验证

## 本机目录分工

| 目录 | 用途 | Git/发布关系 |
|---|---|---|
| E:/Proj-2026-N06_optDSH-dev | 新开发工作树，codex/platform-dev | 从这里提交并推送受跟踪源码/测试/文档 |
| E:/.optdsh-source | 日常源码版唯一DSH_HOME；状态在state/web | 不进Git，不放validation；保留会话、模型配置和用户数据 |
| E:/Proj-2026-N06_optDSH | 保留原现场 | 与新工作树共用Git对象库，不随意删除.git |
| E:/Proj-2026-N06_optDSH-releases | 每个版本的不可变tgz/wheel/EXE/文档/SHA | 不整体提交Git，选定产物供Release附件 |
| E:/Proj-2026-N06_optDSH-validation | 只用于安装核验：当前核验、历史记录、临时测试 | 不放日常开发版Home；现场不推送 |

这些是本机开发布置，产品不硬编码这些路径。真实课题外置，不在源码区建STUDYS。

### 固定目录规则

- 以上已确认根目录复用；源码版Home迁入用户明确指定的E:/.optdsh-source是本轮授权的布局修正。不得再创建其他delivery/validation平行根；确需调整先与用户确认。
- 发布区：`<版本>/`存固定原始构建；`<版本>-user/`存解压后的用户包；`optDSH-<版本>.zip`及其`.sha256`为可上传附件。例如本次`0.2.0-dev.25/`、`0.2.0-dev.25-user/`与`optDSH-0.2.0-dev.25.zip`均在同一个releases根内。
- 验证区：`当前核验/dev.25/{program,home,workspace,canvas-editor}`供人工核验；旧case与其数据/回执归`历史记录/安装批次`，自动测试记录归`历史记录/自动测试`。测试只写`临时测试/<suite>/<run-id>`，批次退出归档并可恢复回收，不再在根目录生成unit-UUID。真实课题不归拢进这里。
- 构建原件和ZIP不可覆盖；发现问题使用新版本。移动产物时校验SHA256；验证程序移动前停止本次实例，修正当前启动配置后重新验证。历史会话/日志/回执中的原地址保留，另记路径映射。
- 本机这两个产物目录不执行`git init`，不作为新分支或新源码仓库。Git管理源码、版本声明、构建脚本、说明和脱敏验收摘要；ZIP/EXE用GitHub Release附件保存，验证现场不上传。
- 安装验证不得无限累积程序副本：阶段结束清点实际app及运行实例，默认只保留最新人工核验安装，额外回退程序须说明保留目的。旧程序及可重建依赖列入可恢复回收清单，Home、课题、模型、画板、结果与证据分别保留；不能把整个case当旧程序删除。并排安装用于隔离验证，不表示安装器会自动卸载历史版本。

2026-10-19再次收尾：251个旧unit目录及源码temp/forms-tests均归档校验后回收；28个历史case与旧发行物分别归位。验证根的“启动 dev.25 安装核验”快捷方式直达当前program。当前路径与验证证据见[本轮回执](verification/source-home-skills-20261019.md)，历史回执保留当时地址，以迁移映射定位。

### 官方Skills标准入口

| 场景 | 实际发现入口 | 实体 |
|---|---|---|
| 在源码目录使用 | `E:/Proj-2026-N06_optDSH-dev/.dsh/skills/<name>/SKILL.md` | 所属packages/plugins源码，通过受管链接引用 |
| 源码版在其他课题使用 | `E:/.optdsh-source/skills/<name>/SKILL.md` | 同一源码实体，保留当前源码编辑 |
| 当前安装核验版 | `E:/Proj-2026-N06_optDSH-validation/当前核验/dev.25/home/skills/<name>/SKILL.md` | 已安装程序/官方Profile中的资源 |
| 普通用户新安装 | `<所选DSH_HOME>/skills/<name>/SKILL.md` | 安装器随包建立入口；默认Home仍是用户~/.optdsh |

产品实体不复制两份；官方文件系统Provider发现标准入口，同名用户入口保留。来源清单在Home/config/optdsh-skills.json，源码投影清单在.dsh/optdsh-skills.json。可选Canvas/Forms受官方Profile状态控制，停用/卸载时只撤下受管链接，目标内容和用户Skill保留。历史链接对象在清单旁的skill-link-history保存，不在skills根铺临时目录。全局.agents不改写。

### 分支与STUDYS

一个工作树当前只检出一个分支：本目录为codex/platform-dev。旧目录检出codex/platform-plugin-refactor并保留原现场；它是当前开发分支祖先，内容已包含，不是待二次合并的独立重构成果。main尚未吸收当前开发改动，本轮不自动合并/推送。

开发源码根不含真实STUDYS。曾看到的源码temp/forms-tests下STUDYS由旧路径只读兼容测试生成，已归档回收；该测试现使用外部临时批次并退出收尾。原工作树的STUDYS属于保留现场，不作为当前开发课题入口，本轮不移动或清理。

## 开发与验证入口

安装根依赖执行npm ci；可选PPT有独立锁文件，按该模块说明准备。纯平台不依赖个人专家中心；光学能力单独安装Python依赖和本项目wheel。开发资源bootstrap只恢复本机开发引用，不修改中心权威源。

日常双击“启动DSH.cmd”；平台源码变化用“重启DSH.cmd”。画板桥/工作台从Profile运行，修改源码后先npm pack再显式Upgrade，见[插件说明](profile-plugins.md)。本机预览配置以.runtime/preview.json为准：当前使用外部2T2R课题和source-home/source-state，模型/插件已迁入配置，不能沿用早期“全新空Home”描述。

```powershell
npm test
npm run version:check
npm run release:check
# 干净本地提交后，输出必须是全新目录
npm run release:local -- <新产物目录> <可选optics-wheel> <可选AgentCanvas-tgz>
```

必要检查按变更范围执行，不自动跑tests/live、真实模型推理、Zemax追迹或保存。验证发布物用packaging/windows/verify-installation.ps1，指定独立的ValidationRoot；它只管理本次身份匹配的进程，凭据和原始日志留本机。

## 四层验证

1. 源码/模块测试：逻辑及协议回归，合成服务不能当作真实Zemax验收。
2. 仓库外安装：独立程序、Home、缓存和Python环境，检查漏文件/依赖、构建身份和插件组合。
3. 真实产品验收：官方会话、实际模型、独立编辑器、Zemax，按授权分别记录。
4. 干净Windows/公司环境：操作系统、权限、网络、许可证与部署恢复；当前暂缓。

分目录测试共享开发机操作系统，不代表沙箱/新机通过。[剩余事项与配合](../planning/ROADMAP.md)和[Windows验证方案](installation/windows-validation.md)是后续入口。

### 日常反馈与安装验收分开

| 变更 | 日常检查 | 何时做完整安装 |
|---|---|---|
| 文案/规则 | 文档检查与受影响页面复核 | 不因纯文案重装 |
| 产品逻辑/界面 | 相关模块测试；`npm run test:quick`覆盖产品逻辑、模拟UI及项目检查 | 使用现有开发预览或验证安装做实际交互；Profile插件改动须显式打包升级 |
| 安装器/依赖/资源布局/运行启动 | 对应安装回归＋实际路径/端口/权限核验 | 做新的独立安装case，不复用旧node_modules冒充全新安装 |
| 准备交付新版本 | 完整`npm test`＋固定源构建 | 完整用户包EXE安装、启动、必要生命周期验收；使用前先人工核验 |

快速入口跳过整组安装交付测试和开发专家分发/架构kit测试，不能代替发布门禁；`npm test`仍执行原完整集合。相关开发工具本身变化时单独运行它们的测试，不能只跑quick。已有测试在代码未再变化时不重复跑；后续文档提交不要求反复重建同一版本包。

2026-10-19现场基线：新目录npm依赖安装约73秒；完整各测试组累计约98秒，其中安装组约48秒、开发专家工具两组约40秒。耗时随机器/缓存变化，新增quick入口本次实测12.47秒通过，记录见[清理与验证回执](verification/old-install-cleanup-20261019.md)；共享下载缓存可减少网络，但不能省去每个新目录重建依赖文件的成本。完整安装器当前仍为全量安装，未实现依赖层镜像或增量安装。

## GitHub放什么

Git推送提交和分支，不上传整个开发文件夹。node_modules/.venv/私人Home/模型/日志/真实课题不进入提交。当前源码远程为https://github.com/nefer5/optDSH.git；本机目录改名不改变它。用户已授权本轮验证通过后快进合入main，并推送main、开发分支与固定构建标签。正式安装包另作GitHub Release附件，不把整个releases目录放进源码树。

本轮代码与文档已本地提交；是否推送源码、推送版本标签或发布Release分别按用户授权执行，不把询问操作方法当作上传授权。具体命令与标签规则见[版本与发布](versioning.md)。

### 经验库的源码、安装和分享位置

源码权威为仓库`.experience/`，由Git同步。dev.27起，发行包携带`.experience/`原文及`experience-manifest.json`；安装时将可分享Markdown校验后复制到`<DSH_HOME>/.experience/`，记录在`Home/config/experience-installation.json`。安装副本保留用户修改与新增，卸载程序时保留。相关产品任务由官方systemPrompt服务提示读取索引，源码指向仓库，安装版指向Home。它不是Skills发现根，也不是AGENTS或专家Preset；原始run、模型、凭据及会话不随库分享。
