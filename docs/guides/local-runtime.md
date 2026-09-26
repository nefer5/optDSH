# 本地 DSH Web

本文说明安装与启动。2026-09-26 后续已完成三家模型的文本/文件工具冒烟测试；光学服务和 Zemax 连接尚未验收。最新结果见 planning/STATUS.md。

## 安装与版本

项目依赖固定为 `@deepseek-ai/dsh@0.1.5-rc.3`。Node 使用现有 24.x；安装成功后 package-lock.json 锁定完整依赖，后续从根目录执行 `npm ci` 恢复。

```powershell
npm run dsh:version
```

这是 npm 发布的构建产物，无需克隆上游或执行源码构建。扩展开发须参考对应版本源码，不能默认 master 的接口与此版本一致。

## 启动、查看、停止

日常推荐双击 `scripts/open-dsh.cmd`，或运行 `./scripts/open-dsh.ps1`：服务停止时自动启动，运行时复用，再打开带认证的入口。
`start-dsh.ps1` 重复运行会复用已匹配的同端口进程；不接管其他进程占用的端口。`open-dsh.ps1 -NoBrowser` 仅启动/检查认证，不打开浏览器。
直接访问3080仍可能因缺少认证cookie而失败；3081是另一个独立的光学工作台。

从本项目根目录运行：

```powershell
./scripts/start-dsh.ps1
./scripts/open-dsh.ps1
./scripts/status-dsh.ps1
./scripts/stop-dsh.ps1
```

默认地址 `http://127.0.0.1:3080`。此版本需要本机访问令牌，首次直接访问根地址可能返回 401；用 open-dsh.ps1 读取官方启动地址并打开，认证后浏览器会使用本机 cookie。脚本不打印令牌；stdout 日志含启动令牌，已被 Git 忽略，不复制进报告。

需要启动默认浏览器时使用 `./scripts/start-dsh.ps1 -OpenBrowser`；端口占用时脚本报错，不接管其他服务，可使用 `-Port 3081`。同项目已有存活进程时先查看状态，不重复启动覆盖其记录。

启动器是隐藏的本地 Node 进程，状态文件保存 PID 与启动时间。停止脚本校验 PID 启动时间与命令路径，避免误杀其他实例；Windows Stop-Process 并非保证优雅关闭，先等任务完成再停止。当前阶段没有运行模型或仿真任务。

## 数据位置

| 路径 | 用途 |
|---|---|
| node_modules/ | 项目独立 npm 依赖 |
| .runtime/dsh/ | DSH_HOME：配置、会话与可能的凭据，Git 忽略 |
| .runtime/dsh-host.json | 本项目启动进程信息 |
| artifacts/dsh-host/ | 每次启动的 stdout/stderr 日志 |
| config/dsh.local-policy.yml | 可版本管理的无凭据启动策略 |

启动器仅在创建子进程时设置 DSH_HOME 和 DSH_TELEMETRY_MODE，随后恢复调用进程原值；不修改 Windows User env。不要在本项目根目录放通用 .env，DSH 会尝试加载；模型接入统一留到下一阶段。

## 当前启动策略

- 只监听 127.0.0.1，官方 Web，使用其内置 Standard preset。
- `DSH_TELEMETRY_MODE=DISABLED`；显式 overlay 将 `session-log-deepseek.config.enabled` 设为 false。
- 使用官方 browse 目录选择器替代自动选择的原生窗口，便于内嵌浏览器操作。在 0.1.5-rc.3 需同时组合 host 和 client 两个包；已实测通过网页路径框添加本项目。
- 启动器不导入模型凭据；用户后续已在Web手工配置GLM、DeepSeek、MiniMax。未启用Codex登录或OpenRouter。
- 上述是已配置的启动策略，不能替代完整网络出口审计。进入模型验证阶段还需检查实际请求。

首次打开出现内测声明和模型配置引导。模型尚未配置时刷新会再次显示引导，可点击“稍后配置”；不能把默认模型标签当成模型已接通。

## 本轮验证（2026-09-26）

- npm 安装退出 0；CLI 返回 0.1.5-rc.3。
- 认证 HTTP 返回 200；监听地址只为 127.0.0.1。
- 启动、状态、停止、重启实际通过；已用开始时间校验修正 PowerShell JSON 日期自动转换带来的进程判断问题。
- 安装阶段浏览器实测加载官方页面、添加本项目工作区、显示标准模式；该阶段未发送消息。随后模型测试另记于 artifacts/model-smoke-20260926/report.md，原安装验收记录不冒充推理验收。
- npm 首次下载仅剩两个 sharp 图像依赖长时间停滞；用已有本机代理进行单次重试成功，没有写全局 npm 代理配置。package-lock.json 保留依赖复现信息。

## 依据

- [固定版本 CLI 行为说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/apps/cli/reference/README.md)
- [固定版本默认组合](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/bundle/base/cordis.patch.yml)
