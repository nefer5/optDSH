# ADR-0001：从官方 Web 与 Standard 起步

日期：2026-09-25。状态：已采纳方向；运行兼容性待验证。

## 决策

- 官方 DSH Web 为初始交互底座，Standard 为光学助手初始能力组合。
- 以可替换的非顶尖模型为基线，不绑定 GLM，也不通过最强模型隐式兜底；公司 GLM 是一种部署场景，其出口要求仅在对应环境适用。
- Creator 用于开发时检查、插件实验与配置辅助，不作为自动生成完整工作台的承诺。
- Code 在工具稳定后用相同任务对照评估；Minimal 留给模型/工具环境评测。
- 独立光学服务 + 工具适配 + Web 扩展 + 运行事件是第一条实现路线。

## 理由

完整基础工具有助于建立可排查的基线。官方 Web 的界面与事件扩展直接对应场景交互和监控分离需求；先不增加第三方客户端适配层。

光学逻辑与 DSH 解耦，方便复用现有 Python/C# 工作并保留将来接 OpenCode 的可能。当前不同时实现多个后端。

## 代价与后续条件

DSH 仍为预览期，必须固定验证过的版本。前端接口与会话格式可能变化；升级用同一组验收任务对照。

只有现有扩展点被真实任务证明不足，才评估改循环、替换 shell 或维护 fork。第三方插件按具体需求逐项验证，不因社区热度整套引入。

## 资料

- [官方模式](https://deepseek.com/harness/en/)
- [官方架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture/architecture.md)
- [Web Client](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md)
