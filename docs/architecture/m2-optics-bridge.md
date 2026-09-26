# M2 只读光学桥接 MVP

当前实现：独立 Python 服务 + Three.js近似几何/四视图页面 + DSH MCP 工具。M2.1交互及几何边界见 [查看器操作说明](../guides/viewer-controls.md)。没有模型写入、保存、载入、追迹或优化接口。

## 启动与打开

```powershell
./scripts/start-optics.ps1 -OpenBrowser
# 服务已在运行时
./scripts/open-optics.ps1
./scripts/status-optics.ps1
# 等采集完成后停止
./scripts/stop-optics.ps1
```

默认地址 `http://127.0.0.1:3081`，通过脚本打开含本机令牌的入口。服务只监听回环，令牌保存在Git忽略的 `.runtime/optics-access.json`；不复制到报告或远端。重启桥接后需重新打开认证入口。

DSH 仍位于3080。启动桥接后，DSH的 `config/dsh.local-policy.yml` 注册 `optics` MCP stdio客户端。新增启动组合本轮需要重启DSH才生效，不能把修改文件视为工具已经加载。服务不在线时MCP返回BRIDGE_UNAVAILABLE，不替换成合成数据。

## 本地配置

`config/optics.example.json` 是无真实模型路径的合成配置样例。复制到Git忽略的 `config/optics.local.json` 后选择：

- `backend=synthetic`：只读 examples/bridge-demo.json，页面显式标注合成。
- `backend=zos-api`：使用 `python` 指定的解释器，以 `sourceRoot/src/auto_zemax/connection.py` 复用连接封装；`expectedFile` 必须精确匹配当前已打开模型，`instance` 为用户已开启的Interactive Extension编号。

本机初版复用opt-assist既有Python环境，没有向其安装或修改依赖。解释器/源目录不存在时明确报错。不要把本机绝对路径配置提交到Git。

## 采集规则

1. 串行短连接到现有Interactive Extension；从不启动standalone。
2. 校验活动文件路径、纯NonSequential模式、Millimeters单位，拒绝活动Tools.CurrentTool。
3. 读取对象的身份显示字段、参考关系、局部位置/倾角与官方 `NCE.GetMatrix`。
4. 连续两遍关键字段一致、前后dirty标志一致才发布；这不是宿主事务锁，无法证明未发生瞬时修改后还原。
5. 30秒超时终止只读工作进程；保留最后成功快照并标为过期。退出extension只释放本地连接，不关闭Zemax GUI。

GetMatrix的基准是NSC surface origin，本版仅支持纯NSC，因此将此坐标系标作world；不将混合顺序系统的组内矩阵冒充全局矩阵。API无效、非有限数、非正交矩阵或缺字段均拒绝本次快照，不静默填0。

本轮活动模型有未保存修改：读取的是内存状态，而非磁盘旧版；采集保持dirty=true，不调用Save。网页“未保存”不是错误。

## 数据版本与查询

schemaVersion=1；`revision` 是被导出关键字段的内容指纹，不是Zemax所有状态的变更计数器。未导出的参数改变不保证revision变化。相同数据重新采集保持revision，capturedAt更新。

`objectId` 为模型+revision+当前索引的保守引用：不承诺跨revision永久身份。字段变更后旧选择失效；不得将旧ID替换为同编号新对象。模型文件路径用于本版本modelId；无法区分同路径、同内容的重新打开操作，禁止将本版引用机制直接用于未来写操作。

所有查询针对最后成功快照，返回capturedAt与captured-only说明。要了解外部最新修改先刷新；刷新失败后工具拒绝继续查询旧快照，页面仍可将其作为明确标记的历史数据查看。

## DSH 工具

| 工具 | 行为 |
|---|---|
| mcp__optics__scene_objects | 按标签/类型过滤并分页，返回版本、对象引用和已计算世界位置；默认20项，最多100 |
| mcp__optics__object_info | 指定modelId/revision/objectId读取坐标、轴向、参考关系及矩阵 |
| mcp__optics__relative_position | 计算to原点减from原点的世界向量、from局部向量和欧氏距离 |
| mcp__optics__snapshot_refresh | 重新采集并返回新版本摘要；对宿主仍为只读 |

相对坐标使用正交旋转矩阵转置换基。距离是**对象原点距离**，不是实体表面间隙、光程、遮挡或碰撞结论。

## 页面与范围

- 真实对象目录、搜索/类型过滤、点选与重叠对象辨识。
- 空间/XY/XZ/YZ四视图，正交方向锁定、可配置旋转/平移/缩放、主体/全景/聚焦取景；详见M2.1操作说明。
- 近似形状使用有来源的尺寸；未支持类型的定位标记仍不按比例。参考连线默认关闭，不是光线；不把近似形状当精确实体。
- 主体取景按各轴10%～90%分位裁取视野，以免远端探测器压缩主光机显示；所有对象仍在目录，全景可查看全部。
- 对象本地/世界坐标、矩阵、相对位置计算、快照导出和提问草稿复制。
- 草稿不自动发送给Agent；M3再做DSH内嵌面板和显式提交闭环。
- 页面每3秒只读取桥接缓存/日志，不每3秒调用Zemax；宿主采集由手动刷新或MCP刷新触发。

## 验证与证据

```powershell
python -m unittest discover -s tests -v
python scripts/check_project.py
```

本轮12项离线测试通过；真实模型90对象采集成功；14个RefObject=0对象的world/local平移交叉核对通过。HTTP认证、跨源拒绝、无写端点、过期版本拒绝、重复采集revision稳定、ZMX磁盘hash不变与dirty保持已验证。

实际运行证据、截图、模型响应放 `artifacts/m2-validation/`；每次完整快照放 `artifacts/optics-captures/`。这些含本地模型信息，不进Git。

DSH端到端实测：GLM-5.3-Flash通过2次scene_objects和1次relative_position查询OBJ59→OBJ60，正确报告世界差(0,0,-20) mm、OBJ59局部差约(0,0,+20) mm、原点距离20 mm及快照版本。没有让模型解码矩阵。该例与早期合成文件任务不同，证明工具链有效，不构成严格同题性能提升实验。

仍需专家核对特殊对象的坐标物理语义；未验证真实运行中的长仿真并发/断连恢复、精确曲面与CAD显示；没有宣称连续实时或原子快照。
