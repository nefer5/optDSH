---
name: optdsh-assembly-tolerance
description: 规划和检查Tx/Rx镜筒装配后耦合的公差分析；用于镜筒内镜片误差、Tx光源6D补偿、Rx SPAD 6D补偿及补偿前后性能对比。提供任务预检、对象映射候选和离线名义指标计算，不执行Zemax公差仿真。
---

# Tx/Rx 镜筒装调公差

## 当前能力

Tx与Rx独立进行：Tx功能测试使用 [Tx Skill](../optdsh-tx-tolerance/SKILL.md)，Rx使用 [Rx Skill](../optdsh-rx-tolerance/SKILL.md)。本公共Skill的预检接受scope=tx/rx/both（旧配置默认both）；以下未实现描述指完整装调优化工作流。

已实现：任务预检、快照对象映射候选、带权角分布/光斑样本的离线指标计算。尚未实现：扰动模型、追迹、6D优化、灵敏度或Monte Carlo执行。不得将计划、预检或对话完成称为公差结果。
在DSH受限工作台中用 `mcp__optics__workflow_guide(name="assembly-tolerance")` 读取本指引和任务预检；工具不存在则按本文件定位脚本，不绕过写入口。

## 已确认业务口径

- 装配顺序：镜片组先装入镜筒，再整体耦合。
- Tx指标：H向D86全角发散角；补偿对象是光源，六自由度XYZ及三转角均可调；用户已确认四颗die整体刚体运动，不能独立优化四颗或简单给各自叠加相同欧拉角。
- Rx指标：SPAD接收面上光斑的矩形H、V尺寸；补偿对象是SPAD，六自由度均可调。
- 6D“可调”不等于无限行程。需要明确坐标基准、旋转枢轴、实际范围与分辨率。
- 尚未确认：D86投影/包络计算口径、Rx尺寸包络/阈值、目标上限、误差分布与相关性、样本数。

先读取 [任务说明](references/workflow.md)；示例规格位于 [当前任务模板](../../../examples/txrx-assembly-tolerance.json)。模板为待确认任务，不是仿真结果。

## 工作方式

1. 建立模型/revision与对象分组：镜筒、内部镜片、光源、SPAD、参考对象和布尔构造关系。不要将Boolean构造体与结果重复计作独立装配误差。
2. 用脚本 `python .agents/skills/optdsh-assembly-tolerance/scripts/preflight.py examples/txrx-assembly-tolerance.json` 列出已确认项、错误和缺项；向专家只询问影响当前阶段的缺项。
3. 先冻结名义状态和指标，再单因素探索灵敏度，再讨论抽样。每次抽样先施加内部制造/装配误差；这些误差在后续耦合阶段保持不变。
4. 同一误差样本上分别记录未补偿与补偿后结果。Tx只优化允许的光源自由度，Rx只优化允许的SPAD自由度；不能暗中优化镜片参数来消除装配误差。
5. 保留失败/未收敛/越界样本，明确分母；输出补偿量、可调范围用量、Tx H-D86、Rx H/V、能量有效性检查及版本/种子。

涉及真实扰动/优化时另需已实现的版本化写工具、明确授权的测试副本、恢复策略与执行后回读。当前工具未提供这些能力，停在可审查计划，不调用通用Shell对活动模型变更。

## 交付

正式报告与计划遵循[公共运行包规范](../../../docs/governance/run-bundles.md)，默认HTML、短ID与配置快照；简单交互式预检可只输出JSON。领域步骤保留在本skill，确定性算法在脚本/工具中。后续执行结果必须能追溯配置、模型、采样种子与未补偿/补偿后同一组样本。

## 名义基线准备

使用 [数据契约与命令](references/baseline.md) 指导映射和离线计算。
`baseline.py inventory`仅按API类型/布尔引用产生候选，不把Comment或坐标链自动提升为机械装配确认。
`baseline.py metrics`要求显式方法、坐标系、输入来源；输出baselineApproved=false，不能把合成数值或无trace来源的缓存称为名义实测。
本机已确认的任务规格优先从config/assembly-tolerance.local.json读取；文件不存在再用examples模板。换模型/revision必须重新确认对象映射。
