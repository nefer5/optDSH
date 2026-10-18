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
