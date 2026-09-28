# Tx原生NSC公差执行

工作台“Tx 公差”或[CLI](../scripts/run_tx_native.py)使用同一光学服务。盲装件生成TNPS，耦合自由度生成CNPS，目标和行程生成MFE，原生Tolerancing执行随机抽样/连续补偿。不是旧Python逐项扰动器。

## 配置

复制[正式样例](../config/tx-native.example.yaml)至所属Study/configs/tx-native.local.yaml。读取工作台当前快照填modelId、expectedRevision及objectId；不能填仅对象编号。位置mm、转角deg。范围来自用户；空值必须拒绝。geometryConfirmed表示已核对本次机械组、参考/旋转枢轴、H局部轴及全局Z=0距离基准。

每die分别设置源、Detector Rectangle、X/Y作为H；后端用GetMatrix所得worldPositionMM[2]计算距离，要求正Z与探测器朝向全局+Z。不能使用局部Z或页面提交的任意距离。RMS角宽近似为1000×σH/L mrad，不是D86或全角。

公差Min/Max按原生误差含义，STAT控制截断倍数。耦合行程相对名义零位，MFE位置/倾角边界作为惩罚；逐样本回读越界不能省略。功率保持率相对同一目标冻结名义接收功率。

## 几何与范围

- 首版使用现有控制对象和其直接子对象定义刚体。选入memberIds的子对象随动；其他直接子对象须隔离，以免误动整个后续光路。
- 仅支持控制对象局部倾角为零时隔离非成员子对象（平移相加后重引用到原父）。隔离后逐对象世界矩阵核对，变化即停止。非零倾斜且需隔离时拒绝，不猜旋转变换。
- Compound/Boolean须由专家选正确机械控制对象；不自动将构造面当独立装配件。六个可配置轴不等于任意机械枢轴已建模。
- 首版MC最多100样本、源光线1000–200000、优化1–20循环。日常首次验证建议3样本/OD/1循环；DLS可选但本轮不做高频对照。

## 运行

`python .agents/skills/optdsh-assembly-tolerance/scripts/run_tx_native.py <配置.yaml>`只校验服务缓存和配置；加`--execute`提交副本作业，`--wait`等待结果。CLI不另起绕开宿主锁的连接。浏览器点击“在副本运行”即授权此配置；关闭面板/停止Agent不取消仿真，使用运行页取消按钮。

1. 服务锁定当前宿主，冻结YAML和resolved/runtime配置。执行器再次读模型/SystemID/revision，任何不一致拒绝。
2. CopySystem后只改副本参考、光源采样、TDE/MFE；原模型不Save。两die分段清空→NSTR→NSDD，名义有效后才运行。
3. 灵敏度：Sensitivity、MC=0，SAVE保存Min/Max模型，再回读每die值和补偿位置；原生汇总MF和mrad分开。
4. MC：SkipSensitivity、NumberOfRuns=N、保存N个原生模型。回读每个补偿后模型，再恢复该样本耦合件的名义零位求同一盲装误差的补偿前值。功率/行程失效样本保留，不能算成有效。
5. 取消请求到达worker后调用原生Cancel，等待结束再关闭副本；恢复校验包括原系统ID、采集字段、MFE/TDE摘要、dirty和磁盘SHA256。API成功标记必须有TXT/ZTD及相应样本文件佐证。

运行包在runs/tx-native/YYMMDD-NN，含冻结配置、代码、原生模型、TXT/ZTD、结果、HTML和哈希。商业模型不进Git。原生保存可能带较大ZDA，此为正式证据不是缓存。

## 结果边界

结果显示实际名义、每样本补偿前后、端点值、最终补偿位置与有效性。没有中间轨迹图。少量样本仅验证功能，不作为良率或收敛结论；有效不等于满足用户尚未填写的规格。源光线数不足/像素化可能影响优化与排名。

旧未补偿H-D86命令run_tx_pilot.py仍保留用于历史复现，不与新RMS评价混用。[原生设计背景](tx-native-design.md)。
