# 安装与运行

## 高频入口

- 根目录 `启动光学工作台.cmd`：按需启动3081及3080并打开工作台。
- 根目录 `启动DSH.cmd`：按需启动3080并打开官方Web。
- 浏览器使用系统默认关联；用户当前选择Tabbit。不会修改默认浏览器设置。

## 首次安装

Windows、Node.js 24、Python 3.12。Zemax功能另需本机OpticStudio和有效ZOS-API；默认Interactive Extension，不自动打开/保存商业模型。

```powershell
pwsh scripts/setup.ps1
```

脚本创建本项目.venv，按packages/optics/requirements.txt安装依赖和本项目光学包，再npm ci。新环境从config/optics.example.json生成本机配置，默认合成演示；真实模型在界面探测确认。不得使用N02的.venv。画板仍需用户已有N05服务127.0.0.1:4173。

## 状态和停止

2026-09-27 用户要求本项目DSH默认完全权限：官方settings的`permission.defaultPreset=danger-full-access`，持久保存在`data/dsh/settings.yaml`，对应sandbox完全访问、approval=never。新会话自动采用；既有会话保留原权限，当前Rx测试会话已通过官方`/permission danger-full-access`同步。此设置无需重启Host，不修改Codex/OpenCode全局配置；光学执行器仍核对模型身份、版本与副本边界。

scripts/runtime 下保留 start/open/status/stop-dsh.ps1 与 optics 对应脚本。-NoBrowser可只检查入口。停止前检查会话/仿真作业；停止Agent不停止Zemax作业。保存/采集忙时不能停止光学服务。

## 认证

复用官方每进程启动令牌和签名cookie。Host用公开的ctx.connection.authenticatedUrl生成启动信息，写入私有.runtime/web-launch.json；脚本校验其PID后读取。DSH_HOME=data/dsh，官方凭据/会话持久保存。重新打开不再解析stdout日志；日志轮转不会破坏启动入口。

新浏览器需要走根目录启动器认证，旧cookie按官方有效期工作。令牌、凭据、原始会话和本机配置不进Git或研究报告。

## 连接排障

实例编号以目标Zemax的Interactive Extension弹窗为准，多窗口不一定都是1。NotAuthorized首先核对实例与目标窗口是否启用API，不能单据错误断言许可证不支持。目标文件变化须显式重新绑定；失败保留标明过期的快照，工具不把旧快照当当前事实。

## 本机数据

见[目录职责](architecture.md)。删除日志前确认没有活跃写入；删除.runtime令牌不会删除DSH持久会话，但会影响启动器，需重启Host重建。禁止把data或.agent-canvas作为临时目录清空。

## 检查

```powershell
npm test
.venv/Scripts/python.exe scripts/maintenance/check_project.py
```

默认检查只运行离线测试与DOM冒烟；tests/live需要显式选择，可能创建会话或消耗模型，不自动执行。实际GUI/ZOS验收单独报告。
