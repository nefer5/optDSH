# 安装与运行

工作台入口现使用内置PowerShell5.1，默认只复用/启动基础DSH并打开已启用的Profile工作台，不重装/启用、不启动光学服务。确需启动执行器须显式StartOptics；本轮未连接真实Zemax。参见[Profile插件](profile-plugins.md)。

2026-10-18重构分支入口已改变：默认独立home为用户目录/.optdsh，workspace默认当前工作目录，状态位于home/state/profile。当前旧3080与data/dsh未切换；旧服务占用端口时新入口拒绝接管，请使用独立测试端口。纯平台setup不安装Python；光学选装使用 `pwsh scripts/setup.ps1 -WithOptics`。独立tarball安装、回退与限制见[安装说明](installation/README.md)。

下面保留此前部署记录，涉及旧data/dsh路径、项目根、19版与旧DSH版本的条目属于历史现场，不作为新默认配置。


## 高频入口

- 根目录 `启动光学工作台.cmd`：按需启动3081及3080并打开工作台。
- 根目录 `启动DSH.cmd`：按需启动3080并打开官方Web。
- 浏览器使用系统默认关联；用户当前选择Tabbit。不会修改默认浏览器设置。

## 首次安装

Windows、Node.js >=24；光学选装Python 3.12+。Zemax功能另需本机OpticStudio和有效ZOS-API；默认Interactive Extension，不自动打开/保存商业模型。

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

## 本地 Strata IQ3_S（2026-10-03）

已通过官方配置热加载接入，无需重启。在模型选择器选择 **本地 Strata · Qwen3.8-Flash-Next → Qwen3.8-Flash-Next ·125B/A6B ·IQ3_S ·MTP → Medium**，必要时刷新当前页面。

| 字段 | 当前配置 |
| --- | --- |
| Provider / 协议 | local-strata / openai-completions |
| Base URL | http://127.0.0.1:8080/v1 |
| DSH模型ID | Qwen3.8-Flash-Next-125B-A6B-GSQ-RCO-IQ3_S |
| 后端responseModel | qwen3.8-flash-next-iq3_s，客户端完整ID为别名映射 |
| 窗口 / 输出额度 / 思考 | 131072 / 32768（含思考）/ medium |
| 超时 / 流空闲 | 600000 / 300000 ms |
| 本地占位鉴权 | Authorization: Bearer local-no-key；非秘密或远端API key |

原默认DeepSeek官方Flash/high已保留，既有Bonsai选项保留；子Agent允许模型目录追加Strata但未改子Agent默认、未执行子Agent验收。现行持久配置在data/dsh/profiles/web/cordis.patch.yml。

Standard真实文字、分开的思考流、一次read及结果回传、原始截图附件均通过。验收未调用/绑定光学工作台，不改变工具权限，也没有修改模型加载参数。复杂业务、光学、游戏/耐久尚未验。

模型由N07独立管理：[启动](../../Proj-2026-N07_LLM-study/启动Strata-IQ3S.cmd)／[停止](../../Proj-2026-N07_LLM-study/停止Strata模型.cmd)／[运行与配置](../../Proj-2026-N07_LLM-study/docs/guides/strata-iq3s-runtime.md)。DSH关闭不等于模型停止；服务不可达时检查health，不自动换云端掩盖失败。上下文是总窗口，留32K输出额度时输入预算约96K。

验收会话`session-ec0a3175-e60a-4b60-959a-90cea40c1b3f`。证据：[原生事件及验证](../runs/model/261003-01/verification.json)；人读报告统一在[模型研究项目](../../Proj-2026-N07_LLM-study/reports/2026-10-03-Strata-IQ3S-DSH接入.md)。

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

## Strata256K与自动压缩（2026-10-03）

local-strata当前窗口262144，medium/32768。Standard/PTC/Cordis的compaction-basic thresholdRatio=0.9；Minimal无自动压缩，独立专家预设未改。保留65536额外余量和输出预留，实际阈值min(窗口×0.9,窗口−输出额度−65536)，Strata为163840。正式重启后认证/全部预设/78聊天回读通过，原默认选择保留；真实长输入压缩未测。报告E:/Proj-2026-N07_LLM-study/reports/2026-10-03-Strata-IQ3S-256K与DSH压缩90.md，证据runs/model/261003-02。

后续当前状态（2026-10-03）：用户选择保守方案，Standard/PTC/Cordis ratio已改回0.8，默认headroom65536保留，有效Strata阈值163840。正式重启后实际预设回读通过、全部6预设正常、81聊天可读，Strata256K/medium/32K持续加载；证据runs/model/261003-03/readback.json。上文0.9为此前配置。

## 产品内pnpm与市场调用

optDSH声明自己的pnpm依赖，官方插件管理器使用该命令。启动Host时还会仅为子进程将本产品node_modules/.bin置于PATH前面，其后为选定Node目录，以覆盖市场插件直接执行pnpm的路径。终端/用户/系统PATH和全局pnpm不修改；Node升级遗留的Corepack全局入口不由本项目修补。Node、npm和pnpm是不同组件，市场环境判断以自身/dsh-market/status的pnpm结果为准。
