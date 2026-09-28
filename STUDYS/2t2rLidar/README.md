# 2t2rLidar

2T2R LiDAR研究的配置与证据入口。这里记录研究目标和结果导航，执行约束以业务Skill为准。

跨模型通用术语与H/V方向使用[2t2rLidar领域契约](../../docs/2t2rLidar/README.md)。具体模型的对象、局部轴、零位和控制系数在当次配置/inspect中核对，不从通用文档猜测。

2026-09-27用户确认：当前控制角关系继续沿用[已确认H/V映射](../../docs/2t2rLidar/angles.md#5-当前控制角映射用户已确认)，没有变化。

## 配置与执行入口

- [研究背景表单](ui/background.form.yaml)：MVP 可编辑界面由独立 [optdsh-forms 插件](../../plugins/optdsh-forms/README.md) 提供，[study.yaml](study.yaml) 指向表单和本地背景文件。未确认参数留空；只收集信息，不生成run或改模型。
- [临时填写示例](ui/briefing-request.example.yaml)：演示一次 Skill 所需信息的独立收集，答案不写回长期背景。
- [结构化参数页](ui/lidar-parameters.form.yaml)：按模块维护数值、发射通道、光谱点及逐发时序，支持模式切换。默认页由study.yaml指定；参数保存在configs/parameters.local.yaml，与旧背景说明分开。
- [公差临时配置示例](ui/tolerance-request.example.yaml)：盲装/耦合件、随动成员、逐轴范围或μ/σ及方法设置；候选与预填值全部为合成示例，只收集配置，不连接真实模型或启动分析。

- [本机配置](configs/)：Tx/Rx装调等实际参数，Git忽略。
- [装调公差Skill](../../.agents/skills/optdsh-assembly-tolerance/SKILL.md)：Tx/Rx独立分支。
- [Rx收光效率Skill](../../.agents/skills/optdsh-rx-collection-efficiency/SKILL.md)：H/V视场扫描。

活动模型仍保留原test/zmx路径，避免移动Zemax已打开文件；平台绑定入口是config/optics.local.json。新研究模型可放本Study/models，不入Git。

## 运行记录

2026-09-27新增DSH+GLM真实小扫描：[260927-11](runs/rx-fov/260927-11/report.html)为9点、每点20000光线；[260927-12](runs/rx-fov/260927-12/report.html)为相同条件独立中心复测。主模型保全和副本关闭均通过，但中心面积归一效率0.201416%与0.032469%不一致，暂不接受定量视场结论。[联合审计报告](../../runs/rx-agent/260927-01/report.html)保留异常、干预与分段计时；不据此确定几何或采样成因。

| 位置 | 内容 |
|---|---|
| [runs/tx](runs/tx/) | Tx功能试跑历史结果与计划，2个运行包 |
| [runs/rx-fov](runs/rx-fov/) | Rx扫描计划、预检、失败及真实执行，7个运行包 |
| [runs/rx-report](runs/rx-report/) | Rx结果报告整理，1个运行包 |

2026-09-27从根runs整体迁入，保留run ID、包内文件与SHA256；未重新追迹或改写历史配置。旧证据中原始绝对路径保留为执行当时事实，定位迁移后的包请用[路径映射](run-locations.json)。后续数量以目录和manifest为准。
