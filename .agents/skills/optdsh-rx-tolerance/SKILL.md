---
name: optdsh-rx-tolerance
description: 独立规划和预检Rx装配公差及SPAD整体6D耦合，使用矩形H/V光斑指标；目前不执行Rx追迹、公差或优化。
---

# Rx 装调公差

读取 [公共装调工作流](../optdsh-assembly-tolerance/SKILL.md)，使用独立Rx配置，scope=rx；不要求Tx数据。对象映射、扰动范围、SPAD和目标探测面序号、尺寸口径、6D枢轴/范围保存在配置中，不写死在Skill。

预检命令：`python .agents/skills/optdsh-assembly-tolerance/scripts/preflight.py <Rx配置>`。
当前只有预检及离线指标能力；不能调用Tx执行器冒充Rx仿真，也不能因Tx功能测试通过而宣称Rx已接入。
