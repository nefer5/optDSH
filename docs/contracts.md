# 场景与交互契约

初始v0合成样例仍保留用于模型对照测试：[场景](../examples/scene.snapshot.json)、[专家提交](../examples/expert-intent.json)。M2实际服务采用下方v1约定；不能混用两版revision类型。

## M2 实际快照 v1

- 实现与入口见 [只读桥接](architecture.md)，代码为 ../packages/optics/src/optdsh_optics/。
- schemaVersion=1；provenance为zos-api或显式synthetic。只支持纯NSC和Millimeters。
- modelId由当前文件路径标识；revision为已导出关键字段内容指纹字符串，capturedAt为UTC时间。不保证捕获宿主全部参数变化，也不是原子快照。
- objectId绑定modelId/revision/sourceIndex，不承诺跨版本稳定；旧引用必须拒绝。
- worldTransform为行主序4×4、乘列向量，平移位于索引3/7/11；来自官方NCE.GetMatrix。worldPositionMM与worldAxes由代码生成，模型不必再解码矩阵。
- 局部原始字段为localPositionMM/localTiltDegrees，referenceIndex/referenceObjectId显式记录。world以纯NSC surface origin为基准。
- geometry已扩展为带dimensionSource、origin、fidelity的近似形状；原始尺寸在shapeParameters。尺寸与zemaxHidden纳入revision；不支持的类型仍退为非比例标记。详见 [显示约定](workbench.md)，不包含可用于求解的精确实体曲面。
- relative_position输出deltaWorldMM、deltaInFromLocalMM和originDistanceMM，方向为to减from；不是表面间隙。
- freshness= captured-only；刷新失败，工具拒绝把旧快照当当前结果，页面只保留标注的历史视图。

### 显式模型绑定（2026-09-27）

认证HTTP新增`POST /api/connection/probe {instance}`及`POST /api/connection/bind {candidateId}`，官方Host仅代理这两个受限路径。探测返回当前文件身份与5分钟候选令牌；候选绑定原配置，确认再校验宿主路径并完整采集。成功才原子保存本机配置并发布快照，失败不替换旧绑定。多窗口切换使旧候选失效；过期确认本身不污染已成功的当前快照。

快照视图携带`binding {sourceFile, instance, id?, changedAt?, previousFile?}`，当前绑定供项目光学服务共享。模型更换后仍以modelId/revision拒绝旧引用；工作台发送另带bindingId，拒绝未同步的旧窗口。会话上下文每次显式发送携带activeModel与fresh标识，跨绑定清空隐式lastSelection，不改写历史或自动迁移公差配置。API连接/采集期间查询返回HOST_BUSY。

### 显式保存接口（2026-09-27）

认证HTTP `POST /api/model/save` 必须携带`authorizeSave:true`与唯一`requestId`。保存已绑定模型使用bindingId/modelId/expectedRevision；保存尚未绑定的候选使用bindingId/candidateId，候选由服务端提供路径、实例、SystemID和revision，不接受任意客户端文件路径。候选保存不提交绑定。

执行器在同一extension连接中前检、备份、再次核对、Save与回读；同一请求的持久回执阻止重复写盘。正常刷新不调用Save。`captureEvidence.systemId`用于拒绝宿主重开造成的身份漂移；revision仍只覆盖导出字段，不代表宿主全参数指纹。保存结果不确定时保留备份与审计，显式返回SAVE_UNCERTAIN。

服务view的`readOnly=false`仅表示存在用户按钮保存能力；`capabilities.queriesReadOnly=true`、`explicitSave=true`明确区分。未开放网页参数编辑或自动光学写入。

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
operandIds绑定同一revision；首版A为镜片、B为无倾角矩形体，表达式仅A&B。坐标公式及支持边界见 [布尔裁切](contracts.md)。
历史快照恢复保留原capturedAt，不更新为当前时间；live refresh失败时结构化查询拒绝，页面只允许检查显式标记的旧状态。

## M3 显式选择问答

用户显式提交requestId/modelId/revision/objectId/question/可选toId；草稿不自动发送。Agent只能调用绑定选择工具，不承担手工拼接长对象ID。
选择上下文在一个快照副本中取得；版本冲突拒绝，答案关联原始revision，变化后禁用其对象跳转。
这是DSH单次只读工作台适配，不是模型写入授权。API与边界见 [M3工作台](workbench.md)。


# 非序列镜片裁切与性能约束

2026-09-26，M2.2 首版。自动宿主采集暂不增加，保持手动刷新。

## v0.1.1资源加载修复（2026-09-26）

同会话工作台迁到官方Host后，viewer原先以绝对根路径`/csg-worker.js`创建Worker，实际返回404，未启动任何布尔计算。现以`new URL('./csg-worker.js', import.meta.url)`定位，使Worker跟随viewer部署路径；不放宽认证或CSP。

Tabbit复核官方路径下Worker、csg-core、Manifold JS和WASM均200，WASM MIME为application/wasm；当前6组Boolean均得到非空网格。选择OBJ58后界面回读“闭合近似裁切 · 3680三角面”，实体视图与固定视图已显示裁剪外形。单批Worker约71ms，不含完整加载/渲染成本。

DOM冒烟增加真实runCSG分支的Worker URL断言，合成场景没有Boolean时不能空测加载路径。6项CSG计算测试通过。证据保留在本机runs/csg-loading，未运行Zemax追迹或写入模型。

## 固定语义

高频模式为 Standard Lens / Even Asphere Lens + Rectangular Volume + Boolean Native。
矩形保留区域使用交集 `A & B`；`A+B` 是并集，不能按“组合”一词猜测。
Comment 是表达式来源，ObjectA/B 是当前快照操作数；编号必须与 modelId/revision 一起使用。

首版只接受完整的 `A&B`（大小写/空白不敏感），A为镜片、B为矩形体，父对象必须先于结果。
不支持的表达式、嵌套、端面倾斜或缺失参数保留标记并解释原因，不能默认为交集。

布尔坐标以表达式第一个操作数A为锚点：

```
B在A局部的变换 = inverse(T_A_world) × T_B_world
result_local = lens_A ∩ transformed_box_B
result_world = T_boolean_world × result_local
```

结果对象可远离构造对象。不能直接把世界空间交集放回世界而忽略结果姿态，也不能重复乘A变换。
Zemax结果材料独立于父对象；此版只渲染近似外形，不映射精确光学面号、镀膜或求解属性。

## 形状与交互

- Manifold 3.5.4（Apache-2.0）本地WASM；后台Web Worker计算封闭三角网格。
- 圆锥基底在Clear处结束；Clear至Edge增加平边，连接前后边缘。高阶非球面、倒角仍未实现。
- 矩形体起点Z=0，终点ZLength；支持前后半宽不同的锥台，但非零端面倾角拒绝。
- 成功裁切的构造体默认隐藏；“显示裁切构造体”可恢复。目录仍可选择父对象，选中时临时显示。
- 点击结果仍指向Boolean对象；配色切换不丢失裁切网格。空交集为空实体，不伪造替代体。
- WASM异常、非法曲面或超时保留定位标记，界面不声称计算成功。

## 性能原则

当前高频定义：每分钟一次参数修改。采用48周向分段、24径向基础采样，加Clear/Edge折点。
计算发生在快照变化时；相机、颜色、同revision缓存轮询不重算布尔。
缓存键由两操作数几何和相对变换组成，不依赖revision-scoped对象ID；相对矩阵取1e-9量级用于显示缓存。
结果自身平移旋转不改变局部裁切；只改变一个父镜片时只失效对应裁切。缓存上限32组。
Worker一次处理一份快照，忙时只保留最新待办，旧revision结果不回填；20秒超时终止Worker。
显式delete WASM对象、dispose Three几何和材质。四视图共享网格，视口事件触发绘制。
新revision仍重建普通对象网格，尚未实现全场景差量更新；当前90对象规模先以实测决定是否优化。
刷新保留相机，选择在revision变化时失效，防止对象号漂移误选。

目标（不是已测承诺）：90对象、6组裁切时，热启动裁切批次P95低于200ms；主线程接收/建网格应单独测量；
宿主采集另计，后续做60次真实编辑的一小时持续验证，观察内存、交互延迟和错误恢复。

## 本轮证据与限制

已有ZOS-API真实90对象快照包含6组a&b，本轮全部生成非空裁切网格。
Node WASM加速60轮参数变化：6组批次中位34.6ms，P95 41.4ms，最大43.0ms；不等于一小时实机运行。
Tabbit Worker实测：一次冷批次约81ms；另一次47.4ms；重复缓存0.1ms；单镜片改厚度只重算OBJ41，约7.1ms。
这些是Worker时间，不含HTTP采集、主线程上传、GPU绘制。浏览器确认旋转、改色保留形状，六结果共约1.84万三角面。
本轮重新采集宿主返回LicenseStatus=NotAuthorized；UI显式显示旧快照与错误。
启动允许恢复相同已配置模型的历史成功快照；失败期间MCP/HTTP结构化查询继续拒绝STALE_SNAPSHOT。
未修改/保存源ZMX，未改变许可证；几何与真实Zemax显示的逐对象专家对照仍待完成。
本地证据在 artifacts/m2-2-validation。

## 权威来源

- [Ansys：Boolean Native语法、材料和首操作数坐标系](https://optics.ansys.com/hc/zh-cn/articles/42661826465043-如何使用布尔物体-原生布尔和组合透镜物体以及合并物体工具)
- [Ansys：Clear/Edge与平边](https://optics.ansys.com/hc/en-us/articles/42661783548563-Modeling-optics-with-realistic-edge-apertures)
- [Manifold及Three.js互操作示例](https://github.com/elalish/manifold/tree/master/bindings/wasm/examples/three)
- 相邻项目只读参考：E:/Proj-2026-N02_opt-assist/docs/superpowers/specs/2026-07-16-zemax-nsc-lens-cut-validation-design.md。
