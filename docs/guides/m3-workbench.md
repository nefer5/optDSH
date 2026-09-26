# M3 只读工作台 MVP

2026-09-26 已实测。入口仍是3081，使用 scripts/start-optics.ps1 / open-optics.ps1。

## 使用

1. Zemax中保留已配置模型与Interactive Extension；点击“刷新真实快照”。本轮重新连接成功，90对象、原有revision不变；此前NotAuthorized的原因没有单独定位，不能据此声称许可证故障永久修复。
2. 在四视图或对象目录选中镜片。右侧“解释裁切”生成问题；“比较位置”同时绑定下拉框里的目标对象。
3. 检查草稿，点击“发送给DSH”。选择/鼠标移动/编辑草稿均不发送。
4. 下方左侧显示回答，右侧显示工具开始/结束及光学采集事件。点击“高亮关联”显示参考对象、构造体和结果；单个标签可选中对应对象。
5. “停止回答”取消该次DSH进程树；没有启动任何仿真，不能将它理解成未来仿真作业的停止按钮。

左右分隔条调整对象/属性宽度，下方横条调整回答与监控高度；支持键盘方向键。主题和尺寸保存于当前浏览器。
四视图、布尔缓存与手动刷新保持；刷新导致revision改变时清除选择，旧回答禁用对象跳转并标明历史版本。

## DSH 接入边界

这版是自制工作台调用官方DSH headless profile，经项目Cordis插件驱动Agent；**不是把3081嵌入官方3080 Web界面**。
DSH 0.1.5-rc.3、项目DSH_HOME以及已有模型配置共用；不直连或重写LLM循环，不新增API key。
官方Web仍由start/open-dsh.ps1单独管理，当前单次问答不依赖Web进程。

每次显式提交创建独立DSH会话，非连续多轮聊天。初期已用MiniMax完成接线验证；用户随后指定近期只测glm-5.3-flash，现由config/optics-model.json显式选择zai/glm-5.3-flash，失败不fallback。运行区展示真实provider/model。
最新20个任务留在桥接内存，桥接重启后列表清空；持久证据在artifacts/optics-agent/<requestId>，DSH轨迹在其原有session目录。
敏感诊断仅本地文件保存，不把provider原始错误或凭据回显到网页。

## 确定性选择绑定

首轮测试中模型缩写objectId并误判时间，说明仅给提示词不足。因此正式适配层将modelId/revision/objectId/toId写进单次请求文件，
模型只看到无参数工具mcp__optics__selection_context；MCP绑定请求，服务从同一份快照副本返回选中对象、布尔操作数、参考对象和可选相对位置。
Agent scope同时限制工具可见性并加执行guard；实际schemas必须恰好只有selection_context，否则启动失败。无Shell/文件写入/模型写入/刷新能力。
普通DSH Web的原4个optics工具不受影响，只有本次受限适配进程注册选择上下文工具。

提交验证版本、问题长度和请求ID；旧版本/宿主失败拒绝，未知目标拒绝。同ID同内容幂等，同ID不同内容冲突。
同一时刻最多一个任务，180秒进程树超时，最多12次工具调用。取消不会重发请求，停止服务脚本先取消活动DSH任务。
回答必须有成功工具调用才标完成；**完成不代表自然语言每句话均正确**，仍需专家对照。不同模型的长期质量未评估。

## API 与文件

- POST /api/agent/jobs：显式提交，含requestId/modelId/revision/objectId/question和可选toId。
- GET /api/agent/jobs：任务、最终回答、受控事件与绑定对象引用；运行中1秒/空闲5秒轮询。
- POST /api/agent/cancel：取消指定任务。
- GET /api/selection：单快照选择上下文，继续使用原有回环认证和同源检查。
- config/optics-agent.yml：关闭官方headless runner，插入项目runner和MCP。
- scripts/dsh-optics-runner.mjs：DSH生命周期与严格工具作用域。
- src/optdsh_optics/agent_jobs.py：请求校验、串行作业与超时。

DSH的patch同ID不能改插件name；必须禁用旧runner、另插入新ID。相对插件路径以patch文件所在目录解析。
UI仅以文本/安全DOM呈现模型输出，不执行HTML或模型生成的操作。

## 验收与剩余项

本轮真实：90对象采集无错误，dirty状态保留；六组裁切仍显示。网页OBJ59→OBJ60查询返回世界ΔZ=-20mm、局部ΔZ=+20mm、原点距离20mm，明确不是表面间隙。
OBJ41问答识别OBJ38镜片与OBJ40矩形体、A&B交集。模型输出尚有解释质量风险，未宣称全面专业正确。
旧revision409、跨源403、无认证403、重复请求幂等、并发409、取消均验证；实际工具目录仅selection_context。
30项Python和13项JS测试通过；浏览器验证分栏、主题、点选发送、关联高亮和回答/监控分离。
证据目录artifacts/m3-validation。未修改或保存ZMX，无追迹、全局安装或上游DSH源码改动。

尚未实现：官方Web内嵌、持续多轮上下文、可确认的修改提案执行、自动宿主采集、AgentCanvas、完整非球面、真实Zemax逐对象外形对照及长期性能/质量测试。

## GLM近期基线实测

用户指定后，两项运行均核实为zai/glm-5.3-flash，无fallback：OBJ41裁切解释25.6秒，OBJ59→OBJ60位置查询20.7秒。
后者返回世界(0,0,-20)mm、局部(约0,0,+20)mm、原点距离20mm并区分表面间隙。
前者核心A/B/交集正确，但曾从Comment角度文字作解释、将API位置与曲面近似边界混写；已补提示约束，改进效果未做该同题复测。
该样本不构成领域质量全面验收；记录于artifacts/m3-validation/glm-results.json。
