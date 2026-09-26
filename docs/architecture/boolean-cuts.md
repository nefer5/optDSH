# 非序列镜片裁切与性能约束

2026-09-26，M2.2 首版。自动宿主采集暂不增加，保持手动刷新。

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
