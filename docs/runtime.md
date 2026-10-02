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

启动器会显示实际监听端口的PID和可执行文件。PID记录缺失、损坏或过期时，只有进程命令匹配本项目Web入口、policy和端口，且当前认证入口返回HTTP 200，才恢复记录并复用服务。其他程序占用时保留进程并报诊断，不自动杀进程；诊断不输出完整命令行或认证令牌。

认证记录失效时，先等正在执行的任务结束，再在项目目录运行 `./启动DSH.cmd -Restart`，显式重启已验证身份的项目Web进程并重新生成认证入口。普通双击不自动重启。查看状态：`pwsh -File scripts/runtime/status-dsh.ps1`；只检查不打开浏览器：`./启动DSH.cmd -NoBrowser`。状态检查读取当前 `.runtime/web-launch.json`，不再依赖旧日志中的令牌。

## 认证

复用官方每进程启动令牌和签名cookie。Host用公开的ctx.connection.authenticatedUrl生成启动信息，写入私有.runtime/web-launch.json；脚本校验其PID后读取。DSH_HOME=data/dsh，官方凭据/会话持久保存。重新打开不再解析stdout日志；日志轮转不会破坏启动入口。

新浏览器需要走根目录启动器认证，旧cookie按官方有效期工作。令牌、凭据、原始会话和本机配置不进Git或研究报告。

## 连接排障

实例编号以目标Zemax的Interactive Extension弹窗为准，多窗口不一定都是1。NotAuthorized首先核对实例与目标窗口是否启用API，不能单据错误断言许可证不支持。目标文件变化须显式重新绑定；失败保留标明过期的快照，工具不把旧快照当当前事实。

## 本地 Bonsai2 服务接入（2026-10-02）

本轮后续按用户要求规范模型名称为 `Qwen3.8-27B-Bonsai2-PQ2_0-MTP-Q8_0`，显示底座版本、27B参数量、PQ2_0主权重和Q8_0 MTP头。正式ID优先接近下载名称，KV/窗口等运行参数独立列出。旧ID `bonsai2-pro-mtp` 留在服务作为兼容别名，既有原始验收记录保留当时名称；本地会话的后续选择已迁移新ID，回答历史不改写。

已通过当前运行的 DSH 0.2.0-rc.2 / Standard 实测文字、流式思考、原生 read 工具和结果回传。配置通过官方 `settings/update` 写入 `llm-pi-ai`，回读 `applies=live`，无需重启 DSH。现行本机文件为 `data/dsh/profiles/web/cordis.patch.yml`，新增 provider `local-bonsai`；不修改 node_modules。

在 DSH 会话的模型选择器选择 **本地 Qwen3.8-27B · Bonsai2 Pro → Qwen3.8-27B · Bonsai2 Pro · PQ2_0 · MTP-Q8_0 → Medium**。验收聊天名“本地 Bonsai2 · DSH接入验收”，ID `session-2f699a63-0859-41c1-ba98-c4300ab6f379`。现有聊天仍按其已选模型运行；全局默认保留接入前的 OpenRouter/Claude Opus 5.5。DSH 原生切换模型会同时记住新默认，后续新聊天的默认可能随手动选择改变。

| 字段 | 当前配置 |
|---|---|
| Provider / 协议 | `local-bonsai` / `openai-completions` |
| Base URL / 模型ID | `http://127.0.0.1:1235/v1` / `Qwen3.8-27B-Bonsai2-PQ2_0-MTP-Q8_0` |
| 窗口 / 默认请求输出额度 | 204800 / 32768 Token（输出含思考） |
| 默认思考 / 可选档位 | Medium / Off、Low、Medium、High；本轮仅实测Medium |
| 输入声明 | text、image；本轮DSH仅实测文字，图片经DSH尚未验收 |
| 超时 | HTTP与流空闲均300000毫秒 |
| 本地占位鉴权 | `Authorization: Bearer local-no-key`，不是秘密或远端API key |

客户端库需要 Authorization；本地 llama-server 当前未启用真实API key，故使用上述占位值，不注册全局凭据。兼容设置为 `maxTokensField: max_tokens`、`supportsReasoningEffort: true`、`supportsDeveloperRole: false`、`supportsStore: false`、`supportsStrictMode: false`。Thinking由OpenAI兼容请求的 `reasoning_effort` 传递；MTP和KV在模型服务加载侧设置，DSH不重新加载权重。

服务由相邻 LLM-study 项目独立管理：启动 `E:/Proj-2026-N07_LLM-study/启动Bonsai-MTP-200K.cmd`，同配置已运行时复用；停止在该项目执行 `powershell -NoProfile -File scripts/stop-bonsai.ps1`。当前只监听127.0.0.1:1235，单并发，无开机自启；DSH关闭不等于模型停止。完整服务/API示例见 [模型侧使用指南](../../Proj-2026-N07_LLM-study/docs/guides/procreations-bonsai2-windows.md)。

排障先检查 `GET http://127.0.0.1:1235/health` 和 `GET http://127.0.0.1:1235/v1/models`；模型ID须一致。连接失败时检查服务，不自动改用云端。换端口时改DSH Base URL；服务停止不会自动释放或调整DSH会话配置。单并发应顺序提交任务，其他客户端同时使用会增加等待。

本轮证据：[验收记录](../runs/model/261002-01/report.html)。测试只处理合成文字与指定文件，未访问Zemax。本轮按用户指示不接光学工作台；其历史 SESSION_SCOPE/400 问题未修复。全天稳定、复杂Agent任务、游戏共存及DSH图片仍待验证。

## 当前日期与最新资讯规则（2026-10-02）

本机Web profile已启用官方 `@deepseek-ai/dsh-time-context@0.2.0-rc.2`，ID `time-context`，`timeZone: Asia/Singapore`、`refreshIntervalMs: 600000`。持久配置在 `data/dsh/profiles/web/cordis.patch.yml` 的insert条目，无需启用Schedule，也没有后台提醒任务。首次进入模型步骤注入；后续距本会话上次读数满10分钟才在下一步骤刷新，间隔内沿用读数，空闲时不注入。浏览器请求时区优先，配置是回退时区。

同时挂载 [optdsh-current-info-policy](../plugins/optdsh-current-info-policy/README.md)，注册系统段落 `optdsh:current-information`：查询最新资讯前检查当前时间，缺读数或需精确时间时用只读工具取时，核对官方来源和发布日期，避免锁定首批结果的旧版本。正文在 [lib/index.js](../plugins/optdsh-current-info-policy/lib/index.js)。profile使用绝对模块路径，迁移时改路径；不修改node_modules或模型权重。

现有进程两插件已active，Standard聊天实际收到系统规则与时间快照。两轮正确回答2026-10-02/Asia/Singapore，约30秒内只注入一次；DSH和模型未重启。[验收261002-02](../runs/model/261002-02/report.html)。未等待完整10分钟，未重跑原联网研究，其他complete预设未逐个验收。

## 本机数据

见[目录职责](architecture.md)。删除日志前确认没有活跃写入；删除.runtime令牌不会删除DSH持久会话，但会影响启动器，需重启Host重建。禁止把data或.agent-canvas作为临时目录清空。

## 检查

```powershell
npm test
.venv/Scripts/python.exe scripts/maintenance/check_project.py
```

默认检查只运行离线测试与DOM冒烟；tests/live需要显式选择，可能创建会话或消耗模型，不自动执行。实际GUI/ZOS验收单独报告。
