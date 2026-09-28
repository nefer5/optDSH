# 2T2R线扫LiDAR术语与命名

本项目采用的工作术语，提炼自N02的2026-08-09术语规范，来源与采用边界见[入口](README.md)。具体厂商的器件名保留原文，并记录到本表的对应关系。

## 基本原则

1. 数量必须附层级：硬件、逻辑输出、时间测量或仿真采样；不能只说“4通道”“64像素”。
2. Channel必须有限定词；Pixel、Cell、Zone、Bin不能默认一一对应。未知硬件映射写unknown/null。
3. LiDAR线数按最终可独立输出的垂直测距采样定义，不按die数、条纹数或Zemax网格数定义。
4. `2T2R`作为架构名称不替代Tx/Rx链路映射表；物理die数、光学链路数和测距通道数分别记录。

## 术语表

| 推荐名称 | 中文及层级 | 定义与边界 |
|---|---|---|
| Frame | 帧／扫描输出 | 一个完整采样周期或规定时间窗的数据集合 |
| Column / Scan position | 水平扫描列／扫描输出 | 一个水平扫描位置或时刻上的垂直数据列，不等于芯片物理列 |
| LiDAR line count | 线数／扫描输出 | 每个水平扫描位置可独立输出距离结果的有效垂直采样通道数 |
| Vertical beam channel | 垂直光束通道／扫描输出 | 经标定的垂直测距通道；角度参数化须明确，不能把投影角V与球坐标仰角混用 |
| Angular sample / Depth pixel | 角度采样点／逻辑输出 | H/V共同指定的输出位置，可带距离、信号、置信度和状态 |
| Return / Echo | 回波／信号输出 | 一个角度采样位置识别出的有效回波；可以0个或多个，不因此改变线数 |
| Point | 点云点／输出 | 角度和距离经标定、投影后的三维点，注明坐标系和return index |
| Tx die / Emitter die | 发射die／硬件 | 物理发光芯片或明确的独立发射单元，不自动等于一条LiDAR线 |
| Tx optical channel | 发射光学链路 | 独立控制、光路或可区分输出的发射链路，定义由系统设计确认 |
| Rx optical channel | 接收光学链路 | 独立接收光路、视场或孔径，须明确其与Tx及接收阵列的映射 |
| Illumination stripe / lobe | 照明条纹／光学分布 | 目标面或远场角域中的条纹、光斑或主瓣，不是测距线数 |
| Physical SPAD cell / pixel | SPAD感光单元／硬件 | 厂商所定义的单SPAD感光单元；不能规定所有Pixel都由多个Cell组成 |
| dToF element / Ranging pixel / Macro-pixel | 测距元素／硬件或逻辑 | 由一个或多个SPAD形成的有效测距单元；优先保留厂商原名及共享结构 |
| Zone | 分区／空间逻辑 | 映射到局部FoV的输出或控制分区；不自动等于VCSEL分区或一条线 |
| ROI | 感兴趣区域／选择逻辑 | 被选择的测量范围，可含多个Zone或像素，不与Zone混称 |
| SPAD readout channel | SPAD读出通道／电路 | 独立读出链路；与感光单元、TDC的对应关系由架构证据给出 |
| TDC channel | 时间数字转换通道／电路 | 独立时间数字化资源；可被共享，TDC LSB不等于最终测距精度 |
| Histogram channel | 直方图通道／处理资源 | 独立形成或保存直方图的资源，不自动与TDC一一对应 |
| Laser shot / Pulse | 发射事件／波形 | shot是发射事件，pulse是脉冲波形；一次shot可能包含脉冲序列 |
| Integration period / shots | 积累窗／积累次数 | 一次测距结果累计的时间窗或发射次数 |
| Photon histogram | 光子时间直方图 | 按相对发射时间累计的光子事件计数 |
| Time / Histogram bin | 时间Bin | 时间离散窗口；不是空间像素，也不直接代表系统分辨力或精度 |
| Range bin | 距离Bin | 算法或后处理中的距离分组，不只写Bin |
| Spatial binning | 空间合并 | 合并相邻感光/测距/输出单元；与time bin、符合检测及编码方案分开 |
| Simulation detector pixel/bin | 仿真探测网格 | Zemax数值积分单元；未建立硬件映射时不得称为物理SPAD或LiDAR输出像素 |
| Echo angular subchannel | 回波角度子通道／仿真 | 回波角域或局部孔径的离散单元，不是TDC/readout/垂直测距通道 |
| Synthetic echo sub-source | 综合回波子光源／仿真 | 为数值重建创建的光源对象，不是额外物理发射器 |
| aperture_field | 接收局部角视野字段 | 须说明H/V范围、照明条纹、目标、仿真离散数和Rx链路映射；不自动叫SPAD Zone |

## 数量与测距指标

线扫基础采样写为`N_vertical × N_horizontal`。均匀且包含两端点时才可用`ΔV≈VFOV/(N_vertical−1)`，正式投影优先使用标定角度表。非规则扫描须给实际采样角度/轨迹，不能据该式补齐。

`N_points,max = N_vertical × N_horizontal × N_returns,max`只是满足相应输出模式下的计数上界，不是实际有效点率。

时间Bin宽度Δt在均匀传播介质中的距离采样间隔为`ΔR_bin=c·Δt/(2n)`。它与range resolution（区分目标能力）、precision（重复性）、accuracy（相对真值误差）分别报告。比如100 ps对应约15 mm采样间隔，不能据此宣布测距精度。

## 命名与配置

建议分别记录`tx.die_count`、`tx.optical_channel_count`、`tx.illumination_stripe_count`、`scan.vertical_channel_count`、`scan.horizontal_samples_per_frame`、`receiver.physical_spad_pixel_count`、`receiver.dtof_element_count`、`receiver.tdc_channel_count`和`simulation.detector_sampling_shape`。这是概念字段建议，不新增执行器必填schema；现有配置保持兼容。

“4 Tx dies、4 illumination stripes”可以描述经确认的具体设计，但不推出“4线”；芯片通道、Zone与TDC关系必须引用其数据手册/架构图。对象展示继续采用平台[契约](../contracts.md)中的编号与当前Comment格式。

## 报告按需说明

凡使用上述术语得出结论，应同时给出相关层级、计数口径和映射状态。例如扫描输出注明角度表/采样/帧率，接收器注明厂商层级与共享方式，仿真注明网格代表空间还是角度。未参与本次问题的硬件字段无需为了填表猜值。
