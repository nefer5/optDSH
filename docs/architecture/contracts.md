# 场景与交互契约

初始v0合成样例仍保留用于模型对照测试：[场景](../../examples/scene.snapshot.json)、[专家提交](../../examples/expert-intent.json)。M2实际服务采用下方v1约定；不能混用两版revision类型。

## M2 实际快照 v1

- 实现与入口见 [只读桥接](m2-optics-bridge.md)，代码为 src/optdsh_optics/。
- schemaVersion=1；provenance为zos-api或显式synthetic。只支持纯NSC和Millimeters。
- modelId由当前文件路径标识；revision为已导出关键字段内容指纹字符串，capturedAt为UTC时间。不保证捕获宿主全部参数变化，也不是原子快照。
- objectId绑定modelId/revision/sourceIndex，不承诺跨版本稳定；旧引用必须拒绝。
- worldTransform为行主序4×4、乘列向量，平移位于索引3/7/11；来自官方NCE.GetMatrix。worldPositionMM与worldAxes由代码生成，模型不必再解码矩阵。
- 局部原始字段为localPositionMM/localTiltDegrees，referenceIndex/referenceObjectId显式记录。world以纯NSC surface origin为基准。
- geometry已扩展为带dimensionSource、origin、fidelity的近似形状；原始尺寸在shapeParameters。尺寸与zemaxHidden纳入revision；不支持的类型仍退为非比例标记。详见 [显示约定](../guides/viewer-controls.md)，不包含可用于求解的精确实体曲面。
- relative_position输出deltaWorldMM、deltaInFromLocalMM和originDistanceMM，方向为to减from；不是表面间隙。
- freshness= captured-only；刷新失败，工具拒绝把旧快照当当前结果，页面只保留标注的历史视图。

## 初始 v0 合成场景（历史测试保留）

- schemaVersion：当前草案版本 0。
- provenance：synthetic / zos-api；样例只能为 synthetic。
- modelId：模型身份；revision：桥接服务确认的状态版本，不能用文件名替代。
- capturedAt：UTC ISO 时间。
- units：所有长度与角度明确单位。草案统一 mm、deg；无单位输入拒绝。
- objects：稳定 objectId、当前 sourceIndex、名称、类型、referenceObjectId。
- worldTransform：行主序 4×4，乘列向量，平移在第 4 列，长度单位 mm。桥接器须用已知姿态样例验证 Zemax 原始旋转到此矩阵的转换。
- geometry：预览类型和保真度；仅占位轮廓不得用于求解或精确碰撞判断。

非序列对象可能包含多个光学面；对象不必等于镜片，顺序面也不必等于镜片。后续支持顺序系统时引入明确的对象/面/组件语义。

## 专家提交

intentId 用于去重；sessionId 用于路由；modelId/revision/selectedObjectIds 绑定场景；instruction 保存用户原话。只有显式提交才触发 Agent。

截图与画板附件在实现阶段增加本地产物引用、hash、坐标框架与视角；不能把浏览器屏幕像素直接当成世界坐标。

## 后续写命令（尚未实现）

最少包含 commandId、modelId、expectedRevision、objectId、操作类型、参数/单位、专家确认记录。写入前检查版本和身份；失败返回结构化错误及最新已知状态。

建议错误分类：STALE_REVISION、OBJECT_NOT_FOUND、AMBIGUOUS_IDENTITY、HOST_BUSY、UNSUPPORTED_OBJECT、CANCEL_UNSUPPORTED、VALIDATION_FAILED。

## 后续运行事件（尚未实现）

eventId、时间、sessionId、jobId、可用时的 callId、modelId/revision、eventType、status、summary、artifactRefs。显示事实而不是模型推测；原始日志按需展开，不塞入交付正文。

此处错误名、工具和事件字段均是本项目拟议接口，不是 DSH/ZOS-API 已有接口名。

## M2.2 Boolean Display 增量字段

Boolean Native额外提供booleanDisplay：expression、status（supported/unsupported）、operation、operandIds、anchorObjectId、frame；失败提供reason。
geometry.kind=boolean表示可尝试构造，实际Worker仍可能报错，不等于已生成或精确几何。
operandIds绑定同一revision；首版A为镜片、B为无倾角矩形体，表达式仅A&B。坐标公式及支持边界见 [布尔裁切](boolean-cuts.md)。
历史快照恢复保留原capturedAt，不更新为当前时间；live refresh失败时结构化查询拒绝，页面只允许检查显式标记的旧状态。

## M3 显式选择问答

用户显式提交requestId/modelId/revision/objectId/question/可选toId；草稿不自动发送。Agent只能调用绑定选择工具，不承担手工拼接长对象ID。
选择上下文在一个快照副本中取得；版本冲突拒绝，答案关联原始revision，变化后禁用其对象跳转。
这是DSH单次只读工作台适配，不是模型写入授权。API与边界见 [M3工作台](../guides/m3-workbench.md)。
