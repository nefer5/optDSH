---
name: optdsh-optics-contract
description: 设计或检查 optDSH 场景快照、对象选择与仿真命令的数据契约，适用于对象身份、坐标变换、状态版本和专家提交的实现或评审。
---

# optDSH 光学契约

从仓库根定位 [契约](../../../docs/architecture/contracts.md)、[M2只读桥接](../../../docs/architecture/m2-optics-bridge.md)和 examples 下的样例。v0为初始合成测试，实际服务使用v1；本skill是使用/设计指引，连接器位于项目代码中。

当前DSH已配置optics MCP时，优先使用scene_objects/object_info/relative_position取得代码计算结果；需要当前状态先snapshot_refresh。模型不自行重算原始矩阵。返回capturedAt、revision和来源，不能将缓存快照声称为实时状态。工具不存在就明确说明，不用脚本绕过预设连接与模型路径检查。

## 必须查清的语义

- 区分模型、对象、面与组件。sourceIndex 只能是当前宿主索引；稳定 ID 的恢复与映射要有证据。
- 所有选择和操作携带 modelId、revision。外部编辑、插入或删除后，过期引用不能静默指向新对象。
- 明确单位、局部/全局框架、参考对象、矩阵布局和旋转顺序。转换用已知输入验证，不从截图反推后直接修改宿主。
- 场景近似与真实仿真结果分开；分析产物标出对应 revision，不能显示为更新后的结果。
- 专家草稿与正式提交分开，提交关联对象、视角/标注与意图。用户确认的约束不得被场景刷新静默改变。

## 按实际任务验证

只读契约优先验证引用一致性与坐标转换。涉及写命令才检查单写入口、expectedRevision、commandId 去重、确认、回读与恢复；涉及作业才检查忙碌、断连和取消语义。不要为无关任务追加完整验收流程。

运行 `python scripts/check_project.py` 只能验证初始化样例和文档，不能替代宿主比对。真实 API 操作仅在任务授权和连接状态确认后执行，不自动打开或修改活动 Zemax 模型。

输出实际发现、可重现样例及兼容影响；修改契约时同步对应 examples 与 docs，运行证据留在 artifacts，标注未验证的对象类型。
