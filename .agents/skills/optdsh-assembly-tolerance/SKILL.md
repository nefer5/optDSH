---
name: optdsh-assembly-tolerance
description: optDSH装调公差分析统一入口。先识别Tx发射、Rx接收或两者的用户意图，再按独立流程处理镜片装配误差与光源/SPAD耦合；Tx支持原生NSC公差及脚本MC/末样本补偿/局部灵敏度的副本运行，Rx按独立流程处理；完整多自由度装调质量仍需专项验证。
---

# 装调公差分析

新增[Tx自定义脚本流程](references/tx-custom.md)及[YAML样例](config/tx-custom.example.yaml)：用户明确选择不走内置公差模块时采用。先确认模型已处理非预期参考链，再脚本MC、只补偿最后样本并采集局部灵敏度，保存最终副本和HTML。工作台与CLI仍共用同一串行入口；不得自动改参考链或修改活动原模型。

Tx已加入原生NSC公差执行入口：见[Tx流程](references/tx.md)、[正式YAML样例](config/tx-native.example.yaml)。工作台“Tx 公差”与CLI共用同一串行服务；只在CopySystem写TDE/MFE、运行原生Tolerancing，支持独立灵敏度与小批MC。先读取当前快照填objectId/revision，不沿用设计稿示例对象。历史[设计说明](references/tx-native-design.md)保留设计取舍，当前执行限制以下方Tx流程为准。

## 先识别意图，再选择流程

从用户本轮要求、已确认上下文和显式对象选择判断分析侧及阶段；不要仅因模型里同时存在Tx/Rx就自动分析两侧。

| 用户意图 | 后续流程 |
|---|---|
| Tx、发射镜组、发散角、H-D86、四die光源耦合 | 读取[Tx流程](references/tx.md)，使用Tx独立配置 |
| Rx、接收镜组、SPAD耦合、接收面H/V光斑 | 读取[Rx流程](references/rx.md)，使用Rx独立配置 |
| 明确要求Tx和Rx都分析 | 分别读取两流程，独立配置、预检、结果；一侧缺项不阻塞另一侧 |
| 只说“公差分析”，上下文无法确定侧别或有冲突 | 先问Tx、Rx还是两者；可说明能力，不猜对象和配置、不启动仿真 |

识别阶段：规划/预检、离线指标、Tx未补偿功能试跑、完整6D补偿/Monte Carlo。用户要求完整分析时不能静默降级为功能试跑；先说明尚未实现部分。仅要求Tx试跑，不用完整6D规格或Rx缺项阻塞它。

在官方DSH中通过原生`skill`工具读取本技能，识别侧别后用`mcp__optics__workflow_guide(name="assembly-tolerance", scope="tx"或"rx"或"both")`按需获取分支指引、独立配置和预检；该工具只能读取包内固定资源，不执行仿真。工作台和官方Web是同一会话的等价入口，使用该会话的Standard工具、文件权限和审批；关联工作台不收窄工具能力。可通过可用文件工具直接读取包内引用，或使用Shell调用本Skill的CLI。Tx执行须满足用户授权、模型/revision校验、独占连接、CopySystem及回读恢复流程，不能因可用Shell而跳过这些检查。指引工具不可用时可按包内文件继续；旧`tx-tolerance/rx-tolerance`只保留为兼容工具别名。旧headless聊天路径仍停用，不另起Agent接管同一会话。

## 共用约束

- 术语与物理H/V采用[2t2rLidar领域契约](../../../docs/2t2rLidar/README.md)；探测器局部坐标或角度采样不自动等于物理H/V，具体映射仍按模型核验并记录。

- 镜片先装入镜筒，再耦合光源或SPAD；内部误差与镜筒整体误差分开，Boolean构造体不重复算作独立镜片。
- 旧Tx试跑为H-D86；本轮原生Tx改为两die的RMS H等效角宽，距离采用用户核对的探测器全局Z；机械组由配置指定，不按评价die数拆分封装。Rx为矩形H/V光斑，SPAD整体6D。坐标、旋转枢轴、行程、指标口径与能量有效性须显式配置。
- 对象映射绑定modelId/revision，换模型或版本须重核；对象编号不当永久身份。对象、扰动幅度不从旧对话猜测。
- 规划、合成/离线数据、真实追迹、补偿优化分开报告。Tx原生入口可配置六维并调用连续补偿；本轮实测覆盖小样本和少量自由度，不宣称完整6D装调或良率验收。Rx能力按独立分支。
- 真实执行遵循Tx流程的独占连接、副本、回读与恢复条件；不得写入活动主模型。Agent停止不等于仿真已停止。

完整装调规划再读[两阶段工作流](references/workflow.md)；对象候选或离线计算再读[名义基线](references/baseline.md)。不必为单侧任务加载另一侧细节。

## 配置与命令

包内模板复制到项目`config/`后核对；优先YAML，旧JSON兼容，同一流程只维护一份有效配置。位置mm、转角deg；模板中的null代表待确认，不能当正式规格。

| 阶段 | 包内模板 → 本机配置 | 项目根目录命令 |
|---|---|---|
| Tx自定义脚本 | [tx-custom.example.yaml](config/tx-custom.example.yaml) → Study配置 | `python .agents/skills/optdsh-assembly-tolerance/scripts/run_tx_native.py <配置.yaml> --execute --wait` |
| Tx原生公差 | [tx-native.example.yaml](config/tx-native.example.yaml) → Study配置 | `python .agents/skills/optdsh-assembly-tolerance/scripts/run_tx_native.py <配置.yaml> --execute --wait` |
| Tx未补偿试跑 | [tx-pilot.example.yaml](config/tx-pilot.example.yaml) → `STUDYS/2t2rLidar/configs/tx-pilot.local.yaml` | `python .agents/skills/optdsh-assembly-tolerance/scripts/run_tx_pilot.py STUDYS/2t2rLidar/configs/tx-pilot.local.yaml` |
| Tx完整装调预检 | [tx-tolerance.example.yaml](config/tx-tolerance.example.yaml) → `STUDYS/2t2rLidar/configs/tx-tolerance.local.yaml` | `python .agents/skills/optdsh-assembly-tolerance/scripts/preflight.py STUDYS/2t2rLidar/configs/tx-tolerance.local.yaml --scope tx` |
| Rx装调预检 | [rx-tolerance.example.yaml](config/rx-tolerance.example.yaml) → `STUDYS/2t2rLidar/configs/rx-tolerance.local.yaml` | `python .agents/skills/optdsh-assembly-tolerance/scripts/preflight.py STUDYS/2t2rLidar/configs/rx-tolerance.local.yaml --scope rx` |

Tx命令默认只生成plan，追加`--execute`才进入已授权的副本追迹；使用`config/optics.local.json`指定的Python环境。预检只读、不会追迹；旧组合配置可用`--scope tx/rx`只检查所选侧。完整装调预检即使规格完整也不返回可执行，因为优化执行器尚未实现。

正式产物遵循[公共运行包规范](../../../docs/runs-and-reports.md)，执行消费包内冻结配置，简单任务可MD、复杂任务HTML，背景与关键Setup先行、配置原文折叠，输入证据与SHA-256随包；简短预检可只输出JSON。历史run不随本次整合改写。
