# 独立安装、升级与验证

本轮开发分支：`codex/platform-dev`。安装包不携带 Node、Python 或 Zemax。Node 24+ 是纯平台前置；光学能力另需 Python 3.12+、依赖和独立安装的 Zemax/许可证。未提供离线完整依赖包。

## 普通用户安装入口（dev.24）

解压用户安装包后，双击`安装optDSH.exe`即可，无需输入命令。顶层只有安装EXE、`使用说明.txt`和配套`_support/`资源目录；保持三者在一起，不必进入资源目录操作。向导在系统默认浏览器打开，分为位置/组件、环境检查、确认、进度和完成五步；复用下方CLI安装器，不另建安装事实源。缺少Node24+时明确提示先安装，不自动安装系统依赖。

EXE是使用Windows内置.NET与PowerShell5.1的薄启动器；本地向导随后用Node运行安装后端。安装器会联网下载声明依赖，当前并非自带完整运行环境的单文件离线安装包。开发用原始release目录含组件、脚本和验证材料，与上述用户包分开保存。

图形向导建议程序目录`%LOCALAPPDATA%/Programs/optDSH/<版本>`，资料默认`~/.optdsh`，首次课题可改为已有工作目录。程序必须放全新位置；升级先并排安装并保留原Home。为独立人工验收，建议使用新的测试Home，不复用正在写入的现役Home。

默认不修改全局.agents或用户PATH。向导仅本机回环监听，随机会话令牌校验请求来源；校验发布包哈希后才安装。错误保留日志及程序回执，不能把“安装完成”当作Zemax/模型业务已验。诊断在发行目录`logs/installer.log`及程序`.runtime`；不要上传包含账号信息的私人Home。

安装包包括公共光学Skills、PPT运行资源，选装Experts/Forms/Canvas/工作台按官方Profile管理。专家公共资料不含私人偏好或图片。Canvas可复用已有兼容安装，或在发行包携带编辑器tgz时单独新装。

dev.26起安装结束实际建立`<所选Home>/skills/<name>/SKILL.md`标准入口，受管链接指向随包资源；来源清单在Home/config/optdsh-skills.json。源码开发还建立源码.dsh/skills入口。可选Canvas/Forms跟随官方Profile状态，用户自定义同名入口保留。旧dev.25固定ZIP没有改写；当前dev.25核验现场已通过声明的Bundle0.2.0-dev.26/PPT0.2.2组件维护补齐此能力，不等同原始ZIP未经维护的行为。

## 本地产物与安装

在开发仓库运行 `npm run release:local -- <新的输出目录>`，生成本地tarball、SHA256清单、运行脚本与离线架构材料。许可证未确定，产物不代表公开发布。

构建者再运行`node scripts/maintenance/package-user-release.mjs <原始release目录> <新的用户包目录>`整理用户入口；此命令只供开发打包，普通用户不执行。下方命令用于开发/排障，用户正常安装使用图形向导。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <发布目录>/packaging/windows/install.ps1 -ReleaseRoot <发布目录> -InstallRoot <新的程序目录> -Home <独立资料目录> -Workspace <课题目录> -Components core -DryRun
# 核对计划后去掉 -DryRun 执行；联网下载官方DSH及所选插件的声明依赖。
<程序目录>/optdsh.exe --workspace <任意课题目录>
```

安装后可直接双击程序目录的optdsh.exe，编辑外置optdsh-launcher.json选择课题/资料/端口/插件；配置不含密钥。EXE与CMD共用Node入口，Windows辅助使用内置5.1，无需另装PowerShell7；Node24仍由用户准备。当前EXE为本地测试产物，未签名/公开发布，沙箱及公司实机待验。

显式选装可传 `-Components core,workbench,canvas,forms`。core无Python/Canvas/私人中心依赖；工作台和画板服务仍须单独准备。Experts可选装官方Preset和公共基线，不包含私人资源。推荐市场插件见发布包内的推荐清单，不自动启用历史disabled项，也不继承旧版兼容豁免。

## 数据布局与回退

程序目录可整体替换，用户目录包含官方 `profiles/`、`sessions/` 与 `state/<profile>/`；课题内容及 `.agent-canvas/` 跟随workspace。旧 `data/dsh` 不会自动搬迁。升级先并排安装，完成隔离验证；切换同一home前停止旧版写入并留存备份，禁止两个版本同时写同一profile。

开发源码与安装版分别管理依赖和Profile；源码修改不会自动升级已安装的插件。隔离验收与日常实例分别记录。

## 卸载与永久保留的数据（dev.24）

当前optDSH采用目录部署：安装器不登记Windows服务、开机任务或“应用和功能”卸载项；后台是启动器拉起的普通进程。默认不改用户PATH，只有显式`-AddToUserPath`才添加程序路径。不要把这一点套用到独立官方DeepSeek Harness桌面版，它有自己的Windows安装/卸载注册，与本项目验证包分开管理。

因此，在先停止属于本安装的进程、确认程序与数据分离且没有PATH登记之后，回收准确的InstallRoot可移除主程序；这不会连带移除Home/Profile中的插件或独立Canvas。仍推荐随包卸载入口，它会核验归属、停止自己的Host、处理所选项及自己登记的PATH，并记录回执。不能删除整个验证case、Home或课题来代替卸载；Node、Python与Zemax等共享运行环境也不随主程序卸载。

安装目录中的`卸载optDSH.exe`打开路径选择向导（备用CMD）。主程序、已安装的自有Profile插件、运行日志分别可选；默认仅选主程序。界面先展示实际路径与共用Profile影响，再最终确认。若Node已被移除，提供原生确认的仅主程序卸载后备入口。

**课题目录永远不在卸载范围，也没有删除选项。** Home配置/账号/会话、课题模型/画板/运行结果、全局.agents、独立AgentCanvas均保留。未勾选插件继续保留在Home/Profile；勾选插件只通过官方管理器移除，可能影响共用该Profile的其他安装。日志选项只回收明确的服务日志目录。

执行器独立核验安装回执与全部已登记课题路径；目录重叠或程序根存在未登记用户文件时拒绝整目录回收。确认后只停止能够核验属于本安装的Host，不停止其他实例。回收调用随包safe-delete脚本，目标机无需另装全局Skill；回收映射留在同盘`.safe-delete-trash`，卸载回执在Home/.runtime/uninstall，用户数据不永久删除。

CLI默认预览：`powershell.exe -File packaging/windows/uninstall.ps1 -InstallRoot <程序目录>`；明确`-Apply -Items program,logs -StopRunning`才处理所选项。插件项为`plugin:canvas/workbench/forms/experts`中的具体一个或多个，不能传入任意删除路径。

## 端口检查与安装记录

首选端口为Web3080、独立Canvas4173、光学HTTP3081、PPT3314。安装前探测，安装过程中再次检查并自动避开冲突；不停止占用者。同一已核验Canvas安装的服务可以复用，其他安装或未知服务不能接管。正在使用的Home拒绝并行安装，验证时应选独立Home。

最终分配保存于程序`PORTS.md`、Home/config/ports.json和installation-receipt.json；Forms、Experts、画板桥及工作台界面共享Web端口。向导/卸载页面自身使用操作系统分配的临时端口，不是常驻模块。端口表区分已配置待启动与已核验复用；启动时仍做实际身份/占用检查，不把预检当作长期占用保证。

## 验收状态

沙箱/持久VM/公司环境暂缓；仓库外tarball/wheel及离线测试另见当前状态。18版适配目标不等于已支持；2023+也须逐版本回读与真实业务验证。真实数据迁移、公开许可证、模型/光学业务与最终服务切换均未以离线检查替代。

## 全局调用与光学依赖

安装时显式添加 `-AddToUserPath` 可登记用户PATH，随后新终端在任意课题目录执行 `optdsh`；本轮未在开发机登记PATH，此选项未实改全局验证。无需复制平台到课题。卸载时先预览并保留用户资料。

光学wheel可作为export-release第二个参数纳入清单：`node scripts/maintenance/export-release.mjs <新输出目录> <wheel路径>`。选装Python环境使用包内 `packaging/windows/install-optics.ps1 -Wheel <wheel> -EnvironmentRoot <新的venv目录>`，按锁联网安装依赖；早期下载尝试曾取消；2026-10-18新工作树续轮已在仓库外新建Python环境完整安装锁定依赖和wheel，pip check、隔离导入与synthetic服务通过。沙箱、公司新机和真实Zemax仍未验证，详见重构工作树迁移记录。

安装推荐市场组件前执行 `install-profile-plugins.ps1` 预览；`-Names` 指定选择，`-Apply`才调用官方profile包管理器。disabled项保留不启用，旧版豁免不继承；新版本兼容拒绝必须先处理。11项快照不等于已全部验证。

全新Profile单独安装自有插件时，先通过官方profile包管理器显式安装 `@deepseek-ai/cordis@4.0.5`。实际独立工作台安装曾缺此peer而被预检关闭，补齐后通过；现有app依赖成功不能代替Profile安装验证。

## 安装时自动装市场与推荐插件

主安装器支持-PluginPreset none、market、recommended。默认none保留纯平台；market只装dshmarket；recommended按包内plugins.snapshot.json安装当前推荐的8项（包含市场）。首次选择后无需逐个搜索。图形向导已复用此后端，仍保留CLI入口。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <发布目录>/packaging/windows/install.ps1 -ReleaseRoot <发布目录> -InstallRoot <新程序目录> -Home <用户资料目录> -Workspace <课题目录> -PluginPreset recommended
```

推荐清单及其SHA256属于发布版本，不追随开发机所有临时安装项。联网下载使用产品自带pnpm及官方DSH Profile流程，不复制开发机node_modules、账号、密钥和会话。原禁用项不自动开启，用户已有版本和启用状态不被推荐清单覆盖，额外插件不删除。

community-plugins-receipt.json区分installed、existing-preserved、failed与not-attempted；安装成功不等于运行验证成功。若中途失败，总安装器报未完成，保留已装程序、用户Home和.runtime/community-install.log，安装回执带coreInstalled和communityPluginStatus供排查。升级始终选择既有Home并先结束其活动写入；不在每次平台启动时重装推荐项。

2026-10-18独立安装验收：dev.3测试包在仓库外新建程序/Home完成recommended自动安装，8项active、8客户端HTTP200、市场pnpm=true、运行构建身份匹配，测试Host退出。复用下载缓存，不等于冷网络或新机器验收；未验证全部插件交互。证据：[dev.3回执](../verification/refactor-20261018/recommended-plugins-dev3.json)。失败后先查回执和日志，停止该Home写入，再用install-profile-plugins.ps1显式选择修复；主安装器不会覆盖已有程序目录。

## 可选独立画板编辑器

CanvasRoot复用已有兼容安装；InstallCanvas＋CanvasInstallRoot安装发行清单携带的本地tgz。连接配置在Home，选择canvas时按需启动；现役旧服务或端口冲突不接管。完整命令、数据归属和旧版本限制见[画板安装接入](canvas.md)。

## 画板桥的官方Profile生命周期

从dev.7起，选择canvas时桥包只安装到官方Profile，app不再带同名运行依赖。已有/新装独立编辑器的接入不变；二者是不同包。启停/卸载在官方插件管理操作，升级用停服后的本地tgz；开发源码不自动覆盖安装副本。完整目录与命令见[Profile插件说明](../profile-plugins.md)。

## 工作台Profile安装

选装workbench与canvas使用相同官方机制，两包都不作为app依赖。包装脚本增加Component=workbench，默认canvas保持兼容；主安装器支持两者分别或一起安装，分别回执。工作台不要求Python/画板/Forms，光学执行器后续显式配置。详见[Profile插件](../profile-plugins.md)。

### 经验库的源码、安装和分享位置

源码权威为仓库`.experience/`，由Git同步。dev.27起，发行包携带`.experience/`原文及`experience-manifest.json`；安装时将可分享Markdown校验后复制到`<DSH_HOME>/.experience/`，记录在`Home/config/experience-installation.json`。安装副本保留用户修改与新增，卸载程序时保留。相关产品任务由官方systemPrompt服务提示读取索引，源码指向仓库，安装版指向Home。它不是Skills发现根，也不是AGENTS或专家Preset；原始run、模型、凭据及会话不随库分享。
