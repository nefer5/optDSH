# DSH与光学工作台复盘及整合建议

2026-09-26。以下保留架构审查与方案演进；本期01/02/03现已实施，当前入口、实测和限制见[同会话工作台](../guides/shared-workbench.md)。04下翻分析区及领域仿真作业统一仍是后续设计。

## 结论

光学核心独立是正确的；3081持续扩展自有聊天和画板控制链路造成了重复。收敛方向是DSH Host统一会话与数据，独立工作台和官方完整Web作为不同界面，共用输入/消息/画板模块。进程可以分离，用户会话不必分裂。原始ADR-0001已提出官方Web底座，目前3081是阶段性MVP偏离后的独立应用。

## 当前实际形态

| 部分 | 实现与职责 | 与官方Web关系 |
|---|---|---|
| 光学核心 | src/optdsh_optics/service.py、capture.py、domain.py、geometry.py、boolean_geometry.py | 独立Python能力，不是DSH插件 |
| 3081服务 | scripts/optics-server.py：认证HTTP、静态工作台、查询、AgentJobs、旧CanvasBridge | 同时承载领域服务和自制产品外壳 |
| MCP适配 | scripts/optics-mcp.py，经dsh-mcp-client加载 | 官方3080已有通用只读工具入口；不是光学UI插件 |
| 自定义DSH runner | scripts/dsh-optics-runner.mjs，经optics-agent.yml装入headless profile | 在DSH框架中是插件模块；并非官方Web光学面板插件 |
| 3081聊天 | web/optics/workbench-agent.js、agent_jobs.py、conversations.py | 自制输入、消息渲染、轮次、会话选择、取消与恢复 |
| 3080画板 | plugins/optdsh-agent-canvas：Host＋Client插件、BoardStore、原生tools | 正式使用官方会话、消息slots、认证通道、prompt与事件 |

两条链路共用DSH运行库和.runtime/dsh持久存储，但3081自行创建不同sessionId，另存optics-conversations.json索引，每轮启动headless进程并create/resume。不能说完全没有共用，也不能把共用存储等同于同一活动会话控制器。

3081 runner只允许selection_context和workflow_guide；其profile没有装载官方画板插件，无法继承canvas_read、canvas_propose_edit。旧CanvasBridge使用定向wait/inbox；3080使用一会话一BoardStore和官方prompt。消息折叠、拒绝反馈、提案应用也分别落在不同UI。

selection_context依赖OPTDSH_REQUEST_FILE，仅在该环境存在时注册；官方3080通用MCP不自动拥有工作台当前选择。UI整合必须补上会话作用域的对象提交，不能只把两个页面放在一起。

## 为什么需要现在收敛

1. 最初只读MVP验证了真实采集、几何和对象选择，这是可保留资产。
2. 之后在独立页添加持续聊天、任务历史、恢复、画板投递，逐步重复官方产品能力，却未把“临时外壳何时退役”列为验收。
3. 官方画板优化已成为较成熟的公共交互；继续给3081复制功能将长期维护两套状态机。
4. 普通Python/JS测试通过只证明各分支内部边界，缺少同聊天跨领域端到端用例，因而未及时暴露体验割裂。
5. 当前Tx副本执行另走CLI并暂停3081以获得独占；未来仿真不能再让聊天进程承担作业生命周期，须归入光学服务的独立作业调度。

## 用户补充后的目标：独立工作台＋同会话完整Web

用户明确两端空间紧张：不把光学工作台挤入官方Web同一页面。工作台为主入口，精简会话与按需画板弹窗满足现场交互；完整DSH Web通过新标签页打开同一个session。这里取代前版“先做官方光学侧栏”的首选布局，底层统一会话的方向不变。

```text
工作台页面（光学大视图＋轻会话＋按需画板弹窗）   官方DSH页面（完整历史/轨迹/设置）
                  \                 /
                   同一个DSH Host / session
                   ├─ 共享已发送消息、队列与工具事件
                   ├─ 共享BoardStore / boardId / 建议稿
                   └─ 独立光学服务 / 模型版本 / 仿真作业 / runs
```

### 界面取舍

- 最新用户选择：右栏默认只显示精简会话，不常驻画板或提供默认上下分屏。点击“画板”打开临时绘图弹窗，用于快速圈选、标注和说明；完整画板交互重点放在DSH完整会话。
- “临时”指按需打开的界面，不是另一套画板数据。弹窗打开本会话既有board，不清空已有图；关闭保留草稿且不自动发送。显式“发送到本会话”才触发Agent，“到完整会话继续”进入完整画板、建议预览和多轮反馈。保存失败/冲突时保留本地草稿并提示，不宣称已保存。
- “完整会话 ↗”带明确session身份打开官方页面，不新建Agent、不复制历史；官方页提供返回工作台入口。具体深链接须按固定DSH路由验证后接入。
- 同页下翻作为补充，承载作业、HTML报告、参数与配置对比；不直接嵌入完整DSH页面。用显式“分析与报告/回到视图”导航，3D或画板区域滚轮只控制该视图，避免页面误滚动。
- 继续保留独立工作台UI，不等于继续保留旧headless runner/聊天状态机。

### 本期与后续范围

当前准备实施01工作台主界面和02按需画板弹窗，并完成03与已有完整DSH的同会话衔接；03不重建官方UI。04下翻分析区保留设计，本期暂不实施。四图关系与入口见[Figma范围表](../guides/figma-workbench.md)。先验证一条对象提问和画板提交能在两端衔接，再接完整工作台；这不是四套独立产品。

### 模块复用方式

- 优先由同一DSH Web Host认证通道提供工作台的独立页面入口；两个URL可以是同一服务，不要求另起DSH实例。新增页面路由和共享客户端模块装配仍须原型验证。
- Host统一维护会话和推理队列；轻会话复用官方controller/事件及可复用消息与输入模块。布局层可以另写，禁止复制整套会话执行、历史和取消机制。
- 将现有画板client拆成共享编辑器/保存/提交适配与完整协作呈现；工作台弹窗只装配快速编辑和提交，建议稿/拒绝反馈等主要在完整DSH页面，两端仍调用同一个BoardStore/API。不要把原Canvas插件整个文件复制到3081。
- 光学领域继续保有独立Python服务、modelId/revision、作业和产物。停止聊天不停止仿真；关闭浏览器页面也不自动销毁领域作业。
- 保留viewport、mesh/CSG Worker、坐标和导航；用显式mount/dispose及输入回调接入，去除页面全局DOM依赖，不重写几何算法。

### 双窗口一致性

- 共享已发送消息/回答/事件，草稿按窗口独立；显式转移草稿才搬运，不能后台互相覆盖输入。
- 共享已保存画板版本/提案；多窗口编辑使用revision检查，冲突保留本地草稿并提示核对。不把现有乐观版本控制声称为多人实时协同/CRDT。
- 两端显式发送都进入同一队列，以稳定requestId去重，保留来源视图；窗口切换不重发消息，不重复启动同一session的Agent。
- 对象选择/鼠标移动保留在视图本地；只有提交后才携带modelId/revision进入会话。不同会话不能仅凭当前活动窗口改变归属。
- 完整页面与工作台可以各自订阅必要数据，后台隐藏视图暂停渲染/无关轮询；大数组不塞会话消息。

### 草稿入口（设计，未接入）

- [05A 独立工作台＋轻会话](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=17-54)
- [05A 临时画板弹窗](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=25-87)
- [05B 同会话完整DSH网页](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=17-316)
- [05C 可选下翻分析区](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=17-380)

保留原方案04，复用其光学矢量、控件和颜色变量，新画板使用Noto Sans SC。画面中的模型/对象只为交互示意，未读取或修改当前Zemax。三张已做截图检查，所有权/导航描述为目标行为，不是当前产品已经具备的同步能力。

## 已核对的上游扩展点与剩余验证

- 已实用：sidebar.right.pane.tab、conversation.session.header.actions、conversation.chat.node，画板插件就是本地例子。
- 已查固定包声明：ctx.conversation.input.for(sessionScope)、insertReference、slash/input-insert-reference、引用序列化与draft语义。具备实现“选中镜片→加入官方输入框”的基础，光学引用序列化/过期校验与真实交互仍须做最小探针。
- 已实用：Host ctx.connection.fetch.register、sessionController.prompt、session/event。光学提交可沿用认证、目标会话、稳定requestId、队列和轮次归属模式。
- 保留当前内联引用在指令中的顺序和位置；首个探针可验证结构化提交，随后接官方reference chip，不能以丢失对象身份的纯文字替代正式契约。
- 各领域可复用消息封装/折叠和提交关联的小模块；画板文档、模型快照与仿真作业各管各自状态。不要提前做泛用框架，也不要让两个插件各自覆盖整块user消息渲染。
- 大画布布局、停靠、拆分和浮动空间需实际验证，不能将“存在侧栏slot”当作满足双视图四列布局。第一阶段证明同会话，第二阶段解决光学主视区布局。

## 为什么不直接互嵌整页

3081 CSP包含frame-ancestors 'none'，并有独立认证/同源约束。简单放宽CSP或把令牌附到iframe不能解决第二套聊天与生命周期问题。官方完整Web嵌入3081也不会自然合并会话。

推荐独立工作台作为同一Host的另一个界面入口，Host代理必要光学请求；后端凭据不下发给页面，继续校验会话归属和模型版本。若为迁移速度保留iframe，只可嵌入移除聊天的viewer模块，并设计明确的origin/source/channel校验；不把现有整页iframe当整合完成。

工具权限必须单独维护：新光学会话可用已验证的只读光学工具＋画板提案工具，不能因复用Standard界面就取消原只读边界。无服务端确认记录与版本检查时不提供Zemax写工具。

## 分阶段验收

### 1. 同会话最小闭环

先做最小双页面会话探针：工作台绑定一个官方session，发一条带对象引用的问题，再从“完整会话”打开该session并追问；两端显示同一回答，画板提案/拒绝反馈共用同一board。复用3081只读API，此路径不再调用旧headless runner。

验收：多选引用及modelId/revision保存；A/B聊天不串台；过期版本拒绝；重复提交不重复推理；画板当前能力与普通聊天共用；固定glm-5.3-flash，分开接口验证和浏览器交互验证。

### 2. 完整工作台布局

保留独立工作台的对象列表、检查器、双/四视图与相机控制，接入精简会话/画板共享模块及完整会话跳转。轨迹和复杂历史留在完整Web，下翻区按需加载分析资料。验证大模型对象列表、CSG缓存、GPU释放、切换session和每分钟一次参数修改基线。

### 3. 退役旧交互适配，统一作业入口

在新闭环验收后停用3081新聊天创建、旧AgentJobs/ConversationStore写路径及旧CanvasBridge；保留独立查看/诊断能力和历史证据。历史headless会话可能含专用工具调用记录，必须离线验证兼容后才能继续，不在两进程同时resume同一session。

将Tx等仿真封装为领域作业提交/查询/取消，复用run包；停止Agent回答不等于取消追迹。所有写入与模型独占归服务管理。

## 代码证据入口

- [Web插件装载](../../config/dsh.local-policy.yml)、[headless配置](../../config/optics-agent.yml)、[runner](../../scripts/dsh-optics-runner.mjs)。
- [Python AgentJobs](../../src/optdsh_optics/agent_jobs.py)、[自制会话索引](../../src/optdsh_optics/conversations.py)、[独立聊天前端](../../web/optics/workbench-agent.js)。
- [光学服务](../../src/optdsh_optics/service.py)、[HTTP/CSP](../../scripts/optics-server.py)、[MCP](../../scripts/optics-mcp.py)。
- [画板Host](../../plugins/optdsh-agent-canvas/lib/index.js)、[画板Client](../../plugins/optdsh-agent-canvas/lib/client.js)、[工具绑定](../../plugins/optdsh-agent-canvas/lib/tools.js)。
- DSH本地固定包：dsh-client-ui-conversation/lib/types/client/contract/input.d.ts、service.d.ts；dsh-client-ui-sidebar-right/lib/types/client/service.d.ts。
