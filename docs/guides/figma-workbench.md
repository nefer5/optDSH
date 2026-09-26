# Figma 前端评审入口

## 葱哥修改意见1（2026-09-26，已落实到前端）

[用户意见画板](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=31-104)：PC四栏同比缩放，在Figma比例基础上微调会话占比；取消650px上限，允许会话拖至半屏；区分输入/消息区域、左右气泡替代身份标签、略缩聊天字号并折叠底层画板数据。

按后续澄清采用比例布局，3D原宽度的10%转给会话；Figma用户画板未修改。原图中光学示意继续使用动态Three.js模型，未转换成静态图片。实际操作及比例见[同会话工作台](shared-workbench.md)，报告在runs/ui-feedback/260926-01/report.html。

## 方案05：双页面、同会话（2026-09-26，待评审）

四张图属于同一方案的不同状态/入口，当前准备实施的范围如下：

| 顺序与范围 | 画板 | 实施内容 |
|---|---|---|
| 01 本期 | [光学工作台主界面](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=17-54) | 保留光学布局，精简会话改接同一DSH会话；画板不常驻 |
| 02 本期 | [主界面的画板弹窗](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=25-87) | 01点击画板后的状态；快速绘图、保存、显式发送、进入完整会话 |
| 03 本期只做衔接 | [复用完整DSH](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=17-316) | 现有官方页面不重建；完成同会话跳转、消息/画板互通与返回入口 |
| 04 后续可选 | [下翻分析区](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=17-380) | 本期暂不实施，后续按分析作业需要增加报告和参数对比 |

Figma标题和排布已同步：第一排01/02，第二排03/04。完整画板协作集中在已有DSH完整会话。交付目标是一套工作台改造加同会话衔接，不是四套新页面。此处为实施范围梳理，尚未修改产品。架构与一致性说明见[整合方案](../architecture/workbench-convergence.md)。

## 最新画板（升级后已同步，2026-09-26）

- [04 最新工作台 / 字号优化 / 自由拖动板块](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=15-54)
- Pro / Full账号已通过whoami核验，文件读取、写入和截图成功；此前Starter额度阻塞已解除。
- 复用确认方案的矢量素材，新增1680×984紧凑布局画板；135个文字节点可编辑，主区域为独立组可自由拖动。保留原基准和原方案。
- 含双视图、45°旋转、全局方向标、单行分类列表、属性与全高交互区。字号较此前提高；Figma字体仍为Noto Sans SC，曲面仅示意。
- 实际工作台CSS同步提高主体13–14px、辅助/按钮约12px，仍保留28px列表行高；刷新页面加载。Figma为近似评审稿，不能等同于默认浏览器实机截图。

## 方案02：依据AgentCanvas重排（2026-09-26，待评审）

用户要求在原素材上修改：左侧上下自由/固定视图，右侧依次镜片列表、属性/其他模块、全高人机交互。
本轮Figma读取请求返回Starter MCP额度耗尽，whoami复核为Starter；原Figma文件未被改动。
已完成本地设计预览和可导入SVG：artifacts/layout-proposal-v2/方案02-双视图四列.png / .svg。
拟议：固定视图顶部切换XY/XZ/YZ/常用方向；属性栏以标签容纳其他模块；交互栏底部输入，运行监控为独立可展开区；列宽和视图分隔可调整。
这些仅为设计，未改产品代码；Figma原文件同步待工具额度可用后执行。

2026-09-26。基于当前M3前端代码及既有截图，用Figma原生图层近似重建；未修改产品布局。

- [调整方案（可编辑）](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=4-28)
- [当前布局基准（锁定）](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=2-12)
- [修改说明区](https://www.figma.com/design/JQmZzgAjNxgreXoqLrzRL9?node-id=4-278)

1680×1050画板，保留对象目录、四视图、属性/提问、独立回答和运行监控。主要区域、文本与示意矢量可独立编辑；按钮使用本地组件，当前深色配色为本地变量。
中文用Figma可用的Noto Sans SC替代系统字体，三维形状为示意矢量，不能用于几何核验；Figma修改不会自动写回产品代码或Zemax。
可在“02调整方案”直接修改或评论，后续按用户确认的方案实现。

本轮自动审批拦截了本地采集页启动/截图传输组合命令，仅返回blocked by policy，因此未完成网页自动捕获。最终交付是原生重建，不是截图导入。
两次Figma原生截图检查完成，修复右栏按钮裁切；未在Tabbit打开DSH或工作台。
用户要求这两个项目仅通过系统默认浏览器操作。当前Windows HTTP/HTTPS/HTML关联读到MSEdgeHTM，用户认为是Firefox；未修改系统关联或擅自固定浏览器。
