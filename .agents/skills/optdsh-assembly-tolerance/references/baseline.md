# 名义基线输入与指标定义

## 对象映射

```powershell
python .agents/skills/optdsh-assembly-tolerance/scripts/baseline.py inventory <scene-snapshot.json> 
```

输入为当前版本场景快照。输出保留modelId/revision/capturedAt/provenance，列出源、探测器、镜片、布尔操作数和参考关系；状态始终candidate-unconfirmed。
Rx1/Rx2及镜筒归属需专家确认，不按名称自动选择仿真对象。四颗Tx die整体6D已由用户确认；枢轴、坐标与行程仍需配置。

## 离线数据计算

Tx CSV列为angle_h_deg,weight：角度已在明确的H向角域坐标系中，权重非负；不是把某个远场平面上的毫米值当作角度。
Rx CSV列为h_mm,v_mm,weight：坐标应是明确约定的探测面H/V系。网格导出需先核对数组轴顺序、像素中心/边界和功率/辐照度单位；不得未经核查交换H/V。

```powershell
python .agents/skills/optdsh-assembly-tolerance/scripts/baseline.py metrics <tx.csv> --kind tx --method equal-tail --frame <H-frame> --provenance exported-unverified 
python .agents/skills/optdsh-assembly-tolerance/scripts/baseline.py metrics <rx.csv> --kind rx --method full-span --fraction 1 --frame <detector-frame> --provenance exported-unverified 
```

方法必须显式选择，示例命令不等于用户已确认口径：

- equal-tail：离散带权CDF的两端等尾区间；Tx固定86%，全角为upper-lower，不能再除2。
- shortest：含不少于指定权重比例的最短离散样本区间；与等尾定义可不同。
- full-span：所有正权重样本的极差，只允许fraction=1；不将零权重离群位置计入。
- 不做隐式高斯拟合、像素间插值或角度绕回展开；跨±180°样本拒绝，需先建立约定分支。
- Rx分别给H、V区间，另统计该二维矩形实际能量比例；两个边缘分布的比例不等于二维包络比例。

分母为输入样本的总检测权重，不是发射功率；没有独立源功率证据就不报告接收效率。空/零功率、负权重或非有限数据拒绝。
若来自离散探测器网格，宽度受像素间距和中心取样限制；本计算器不声称达到亚像素精度。

## 真实基线验收仍需要

当前模型版本、对象/通道、名义位置、光源谱/功率、有效光线数、追迹设置/种子、数据生成时间与H/V坐标约定。
GetAllDetectorDataSafe能读缓存并不证明缓存来自当前模型或最近一次追迹。当前适配未执行新的追迹，也未导出认证的名义角分布/光斑，因此输出baselineApproved=false。

实现参考：相邻opt-assist的lidar-lambertian-echo-tiled-psf/scripts/visualize_tiled_psf.example.py（二维网格与边缘分布）及common.example.py（矩形探测器轴中心/数据读取）。旧脚本使用90%指标且存在负值裁零等选择，本实现没有照搬其口径，也没有运行会改变宿主的旧脚本。

正式输出自动分配到runs/baseline/YYMMDD-NN；可用--runs-root指定项目内父目录。CLI解析参数保存为config/resolved.json，输入快照/CSV复制到inputs后再计算，默认入口report.html。
