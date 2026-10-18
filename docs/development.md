# 开发、发布与安装验证目录

本机采用同一Git仓库的两个工作树。旧目录保留现场，新工作树继续重构；发布包和安装测试独立于源码目录。

| 角色 | 本机位置 | 边界 |
|---|---|---|
| 原现场 | `E:/Proj-2026-N06_optDSH` | 保留旧依赖、资料与历史输入，不因新开发切换分支或重启服务 |
| 开发工作树 | `E:/Proj-2026-N06_optDSH-dev` | 后续正式源码修改、独立安装开发依赖；与原现场共享Git对象库 |
| 发布产物 | `E:/Proj-2026-N06_optDSH-releases` | 每次构建使用新子目录，保存tarball/wheel、哈希、离线说明 |
| 安装验证 | `E:/Proj-2026-N06_optDSH-validation` | 每次用新case，独立app/home/workspace及可选Python环境，不借源码依赖 |

本机路径是开发布置，不进入产品的默认运行路径；实际用户资料仍由Home/Workspace参数决定。Windows沙箱暂缓；本机分目录测试不冒充操作系统隔离。

## 新工作树准备

```powershell
pwsh scripts/maintenance/bootstrap-dev.ps1
py -3.12 scripts/maintenance/prepare-dev-resources.py
pwsh scripts/setup.ps1
# 选装光学开发依赖：pwsh scripts/setup.ps1 -WithOptics
```

`bootstrap-dev`只建立本机开发引用，不改用户中心源。专家权威、私人资料不再作为项目源码重复跟踪；相关本机链接被Git忽略。缺少用户中心时可运行纯平台和安装产物测试，专家资源与完整开发文档检查需先恢复相应中心。

依赖重新安装，不复制旧node_modules或.venv；安装器不要求终端具有私人专家中心。项目保留的专家分发器用于开发兼容与测试，不是新的专家权威。

## 工作树及回退

当前工作树和分支用 `git worktree list` 核对；在新开发目录提交只更新其分支，原目录的文件不会自动变化。本地提交/标签不等于推送，未经用户授权不推送。不要删除原目录的.git；新工作树依赖共用对象库。现役用户资料、未跟踪商业模型和历史run不由Git回退，需要单独保留。

正式发放只取构建产物，不压缩整个开发目录。源码、公共资源及许可证和发布许可是不同检查项。

开发资源准备使用用户中心分发器的白名单读取能力，只写Git忽略的本机参考包，不分发宿主角色/hook或修改中心。当前全局Node若不是24.x，请在该终端选择已安装的Node24；不要修改全局Node来适配单个项目。

## 可重复安装验收

`packaging/windows/verify-installation.ps1 -ReleaseRoot <本地产物> -ValidationRoot <验证根下全新case> -Components core,workbench,canvas,forms`：使用独立app/home/workspace和npm-cache，执行安装、认证与所选能力/client脚本检查，最后仅停止本次身份匹配的服务。默认不发模型请求、不接Zemax。失败保留回执和私有日志；不在控制台打印令牌，默认-DryRun可先查看路径方案。

原现场以本地checkpoint保存；恢复旧提交不等于恢复未跟踪用户数据。回退标签与快照位置见实施计划。用户中心仍被多个项目共用，普通项目重构不能修改这些链接的目标。

完整回归包括独立PPT模块，该模块有自己的依赖锁；需另行在packages/ppt-slidewise执行npm ci。根npm ci只安装平台工作区，不应误认为已安装所有可选包。纯平台安装不要求PPT。

源码根不再跟踪或创建STUDYS；真实课题外置，示例只归包examples/tests，详见[课题与源码边界](workspaces.md)。[Agent资源共享设计](agent-resource-layout.md)已获用户确认；公共基线和可选共享的完整实现仍待做，当前不改写本机全局.agents。

## 沙箱未启用时，如何亲自验证新版

分目录验证能发现漏打包、缺依赖、工作目录写错和启动故障；仍共享本机操作系统、注册表、网络与已装软件，因此不能证明公司新机必定可用。

| 验证层 | 入口 | 主要确认 |
|---|---|---|
| 源码验证 | 新开发目录的启动器 | 最新源码能否启动、改动是否正确 |
| 安装包验证 | 002 case的app启动器 | 脱离源码后是否漏文件/依赖；自动验收会停止自己的服务 |
| 人工业务验收 | 独立手动预览home和合成workspace | 浏览器操作、模型配置、会话和插件实际交互 |
| 沙箱/公司环境 | 后续单独安排 | 干净Windows、权限/网络/许可及真实宿主差异 |

### 日常一键启动源码版（当前推荐）

在资源管理器打开 E:/Proj-2026-N06_optDSH-dev，双击根目录的启动DSH.cmd即可。当前开发机的忽略配置已准备好：自动选择已有Node24，使用manual-preview/source-home、测试workspace、独立source-state及3380端口，默认只启动core，不需要手填参数。再次双击会复用通过身份和认证检查的现有预览服务并打开浏览器。

这是新开发目录的本机配置，不进入发布包，也不改全局PATH或用户.agents。旧目录启动器保持原样。完整光学工作台仍需单独完成光学服务配置，不能把纯平台的一键启动当作全部业务验收。

### 高级手动参数（排查或切换课题时使用）

打开PowerShell，执行以下命令。本机默认Node26不在当前要求范围，下面只为该终端选择已存在的Node24，不改用户PATH；.runtime/development.json是本机忽略的开发记录。

```powershell
Set-Location E:/Proj-2026-N06_optDSH-dev
$nodeExe = (Get-Content .runtime/development.json -Raw | ConvertFrom-Json).nodeExecutable
$env:PATH = (Split-Path $nodeExe -Parent) + ';' + $env:PATH
./启动DSH.cmd -Home E:/Proj-2026-N06_optDSH-validation/manual-preview/source-home -Workspace E:/Proj-2026-N06_optDSH-validation/manual-preview/workspace -StateRoot E:/Proj-2026-N06_optDSH-validation/manual-preview/source-state -Port 3380 -Components core
```

预览目录已由本轮检查准备，workspace只有合成/测试内容，未复制真实课题。启动器会按系统默认浏览器打开认证入口；不要仅手打localhost地址代替首次认证。主入口为http://127.0.0.1:3380，认证链接和令牌不粘贴到报告或聊天。

该命令启动纯平台。新home内没有复制旧模型配置、密钥、市场插件和历史会话，需要在新版界面配置自己的模型后再手动测试对话；本轮未代发真实模型请求。重新运行同一命令可打开已启动且身份匹配的服务。关闭浏览器不等于停止后台服务。

停止本次源码预览：

```powershell
./scripts/runtime/stop-dsh.ps1 -Home E:/Proj-2026-N06_optDSH-validation/manual-preview/source-home -Workspace E:/Proj-2026-N06_optDSH-validation/manual-preview/workspace -StateRoot E:/Proj-2026-N06_optDSH-validation/manual-preview/source-state -Port 3380
```

切换研究目录前先结束预览任务并停服务，再修改-Workspace重启；不要复用同一个运行实例的旧workspace状态。当前Forms HTTP还不能按所有会话cwd自动切换。

### 再对比安装包版

保留上面终端的Node24选择，在源码根调用已验证的002安装目录：

```powershell
& E:/Proj-2026-N06_optDSH-validation/20261018-workspace-full-002/app/scripts/runtime/open-dsh.ps1 -Home E:/Proj-2026-N06_optDSH-validation/manual-preview/installed-home -Workspace E:/Proj-2026-N06_optDSH-validation/manual-preview/workspace -StateRoot E:/Proj-2026-N06_optDSH-validation/manual-preview/installed-state -Port 3382 -Components core
```

安装版固定于提交1e273cb，不会随源码改动自动更新；新的改动须重新打包、在新的case安装。这里只借用已安装app，人工数据写入manual-preview，不改写自动验收case的home/workspace证据。停止时调用同一app下的stop-dsh.ps1并传相同Home/Workspace/StateRoot/Port。

### 建议依次检查什么

1. 纯平台：页面加载、创建会话、刷新后仍能读回；手动配置模型后测试一次简单对话和合成文件读取。
2. 课题归属：在合成workspace写一个测试文件，确认它落在所选目录；之后换另一个测试目录重复检查。
3. 插件：停止纯平台后在源码启动命令中把-Components改为core,workbench,canvas,forms；分别检查入口和故障提示。组件ready只证明加载，不等于完整业务通过。
4. 画板仍需N05编辑器服务，光学工作台需独立光学服务；当前没有自动启动它们，也不因页面打开就宣称Zemax/画板编辑通过。缺少服务时先检查明确的连接提示，真实Zemax另行授权验收。

本轮机器检查只启动并停止两种纯平台预览，核对认证HTTP200；没有打开浏览器、配置模型、调用Zemax或改写用户全局.agents。离线完整回归和四组件安装证据见[迁移记录](refactor/2026-10-18/worktree-transition.md)。

## Windows发布入口：已确认Q9

面向小白，推荐开发期保留.cmd，正式发行提供薄EXE启动器；业务/启动编排复用Node CLI，路径、组件和版本等配置外置，避免把业务逻辑编译进EXE。用户已确认采用该方案，实施与验证状态见[薄启动器计划](../.agents/plans/261018-windows-thin-launcher.md)。

开发根目录CMD仍可使用本机已有pwsh；发布EXE/CMD共用Node入口，运行链已适配Windows内置5.1，包括JSON读取、路径和UTF8处理。无需要求普通用户另装7；不能把同机移除pwsh搜索路径的成功当作沙箱或干净Windows成功。
