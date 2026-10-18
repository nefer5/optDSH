# optdsh-agent-canvas

独立 AgentCanvas 编辑器与官方 DSH 会话的桥接插件：负责 DSH 侧 board 存储、工具、revision、建议稿和官方会话提交；不复制独立 Canvas 的 inbox 消费协议。当前 private=true，尚未宣称公开发布或更改许可证。

## 数据归属

新画板从官方会话 inspect.meta.cwd 取得项目，保存 `<workspace>/.agent-canvas/optdsh/boards/`。不同会话仍有独立 board；冲突副本、冻结提交快照和建议稿都保存在同一目录，跟随项目备份。

独立 N05 项目已有 `.agent-canvas/project.json`、`current`、`versions`、`inbox`、`processed` 等布局；本桥使用其 embed=dsh 的消息协议，并不读写这些独立模式文档。`optdsh/boards` 是 DSH 会话协议的唯一事实源，而非另一份独立 Canvas current 镜像。把目录放在一起不表示已统一这两种协议。

旧 `<stateRoot>/data/canvas/boards` 文件保留原地权威，不自动复制、删除或搬迁。打开旧板继续访问原文件，避免丢失 revision/提交状态。新旧目录同时发现同一 board 时返回 BOARD_MIGRATION_CONFLICT，人工核对后才可迁移。迁移需停写、整包移动 board 与所有同前缀快照/建议/冲突文件，并记录哈希及路径映射；本轮未迁移用户数据。

## 注入配置

- `stateRoot`（兼容 projectRoot）：旧数据查找根；`legacyRoot` 可显式指定旧 boards 目录。
- `editorUrl`：已独立安装的 AgentCanvas 编辑器 origin，默认 http://127.0.0.1:4173；要求支持 `embed=dsh` 请求/响应协议。bridge 不自动启动或安装编辑器。
- `enabled: false`：不注册 API/工具。

共享 transport 从注入地址生成 iframe URL，并对消息校验精确 origin、frame source、channel；不接受模型自行指定 session。包不依赖相邻 checkout，但外部编辑器仍需独立部署且具备兼容协议。Node.js 24+，DSH 0.2.1-rc.2 系列；没有真实编辑器/模型端到端验收时，不能只凭工具注册宣称已接入。

## 独立装配

包内 `dsh.bundle.patch` 指向 cordis.patch.yml。可先 `npm pack` 生成本地 tgz，再通过 DSH 官方插件/Bundle 安装入口选择该文件；启用前在 Profile overlay 注入上述 workspaceRoot/stateRoot（画板还可注入 editorUrl）。不把 checkout 路径写进包，外部运行依赖由用户准备。独立安装后的官方宿主加载仍需验收，不能把 tarball 校验当作端到端成功。

### 全新官方Profile的Cordis前置条件

通过官方 `dsh plugin --profile web add <本插件tgz>` 独立安装时，先在同一DSH_HOME/Profile执行 `dsh plugin --profile web add @deepseek-ai/cordis@4.0.5 --config.auto-install-peers=false`，再安装本插件。宿主范围是DSH 0.2.1-rc.2/Cordis ~4.0.5，不继承旧版豁免。已实测全新Profile仅装工作台会因传递包缺Cordis被预检禁用，补齐后加载通过；不要编辑node_modules解决。产品app安装器已提供宿主依赖，和Profile独立安装是不同路径。
