> 历史方案/审查记录，不作为当前实施规范；现行入口见[文档导航](../README.md)和[项目状态](../../planning/STATUS.md)。

# Agent Canvas 接入 DSH：设计提案

当前版本见[官方会话画板v2](../architecture/canvas-session-boards.md)：已改为会话独立board和专用内嵌协议，不再使用固定dshSessionId或项目级共享画板。下文保留初版设计与接线探针历史。

日期：2026-09-26。状态：分期1（接线探针）已实现并端到端通过；插件为 `plugins/optdsh-agent-canvas`，经 `config/dsh.local-policy.yml` 的 `--patch` insert 装载（无需 `dsh plugin add`/pnpm），配置见 `config/agent-canvas-bridge.json`（dshSessionId 留空则仅装页签、桥接禁用）。浏览器视觉验收仍待用户确认。

## 建议

采用“DSH 原生薄插件 + 独立 AgentCanvas 服务”。在官方 Web 右侧增加可放大的画板页签，保留官方聊天与运行记录；Canvas 继续负责编辑、保存、版本和提交快照，DSH 负责接收明确提交并处理。插件暂名 `optdsh-agent-canvas`，通用画板桥接与光学引用分开。

首版优先证明“同一 DSH 聊天中收到画板并继续讨论”，随后增加 Agent 回画与光学截图标注。无需重新编写通用 Agent 循环，也不把当前3081单次headless问答当作官方Web多轮接入。

## 已核对的扩展基础

| 基础 | 当前证据 | 边界 |
|---|---|---|
| DSH 0.1.5-rc.3 右侧页签 | 本地 `dsh-client-ui-sidebar-right` 类型声明提供 `sidebar.right.pane.tab`，作用域为session | 自定义插件装载、iframe布局及快捷键尚未实测 |
| DSH 会话输入 | 本地 `dsh-api-session-controller` 的 `ISession.prompt` 和提交回执声明；官方扩展手册提供Host侧 `followup` 路径 | 接受输入不等于任务完成；需锁定本地版本接线 |
| Canvas 投递 | `http-api.mjs` 支持提交、活动接收会话、等待、待处理列表、领取与完成 | Canvas的临时接收session不是DSH聊天session |
| Canvas 多接收者 | `App.tsx` 已有多Agent选择，提交携带 `targetSessionId` | 还没有与DSH聊天的持久绑定和离线重投协议 |
| Canvas 数据 | 提交保存scene、metadata、SVG、PNG；scene写入检查 `baseRevision`，冲突返回409 | 服务端场景可写不等于浏览器能安全接收并合并Agent回画 |
| 浏览器访问 | Canvas API校验Origin必须匹配自身回环端口 | 3080页面不能直接跨源调用4173 API；不能简单放开任意Origin |

本地参考：`E:/Proj-2026-N05_AgentCanvas/scripts/lib/{http-api,session-broker,submission-store,scene-store}.mjs`、`src/App.tsx`；DSH参考为本项目node_modules中的上述包。

官方参考：[扩展手册](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md)、[Web架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.zh.md)。线上master可能与固定版本不同，本地声明与实际加载测试优先。

## 三种路径

| 路径 | 优点 | 代价 | 定位 |
|---|---|---|---|
| Skill + 现有CLI，画板独立窗口 | 最少接线，现有wait/inbox/complete可复用 | 依赖Agent主动等待；缺少固定聊天关联和同屏体验 | 技术冒烟或临时使用 |
| 原生DSH插件 + 独立Canvas | 保留现有画板功能和官方聊天，职责清晰 | 需实现会话桥接和轻量嵌入契约 | 推荐 |
| 抽取画板React组件直接集成 | UI与主题控制最完整 | React/Excalidraw依赖、CSS、快捷键、保存逻辑耦合及升级负担较大 | 薄插件证明需求后再评估 |

单独MCP可提供读取/画图工具，但不能单独解决Web页签、用户提交路由和聊天生命周期，因此不是完整接入方案。

## 用户流程

1. 在DSH当前聊天点击“画板”，显示项目、目标聊天与实际连接状态。首版每项目复用当前画板；不同聊天可引用不同提交快照，不假称已支持每聊天独立画板。
2. 用户绘图、添加文字。编辑只保存草稿，不自动触发模型。
3. 点击“发送到此聊天”，冻结提交快照。聊天显示画板卡片：说明、版本、预览、提交ID及处理状态。
4. 插件把用户说明与结构化摘要送入绑定的现有DSH会话，模型按需读元素和引用；回答继续出现在该聊天。
5. 用户继续修改画板并再次发送，形成新快照。旧消息仍引用旧图，不能悄悄变成最新图。
6. 后续Agent回画以“建议稿”出现；用户预览后合并，保留原图与撤销路径。

画板默认放右侧可伸缩页签，支持放大；光学三维视图与画板并列切换。先避免把聊天、三维、画板全部挤入固定窄列。独立打开使用系统默认浏览器。

## 插件内部边界

**Client部分**：注册画板页签及聊天提交卡片；首选iframe载入4173现有页面以隔离样式和依赖。嵌入模式需在Canvas明确增加，而非假设已有：收起重复项目面板、显示锁定目标、适配尺寸/焦点。iframe可行性先验CSP、存储、快捷键和刷新；失败时先用默认浏览器独立窗口完成相同数据通道。

**Host部分**：注册/续建真实Canvas等待会话，持有令牌，核验项目映射，领取明确交付，记录持久路由，将内容排入DSH，并投射状态。Host访问固定回环地址；浏览器经DSH认证Remote访问Host，iframe自身请求保持4173同源。若引入postMessage，只承载有限UI消息，严格校验origin、source与绑定标识，不传DSH凭据，不允许任意文件路径或URL代理。

**画板服务**：仍拥有场景与提交快照；旧CLI与其他Agent继续可用。插件不扫描或消费整个项目inbox。现有POST claim领取最早任务，不适合“点击某一提交只领取它”；离线按ID认领需新增接口或显式采用单项顺序领取，不能伪装成只读查看。

**模型工具**（拟新增）：`canvas_read_submission`、`canvas_read_elements`，后续 `canvas_propose_patch`。工具默认绑定当前提交和项目；返回紧凑摘要、按需分页，不把完整base64图片和大型scene常驻上下文。传输与完成状态由确定性桥接管理，不让模型承担轮询收件职责。

## 关联、恢复与完成

桥接记录至少包含：`projectId`、`dshSessionId`、`canvasReceiverSessionId`、`submissionId`、`sceneRevision`、`requestId`、内容哈希、时间与交付状态。画板像素坐标与光学模型坐标分开。

- 一个Canvas接收会话固定映射一个DSH聊天；切换可见聊天不改变已经提交任务的目的地。恢复时若原聊天不可用，显示待选择目标，不能投向当前任意聊天。
- wait一次交付后结束，由Host在生命周期内重新等待；页面可见、桥接等待、DSH处理中分别显示。断开后立即撤销“等待中”，不能仅以iframe加载成功宣称连接。
- 插件记录独立状态：待交付、已排队、处理中、等待用户、已完成、失败、已取消。Canvas原生pending/received/processed保持原语义，其他状态放桥接记录中。
- DSH忙时默认排队，不隐式steer打断；首版同聊天串行处理画板任务。不能把任意一次turn/end当成某个submission完成。
- 以submissionId去重并持久记录DSH入队回执；明确测试“已入队但回执落盘前崩溃”。若固定版本不能可靠查询/去重，标记交付状态待核对，不盲重发，不承诺exactly-once。
- 只有属于本提交的结果已保存且实际工作完成，才complete；询问用户、失败与取消均不提前完成。领取租约、超时及重启需与现有Canvas回收语义一致，防止另一个Agent重复处理。
- 取消DSH任务和取消外部仿真是两个动作，分别报告结果。

## 输入质量与回画

近期仅用glm-5.3-flash。先以文字标签、元素类型、显式连线绑定、分组和用户说明作为输入；空间临近只作提示，不能擅自认定连接或物理约束。纯手写、照片和复杂示意图需要视觉能力：端点未验证前明确提示补充文字，不暗中转发其他模型。

第二阶段回画使用元素级操作和baseRevision，默认新增到建议稿；禁止模型任意覆盖整个scene。用户合并前检查版本，冲突保留双方内容，不静默覆盖。需验证浏览器热加载、撤销/重做、图片引用、删除语义和再次打开后的持久性。

光学标注作为后续适配：从3081导出截图和选择引用，绑定modelId/revision/objectId及视角。画板箭头是意图，截图标注不能直接换算成Zemax写指令；查询仍经过现有确定性工具，写入另走专家确认、版本检查与回读流程。

## 分期与验收

1. **接线探针**：本项目隔离profile加载最小页签，显示现有画板；一次带标识的合成提交进入指定DSH聊天并收到回答。验证真实插件加载、iframe/默认浏览器及glm结构化输入；未通过前不做大UI重构。
2. **首个可用版**：同聊天连续两次提交、预览卡片、忙时排队、目标绑定、持久去重、失败/重启恢复。两聊天并存不串单；刷新不重复推理；取消不complete；原CLI路径不受影响。
3. **双向协作**：Agent建议稿、元素级变更、专家合并、冲突与撤销验证。
4. **光学联动**：截图标注与真实对象引用一起送入同一聊天；先只读查询，再另议写操作。

本次仅新增设计文档。后续实施若需要改AgentCanvas，应明确纳入两项目变更范围；本轮未改其源码或活动服务。无需新增全局工具，也不需更换模型。
