# Rx装调公差流程

接收镜片先装筒，再整体6D耦合SPAD。当前仅有规格预检、对象候选与离线矩形H/V指标；没有Rx追迹、公差执行或优化，不得借用Tx执行器代替。

1. 读取独立`config/rx-tolerance.local.yaml`，不存在则兼容同名JSON；初次使用复制[Rx模板](../config/rx-tolerance.example.yaml)。缺少Tx信息不阻塞Rx。
2. 确认接收通道、镜片机械分组、SPAD与测量面，绑定modelId/revision；多接收通道分别确认，不按编号或名称猜测。
3. 运行`python .agents/skills/optdsh-assembly-tolerance/scripts/preflight.py <Rx配置> --scope rx`，仅报告Rx及共用规格缺项。明确H/V测量坐标、尺寸包络/阈值、捕获能量门限以及SPAD的6D基准、枢轴与行程（位置mm、转角deg）。
4. 完整装调计划按[两阶段工作流](workflow.md)；已有快照/光斑数据则按[基线入口](baseline.md)做候选映射或离线计算。独立H/V能量区间不等于二维矩形内同等能量。
5. 交付预检或离线指标，并说明来源和未实现部分；不得宣称真实Rx仿真、补偿结果或良率。正式报告沿用[公共运行包规范](../../../../docs/runs-and-reports.md)。
