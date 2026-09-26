# 官方 DSH 会话画板

## v4：折叠内容、拒绝反馈与绑定图形协作（2026-09-26）

- 自然语言与结构化上下文分为独立消息内容块。聊天气泡显示自然语言，下方灰色“返回画板内容”默认折叠，点击展开技术数据。旧v2/v3提交也在显示时折叠，不重写历史；普通消息保留上游渲染。
- “拒绝 ▾”展开修改意见输入框；空反馈只拒绝，填写后“拒绝并发送修改意见”回到原聊天，Agent重新读图并生成建议。固定requestId保证重复点击不重复交付；失败不自动重放。
- 用户绘制内容同样允许修改。带标签方框移动/缩放/旋转时文字跟随，连接箭头端点联动；删除容器会删除标签并解除连线端点绑定，删除标签清理容器引用。保留原ID，不能用复制代替移动。已有图片/手绘也可移动、缩放或删除，仍未新增像素理解。
- 仍保留会话隔离和版本冲突检查。专项Skill只在项目内；普通回复省略ID、端口、协议和冗长技术说明。

验证：28项Node、116项Canvas逻辑测试及构建通过。真实GLM先整体下移合成“方2”100px，拒绝反馈要求150px后重新生成并应用，图形/标签ID保持。折叠测试覆盖新旧消息与默认关闭状态；证据artifacts/canvas-v4-validation。浏览器自动验证被工具策略中止（Windows浏览器URL无法可靠识别），本轮真实视觉/点击仍待验。

## v3：Agent回画建议稿（历史，2026-09-26）

用户已实机确认v2的会话打开、绘图和发送成功。v3新增反向编辑：在聊天中要求Agent画图或修改，Agent使用项目专项optdsh-canvas Skill，先canvas_read再canvas_propose_edit。工具自动绑定调用Agent的当前会话，没有任意session参数。

画板下方出现“Agent建议”，点击“预览修改”，确认后“应用此修改”或“拒绝”。预览使用独立只读图层，不改变主编辑器；应用先等待用户草稿保存，再检查提案baseRevision。用户继续编辑造成版本变化时拒绝旧提案，要求重新生成，不静默覆盖。应用以一次Excalidraw历史操作进入原画板，提供原生撤销；浏览器真实Undo交互仍待验证。

支持新增rectangle/ellipse/diamond/text/line/arrow，以及未锁定、无绑定基础元素的移动/尺寸/文字/颜色修改和删除。暂不自动修改绑定文本/连线、图片、手绘笔画；可以在旁边新增独立标注。草图px不是光学坐标，Zemax无写入。

Skill仅位于项目`.agents/skills/optdsh-canvas/SKILL.md`，由本项目AGENTS路由；本机主目录通用agent-canvas Skill未修改。既有专家协作Skill仅增加指向专项Skill的路由。

验证：19项Node边界测试、Canvas116项UI逻辑测试和生产构建通过。真实glm-5.3-flash轨迹实际调用skill(optdsh-canvas) → canvas_read → canvas_propose_edit，生成蓝色圆形和文字；API验证预览前原图不变、显式应用新增元素、重复应用幂等、跨会话访问拒绝。证据artifacts/canvas-edit-validation/result.json；没有改用户原图。新建议预览/应用/Undo的默认浏览器点击仍待验收。

2026-09-26。已接入；官方HTTP链路和GLM已实测，默认Edge浏览器视觉/实际点击待验证。

## 使用

1. 在本项目的官方DSH聊天顶部点击“画板”。首次打开创建该聊天的独立画板，以后恢复同一boardId。也可从右侧页签引导打开。
2. 绘图、填写说明，点击“发送到本会话”。目标会话在画板中显示；切换聊天不改变已提交任务的归属。
3. Agent在原聊天中回答。下方显示排队、处理中、已回答、需核对等状态；确认工作完成后点击“确认已处理”。回答结束不会自动关闭画板任务。
4. 点击提交记录中的版本打开只读快照；“返回当前画板”继续编辑。快照不随当前图改变。

默认浏览器入口：`scripts/open-dsh.ps1`。AgentCanvas服务仍使用4173；内嵌入口由DSH页签提供，不要单独打开embed地址。

## 所有权与兼容

- 宿主持有会话画板：独立 `BoardStore` 模块保存 `.runtime/agent-canvas-boards/`，一会话一board。Canvas新增嵌入编辑模式，以校验origin/source/channel的postMessage与父页通信；不接收DSH凭据。
- 这是对最初“项目级场景＋wait”方案的调整：内嵌模式不消费共享inbox，不伪造项目或接收者。独立AgentCanvas仍沿用原项目保存及wait/inbox/complete。
- 旧 `.agent-canvas`、独立浏览器存储和旧桥接state.json保留；不会把旧图自动复制进新聊天。需要旧图可用Excalidraw导入/导出显式复用。
- 官方3080停止固定session后台接收。3081适配仍保留，未迁移其历史任务；两条路径不消费同一收件箱，不把3081宣称为官方Web插件。
- 当前只支持optDSH项目聊天，Host核验持久cwd后才创建board；跨board请求拒绝。

## 交付与恢复

- HTTP注册在官方Connection认证Fetch通道，沿用Cookie及Host/Origin检查，无新端口或凭据。
- 提交冻结scene/revision/note/hash，持久记录accepting后，调用官方sessionController.prompt，以稳定requestId和queue模式入队；不自行resume或更换会话模型。
- 重复clientSubmissionId返回同一提交，同ID不同内容拒绝。重启读回状态，不自动重发不确定任务，而是通过原会话事件核对。
- user/message的rpcId及所在turn关联结果；其他turn结束不替该提交结算。只有用户确认才processed。
- 自动保存检查revision；服务端保存冲突副本，浏览器恢复副本按board隔离。未上传草稿重开可恢复；不同revision副本另存并提示核对，不静默覆盖。
- 不确定入队结果需要人工查看聊天/记录核对，没有承诺所有崩溃时刻exactly-once。停止回答使用官方聊天的停止操作；没有外部仿真取消或模型写入。
- 历史scene单独保存，不随每次autosave重写；会话归属在进程内首次访问核验，后续状态使用实时事件，避免不断遍历全部历史。

## 验证与边界

- 11项Node测试：会话隔离、重启去重、冲突副本、不可变快照、准确轮次归属、取消禁止确认、损坏文件拒绝、跨源/跨窗口伪消息拒绝、聊天入口动作。
- Canvas原有113项UI逻辑测试通过，TypeScript/Vite构建通过；独立项目收件服务未修改。
- scripts/validate-canvas-http.py：两个新聊天、三次真实GLM投递（A1/B1/A2）完成；重复请求只入队一次；跨board拒绝；未认证401；历史快照与显式确认通过。证据artifacts/canvas-v2-validation/result.json。
- 实际重启DSH后，两聊天boardId、scene、revision、已回答/已确认状态均恢复；重发原请求ID仍返回原提交。证据artifacts/canvas-v2-validation/restart.json。当前服务器提供的前端资源含标题栏入口。
- 仅使用合成文字与glm-5.3-flash；不接Zemax，不修改用户原画板，测试聊天保留供查看。
- 官方boot图包含插件，4173提供新构建且无阻止iframe的响应头；这不等于浏览器验收。CUA当前返回Edge不可用，未改用其他浏览器。
- Agent回画、图片/手绘像素理解尚未实现。
