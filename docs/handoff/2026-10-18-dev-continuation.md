# optDSH开发目录接续摘要

日期：2026-10-18。当前接续工作目录必须为E:/Proj-2026-N06_optDSH-dev，分支codex/platform-dev。先读README.md、planning/STATUS.md，再读本文件和.agents/plans/261018-version-and-profile-migration.md。不要回到旧目录修改代码。

## 用户确认与边界

- 平台源码/程序、可配置DSH_HOME、任意课题目录分离；不要在源码内重新建STUDYS。
- Home供多个光学课题共用。官方DSH同一Host支持不同会话cwd；不能把测试启动器默认目录限制说成框架不能切项目。Forms动态会话目录和工作台部分默认路径仍待完善。
- 包内保留完整公共能力；可选共享到.agents，专家按宿主适配；不得改写本机全局.agents。该公共分发机制尚未全实现。
- Node>=24，不只允许24；已验证24和26。Node/Python/Zemax由用户安装，不随包打包。
- 开发保留CMD；启动DSH.cmd复用，重启DSH.cmd真重启，均只处理身份匹配的本项目进程。英文重复入口已回收。
- 正式发行薄EXE，配置外置，无需额外安装PowerShell7；复用系统内置5.1生命周期辅助，首版已验证。图形安装向导让用户选程序/Home是明确需求，尚未实现。
- 从0.2.0-dev.1开始统一升版、发布检查、构建追踪和版本查询；只做本地提交及测试包，不推送或正式发布。
- 工作台同仓可选，独立AgentCanvas仓库不改；Zemax18桥尚未完成，2023+仍需实机验收。Sandbox/VM/公司实机、真实模型调用及Zemax不纳入自动验收。

## 实际位置

| 用途 | 位置 |
|---|---|
| 新开发源码 | E:/Proj-2026-N06_optDSH-dev |
| 官方DSH npm安装代码 | 上述node_modules/@deepseek-ai/dsh，配套官方包在同级@deepseek-ai |
| 当前Home | E:/Proj-2026-N06_optDSH-validation/manual-preview/source-home |
| 当前状态/日志 | 同一manual-preview/source-state |
| 当前测试课题 | 同一manual-preview/workspace |
| 当前Web | http://127.0.0.1:3380，经根CMD走认证，不粘贴令牌URL |
| 旧现场及旧Home | E:/Proj-2026-N06_optDSH；其data/dsh只读保留 |
| 发布和安装验证 | E:/Proj-2026-N06_optDSH-releases；E:/Proj-2026-N06_optDSH-validation |

manual-preview中的installed-home/state是此前独立安装版验证，source-home/state用于源码预览，两套故意分开；不要误删正在使用的source-home。默认~/.optdsh当前未使用。路径入口在Git忽略的.runtime/development.json及preview.json，正式安装为外置optdsh-launcher.json或-Home。

## 当前阶段已实现

- Product和Bundle为0.2.0-dev.1；版本命令及构建门禁在scripts/maintenance/version.mjs、Bundle version.mjs；认证API /api/optdsh-version；EXE/CLI支持version。
- 旧GLM配置按白名单迁入当前Home，默认zai/glm-5.3-flash，凭据仅进官方Home的凭据ref；旧浏览器登录密钥未复制，新浏览器密钥保留。不要输出.credentials.yaml或整块模型配置。
- 旧启用8插件恢复：GenUI、Tasks、Better Sidebar、Claude Style、Context、Quote Followup、Firefly、dshmarket。Better Sidebar从0.25.0升级0.28.0以适配connection服务；均已回读active，8个客户端资源HTTP200，市场查询accepted。原禁用项不重新开启，无兼容豁免。
- 全局pnpm因Node升级遗留Corepack入口失效；没有修全局。产品Bundle声明pnpm11.25.0依赖，官方CLI及plugin-manager用本项目入口。

## 接续注意

原工作树和新worktree共享Git对象库，不能删除旧目录.git。源码、打包物和验证实例分开；旧大数据不随Git保护。历史验证见docs/refactor/2026-10-18/及规划；任务勾选、最终提交和测试包位置以本轮最后收尾记录为准，不把本摘要的“已实现”当作完整UI/真实业务通过。

继续优先处理原重构未完成项：Forms按官方会话cwd、AgentCanvas独立文档协议、专家公共资源分发、Zemax18适配桥、安装向导与公司环境验收。无需再次询问已确认的架构决定；涉及未授权的全局修改、推送和真实仿真仍保持边界。

## 本轮最终验收（中断后已补齐）

- 代码提交a3c90405d59560eeb05366b8f823740b045a12b2；本地不可变标签v0.2.0-dev.1指向该提交。测试包E:/Proj-2026-N06_optDSH-releases/0.2.0-dev.1；安装验证E:/Proj-2026-N06_optDSH-validation/0.2.0-dev.1。不要重复生成同一版本；下一次交付先推进dev.2，源码文档提交可继续由Git追踪。
- 完整回归：147插件、53安装、11PPT、121光学、37分发、56架构kit；后加的精确DSH依赖门禁由8项版本专项覆盖。安装身份、CLI/API版本、四组件加载/client脚本与凭据值未入包检查通过。
- 开发Home中GLM及8插件已实际加载，不是仅复制文件。没有真实模型推理或全插件UI交互验收，用户可手测。保留当前Home配置，不要每次新建空Home来代替日常开发。
- 备份位于当前Home/.backup/profile-import-20261018-151412；含私人凭据，仅留本机，不纳入Git/发布包。失败或回退先停止本Home写入，再按备份恢复，不覆盖旧源Home。
- 公开回执位于docs/refactor/2026-10-18/evidence/version-dev1-installation.json、profile-import.json。共享环境已记录Home配置持续保存，日志收尾时追加。
- 当前聊天源ID为01a135e2-26f2-70a2-9236-e1c8db8b1764，原标题“调研光学DSH重构与沙箱方案”。用户要求将上下文归纳后接续到新开发项目，优先用Codex官方项目移动能力；不能直接移动时使用本摘要创建该目录的接续会话，不改Codex内部数据库。

## Codex会话归属状态

已尝试官方move_thread_to_project将本会话移动到已登记项目Proj-2026-N06_optDSH-dev（对应E:/Proj-2026-N06_optDSH-dev）。工具返回confirmation_required，因当前历史仍关联旧目录E:/Proj-2026-N06_optDSH；没有执行迁移，没有改应用内部数据库。用户可在侧栏把本会话拖入新开发项目并确认旧目录访问，以保留完整历史；也可在新项目会话直接读取本摘要继续。不要把“摘要已生成”说成“原会话已迁移”。

后续用户已在Codex侧栏手工完成移动。本会话不指定workdir时的Get-Location、Git仓库根均已实测为E:/Proj-2026-N06_optDSH-dev，分支codex/platform-dev；上述目录确认阻塞已解除，不要再要求用户迁移一次。

0.2.0-dev.2追加修复：dshmarket自行调用pnpm，未使用官方plugin-manager的pnpmCommand，仍命中全局失效Corepack入口。Host启动时仅给子进程优先注入产品node_modules/.bin及所选Node目录；市场status.pnpm已从false变true，用户/系统PATH不变，PowerShell7和内置5.1回归均通过。旧0.2.0-dev.1测试包保持不覆盖。

0.2.0-dev.3追加：安装器支持-PluginPreset none（默认）/market/recommended；公共推荐清单固定版本与SHA256随包，8项经独立新Home联网安装、active与客户端200验证，市场pnpm=true。代码0a69ac4；测试包releases/0.2.0-dev.3，验证根validation/0.2.0-dev.3-recommended（测试Host已停）。保留用户已有版本/开关，不复制账号/会话；图形向导仍待做。完整回归通过，缓存复用/无真实模型/无沙箱公司实测；不得覆盖已有同版本测试包。证据evidence/recommended-plugins-dev3.json。

Canvas续轮最终dev.6：本地代码b31c70a，AgentCanvas独立仓库8c328da改名@nefer5/agent-canvas0.2.3，不公开npm/不推送。新增已有/本地包新装与协议身份探测，Home连接配置，按需隐藏启动；修复PS5传参和控制台继承。独立包安装/运行身份、iframe/绘图/重启回读和core降级通过。2T2R位于外部课题目录，206份原件快照校验，公共装调/Rx Skill0.3.0去课题绑定，光学0.2.1。日常预览rootCMD仍可用，Home/模型/插件保留，canvas来自manual-preview/canvas-editor独立包，已登记外部课题。市场重启导致PID记录滞后已按实际命令/launch记录校准，旧平台/4173/全局.agents未动。历史报告不改写；真实Agent提交/建议/光学及通用文档协议统一仍待验。完整证据见canvas-installation-dev6.json。

Profile生命周期续轮最终dev.8：Canvas桥0.6.0从根workspace隐式依赖移出，源码仍plugins，运行只由Home/Profile安装及官方开关管理。包管理/配置合成使用官方API，无源码fallback；状态与编辑器按Profile有效启用判断，components不再强拉。日常预览同Home模型/插件保留，桥已由官方安装且availability=profile/removable=true。真实官方启停/升级保留off/卸载重启无回流、课题哈希保护通过，dev.8独立fresh包/运行身份通过；源6599a30，证据canvas-profile-dev8.json。dev.7保留作为PS5stderr问题候选。升级显式停服CLI，不承诺在线热升级；编辑器生命周期独立，其他自有插件继续后续。源码改动需pack+显式Upgrade，普通CMD不再重装覆盖；全局.agents和旧平台未动，未推送发布。

工作台Profile续轮最终dev.11/插件0.9.2：通用Profile状态/安装器支持canvas+workbench，工作台退出app workspace与旧源码挂载；独立配置/缺服务503、业务拒绝不吞，卸载撤销绑定Agent的光学提示词。根工作台CMD内置PS5.1，默认只开UI，不自动光学；StartOptics显式请求，本轮未用。首轮旧dsh-llm私有依赖导致remove.application=failed虽删包，已改宿主peer，最终严格源Profile及发行包卸载均applied/core立即ready/重启无回流。日常同HomeCanvas+Workbench ready，模型/数据保留；Tabbit渲染工作台0.9.2、缺后端保存禁用，未连Zemax/模型。源38f4063，release/dev.11不可变；fault/upgrade版本仅测试夹具。完整证据workbench-profile-dev11.json，临时Host停，继续Forms/专家等后续。源码改动须pack后显式Profile升级，不普通重启覆盖。
