# optDSH Agent 规则

## 入口与范围

- 先读 README.md、planning/STATUS.md；按任务再读对应 docs。更新实现时同步状态与必要设计说明。
- 当前起点：官方 DSH Web + Standard + 可替换的非顶尖模型；不绑定 GLM，不依赖最强模型隐式兜底。Creator 辅助开发。详见 docs/decisions/0001-start-with-official-web-standard.md。
- 项目模型原则与部署策略分开：个人合成数据试验可选择模型；公司资料仍遵守公司模型/数据出口限制。
- 图片、工具调用等能力按实际端点验证，不得将模型名或配置声明当作证明。
- 近期测试策略（2026-09-26用户指定）：产品运行验证集中于 `glm-5.3-flash`，暂停MiniMax表现测试；失败不自动切备用模型。配置入口为config/optics-model.json，长期原则仍是不依赖顶尖模型。

## 光学事实与交互

- Zemax 为光学模型与求解权威。网页近似几何、草图、抽样光线必须与真实状态区分。
- 单一服务持有并调度同一模型的写入口；所有对象引用携带模型身份与 revision；编号不能当永久身份。
- 坐标、单位、参考对象、旋转语义必须明确；不能从截图推断后直接写模型。
- 先只读闭环，再做修改。写操作必须有前置版本检查、专家确认、执行后回读及恢复策略。
- 专家选择/标注是意图，只有提交后才进入 Agent；草稿和鼠标移动不自动成为提示词。
- Agent 停止不等于仿真停止；仿真作业单独报告状态、取消能力和结果版本。

## 工程与交付

- 配置型Skill优先采用YAML，包内必须在`config/`目录附带可复制的YAML样例（`xxx.example.yaml`），并由SKILL.md链接说明；执行器须实际支持并校验，原始配置随run保存。共性要求见[铁律OPT-14](docs/governance/project-rules.md#opt-14-skill配置范式)。

- 所有正式Skill/分析运行统一使用公共run包：`runs/<workflow>/YYMMDD-NN/`，开始排他分配一次，整条链路沿用，不覆盖、不重复嵌套。默认人读报告`report.html`；执行前保存实际配置快照，执行消费run内配置；结果、输入证据、状态和SHA-256随包。通用规范见[运行包规范](docs/governance/run-bundles.md)，不在各Skill重复维护。服务日志/临时诊断仍用artifacts，凭据不入run。

- 浏览器偏好（2026-09-26用户指定）：DSH与光学工作台仅使用系统默认浏览器打开和操作，不再使用Tabbit；启动入口交给系统默认关联。

- 性能是持续约束：以每分钟一次镜片参数修改作为当前基线。布尔计算移出UI线程，按几何依赖缓存，限制缓存容量并释放GPU/WASM资源；四视图共享几何，颜色/相机操作不触发布尔重算。性能结论必须区分采集、网格重建、显示和长时间运行证据。

- 光学逻辑独立于 DSH；DSH 插件只做工具、事件、前端适配。先使用现成循环，按证据决定更深定制。
- 不直接修改其他项目、全局工具或当前 Zemax 会话来完成本项目初始化。
- docs 保存长期设计；planning 保存当前状态；正式运行数据在runs，服务日志与诊断在artifacts。凭据、商业模型、CAD、光线大数组和原始会话不进 Git。
- 新依赖固定版本、隔离安装；变更范围内验证。新增行为测试真实边界，不为文案修改添加形式测试。
- 对外结果标注“设计/模拟/已接入/已实测”；最终回复必须交付用户原问题，维护信息不能替代正文。
- 本项目初始化并不授权发布、推送远端、安装全局工具或连接生产模型。

## 按需入口

文档总入口：[docs/README.md](docs/README.md)。开始相关工作前按下表读取对应约束，不要求每轮通读全部docs。

| 工作内容 | 必读入口 |
|---|---|
| 新建/改造Skill、配置设计 | [项目铁律OPT-14](docs/governance/project-rules.md#opt-14-skill配置范式)：包内`config/xxx.example.yaml`、真实解析校验 |
| 分析/评测/仿真及报告 | [运行包规范](docs/governance/run-bundles.md)：短ID、配置冻结、HTML、证据校验 |
| Zemax连接、对象读写、数据契约 | [数据契约](docs/architecture/contracts.md)、[N02复用与副作用](docs/research/opt-assist-reuse.md)，再读optics-contract Skill |
| 几何/布尔/多视图性能 | [布尔裁切与性能](docs/architecture/boolean-cuts.md)，遵守每分钟一次参数修改基线 |
| 会话、画板、专家提交 | [持续会话](docs/architecture/conversations-canvas.md)、[官方画板](docs/architecture/canvas-session-boards.md)，按产品入口区分适配 |
| 本地启动/认证/部署 | [运行指南](docs/guides/local-runtime.md)、[开发与数据出口](docs/governance/development.md) |

`docs/archive/`只用于历史追溯；关键约束迁移或新增后必须同步本表及docs导航。正式结果在runs，当前状态在planning，不混入docs。

- Tx/Rx公差独立：Tx用`.agents/skills/optdsh-tx-tolerance/SKILL.md`，Rx用`.agents/skills/optdsh-rx-tolerance/SKILL.md`。对象序号和扰动幅度来自独立配置，不硬编码进Skill；Tx功能执行器仅操作CopySystem，工作台产品仍只读。

- 官方DSH会话画板绘制/修改：`.agents/skills/optdsh-canvas/SKILL.md`。这是项目专项Skill，使用原生canvas工具；不修改或混用本机主目录的通用agent-canvas Skill。

- Zemax连接/读取/分析能力开发前，优先参考相邻 `E:/Proj-2026-N02_opt-assist`；已核对的复用入口与副作用见 [复用备忘](docs/research/opt-assist-reuse.md)。只读参考不授权修改旧项目或活动模型，不复制未经检查的连接样板。
- 规则理由与验收见 [项目铁律手册](docs/governance/project-rules.md)，不用每轮全读所有文档。
- 模型基线/切换/对照评估：`.agents/skills/optdsh-model-baseline/SKILL.md`。
- 场景快照/对象选择/坐标/版本契约：`.agents/skills/optdsh-optics-contract/SKILL.md`。
- 领域工作流优先做项目Skill，确定性计算和连接在工具/脚本中；不要只在聊天提示词里临时编排。连续专家协作：`.agents/skills/optdsh-expert-collaboration/SKILL.md`；Tx/Rx镜筒装调公差：`.agents/skills/optdsh-assembly-tolerance/SKILL.md`（当前预检/设计阶段）。
- 检查命令：`python scripts/check_project.py`。项目 skills 是指令资源；2026-09-26 DSH Standard 已实际发现并调用 optics-contract，注意开发与产品 Agent 的作用范围，不能假设它们只被 Codex 读取。
