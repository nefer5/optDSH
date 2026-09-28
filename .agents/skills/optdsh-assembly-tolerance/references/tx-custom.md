# Tx自定义脚本分析

2026-09-27用户确认：先记录全部未补偿MC，仅补偿最后一个MC状态；不恢复该状态的盲装误差，保存最终副本文件，活动原模型不变。OD/DLS使用独立局部优化器；也可由脚本逐轴微调。此模式不调用OpenTolerancing，不生成/执行TDE。

## 输入和预检

工作台仍共用装配/目标配置，运行页选择“自定义分析”。或复制[tx-custom.example.yaml](../config/tx-custom.example.yaml)到Study/configs/，用本项目`.venv/Scripts/python.exe .agents/skills/optdsh-assembly-tolerance/scripts/run_tx_native.py <配置>`同一入口（实际脚本位于本Skill/scripts）预检，加`--execute --wait`提交串行服务。解析器真实支持YAML、重复键/非有限数拒绝，run保留原文及resolved配置。

提醒用户先在Zemax中准备模型，去除移动镜片时不应传递的参考链。勾选geometryConfirmed及referenceChainConfirmed不代替程序检查：盲装件不得有参考子孙；耦合控制对象的全部参考子孙须精确属于memberIds，测量探测器不能随耦合移动。脚本不自动改Ref Object。移动轴须Fixed；预检/逐次回读检测未知Pickup或不应随动的世界矩阵变化并拒绝执行。对于Boolean/Compound镜片，需由专家选择正确控制实体并准备依赖，不能把构造面自动当机械件。

用户对象引用绑定当前modelId/revision/SystemID，原模型dirty不自动Save。双目标仍是die1/die2各一源一探测面；H明确为探测面局部X/Y。后端读取GetMatrix全局Z，要求已确认全局Z=0为测距起点、探测面法向为全局+Z，L>0。近轴RMS等效角宽=1000×σ_H/L mrad，不是D86/FWHM或全角。

## 固化流程

1. 同一宿主排他调度→核对身份/版本→创建独立CopySystem。保持已准备好的参考链不变，缓存名义局部位姿与不应移动对象的世界矩阵。
2. 不加制造误差先独立追迹两颗die。读取Detector Rectangle二维flux网格，核对网格和API总功率；脚本按像素中心计算H向能量加权质心、RMS宽度、等效角宽、边缘功率比例和H投影。
3. 用指定seed生成截断正态独立误差；每个样本直接设置“名义位姿+本次误差”，不累计上一次误差。每次保存偏移向量、两die目标、功率有效性与光斑NPZ，全部MC完成后保存last-mc.zos。
4. 保留最后样本的盲装误差不变，只调整耦合件。最终只给最后样本写after；前面样本after=null，不补零、不推算整批补偿效果。
5. 围绕最终补偿位置逐轴扫描当前点及±末级步长，其他补偿轴固定。记录每个点的完整补偿向量、目标、有效性，标为终点局部灵敏度；临时扫描完回到最终补偿位置，不回到无公差名义状态。
6. 保存final-compensated.zos及最终光斑，生成完整离线HTML：背景→关键Setup→名义光斑/目标→MC散点→末样本前后→最终补偿量/局部灵敏度→证据。关闭副本，核对原模型采集字段/源采样/dirty/SystemID/磁盘哈希不变。

## 补偿方法

- coordinate：每轴在当前点及±步长试探，候选严格裁剪到配置行程；以两die归一化角宽平方和选更好点。全部有效点都须满足名义功率保持率，丢光造成的窄光斑不接受。逐轴遍历后按shrinkFactor缩步，共rounds轮；这是局部坐标搜索，不保证全局最优。
- OD/DLS：脚本在最后MC副本建立两die的NSDD/MFE目标、功率与行程约束，只将指定耦合轴设为Variable，调用OpenLocalOptimization；优化后脚本用同一raySeed重新采集网格，检查功率、行程和目标。无效/恶化结果被拒绝，仅恢复耦合到本次补偿前位置，盲装误差仍保留。报告保留候选值和接受/拒绝状态。
- none：记录MC及末状态的局部扫描，不宣称完成补偿。无耦合件时不扫描。

OD/DLS并不使用内置公差模块。局部优化器中的NSTR采样与脚本显式raySeed的采样不保证相同；最终接受判断以脚本固定种子重测为准。OD/DLS的cycles是重复执行单轮局部优化次数，不是MC样本数。

执行器逐目标核对同一缓存光线的NSDD与网格RMS，并记录命中数；OD/DLS另存optimizer-evidence.json，记录优化前、每轮后的实际MFE及两die读数。MFE追迹结果不可用此前API缓存的探测器网格冒充。当前实测SourceDiode的Sobol设置未能回读生效，不宣称两种追迹已统一采样。当前目标只约束宽度、功率和行程，未约束质心/出射指向，须结合光斑图解释补偿结果。

## 产物和边界

公共run位于runs/tx-custom/YYMMDD-NN，保留input.yaml/resolved/runtime、代码、partial-result、随机偏移、NPZ、末MC及补偿副本、PNG图、result.json/report.html/manifest。大数组不进API JSON，不保存无必要的整套ZRD；本模式采集的是探测器光斑/通量网格，不声称已导出逐光线历史。

原始光斑不做图像滤波来缩窄宽度；像素中心RMS有离散化误差，报告记录像素宽度与边缘功率。无命中记录为无效，不填0角宽。少量MC只验证功能；仅补偿最后一个样本不能给出全批补偿后良率。局部灵敏度随最终状态/步长改变，不等同于原生公差端点排序。

坐标、位置与最终模型读取全部以本次run为准，不给历史报告补写新模型字段。原生模式与自定义模式互不冒充，普通native能力仍见[Tx原生流程](tx.md)。


## 2026-09-27 输入与检查补充

盲装误差支持statistics.inputMode=range/sigma。sigma方式逐轴提供mean与sigma（位置mm/转角deg），后端权威计算Min=mean−nσ、Max=mean+nσ；不能只依赖页面计算。切换方式保留已有区间中心，修改n时sigma方式保持mean/sigma、range方式保持Min/Max。耦合行程仍采用上下界。

快照现在记录每对象位姿Solve、活动参数单元格的非Fixed Solve、光源Layout/Analysis Rays及Power。预检按“对象+单元格列号”追踪ObjectPickup的传递，包括未选对象的间接依赖；未知求解类型拒绝核验，不再仅检查Ref Object。快照revision覆盖这些新字段，旧配置需更新引用。

网页统一设置每源分析光线数：分析副本内Analysis Rays须实际变为Fixed并回读等于网页值；布局光线及光源Power不能因采样设置改变。source-sampling.json记录原设置与逐目标实际配置。用户确认本轮修复将目标die1/die2在原文件内也设为Fixed，Power=1 W用于归一化测试；这不是通用的物理光源默认值。

报告按每个补偿轴把终点局部灵敏度与能量变化画在同图：共用补偿增量横轴，左轴RMS角宽mrad，右轴接收功率/名义接收功率百分比；明确离散采样点连线，不当连续函数或优化轨迹。OD/DLS内部进度未知时显示阶段运行中，不再保留假的60%总体进度。
