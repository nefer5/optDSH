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
