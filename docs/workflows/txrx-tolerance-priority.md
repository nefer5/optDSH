# 近期优先：Tx/Rx装调公差分析

2026-09-26用户明确将此列为近期急需任务。领域工作流统一采用项目Skill，确定性计算放工具/脚本；本页仅作业务入口，不复制完整方法。

## 用户已确认

| 系统 | 指标 | 镜片装好后的补偿对象 | 自由度 |
|---|---|---|---|
| Tx | H向D86全角发散角 | 四颗die整体光源组件（用户已确认） | XYZ及三转角，共6D |
| Rx | SPAD接收面光斑矩形H、V尺寸 | SPAD | XYZ及三转角，共6D |

镜片组先安装在镜筒内，再进行整体耦合；不将“整体耦合”误解为允许镜筒内镜片任意重新优化。

## 入口与阶段

2026-09-26更新：Tx/Rx已拆开独立进行。Tx使用[Tx Skill](../../.agents/skills/optdsh-tx-tolerance/SKILL.md)，Rx使用[Rx Skill](../../.agents/skills/optdsh-rx-tolerance/SKILL.md)。对象序号、扰动范围与测量参数保存在独立配置，当前Tx功能配置为config/tx-pilot.local.yaml。Tx已在CopySystem完成18工况未补偿试跑；HTML报告runs/tx/260926-01/report.html（历史实测结果整理）。名义1.172°，最大变化0.004°等于一像素，尚需采样与物理口径收敛。以下预检描述保留为完整装调优化阶段说明；6D优化、制造统计和Rx执行仍未实现。

- [装调公差Skill](../../.agents/skills/optdsh-assembly-tolerance/SKILL.md)：步骤、输入、补偿约束和验收。
- [规格模板](../../examples/txrx-assembly-tolerance.json)：确认值已填入，未知数保持null。
- 预检：`python .agents/skills/optdsh-assembly-tolerance/scripts/preflight.py examples/txrx-assembly-tolerance.json`。

Tx已有未补偿单因素功能测试；Rx仍为预检与离线指标。Monte Carlo或6D优化尚未实现。
后续优先落实：对象/镜筒分组与参考系 → 名义指标提取 → 单因素误差及补偿前后对照 → 联合抽样和补偿量统计。
真实扰动需使用明确授权的测试副本及恢复方案，不能直接对活动模型写入。

仍待确认：D86投影/包络计算细则、Rx尺寸能量包络/阈值、指标限值、6D行程/枢轴/坐标、误差分布及相关性、采样数量与最低有效能量条件。

## 映射与离线指标基础（2026-09-26）

实时快照读取90对象，候选映射在artifacts/tolerance-baseline/mapping-review.md与object-inventory.json；当前本机规格保存在Git忽略的config/assembly-tolerance.local.json，绑定该快照版本。
四die刚体组已确认；其余机械分组只做候选，未将参考链自动认作镜筒结构。Rx1/Rx2优先级等待用户选择。
Skill新增baseline.py：生成候选清单，或对显式坐标/权重样本计算Tx H-86%全角区间和Rx矩形H/V；计算口径必须指定，未将旧项目90%定义套入D86。
8项新增边界测试通过；合成CSV实际执行成功，数值不是模型名义测量。此处为早期离线准备记录；后续Tx新追迹证据见上方run报告，Rx真实基线尚未取得。
