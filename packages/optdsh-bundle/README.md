# optDSH bundle

官方 DSH Profile 的产品组装层，保留官方 Agent loop。默认仅启用 core；工作台、画板桥、Forms、专家均为显式可选组件。Node 24 由用户安装；core 不要求 Python、Zemax、AgentCanvas 或私人 Agent 中心。

`node lib/cli.mjs compose --install-root <app> --home <home> --profile web --workspace <research> --state-root <state> --components core --output <state>/bundle.patch.yml`

输出 `{patchPath}`，不输出认证令牌。包内 `dsh.bundle.patch` 支持官方插件安装；Windows启动器使用 compose 注入路径和可选项。可选插件加载失败记录到 `/api/optdsh-platform`，不会阻止官方会话主链。子插件自身运行时或浏览器故障仍需各自回归。

独立资料根默认由启动器解析，画板资料属于workspace。不要把发布包与个人Profile/凭据一起分发；包安装不代表实际加载和业务通过。许可证见 NOTICE.md，当前只做本地测试产物。
