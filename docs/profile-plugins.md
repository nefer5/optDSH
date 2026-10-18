# 插件源码、安装与官方Profile

当前Canvas桥与光学工作台均按下述官方Profile机制管理；Forms/专家等其他可选组件继续逐项收敛。

## 目录位置

```text
开发源码/
  plugins/optdsh-agent-canvas/        画板桥源码
  plugins/optdsh-workbench/           工作台源码
发行包/
  packages/optdsh-agent-canvas-0.6.0.tgz
平台程序/
  node_modules/@deepseek-ai/         官方DSH和基础依赖
  node_modules/optdsh-bundle/        推荐、默认与平台引导
Home/
  profiles/web/
    package.json                    依赖及dsh.profile.bundles
    pnpm-lock.yaml                  官方包管理器锁
    cordis.patch.yml                用户启停及配置覆盖
    node_modules/optdsh-agent-canvas/ 画板安装副本
    node_modules/optdsh-workbench/    工作台安装副本（pnpm可能使用链接）
  config/canvas.json                独立编辑器连接默认
任意课题/
  .agent-canvas/optdsh/boards/        画板、提交及建议稿
```

源码目录与安装目录不同，包内lib等相对结构保留；package.json files决定内容，npm/pnpm搬运与依赖解析，不逐文件自定义复制。安装副本不从旧平台、源码checkout或app同名包回退。

## 用户操作

- 新装平台时选择canvas组件：安装器把发行tgz通过官方CLI登记到所选Home/Profile；app依赖不含画板桥。
- 后续在官方Web的“插件”管理中停用/启用或卸载画板桥；Bundle停用保留包，单插件停用保留配置，卸载移除包依赖。
- 启动器读取官方合成后的配置，不安装插件，不强行加入Bundle，不用components覆盖用户关停。即使旧components仍含canvas，卸载后也不会回来。
- 画板编辑器是独立程序，和桥插件分开；停用/卸载桥不终止共享编辑器、不删除课题画板。没有运行的编辑器可用原独立入口启动，或启用桥后重启DSH按Home配置拉起；不承诺任意外部服务在HMR启用时自动启动。
- Canvas与工作台已收敛；Forms等其他自有组件仍处过渡阶段，不能说已经全部统一。

## 本地包安装与升级

官方CLI支持本地tgz，不要求公开npm或市场。平台包内便捷脚本只转发官方流程和写事实回执，不另造启停数据库。

```powershell
# 先停止同一Home/Profile的活动任务和服务；预览默认不写
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/windows/install-profile-component.ps1 -InstallRoot <平台程序> -Home <资料目录> -Package <画板桥tgz> -Operation Install
# 确认参数后加-Apply。升级显式改为-Operation Upgrade；卸载用-Operation Remove（无需Package）。
```

Install遇到既有依赖保持原版本/开关，不重复默认启用。Upgrade调用官方CLI add新tgz，保留未选Bundle和disabled patch。当前官方在线原位升级受HMR接口限制，采用停服后的CLI升级，不伪称在线热升级。运行中的Profile拒绝离线包操作；命令失败保留原资料和回执，不能只凭HTTP200判断实际效果。

## 开发步骤

画板桥与工作台源码保留plugins目录，但从根workspaces的隐式安装列表中移出，避免官方优先解析app副本、盖住Profile版本。源码变化需要显式npm pack、停止测试Profile、通过上述Upgrade安装，然后启动验证；单纯重启不会偷偷重装或把用户停用项打开。根npm install/ci按声明维护安装树，无手改node_modules适配。

## 配置与组合

官方顺序：Bundle默认 → Profile覆盖 → Home覆盖 → 启动覆盖。Canvas的产品启动覆盖不insert/enable或重写用户配置，只在已启用但编辑器不兼容时隔离对应桥，core继续。Profile显式editorUrl优先于Home连接默认；对应外部服务由该配置的使用者管理。

Bundle推荐不等于强制依赖或周期重放。Profile是包、选中Bundle与用户patch的唯一事实源；平台状态接口只是回读，不是另一套开关。具体画板安装见[编辑器安装说明](refactor/2026-10-18/canvas-installation.md)。

## 本轮验收

最终dev.8本地测试包与日常预览已验证；Canvas桥0.6.0在官方清单中availability=profile、removable=true，app无同名包。官方entry/Bundle停用、重启保留、停服升级测试夹具后仍off、再启用与卸载重启全部通过；画板哈希不变。PS5首次Profile stderr提示按退出码处理，日志保留。无真实模型或Zemax调用，缓存复用，未推送/npm公开。证据：[生命周期回执](refactor/2026-10-18/evidence/canvas-profile-dev8.json)。

## 光学工作台

工作台使用同一helper，添加 `-Component workbench`，包名optdsh-workbench。主安装器选择workbench时通过官方CLI装入Profile，不作为app依赖。停止同一Profile后显式Upgrade；Web插件管理可启停/卸载。源码改动先pack插件再显式升级，普通启动不覆盖用户开关。

根“启动光学工作台.cmd”使用Windows自带PowerShell5.1，默认只打开已启用的工作台；缺包/停用会给诊断，基础DSH可用，不自动重新安装或启用。光学执行器独立管理，明确传StartOptics才请求启动，当前重构没有执行该选项或真实Zemax连接。没有Python/画板/Forms仍能加载页面及管理会话；访问光学能力时未配置/不通返回503 OPTICS_UNAVAILABLE，真实业务403/409继续拒绝。

停用/卸载工作台撤销其给绑定Agent注入的光学规则，保留历史会话、绑定文件、报告和课题。无光学服务与不兼容/损坏包的隔离均已取证，不能把synthetic视为真实光学验收。

共享官方SDK应声明宿主peer，不作为插件私有运行依赖重复放进Profile；工作台0.9.2已按此修正dsh-llm。否则卸载可能移除进程正在使用的共享库，使文件删除后官方热重载仍报failed。验收要求检查application结果与重启状态，不能只看包目录消失。

## 工作台本轮验收

最终平台dev.11、工作台0.9.2。独立Profile无Canvas/Forms可加载，缺后端503不影响core；官方启停、停服升级保留off、卸载applied及重启无回流、数据保护通过。实际发行包卸载后core即时保持ready；日常预览保留。前两候选的共享SDK打包问题已修，不把当时application=failed当作成功。最终58工作台/98安装项回归通过（光学等其余完整回归此前通过），无真实Zemax/模型调用。见[工作台证据](refactor/2026-10-18/evidence/workbench-profile-dev11.json)。
