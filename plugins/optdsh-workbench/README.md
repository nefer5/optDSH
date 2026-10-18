# optdsh-workbench

官方 DSH 会话的光学工作台插件。lib 为适配，web 为前端，config 为产品指令；资源从包自身加载，不读取工作目录中的 package.json。源码随 optDSH 维护，仍可单独装配/禁用；当前 private=true，不表示已经公开发布。

## 配置与边界

- `workspaceRoot`：新建会话的工作目录；已有会话以官方 sessionController.inspect 的 cwd 为准，不局限安装目录。兼容旧 `projectRoot`。
- `stateRoot`：optDSH 私有状态根，保存 data/workbench/bindings.json，读取 .runtime/optics-access.json；默认兼容旧 projectRoot。认证启动由平台负责。
- `model: {provider, model}`：可选的新会话模型选择；省略沿用官方 Standard 默认，不再强读安装源码中的模型配置。
- Canvas 仅点击画板时动态加载 transport。未安装或接口不兼容只反馈画板不可用，聊天与光学 UI 可继续加载。Forms 链接独立探测，缺失不阻止工作台初始化。
- 光学服务不可达时，可继续一般讨论；携带明确对象引用的提交必须验证当前模型，不能沿用旧引用。

依赖 Node.js 24+ 与 DSH 0.2.1-rc.2 系列。运行数据不在包内。服务端注册/载入失败的整体隔离由平台 Bundle 装配层负责，本插件不替换官方 Agent 循环。

## 独立装配

包内 `dsh.bundle.patch` 指向 cordis.patch.yml。可先 `npm pack` 生成本地 tgz，再通过 DSH 官方插件/Bundle 安装入口选择该文件；启用前在 Profile overlay 注入上述 workspaceRoot/stateRoot（画板还可注入 editorUrl）。不把 checkout 路径写进包，外部运行依赖由用户准备。独立安装后的官方宿主加载仍需验收，不能把 tarball 校验当作端到端成功。

### 全新官方Profile的Cordis前置条件

通过官方 `dsh plugin --profile web add <本插件tgz>` 独立安装时，先在同一DSH_HOME/Profile执行 `dsh plugin --profile web add @deepseek-ai/cordis@4.0.5 --config.auto-install-peers=false`，再安装本插件。宿主范围是DSH 0.2.1-rc.2/Cordis ~4.0.5，不继承旧版豁免。已实测全新Profile仅装工作台会因传递包缺Cordis被预检禁用，补齐后加载通过；不要编辑node_modules解决。产品app安装器已提供宿主依赖，和Profile独立安装是不同路径。
