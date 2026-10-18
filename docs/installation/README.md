# 独立安装、升级与验证

本轮开发分支：`codex/platform-dev`。安装包不携带 Node、Python 或 Zemax。Node 24 是纯平台前置；光学能力另需 Python 3.12+、依赖和独立安装的 Zemax/许可证。未提供离线完整依赖包。

## 本地产物与安装

在开发仓库运行 `npm run release:local -- <新的输出目录>`，生成本地tarball、SHA256清单、运行脚本与离线架构材料。许可证未确定，产物不代表公开发布。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <发布目录>/packaging/windows/install.ps1 -ReleaseRoot <发布目录> -InstallRoot <新的程序目录> -Home <独立资料目录> -Workspace <课题目录> -Components core -DryRun
# 核对计划后去掉 -DryRun 执行；联网下载官方DSH及所选插件的声明依赖。
<程序目录>/optdsh.exe --workspace <任意课题目录>
```

安装后可直接双击程序目录的optdsh.exe，编辑外置optdsh-launcher.json选择课题/资料/端口/插件；配置不含密钥。EXE与CMD共用Node入口，Windows辅助使用内置5.1，无需另装PowerShell7；Node24仍由用户准备。当前EXE为本地测试产物，未签名/公开发布，沙箱及公司实机待验。

显式选装可传 `-Components core,workbench,canvas,forms`。core无Python/Canvas/私人中心依赖；工作台和画板服务仍须单独准备。专家插件未包含私人资源，默认不选；公共资源独立发行尚需核验。推荐市场插件见发布包内的推荐清单，不自动启用历史disabled项，也不继承旧版兼容豁免。

## 数据布局与回退

程序目录可整体替换，用户目录包含官方 `profiles/`、`sessions/` 与 `state/<profile>/`；课题内容及 `.agent-canvas/` 跟随workspace。旧 `data/dsh` 不会自动搬迁。升级先并排安装，完成隔离验证；切换同一home前停止旧版写入并留存备份，禁止两个版本同时写同一profile。

当前本机root依赖声明/锁升级为DSH 0.2.1-rc.2；现役node_modules与3080服务暂不更换。隔离测试与现役加载分别记录。

卸载脚本默认预览，只接受带安装回执的程序根并保留home/workspace。实际回收使用safe-delete；目标机若未安装该技能，脚本拒绝并保留程序，不作永久删除。

## 验收状态

沙箱/持久VM/公司环境暂缓；仓库外tarball/wheel及离线测试另见当前状态。18版适配目标不等于已支持；2023+也须逐版本回读与真实业务验证。真实数据迁移、公开许可证、模型/光学业务与最终服务切换均未以离线检查替代。

## 全局调用与光学依赖

安装时显式添加 `-AddToUserPath` 可登记用户PATH，随后新终端在任意课题目录执行 `optdsh`；本轮未在开发机登记PATH，此选项未实改全局验证。无需复制平台到课题。卸载时先预览并保留用户资料。

光学wheel可作为export-release第二个参数纳入清单：`node scripts/maintenance/export-release.mjs <新输出目录> <wheel路径>`。选装Python环境使用包内 `packaging/windows/install-optics.ps1 -Wheel <wheel> -EnvironmentRoot <新的venv目录>`，按锁联网安装依赖；早期下载尝试曾取消；2026-10-18新工作树续轮已在仓库外新建Python环境完整安装锁定依赖和wheel，pip check、隔离导入与synthetic服务通过。沙箱、公司新机和真实Zemax仍未验证，详见重构工作树迁移记录。

安装推荐市场组件前执行 `install-profile-plugins.ps1` 预览；`-Names` 指定选择，`-Apply`才调用官方profile包管理器。disabled项保留不启用，旧版豁免不继承；新版本兼容拒绝必须先处理。11项快照不等于已全部验证。

全新Profile单独安装自有插件时，先通过官方profile包管理器显式安装 `@deepseek-ai/cordis@4.0.5`。实际独立工作台安装曾缺此peer而被预检关闭，补齐后通过；现有app依赖成功不能代替Profile安装验证。
