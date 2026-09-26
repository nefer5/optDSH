---
name: optdsh-tx-tolerance
description: 独立执行Tx镜片装配公差功能测试，读取配置生成单因素扰动，在Zemax内存副本上追迹并计算H向D86全角；不依赖Rx规格，不执行6D补偿或良率分析。
---

# Tx 装配公差功能测试

镜片先装筒，Tx光源组件整体6D耦合。四颗die必须作为刚体；当前执行器只验证未补偿镜片扰动，不能宣称已完成耦合优化。

## 参数入口

读取 `config/tx-pilot.local.yaml`，不存在则参考 [配置模板](config/tx-pilot.example.yaml)。镜片、光源、目标探测面序号、扰动幅度、分辨率、追迹光线数、随机种子、指标口径全部来自配置；不从本Skill或旧会话猜序号。modelId与expectedRevision绑定当前快照，换模型必须重核对象类型、参考链和机械分组。

`perturbations` 中位置单位mm，倾斜单位deg；幅度生成正负两个工况。它们是功能测试幅度，不能当制造规格。`sources.indices`是整体光源组，`lenses[].index`是独立扰动镜片，`detector.index`是采集目标。Compound Lens的构造面不重复当装配误差。

## 执行

1. 用配置中指定的Python环境运行 `scripts/run_pilot.py <config>`，默认只生成plan运行包；遵循[公共运行包规范](../../../docs/governance/run-bundles.md)，默认`runs/tx/YYMMDD-NN/`，`--runs-root`指定父目录。配置先冻结到包内，后续实际执行读取快照；输出`report.html`、`result.json`和校验清单。
2. 已获测试授权后，检查工作台无活跃任务，暂停3081桥接，确保只有执行器连接该宿主。加 `--execute` 执行。不要借用DSH通用Shell绕过此流程。
3. 执行器核对文件/modelId/revision，创建独立CopySystem；只在副本解除采样参数Pickup、禁用非目标光源、配置角域采样。遇到未知坐标依赖、写后回读不符、连带位姿变化立即停止。原模型不保存、不载入、不写入。
4. 每个工况清探测器、固定种子追迹；能量积分校验通过后计算显式定义的H向D86全角。默认模板equal-tail表示7%–93%区间，仅为试跑口径；Detector Rectangle的角坐标是径向投影，不等同笛卡尔XZ角。
5. 最后关闭副本不保存，检查primaryUnchanged、原文件哈希及cleanupErrors，恢复3081桥接。失败不能报告为已完成。

完整6D补偿的坐标/枢轴/行程与制造误差预检仍用 [公共装调Skill](../optdsh-assembly-tolerance/SKILL.md)，配置scope=tx；Rx缺项不阻塞Tx。

## 报告边界

报告名义值、各工况变化、重复名义值、角域像素宽度、能量一致性及是否补偿。角域边界无能量不证明物理探测面未截光；正式指标前需扩口径/角域/采样收敛验证。小于一个像素的变化不能据此排序敏感度。正式产物保存在run包，不放Skill目录；历史结果只校验导入，不补写未经保存的历史配置。

## YAML配置使用

从Skill包内`config/tx-pilot.example.yaml`复制到项目`config/tx-pilot.local.yaml`，核对对象映射、modelId/revision后修改。旧JSON显式输入仍兼容；自动读取优先YAML，不同时维护两份有效配置。

```powershell
# 在项目根目录，使用config/optics.local.json中配置的Python解释器
python .agents/skills/optdsh-tx-tolerance/scripts/run_pilot.py config/tx-pilot.local.yaml
```

默认plan，不连接宿主。只有追加`--execute`才进入已授权的副本执行流程。YAML依赖PyYAML==6.0.3（项目requirements-config.txt）；包内原始input.yaml保留注释/字节，resolved.json保存实际解析参数。重复键、非有限数值、非映射根节点被拒绝，样例身份占位符不可用于execute。
