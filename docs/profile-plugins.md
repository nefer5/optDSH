# 插件源码、安装与官方Profile

## 目录位置

```text
开发源码/
  plugins/optdsh-agent-canvas/        手写实现、package.json、tests
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
    node_modules/optdsh-agent-canvas/ 安装副本（pnpm可能使用链接）
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
- 当前先收敛Canvas；工作台、Forms等其他自有组件仍处过渡阶段，不能说已经全部统一。

## 本地包安装与升级

官方CLI支持本地tgz，不要求公开npm或市场。平台包内便捷脚本只转发官方流程和写事实回执，不另造启停数据库。

```powershell
# 先停止同一Home/Profile的活动任务和服务；预览默认不写
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/windows/install-profile-component.ps1 -InstallRoot <平台程序> -Home <资料目录> -Package <画板桥tgz> -Operation Install
# 确认参数后加-Apply。升级显式改为-Operation Upgrade；卸载用-Operation Remove（无需Package）。
```

Install遇到既有依赖保持原版本/开关，不重复默认启用。Upgrade调用官方CLI add新tgz，保留未选Bundle和disabled patch。当前官方在线原位升级受HMR接口限制，采用停服后的CLI升级，不伪称在线热升级。运行中的Profile拒绝离线包操作；命令失败保留原资料和回执，不能只凭HTTP200判断实际效果。

## 开发步骤

画板桥源码保留plugins目录，但从根workspaces的隐式安装列表中移出，避免官方优先解析app副本、盖住Profile版本。源码变化需要显式npm pack、停止测试Profile、通过上述Upgrade安装，然后启动验证；单纯重启不会偷偷重装或把用户停用项打开。根npm install/ci按声明维护安装树，无手改node_modules适配。

## 配置与组合

官方顺序：Bundle默认 → Profile覆盖 → Home覆盖 → 启动覆盖。Canvas的产品启动覆盖不insert/enable或重写用户配置，只在已启用但编辑器不兼容时隔离对应桥，core继续。Profile显式editorUrl优先于Home连接默认；对应外部服务由该配置的使用者管理。

Bundle推荐不等于强制依赖或周期重放。Profile是包、选中Bundle与用户patch的唯一事实源；平台状态接口只是回读，不是另一套开关。具体画板安装见[编辑器安装说明](refactor/2026-10-18/canvas-installation.md)。
