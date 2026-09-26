# 当前状态

更新：2026-09-26。

## v0.1.0版本基线（2026-09-26）

- 根版本由初始化占位0.0.1升为0.1.0，版本规则、CHANGELOG、锁文件一致性检查及工作台版本显示已建立。DSH依赖保持0.1.5-rc.3；内部画板插件0.5.0、工作台插件0.1.0独立维护。
- 本轮离线回归：64项Node、54项Python、工作台DOM冒烟和项目检查通过；实际认证HTTP已显示v0.1.0。待同步main和附注标签v0.1.0，远端结果以Git核验为准。
- 用户随后报告布尔计算模块加载失败、Web裁剪未生效；单元布尔计算通过不能证明当前浏览器模块加载。版本基线同步后优先专项修复，不将此问题写成已解决。

## 分隔线交互修复（2026-09-26，已实测）

- 根据用户实机反馈和Blender/VS Code公开资料，手动拖动改为边界驱动：相邻两栏优先一增一减，碰到最小尺寸才向外传递，替换此前全局同比再分配。窗口变化仍保存比例，聊天可扩大半屏。
- 上下拖动原先DOM已变化但WebGL未同步：补上内部view-surface尺寸观察并按帧合并重绘；移除多余30px相对偏移。横线8px与扩大命中区、拖动高亮、Esc撤销、双击复位与键盘微调已接入。
- Tabbit实测list左边界-80px时右边界及远端面板不动；上下+100px后真实GPU viewport与DOM吻合；刷新恢复/Esc/50:50/半屏验证通过。17项相关Node及DOM冒烟通过，报告runs/splitters/260926-01/report.html。
- 规则入口docs/guides/panel-resizing.md，AGENTS已路由；没有新增依赖、改变模型或声称长期性能验证。

## Figma修改意见1前端优化（2026-09-26，已实测）

- 读取用户Figma 31:104及文字意见，并结合后续澄清：四栏同比缩放，默认43.89/10.22/14.53/31.35%；取消会话650px上限，比例保存为v5，旧像素宽度不继承。双击分隔线或Home恢复默认。
- 消息13px、角色左右气泡与分色、输入区独立底色；移除可见身份行和空气泡，支持安全的加粗/行内代码。画板结构化内容及旧提交默认折叠，普通代码不误隐藏。
- Tabbit验证1280/1920/3440宽度默认比例一致、无横向溢出；3440屏会话可拖到1720px，刷新持久保存；深浅主题和折叠实测。17项相关Node测试、实际应用DOM冒烟与项目检查通过。最后截图和报告在runs/ui-feedback/260926-01。
- 本轮只改前端与静态资源映射，未发送模型请求、未写Zemax；用户Figma意见页保留不动。

## 本期01/02/03同会话工作台（2026-09-26，已实测）

- 新增optdsh-workbench薄插件：官方3080认证页面承载原光学布局，精简会话直接使用官方sessionController；同会话完整Web跳转与返回、画板按需弹窗已实现。3081保持独立只读后端，旧AgentJobs/CanvasBridge入口410，不再从工作台启动headless进程。
- 完整Web与弹窗复用web/shared/canvas-bridge.js及唯一BoardStore。修复实机发现的官方消息slot延迟注册，镜片/画板技术内容默认折叠；精简消息过滤系统注入。对绑定会话保留只读光学＋画板工具白名单。
- 3轮glm-5.3-flash真实验收在同session完成：真实OBJ7/11只读查询、官方API追问、画板提交；重复ID去重、内容冲突、旧版本拒绝。Host真实重启后绑定与消息恢复；模型文件SHA256不变。
- Tabbit两标签实际验证工作台、完整会话跳转、真实WebGL、共享画板、默认折叠和弹窗关闭后未发送说明保留。53项Node、54项Python及真实应用DOM冒烟通过；后者WebGL为stub，不能替代Tabbit证据。
- 新入口scripts/open-optics.ps1（支持-NoBrowser）；使用与边界见docs/guides/shared-workbench.md，run报告在runs/workbench/260926-01。当前精简会话约1.8秒更新已记录消息，非逐token流式；多窗口画板冲突保留原机制，长期并发/内存表现待观察。04下翻区未实施。

## 四张草稿的实施范围（2026-09-26，设计梳理）

- 本期准备做01工作台主界面、02其画板弹窗，并完成03与现有完整DSH同会话衔接；不重建完整DSH界面。04下翻分析区留待后续。
- Figma四图标题、说明和排布已同步，入口见docs/guides/figma-workbench.md。仅整理范围，未启动产品改造。

## 05A画板按需弹窗（2026-09-26，设计）

- 用户确认画板不常驻工作台；05A右栏改为默认精简会话，新增临时画板弹窗草稿。快速绘图/标注/发送在弹窗，建议与多轮修改主要进入同一DSH完整会话。
- Figma 17:54更新，25:87为弹窗状态，05C缩略稿同步；截图检查通过，设计说明同步。仅设计，未改运行产品。
- 用户已撤销“不使用Tabbit”约束，AGENTS与共享环境已更新偏好；系统关联只读仍显示MSEdgeHTM，未自动更改设置。

## 双页面同会话草稿（2026-09-26，设计）

- 用户指出两端空间紧张，修订为独立光学工作台＋精简会话/画板，按钮新开官方完整Web同会话；不将工作台挤入官方侧栏。
- Figma原文件新增05A/B/C三张可编辑草稿并截图检查，原04保留。下翻区建议只放作业、报告、参数对比；草稿各窗口独立，已保存画板与提交共享，版本冲突不静默覆盖。
- 双页面共享Host/controller、画板模块与同session为待实现目标；未改运行服务或Zemax。见[设计方案](../docs/architecture/workbench-convergence.md)及[Figma入口](../docs/guides/figma-workbench.md)。

## DSH与光学工作台架构复盘（2026-09-26，仅审查）

- 已核对本地实现：光学Python服务＋MCP、自制3081聊天/headless runner，与官方3080画板插件分属两条交互链；共用DSH库和存储不等于同一会话控制器。3081旧画板和受限工具不能自动继承官方画板v4。
- 建议让官方DSH统一会话和交互，以光学插件复用现有几何/桥接；先同聊天对象引用＋画板闭环，再布局迁移、旧适配退役和仿真作业整合。详见[复盘](../docs/architecture/workbench-convergence.md)。
- 未改运行代码、未重启服务、未连接宿主或调用模型。上游声明支持页签/会话输入与引用；完整布局和光学同会话集成仍待探针，不宣称已接入。

## 画板v4协作体验（2026-09-26）

- 自然语言与画板技术数据分离，聊天默认灰色折叠；兼容旧提交，不改历史。拒绝建议可展开修改意见并发回原聊天，交付幂等。
- 解除用户/绑定图形限制：移动原图与文字/连线联动，删除维护引用；不再用复制代替移动。项目专项Skill同步，全局Skill未改。
- 28项Node、116项Canvas逻辑测试与构建通过；GLM实测100px移动→拒绝反馈→150px重新提案并应用，原ID保持。证据artifacts/canvas-v4-validation。
- 浏览器自动验证被工具策略中止（URL无法可靠识别）；折叠和反馈下拉的实机视觉仍待验。详见[画板说明](../docs/architecture/canvas-session-boards.md)。

## Tx YAML落实与docs分类（2026-09-26）

- Tx现支持安全YAML读取，Skill包内样例为config/tx-pilot.example.yaml；本机config/tx-pilot.local.yaml由旧JSON等价转换，产品workflow_guide优先读YAML。原始YAML及规范化参数随run归档，旧JSON显式输入兼容。
- 54项Python测试通过；配置Python环境实际plan通过，占位符execute在连接Zemax之前拒绝。校验重复键、非有限数值、安全解析、样例等价和原始字节冻结；没有重新追迹。
- 26份docs按governance/architecture/guides/workflows/research/archive分类，decisions保留；总入口docs/README.md。历史草案标记归档，AGENTS增加工作内容到必读约束表，README缩短为核心入口。链接与代码引用已同步，项目检查通过。
- 依赖声明requirements-config.txt固定PyYAML==6.0.3，使用既有环境中的同版本；未安装依赖或修改N02/全局规范。以下条目为此前阶段历史，当前状态以上述更新为准。

## 配置型Skill范式（2026-09-26）

- 用户指定：配置优先YAML，Skill包内必须附带YAML样例。已写入铁律OPT-14，同步AGENTS与运行包规范。
- 本次为规范更新；既有Tx等JSON执行入口尚未迁移，不将YAML规范当作已经支持的运行能力。历史run保持原格式。

## 公共运行包与HTML报告（2026-09-26）

- 已只读核对N02运行规范、公共分配器、Study配置和HTML报告实现，将共性要求提升至AGENTS、项目铁律OPT-13与docs/governance/run-bundles.md。
- 公共run_bundle模块原子分配runs/<workflow>/YYMMDD-NN；执行前冻结配置、离线HTML、JSON证据和文件SHA-256。Tx plan/execute与离线baseline入口已接入；失败也保存报告。服务诊断保留artifacts，未改全局规则或N02。
- 上一轮Tx证据校验复制到runs/tx/260926-01，报告report.html；配置从旧result.json提取，原始文件在original，旧路径保留。本次未重新追迹，旧运行环境/代码版本未保存的部分明确unknown。
- 51项Python测试通过；Tx计划/校验失败与合成离线指标CLI实测。报告在系统默认Edge引擎完成桌面渲染检查。新包装器未另做Zemax实跑，原光学执行逻辑未修改。

## Tx独立公差功能测试（2026-09-26，已实测）

- 新增独立Tx/Rx Skill与scope预检；对象序号、扰动范围、采样/指标都从配置读取。Tx配置config/tx-pilot.local.json，示例examples/tx-pilot.example.json。Rx规格不阻塞Tx。
- 内存CopySystem上完成18工况：两片镜片各X/Y±10μm、倾斜X/Y±0.01°，首尾名义重复；四die采样，其他源禁用。分析光线数Pickup在副本中改Fixed；镜片参考链重挂与所有非目标世界位姿检查通过。
- 试跑定义：探测器局部X径向投影角、7%–93%能量区间。名义H-D86全角1.172°，扰动范围1.172–1.176°；差异仅一个H像素0.004°，不作敏感度排名或制造结论。
- 主模型回读、dirty与磁盘SHA256不变，副本关闭无错误，3081桥接恢复。结果artifacts/tx-tolerance/pilot-03/report.md及result.json。48项Python测试与项目检查通过；后补的进程锁/异常审计保护尚未用故障注入完整覆盖。
- 下一步先做像素/光线/物理探测口径收敛；6D补偿、Monte Carlo与Rx追迹未实现。本次直接运行确定性工具，不代表GLM自主执行已验证。

## 官方画板反向编辑v3（2026-09-26）

- 用户实机确认v2会话打开/绘图/发送成功，新增需求为Agent操作画板。
- 原生canvas_read/canvas_propose_edit已接入；元素级建议稿、只读预览、显式应用/拒绝、版本冲突保护和原生撤销接线完成。
- 项目专项`.agents/skills/optdsh-canvas/SKILL.md`已由真实GLM发现调用；本机主目录通用Skill未改。GLM实际生成蓝色圆形＋文字，接口验证原图保留/应用幂等/跨会话拒绝通过。
- 19项Node、116项Canvas UI逻辑测试与构建通过；新建议稿UI实际点击与Undo仍待用户验收。详见[会话画板v3说明](../docs/architecture/canvas-session-boards.md)，证据artifacts/canvas-edit-validation。

## 官方会话画板v2（2026-09-26）

- 已取代固定会话投递探针：标题栏画板入口、一聊天一board、嵌入编辑模式、版本保存/历史快照、官方prompt复用Agent、稳定requestId去重和显式确认处理。
- 11项Node边界测试、Canvas原有113项UI逻辑测试和构建通过；两个新聊天三次真实GLM投递（A1/B1/A2）通过，未认证401、跨board拒绝、重复入队保护通过。
- 独立Canvas项目/旧提交保留，3081适配未迁移；默认Edge视觉/实际点击仍待验（CUA不可用）。详见[使用与验证](../docs/architecture/canvas-session-boards.md)。下方分期1与审查为历史记录。

## 装调Skill：对象映射与离线指标（2026-09-26）

- 本轮桥接重新启动且真实采集90对象成功。候选清单区分源/探测器/镜片/布尔结果与构造体，保留modelId/revision；机械镜筒归属仍未确认。
- 用户确认Tx四颗die（当前OBJ2–5）作为一个刚体整体6D耦合。已保存本机config/assembly-tolerance.local.json；Rx1(940)/Rx2(905)优先级待答，候选SPAD为61/76。
- 公差Skill新增baseline.py与数据定义参考，确定性内核支持显式定义的带权角域86%区间及矩形H/V，报告二维矩形实际能量比例；不隐式套用相邻项目90%口径。
- 8项新增测试与合成CSV命令通过，全部44项Python测试通过；Skill格式和项目检查通过。产物artifacts/tolerance-baseline。
- 没有执行追迹/模型扰动/补偿优化，也未取得有新追迹与版本证明的真实名义D86或Rx尺寸；目前交付为基线准备，不是公差分析结果。

## AgentCanvas 初稿审查（2026-09-26）

- 当前官方插件仅验证固定会话的一次投递；当前聊天绑定、绑定画板入口、独立board身份和连续提交尚不满足使用闭环。
- 源码核对及隔离探针发现静态目标会话、重复resume、去重状态未读取、提前complete和取消边界问题；详细证据及修订验收见[初稿审查](../docs/archive/agent-canvas-review.md)。本次只检查和记录，未改运行实现。

## AgentCanvas 接入分期1已实现（2026-09-26）

- 插件 `plugins/optdsh-agent-canvas`：Host 侧桥接（Canvas 定向 wait→resume 会话→followup→回答→complete 回执）+ Client 侧右侧"画板"页签（iframe 载入 4173，失败提示改用系统浏览器）。经 `config/dsh.local-policy.yml` 以 `--patch` insert 本地路径装载，无需 pnpm/plugin add；client 模块由 host Loader entries 自动进浏览器 boot 图。
- 端到端探针通过：合成提交（两矩形+箭头+文字）→ 桥接领取 → session-c5b27910 内 turn completed（glm-5.3-flash 复述元素结构正确）→ Canvas complete 回执、inbox 清空、state.json 幂等记录、消息持久化到 storages/session_projcache。证据 `.runtime/agent-canvas-bridge/state.json`。
- 关键实现事实：空会话 resume 后 followup 会因 prompt 组装缺 `{{model}}` 报错，需按 `config/optics-model.json` 在 resume 时 installModelSelection；消息主体持久化在 storages/session_projcache（jsonl.zstd 仅会话头）；Loader entry 相对路径相对 patch 文件目录解析且不支持目录导入。
- 待验收：浏览器视觉（右侧画板页签+iframe 实际渲染、聊天中消息可见）；绑定状态显示、忙时排队、崩溃恢复与去重为分期2。

## 持续会话、画板与领域Skill（2026-09-26）

- 3081工作台已复用官方DSH AgentRegistry.resume；连续三轮GLM测试使用同一个sessionId，能记住前轮定义的“耦合基准A”。服务持久索引保存会话/任务，异常中断不自动重发。
- 新增“新会话/会话选择/连接画板/确认画板已处理”；Canvas接收者绑定指定聊天，不扫共享待处理箱。合成定向提交实际进入第三轮并得到正确上下文回答；原画板scene内容比对一致（autosave导致revision计数增长，不能用整包哈希误判）。
- 新建optdsh-expert-collaboration和optdsh-assembly-tolerance项目Skill；GLM实际调用workflow_guide读取两者，预检明确未具备公差执行器。
- 用户确认：Tx H-D86全角、光源6D补偿；Rx矩形H/V光斑、SPAD 6D补偿；先装镜筒再耦合。作为近期优先业务，参数模板与预检已交付；未运行公差仿真。
- 36项Python、19项JS及真实应用DOM冒烟通过；三轮结束后再次采集90对象成功，dirty保持、ZMX哈希不变。证据artifacts/conversation-validation。
- 仍未完成：官方Web原生嵌入、画板图片像素/回画、失败会话自动修复、离线旧提交重投与默认浏览器完整交互验收。当前Canvas模式是3081会话绑定，区别于下方官方Web设计提案。

## Agent Canvas 接入提案（2026-09-26，设计）

- 已只读核对固定版本DSH的右侧页签/会话输入声明与AgentCanvas提交、等待、目标选择和版本接口；建议原生薄插件＋独立画板服务。
- 先验证官方Web同聊天接收画板，再做Agent建议稿与光学标注；离线定向领取、崩溃去重、嵌入模式与图片能力为明确验收项。
- 详见[接入设计](../docs/archive/agent-canvas-integration.md)。未安装插件、修改相邻项目、连接/领取画板提交或调用模型。

## 最新连接复核（2026-09-26 06:21，本地时间）

- 用户提出待验证假设：进程嵌套及子进程退出可能影响API连接。后续正常测试遇到复现时对齐DSH/MCP退出、采集worker连接/退出、extension实例与LicenseStatus的时间，不先认定根因、不为此另开定时监控。当前DSH查询经HTTP读桥接快照，ZOS采集worker由桥接刷新独立启动，两条路径须分开核查。

- 用户确认API已连接后，显式refresh成功，90对象、2.39秒、两次读取一致、dirty前后均true；revision未变化。
- zai/glm-5.3-flash多引用OBJ59/60实际查询完成，16.6秒，返回20mm原点距离、世界ΔZ=-20mm、局部ΔZ=+20mm，工具无错误且结果未过期。
- 证据artifacts/layout-v4-validation/glm-multi-recheck.json；这是本次恢复，不宣称间歇性NotAuthorized原因已解决。

## 方案04已实现（2026-09-26）

- 用户实机反馈字号偏小后，主要文字调整为13–14px，按钮/辅助文字约12px；保留28px单行对象列表与紧凑顶栏，未缩放3D画面。

- 双视图四列、固定投影反向与CW/CCW 45°、全局XYZ方向标及原点轴开关；多选对象嵌入指令草稿、服务端版本校验。
- 用户执行中补充已纳入：28px列表单行编号/备注、超长省略/悬停全文；顶部合并紧凑入口、低频选项折叠，分类筛选放列表内；大列表窗口化。
- 32项Python+19项JS通过，实际应用DOM模块冒烟通过（WebGL替身，不是浏览器视觉验证）。HTTP资源200，源ZMX哈希未变。
- 重启桥接时宿主再次NotAuthorized，保留历史快照且拒绝新查询；本轮没有新的GLM真实多选验收。默认浏览器入口已打开，CUA无法连接Edge，未改用Tabbit。
- 默认浏览器排版/IME/Undo/GPU与真实多对象查询待验；详见docs/guides/workbench-v4.md和artifacts/layout-v4-validation。

## 运行入口修复（2026-09-26）

- 用户报告DSH打不开时，3080进程已停止，3081正常；直接start-dsh启动成功，停止原因未定位。
- open-dsh现在可在服务停止时启动；start-dsh重复运行复用同端口且身份匹配的进程。新增可双击open-dsh.cmd。
- 当前PowerShell与Windows PowerShell 5认证HTTP200；浏览器实际加载官方DSH界面，GLM-5.3-Flash显示正常。未修改模型凭据或占用其他服务端口。

## 已确定

- 目标为光学专家与 Agent 协作工作台；对话、空间交互和监控分离。
- 官方 DSH Web + Standard + 可替换非顶尖模型起步；不绑定 GLM，Creator 辅助开发。
- 独立光学服务持有模型访问，DSH 只做适配；先只读后写入。
- 个人模型试验与公司部署分开；公司允许开源框架，其模型与数据出口受控。

## 本轮交付

- M0 项目骨架、Codex AGENTS.md、项目铁律手册、两个项目级 skills、架构与接口草案。
- 合成场景及专家提交样例、无凭据配置样例、上游候选版本快照。
- 本地结构检查脚本；Git 已初始化为 main，尚无提交和远端。

## 初始化验证

- `python scripts/check_project.py`：通过，文档/skill 相对链接、JSON 与合成样例对象引用一致。
- 两个 skills 均通过 skill-creator 的 `quick_validate.py` 格式检查。
- 模型约束已由 GLM 唯一通道修正为非顶尖模型原则，示例 model 留空，待选择。
- Codex `/init` 对应的 AGENTS.md 入口已手工按背景建立；未执行交互式命令，未改全局 Codex 配置。
- 新 skill 在新任务的自动发现尚未实测，不把文件校验视为运行宿主已加载。

## 未实现/未验证

- DSH Web、三家文件工具调用及GLM的M2真实对象查询已实测；多模态与复杂任务仍未验证。
- Zemax只读连接/90对象快照/版本校验已实现；精确几何、跨版本永久身份、写入/恢复尚未实现。
- 独立Three.js近似几何/四视图查看器已实现；M3内嵌交互和AgentCanvas适配未实现。
- 已测 GLM-5.3-Flash、MiniMax-M2.7-highspeed、deepseek-flash；不等于已完成选型，图片能力未验证。
- 无远端仓库，无发布或推送。

## M1 第一步已完成：运行环境

- 项目本地安装 @deepseek-ai/dsh@0.1.5-rc.3，package-lock.json 固定依赖；Node 24.13.1。
- 独立 DSH_HOME 为 .runtime/dsh，只监听 127.0.0.1:3080；官方令牌认证保留。
- start/open/status/stop 脚本齐备；启动、认证 HTTP 200、停止/重启和实际浏览器页面通过验证。
- 通过官方 browse 目录选择器添加本项目，标准模式可见；模型引导选择稍后配置，无推理请求。
- OTel DISABLED、DeepSeek session log contribution关闭；完整网络出口审计尚未做。
- 运行说明：docs/guides/local-runtime.md；截图和检查证据：artifacts/dsh-host/（本地，Git忽略）。

## M1 三家接入冒烟测试（2026-09-26）

- 用户完成三家凭据录入后，Agent 经官方Web分别运行同一合成只读任务；实际请求头确认路由，三次均 completed。
- MiniMax/DeepSeek坐标与间距正确；GLM把Z平移误读为X。三家均识别合成数据与版本冲突。
- MiniMax实际加载 optdsh-optics-contract：当前DSH已发现该项目skill；不能再将项目skills一概视作只供Codex读取。
- 仅一次/模型，不能作质量排名；图像/仿真/写操作及长期稳定性未验证。
- 报告与证据：artifacts/model-smoke-20260926/report.md 和 results.json（本地，Git忽略）。用户原有hello会话保留，默认模型恢复MiniMax。

## M2 前置设计记录（下方 MVP 已执行）

- 用户指定相邻opt-assist为优先复用来源；先只读检查实际目录E:/Proj-2026-N02_opt-assist、连接封装/对象导出/注册表/手册。见docs/research/opt-assist-reuse.md。当时只补文档与方案，后续MVP实现见下方。
- M2先复用确定性读取，补world transform、revision与对象身份；M3采用场景组件＋DSH薄插件，先最小槽位与点选提交，再接真实快照。

1. 将合成场景的坐标解析与版本检查实现为确定性只读工具，避免依赖模型读取矩阵后自行推算。
2. 用本轮同一案例比较工具化后的效果，再确定首个光学助手基线。
3. 公司接入与完整网络出口另验；小样本成功不代表所有部署策略已经验证。
4. 图片输入独立验证；失败时保持结构化文本路径。

以上为M2实施前的安排；当前交付与剩余边界以下方MVP记录为准。

## M2 MVP 已实现（2026-09-26）

- 复用opt-assist连接封装，extension1只读连接本项目0926-optdsh-test模型；90对象GetMatrix成功，保留dirty=true。
- src/optdsh_optics提供两次一致读取、快照内容revision、保守对象引用和确定性相对位置；30秒worker超时、busy/断连错误处理，不自动fallback。
- 3081独立查看页面：搜索/过滤/点选、原点坐标轴与参考关系、主体/全景/聚焦、相对计算、复制提问草稿。不是实体曲面或光线渲染。
- DSH新增optics MCP四工具；首次新增启动组合未热加载，空闲重启后真实GLM验收成功：OBJ59→60世界ΔZ=-20 mm、局部ΔZ=+20 mm、原点距离20 mm。
- 12项离线测试通过；认证/跨源/无写路由/过期引用、刷新一致性、14个Ref0对象平移、磁盘ZMX不变及dirty状态保持已核验。源项目未修改。
- 证据：artifacts/m2-validation；使用说明：docs/architecture/m2-optics-bridge.md。
- 下一步由用户检查查看器与真实模型的物理意义，再推进M3内嵌场景及显式发送；复杂实体几何和长期稳定性仍待验收。

## M2.1 首版已实现（2026-09-26）

- Three.js 0.186.1项目依赖锁定、本地提供资源；单场景四相机，支持空间/XY/XZ/YZ、最大化、联动聚焦和正交缩放同步。
- 只读提取typed尺寸字段；90对象中63个参数化近似形状，15个参考对象，12个非比例标记。6个布尔结果不做CSG，复合镜片为名义代理。
- 分类配色、手动显示分类、分类显隐/隔离、半透明/实体/线框；不改变模型材料和可见性。
- 支持自定义鼠标组合键和聚焦键，冲突检查、localStorage保存、输入框排除。默认Shift+左键平移，正交相机锁定旋转。
- 19项Python+7项JS测试通过；Tabbit交互验证通过，旧20mm查询仍正常。证据 artifacts/m2-1-validation，使用说明 docs/guides/viewer-controls.md。
- 源模型ZMX哈希与升级前一致；没有保存或写入模型。用户可继续评估近似外观，M3嵌入与复杂几何后续实施。

## M2.2 布尔裁切（2026-09-26）

- 实现A&B镜片/矩形体封闭近似裁切，首操作数坐标系到结果对象姿态，补Clear外机械平边；不支持表达式/倾角明确保留标记。
- Manifold 3.5.4本地WASM Worker，32项几何缓存，旧revision结果丢弃，20秒超时；颜色/相机不重算，刷新保留视角。
- 既有真实快照6组全部生成裁切网格，浏览器Worker约81ms冷批次；缓存0.1ms，单镜片变化约7.1ms。加速60轮测试非一小时实机验收。
- 当前重新连接Zemax返回LicenseStatus=NotAuthorized，未修改授权配置；同模型旧快照可恢复显示，查询仍拒绝STALE_SNAPSHOT。实时编辑回读和专家逐对象对照待验证。
- 使用与证据：[布尔裁切](../docs/architecture/boolean-cuts.md)、[开源调研](../docs/research/frontend-reuse-research.md)、artifacts/m2-2-validation。
- 用户决定暂不增加自动采集；1次参数修改/min是持续性能基线，已写入AGENTS及铁律。

## M3 只读工作台 MVP（2026-09-26）

- 用户确认Zemax仍打开后重新连接，采集90对象成功，revision与M2.2一致，dirty保持；此前NotAuthorized原因未定位，不声称永久修复许可问题。
- 紧凑深浅主题、左右/底部可调整面板；回答与运行记录分开，同屏查看。
- 显式点选发送经DSH headless项目适配返回回答，独立单次会话；不是官方Web内嵌，也不是连续多轮聊天。
- 模型仅看到无参数selection_context工具，后端绑定modelId/revision/objectId/比较目标，代码计算关系；真实工具目录验收只有这一项。
- 旧版本拒绝、请求幂等、单任务、跨源/认证、取消已验；30项Python、13项JS通过。证据artifacts/m3-validation。
- 用户新增近期策略：只测试glm-5.3-flash，不再测试MiniMax表现；config/optics-model.json和项目DSH默认同步，GLM实测结果单列。
- 初期MiniMax接线样例曾误缩写ID并猜测过期；已用绑定工具消除此类参数输入。仍需评价GLM答案质量，不能把completed当所有解释正确。
- 下一步：用户体验当前布局和只读问答；官方Web内嵌、真实写提案、完整非球面和长期性能后续推进。

- GLM实测补充：两次zai/glm-5.3-flash完成，裁切核心关系正确（仍有解释边界问题）、20mm相对位置正确；用时25.6/20.7秒，不推广为质量全面通过。
