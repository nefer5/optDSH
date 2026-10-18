# optDSH bundle

官方 DSH Profile 的产品组装层，保留官方 Agent loop。默认仅启用 core；工作台、画板桥、Forms、专家均为显式可选组件。Node 24+ 由用户安装；core 不要求 Python、Zemax、AgentCanvas 或私人 Agent 中心。

`node lib/cli.mjs compose --install-root <app> --home <home> --profile web --workspace <research> --state-root <state> --components core --output <state>/bundle.patch.yml`

输出 `{patchPath}`，不输出认证令牌。包内 `dsh.bundle.patch` 支持官方插件安装；Windows启动器使用 compose 注入路径和可选项。可选插件加载失败记录到 `/api/optdsh-platform`，不会阻止官方会话主链。子插件自身运行时或浏览器故障仍需各自回归。

独立资料根默认由启动器解析，画板资料属于workspace。不要把发布包与个人Profile/凭据一起分发；包安装不代表实际加载和业务通过。许可证见 NOTICE.md，当前只做本地测试产物。

## Windows共用启动入口

发布EXE和CMD使用lib/launcher.mjs，外部optdsh-launcher.json声明schemaVersion、installRoot、home、workspace、profile、stateRoot、port、components及可选nodeExecutable。相对路径按配置文件目录解析；命令行可覆盖。Node>=24由用户提供。

入口支持start/status/stop、--config、--workspace、--home、--profile、--state-root、--port、--components、--no-browser；--restart必须显式指定。Windows生命周期复用内置PowerShell5.1运行的同一套scripts/runtime，不搜索或要求pwsh。默认只有核心平台启动，不自动启动Zemax或光学服务；选择canvas且Home/config/canvas.json已配置时，校验并按需启动/复用独立画板编辑器。

EXE源码在windows/Launcher.cs，维护构建脚本输出二进制到发布目录，不跟踪编译产物。它使用Windows现有.NET Framework，不要求用户安装.NET SDK或现代.NET运行时；仍需目标Windows验证。
