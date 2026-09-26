# opt-assist 参考与 M2/M3 实施备忘

日期：2026-09-26。用户明确要求优先参考相邻项目已有的 Agent 辅助 Zemax 工作。

## 现场核对范围

实际根目录是 `E:/Proj-2026-N02_opt-assist`。本轮未发现 `E:/Proj-2026-N02/_opt-assist`；后续以实际单层路径为准。只读检查了源码、规则、注册表和说明；没有启动旧脚本、连接 Zemax、修改相邻项目或执行其测试。

本次源仓库 HEAD：`9f8d7a3`；git status --short 无输出。`.venv/Scripts/python.exe` 和归档 `docs/reference/zemax/2025-r1/ZOS-API.chm` 存在。源码存在、旧项目标记验证过与本项目端到端验证是三种证据，不混用。

## 优先参考入口

以下路径均相对 opt-assist 根目录。

| 入口 | 本次看到的内容 | 在 optDSH 中的用法 |
|---|---|---|
| AGENTS.md、README.md | Interactive Extension 入口、netfx、对象引用及单写资源约束 | 先继承已有工程经验，运行前复核现场环境 |
| src/auto_zemax/connection.py | OpticStudio context manager；extension退出不关闭用户GUI，standalone关闭自己创建的应用 | M2连接能力首选复用对象；显式指定extension，类默认值是standalone |
| scripts/check_extension_connection.py | 旧项目推荐的连接冒烟入口 | 未来连接验证时阅读并复用，非本轮自动运行 |
| .agents/skills/zemax-nsc-module-tools/scripts/zemax_nsc/editor.py | dump_nce/dump_system，序号、comment、类型、参考对象、位置、倾角、材料、单元格与部分镀膜信息 | 作为原始数据抽取参考，映射成optDSH场景契约 |
| 同目录 cli.py 的 inspect_model | 活动系统导出；传--file时创建新系统、加载文件并关闭 | 不能仅因命令叫inspect就视作无宿主副作用；第一步只用已授权活动模型的读取路径 |
| 同目录 core.py | connection配置默认为extension；RunContext默认写入旧项目temp | 适配时显式设置输出到optDSH artifacts，避免跨项目写入 |
| src/auto_zemax/runtime/backups.py | 集中的模型写前备份机制 | M4参考；M2只读阶段不调用保存/备份以免改变dirty状态 |
| src/auto_zemax/capabilities/ | dichroic_aoi、镀膜、光谱、LiDAR分析等 | 后续按实际需求接入，不在M2整包执行 |
| .agents/registries/skills.yaml | installed/lab、maturity和版本分开；nsc-module-tools为0.1.0 candidate | 选择具体能力前核对成熟度，lab不当生产入口 |
| tests/、skill自带tests/、docs/reference/zemax/ | 离线验证与本地官方手册 | 复用用例和API依据，现场结果仍需专家对照 |

## M2：复用已有读取能力，增加 optDSH 适配层

推荐短期使用独立Python桥接进程，在本机通过显式配置引用旧项目确定性模块；DSH调用该服务，不直接把.NET对象交给前端或模型。依赖路径、解释器和源commit需记录。先不复制整个仓库、不增加全局PYTHONPATH，也不让两个项目同时占有并写入同一GUI模型。旧项目尚无可直接pip安装的pyproject.toml，不能把它当已发布SDK。

长期若两边都稳定依赖同一能力，再提取公共包或维护明确版本依赖。相邻仓库有变动时先核对差异，不能静默把未验更新带入产品。

### 可以省掉的重复工作

ZOS-API初始化、netfx处理、Interactive Extension经验、NCE字段读取、comment显示规范、部分分析适配、测试样例及官方手册检索。

### M2仍需补齐

- 从原始字段生成世界变换；不能把相对RefObject的位置与倾角直接贴成世界坐标。旋转顺序、参考链和单位按API/已知样例验证。
- 原dump部分字段用getattr缺省值和异常吞掉策略。本项目对关键坐标/身份字段须返回unknown或明确错误，不能把缺字段产生的0当真实位置。
- 建立modelId、revision、capturedAt和对象引用；Comment用于人类辨识，不是唯一ID。初期无法可靠跟踪插删时使旧映射整体失效，拒绝猜测身份。
- 检查读取前后状态，防止将一次外部编辑跨越的两份数据拼成同一快照；无法确认一致性时明确标记。
- 补齐busy/disconnected/unsupported状态、只读工具输出和本项目产物目录。
- 独立计算对象相对位置/距离等确定性结果，避免让模型重现本次GLM读矩阵错误。

M2最小交付：一个经授权活动模型的快照 + 对象查询 + 相对位置查询，通过与Zemax的对象/姿态/单位对照。旧项目关于2025 R1、standalone许可证不可用的记录是现场复核线索，不能当成本轮已重新验证。

## M3：对象中心的只读协作工作台

采用“可独立验证的场景查看组件 + DSH薄前端插件 + M2数据服务”。组件消费同一个场景契约，先用冻结快照调试，再切换到M2真实快照；两种来源在UI显式区分。

### 界面构成

- 中央可伸缩的三维场景区：旋转、缩放、正交视角、局部坐标轴、选中高亮。
- 对象树与属性区：显示OBJ序号[当前Comment]、类型、参考对象、本地/世界坐标、数据版本。
- 对话区：复用DSH对话与模型选择。
- 独立可展开运行区：当前连接、快照时间/版本、工具调用/错误；原始轨迹沿用DSH轨迹视图，不塞进最终答案。

空间查看组件可使用WebGL渲染实现；具体库在首个对象类型与几何样例确定后锁定。渲染组件不承担Zemax坐标语义或光学计算。

### 第一批点选动作

“查看真实参数”“查询相对位置”“解释参考关系”“把对象引用加入提问”。点击对象先产生选择草稿，用户确认发送后才进入指定会话。提交携带modelId、revision、objectId和原话；相对位置问题携带两对象，不让模型根据屏幕左右猜目标。

### 几何与真实性

先覆盖一个真实模型里少量已知类型，例如透镜/探测器/参考对象。真实姿态配简化轮廓即可开始，明确标示“简化显示”；未知类型显示标记/包围表示，不伪造精确曲面。后续再增加曲面、CAD与代表性追迹光线，不以重建完整Zemax渲染器作为M3前提。

### 状态同步

先提供“刷新快照”，在宿主允许的读取点执行；别假设API占用时仍可高频读取。正在分析时显示最后已确认状态及过期提示。点击对象绑定当时版本；刷新后对象映射改变，取消或重新确认旧选择，不自动指向同编号新对象。

### DSH接入方式

沿固定0.1.5-rc.3的Client Modules、Slots、Host/API与Session接口接入。优先独立场景面板与现有对话并排，先做最小槽位探针验证布局和提交回显，再投入完整三维组件。不要直接编辑node_modules；如该版本槽位不足，用独立页面通过适配器联动作为可回退方案，而非立即fork整个客户端。

M3验收：点击真实对象 → 提问“它相对探测器在哪” → Agent调用M2工具 → 答案绑定正确对象和revision → 场景高亮对应对象 → 运行区可核对工具证据。刷新和断连不允许显示伪造的实时状态。

## 与 AgentCanvas 的关系

M3先把“选中对象加入提问”做通。随后将AgentCanvas作为草图/批注面，使用同一对象引用与revision关联；草图表达设计意图，真实场景显示宿主状态，两者不互相覆盖。无需为启动M3先重写或深度合并整个画板项目。

## 参考

- [DSH 0.1.5-rc.3 Web架构](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/docs/subsystems/web-client.md)
- 本项目 [架构](../architecture/architecture.md)、[契约](../architecture/contracts.md)、[路线](../../planning/ROADMAP.md)。
