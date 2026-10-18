# 光学执行器 wheel

optDSH 平台和工作台插件可以独立于本包运行。需要真实光学服务时，用户自行准备 Python 3.12+、本包声明的依赖、Zemax、许可证和 Interactive Extension；不捆绑 Python、Zemax 或许可证。本包无发布许可证决定，当前仅用于本机隔离构建和评审，不代表已公开发布。

```powershell
python -m pip install <optdsh_optics-wheel路径>
python -m optdsh_optics serve --config E:/用户配置/optics.json --workspace E:/研究课题 --state-root E:/用户资料/state/web
```

安装器也可用 `python -m pip wheel --no-deps packages/optics` 构建。依赖由用户安装时下载。需无网络部署时，另行准备并核验完整依赖 wheel 清单；当前没有交付离线依赖全集。

包内命令为 `serve`、`mcp`、`worker`、`tx-native-worker`。同时提供 `optdsh-optics` 及对应 `optdsh-optics-serve/mcp/worker/tx-native-worker` 控制台入口。worker 只供已授权执行器消费冻结配置；启动服务不构成仿真、保存或追迹授权。仓库 scripts 仅保留开发兼容入口，服务子进程不再引用源码 checkout。

## 路径与配置

`--workspace` 是研究目录，不要求 AGENTS.md、package.json 或 study.yaml。运行包归 workspace/runs；旧 Study 内配置在 workspace 内时仍按既有规则就近归其 runs。公共库不选择固定 2t2r 课题。

`--state-root` 是选定 optDSH 用户资料下的状态目录；访问令牌和进程记录在其 `.runtime/`，快照、保存回执和作业索引在其 `data/optics/`，日志在 `logs/optics/`。访问记录绑定 PID、workspace 和 stateRoot，不能跨课题错连。安装目录只存代码。

服务配置示例（JSON；包内 loader 同时接受 YAML）：

```json
{
  "backend": "zos-api",
  "expectedFile": "E:/研究课题/模型.ZMX",
  "instance": 1,
  "target": {
    "family": "ansysModern",
    "installDir": "C:/用户安装的OpticStudio目录"
  }
}
```

通过服务启动器选择已安装 wheel 的 Python；服务及子进程复用该解释器。包内合成测试用 `{"backend":"synthetic","instance":1}`，不会在真实连接失败时自动替换。配置的 `expectedFile` 需为明确模型路径，绑定后仍保留 modelId/revision/SystemID、单位、只读与副本保存门禁。

MCP 使用 `OPTDSH_WORKSPACE`、`OPTDSH_STATE_ROOT` 定位当前研究及访问记录。工作流说明资源需显式提供 `OPTDSH_SKILLS_ROOT`，不读取开发者私人中心、不搜索仓库根、不自动读取 Study 私有配置，也不执行资源目录中的 preflight 脚本。确定性校验仍由各工作流本来的显式 CLI 执行。

## 正式连接组件与版本约定

连接实现属于本wheel，供工作台HTTP、MCP及其他本地调用者复用，不依赖开发临时脚本。

| 层 | 正式入口 | 归属 |
|---|---|---|
| 服务/业务公共入口 | Bridge.probe、Bridge.switch/refresh、capture.capture | 统一身份、模型、只读和锁契约 |
| 新版适配器 | connection.OpticStudio | Python/.NET Framework，在短生命worker加载显式安装DLL |
| 旧版适配器 | legacy.capture_legacy 与包资源 legacy.ps1 | 独立Windows PowerShell5.1/.NET Framework只读桥；不是临时脚本 |
| 版本与串行化 | runtime.validate_target、validate_host_version、instance_lock | 验证配置、API构建、分组及共享实例锁 |

用户确认暂按2021及以前/2022起分两组，默认推荐新版；这是兼容策略假设，不是对所有API实现相同或bug数量的保证。Web保存target.family=zemaxLegacy或ansysModern，并记录安装产品主版本及完整API构建号。既有zemax18/zemax19/ansys2023plus标识仍能读取；新版策略不要求研究代码硬编码本机目录。

| 分组 | 实现 | 本轮验证 |
|---|---|---|
| 旧版（2021及以前） | 18/19等共享旧桥，按明确安装和实际构建核验；当前只读，不开放保存/追迹 | 19/API190513 Web探测、确认绑定与92对象采集通过，模型哈希不变；18及其他旧版尚未实测 |
| 新版（2022起） | 正式Python连接器，产品年和API构建年分开比较；保留显式保存门禁 | 2025产品25.1/API241210 Web探测/绑定与92对象采集通过；本轮未做写入/追迹或其他年份实测 |

不同DLL与运行时分隔在独立worker；同实例号可能跨版本命中其他窗口，所以连接后必须检查完整API构建号和模型身份，不能仅凭DLL路径认定正确。正式wheel包含legacy.ps1（PS5.1中文所需UTF-8 BOM保留）；研究模型、原始快照和测试临时脚本不入发行包。

## 共享锁与恢复

所有研究目录、安装目录、profile 和 DSH_HOME 共享 `%LOCALAPPDATA%/optDSH/locks/zemax-extension-<instance>.lock`。按实例编号保守互斥，两个版本同编号也串行；锁目录不随 workspace 或 Home 切换。权限不足会明确失败，不回落到项目锁或关闭互斥。当前只覆盖同一 Windows 用户；跨 Windows 用户并发仍未实现。

采集、显式保存、原生/自定义作业和直接 API 连接复用 OS 字节锁；同一线程内嵌套连接复用已有 lease。进程退出释放 OS 锁；如原生工具仍在运行、独立副本未确认关闭或清理失败，会另写 `zemax-extension-<instance>.uncertain.json`。后续操作返回 `HOST_RECOVERY_REQUIRED`，服务重启不会自动解除或重放作业。

恢复时先检查该标记引用的 run、Zemax 工具是否仍运行、原模型身份和保存结果；无法确认则继续阻塞。人工确认恢复条件后，使用安全回收流程归档该标记并留审计记录，才允许新请求。不要删除整个锁目录或靠换工作目录规避门禁。保存结果不确定仍由原请求回执拒绝重复写入。

## 包内组织与检查

- `src/optdsh_optics`：命令入口、连接/采集/几何、保存、Tx/Rx 确定性执行器和报告。
- `scripts`：源码开发兼容入口；不随 wheel 作为运行依赖。
- `tests`：离线边界、跨进程共享锁、状态隔离及版本门禁；均不启动 Zemax。
- `UPSTREAM.md`：原始来源记录；不导入相邻 N02 项目源码或虚拟环境。

```powershell
python -m unittest discover -s packages/optics/tests -q
```
