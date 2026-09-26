# 资料与相关项目

资料核对日期：2026-09-25。链接指向上游现行页面，可能更新；选型快照见 [baseline](../../config/upstream-baseline.json)。

| 来源 | 用途 |
|---|---|
| [DeepSeek Harness 官方介绍](https://deepseek.com/harness/en/) | 模式与定位 |
| [官方仓库](https://github.com/deepseek-ai/deepseek-harness) | 源码、许可、预览状态 |
| [架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md) | Profile、bundle、事件与服务 |
| [Web 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.zh.md) | 浏览器端插件与呈现 |
| [扩展手册](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md) | 工具及事件入口 |
| [模型配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md) | 公司网关协议适配 |
| [OTel](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-telemetry-otel/README.md) | 反馈与日志出口核验 |
| [Ansys API 模式](https://optics.ansys.com/hc/en-us/articles/42661773562899-Sample-code-for-ZOS-API-users) | 连接方式 |
| [Ansys Interactive Extension FAQ](https://optics.ansys.com/hc/en-us/articles/42661836544659-Interactive-Extension-FAQ) | 编辑器及分析刷新 |
| [OpenCode Server](https://opencode.ai/docs/server/) | 将来替换后端的参考 |

## 本地相关资产

- AgentCanvas：当前路径 `E:/Proj-2026-N05_AgentCanvas`。2026-09-26已只读检查规则、README、HTTP接口、提交/等待/版本实现及前端发送逻辑；未连接画板或领取提交。复用提案见[接入设计](../archive/agent-canvas-integration.md)。
- 既有光学项目：`E:/Proj-2026-N02_opt-assist`，用户要求优先参考。2026-09-26只读核对连接源码、NSC导出、skill注册表、解释器和归档手册，HEAD为9f8d7a3；未连接宿主或执行旧脚本。具体复用边界见 [M2/M3备忘](opt-assist-reuse.md)，不等于已完成本项目接入。
- 这些项目独立维护。本项目初始化不迁移、复制、修改它们，也不重新发布商业文档或软件。
