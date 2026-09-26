# 持续会话与AgentCanvas

> 本文为3081旧适配的历史说明。当前入口已改为[官方Host同会话工作台](../guides/shared-workbench.md)，旧聊天/旧CanvasBridge写路径停用，历史数据保留。

2026-09-26。本文描述3081本地适配；官方3080现已另有[会话画板v2](canvas-session-boards.md)，两者的入口与存储不同。

## 使用

1. 新建会话，添加对象引用并发送首轮问题。
2. 后续可直接输入追问，不必重复添加同一组对象；服务端复核上轮绑定的modelId/revision。版本改变时必须重新选择引用，不会按编号自动换绑。
3. 会话选择器切换不同主题。DSH用同一session持久记录历史；每轮进程可以退出，再通过官方AgentRegistry.resume恢复。不是手工把旧回答拼入新任务。
4. 点击“连接画板到本会话”，在AgentCanvas相同项目中选择以optDSH开头且含当前会话短ID的接收者，然后发送画板。提交会沿用该会话最近确认的对象上下文。
5. 若模型正忙，画板在本会话内排队。回答生成后仍不自动把专家画板标成processed；确认实际问题已处理后点击“确认画板已处理”。

“连接画板”不会打开其他浏览器，不领取已有共享待处理箱，也不修改Canvas场景。当前只处理新发给该接收者的定向提交。
连接标签、waiting/queued/delivered/error与DSH任务状态分开；60秒接收窗口会在连接开启期间续接。

## 状态与恢复

- 本地索引为.runtime/optics-conversations.json，原DSH轨迹仍归DSH session持久层，诊断和结果保存在artifacts/optics-agent。
- 两个会话各自拥有不同DSH sessionId；同一时刻仍只允许一个模型任务，避免相同持久会话被并发写。
- 已完成轮次可恢复并继续。取消/异常中断的会话保守标记needsRecovery，保留历史，提示新建会话；当前未做自动截断/修复半轮DSH日志。
- 服务重启发现running任务时标记interrupted，不自动重发或自动收费。画板交付前后崩溃的极端窗口没有exactly-once保证；失败/取消保持received并需人工核查，不提前complete。
- 目前离线历史待处理箱重投、多个失败附件的恢复UI、Agent回画和官方Web原生嵌入未完成。

## 画板输入

优先读取文本、元素类型、坐标/尺寸、组ID和显式连线绑定，附用户说明；不把空间邻近推断为机械/光学连接。
限制150元素、单文本600字符、说明3000字符；截断和未解析image/freedraw均显式标记。没有验证GLM图像端点，因此不上传PNG作视觉推理，也不换其他模型。
提交路径校验必须位于本项目.agent-canvas/inbox，scene文件上限5MB；连接令牌只在内存中使用，不返回工作台。

## Skill与工具

- `.agents/skills/optdsh-expert-collaboration`：会话/对象/画板的领域处理方法。
- `.agents/skills/optdsh-assembly-tolerance`：镜筒装配和光源/SPAD耦合的任务预检与分析方法。
- 受限Agent只看到selection_context与workflow_guide。后者只能读取白名单Skill及公差任务预检，没有任意文件读取或执行入口。
- 仍固定glm-5.3-flash。缺少真实仿真执行器时只输出计划与缺项，不把模型语言当公差计算结果。

证据：artifacts/conversation-validation。默认浏览器里的完整多轮排版和收件体验仍需使用者实际验收；接口/DSH实测不能替代浏览器交互验收。

本轮三轮端到端证据使用同一个DSH session：首轮定义“耦合基准A”，次轮无对象重传仍能恢复代号且读取装调Skill，第三轮从Canvas定向提交继续确认Tx/Rx指标与前轮代号。两种Skill均在实际轨迹中被调用。
测试提交独立留存，用户原画板scene内容保持一致；Canvas autosave递增了revision/updatedAt，比较场景内容与比较整包响应需区分。
三轮进程退出后重新采集Zemax仍成功，不能认定进程退出必然导致NotAuthorized。
