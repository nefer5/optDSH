# 光谱增强 LiDAR 研究

在现有线阵光源、转镜线扫 LiDAR 基础上，加入少通道光谱接收能力，研究几何信息与目标材料／状态信息联合获取的应用价值和实现条件。

当前候选光谱范围为可见光至约 2 μm，优先考虑白天被动接收。波段、通道数、具体光路和探测器尚未冻结。普通硅基 CIS 与扩展 SWIR 探测器分开讨论，外部主动照明结果不直接视为本方案性能。

## 主要产出

| 产出 | 入口 |
| :--- | :--- |
| 黑冰／薄冰光谱研究 HTML | [阅读报告](runs/black-ice/260928-01/report.html) |
| 黑冰完整离线报告包 | [下载 ZIP](runs/black-ice/260928-01-black-ice-report.zip) |
| A版专利背景 PPT：黑冰预警＋材料分拣 | [PPTX](presentations/spectral-lidar-patent-a/revision-2.pptx) · [SlideWise 编辑](http://127.0.0.1:3314/?id=spectral-lidar-patent-a) |
| B版专利背景 PPT：植被状态＋畜禽筛查 | [PPTX](presentations/spectral-lidar-patent-b/revision-3.pptx) · [SlideWise 编辑](http://127.0.0.1:3314/?id=spectral-lidar-patent-b) |
| 两版内容逻辑、来源与制作资料 | [内容稿](presentations/spectral-lidar-patent-options/content-review.md) |
| 光栅／10 mm焦距／CIS计算说明 | [技术说明](presentations/spectral-lidar-patent-options/technical-note.md) · [计算数据](presentations/spectral-lidar-patent-options/calculation.json) |
| 材料＋ToF、树冠叶绿素和含水量论文参考 | [中文解读与数据说明](references/spectral-lidar-evidence/README.md) · [图文资料包](references/spectral-lidar-evidence/spectral-lidar-reference-pack.zip) |

PPT当前均为4页：两个场景、方案动机与预期优势、共同技术附页。可编辑文字与表格保留。当前导出文件对应迁移时版本，后续通过SlideWise保存和导出会产生新revision，应以编辑器与稿件目录中的最新记录为准。

## 目录归属

```text
presentations/  两套可编辑稿、导出PPTX、预览、历史及策划计算资料
references/    论文、原图、数据摘录与参考资料包
runs/          正式研究报告及完整证据包
work/          本课题早期脚本、检索缓存和中间验证文件
migration/     本次迁移路径映射、逐文件哈希与核验结果
```

后续本课题产出集中在这里。正式运行或研究报告新建在本Study的`runs/<workflow>/YYMMDD-NN/`，不再散落到根`runs`、`data/research`或根`temp`。不因普通问答强制生成run。

`work/`保留此前工作的完整上下文，不代表每个缓存文件都是有效研究依据。历史脚本内的旧绝对路径是当时记录，执行前按迁移映射核对并在新工作副本中调整；不要重放旧脚本覆盖成品。

## 当前研究判断与边界

- 重点应用包括白天薄冰风险筛查、限定材料分拣、三维植被状态和固定观察位活体筛查。
- 已有文献支持部分光谱与几何互补价值；本课题尚未完成自有传感器实验或分类模型训练。
- 黑冰报告区分薄透明冰与水膜、白天被动与主动照明，以及总体准确率与冰召回率。
- 植被参考资料保留叶绿素仪指标、木质部分影响及异常观测剔除条件。
- 外部数据集、论文结果和几何估算不等同本方案验收。

## 2026-09-28 集中迁移

用户授权整包集中。所有原文件内容保持不变，移动前后逐文件SHA-256核对，详情见[migration/260928/manifest.json](migration/260928/manifest.json)。历史run自己的manifest及报告不改写。

为保持现有SlideWise ID、浏览器编辑页和保存路径可用，仅在原`data/ppt-slidewise/`下保留A、B两个稿件的Windows Junction。它们指向本Study的真实目录，不是内容副本。迁移后的兼容入口及检查结果见[migration/260928/validation.json](migration/260928/validation.json)。

旧报告和脚本里的绝对路径可能仍指向迁移前位置，按迁移manifest的`mappings`查找新位置。报告内部相对链接和完整ZIP不变，可继续离线阅读。
