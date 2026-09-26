# M2.1 三维查看器：操作与表示边界

入口仍为 `scripts/open-optics.ps1` / 本机3081。Three.js固定版本0.186.1，资源从本机提供，不使用CDN。相机/配色/显隐/布局只在浏览器变化，绝不写回Zemax。

## 默认操作

| 动作 | 默认 |
|---|---|
| 空间视图旋转 | 左键拖拽 |
| 平移 | Shift + 左键拖拽 |
| 拖动缩放 | 中键拖拽 |
| 缩放 | 滚轮 |
| 选择 | 左键单击；穿透多个对象时从列表确认 |
| 聚焦对象 | 视口获得焦点后按 F，或点击聚焦按钮 |
| 放大某个视图 | 双击视口标题，或点击右上角⤢；再次操作恢复 |

右上“操作设置”可配置旋转/平移/拖动缩放的鼠标按钮与单个Shift/Ctrl/Alt修饰键、聚焦字母/数字键。冲突时不允许保存。配置在当前浏览器localStorage持久保存，换浏览器不自动同步。输入框内打字不会触发聚焦。

三个正交视图锁定旋转；原本用于旋转的拖拽在其中变为平移。XY为右+X上+Y（从+Z看），XZ为右+X上+Z（从-Y看），YZ为右+Y上+Z（从+X看）。角落轴向说明是坐标依据，不用容易歧义的“前视/俯视”代替。

四个视口共享同一个场景、objectId选择与显隐，各有独立相机。默认联动聚焦，可选同步三个正交视图的缩放。主体/全景重设所有相机取景；主体仍按位置分位数取景，不保证包含远端探测器。

## 配色与显隐

透镜/光学面青色、反射件紫色、介质/平板橙色、光源黄色、探测器蓝色、结构件灰色、参考系浅灰、未支持对象粉灰。分类优先依据对象类型与MIRROR等明确材料，不通过Comment猜测滤光功能。

对象检查中可手动指定“滤光/分光”等**显示分类**，只影响该模型版本下的前端颜色，浏览器本地保存；不改变材料或镀膜。分类、目录和三维场景使用同一配色。选中对象用白色轮廓高亮。

- 点击类别按钮开关显示；“仅显示选中”隔离对象。
- “遵循Zemax隐藏”按采集的DoNotDrawObject过滤；默认关闭以方便检查隐藏的构造对象。
- 可选半透明、实体着色、线框和透明度。
- 参考连线默认关闭；它们不是追迹光线。

## 近似形状

| 类型 | 表示方式与依据 |
|---|---|
| Standard Lens / Even Asphere Lens | API半口径、中心厚度与圆锥基底参数生成简化旋转体；前顶点Z=0，后顶点Z=Thickness。忽略高阶非球面、倒角及口径台阶；无效/交叉曲面退为名义圆柱并标注 |
| Compound Lens | 本模型为矩形复合镜片，使用半宽和厚度生成名义盒体；不声称是真实包围盒或重建曲面 |
| Rectangle / Detector Rectangle / Source Rectangle | API X/Y半宽生成平面，未凭空添加物理厚度 |
| Ellipse | API X/Y半宽生成椭圆面 |
| Standard Surface | MaxAperture圆形代理，曲率和内遮挡未显示 |
| Rectangular Volume / Pipe | API前后半宽和ZLength生成锥台；前面Z=0、后面Z=ZLength。忽略端面倾斜，管道用线框、不假设壁厚 |
| Boolean Native | 仅非比例定位标记；不把操作数当最终布尔裁切结果 |
| 其余未支持对象 | 非比例标记，明确说明尺寸未知；Null为参考标记 |

当前90对象快照中，63个有参数化近似表示（含管道线框），15个为参考对象，12个是未实现尺寸表示的定位标记。7片普通/非球面透镜均已支持，另1个复合镜片显示名义盒体；6个布尔结果暂不生成实体。

`geometry`内记录kind、fidelity、dimensionSource、origin和note；原始shapeParameters另存。尺寸和显示隐藏状态纳入快照revision，改变后旧对象引用失效。画面不能用于表面间隙、碰撞、遮挡、面形或光学效果验收。

## 验证

```powershell
python -m unittest discover -s tests -v
node --test tests/viewer.test.js
```

19项Python测试与7项JS测试通过。Tabbit实测旋转、Shift平移、自定义Ctrl平移及刷新保持、冲突拒绝、输入框排除、正交旋转锁定、双击最大化/恢复、正交缩放联动、XY拾取、类别/原生隐藏与相对查询通过，未报告页面异常。

已支持对象的尺寸字段由当前API只读获取；仍需用户对特殊镜片的近似外观进行物理意义检查。旧Canvas实现已归档至本地 artifacts/m2-1-validation/，运行路径只保留Three.js实现。

## 来源

- [Ansys光学边缘口径说明](https://optics.ansys.com/hc/en-us/articles/42661783548563-Modeling-optics-with-realistic-edge-apertures)：Clear/Edge半口径语义。
- 相邻opt-assist的Rectangular Volume轴向起始面修复经验；结合当前API属性读取得出本版Z=0..ZLength约定。
- [Three.js controls说明](https://threejs.org/docs/pages/OrbitControls.html)：导航交互参考。本项目为支持可配置组合键及四个相机，使用独立导航层，没有直接修改上游控件。

## M2.2 裁切显示增量

A&B镜片与矩形体可显示封闭近似裁切结果，Clear外机械平边已加入；其他组合仍受支持边界限制。
成功结果默认隐藏构造体，勾选“显示裁切构造体”或选择父对象可检查；选择Boolean结果后“仅显示选中”＋“聚焦”检查四视图。
此节取代上文“所有布尔均为标记”的旧限制；详见 [裁切与性能](../architecture/boolean-cuts.md)。
当前宿主NotAuthorized时页面明确显示历史快照，无法代表最新编辑，恢复授权连接后再手动刷新。
