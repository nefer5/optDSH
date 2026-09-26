# AI4Optics / DeepO：项目分析与界面借鉴

核验：2026-09-26。实际使用Tabbit检查用户打开的DeepO页面及Chat/Parameters/Console标签；核对官方手册和关联公开仓库。未登录、上传模型、发送聊天或启动计费求解。下面区分网页观察、官方说明和本项目建议。

## 结论

DeepO适合作为optDSH的工作台交互参考；DeepLens等开放内核适合后续独立研究试验。
不以此替换ZOS-API作为当前非序列布局与Boolean Native的权威来源。本轮只整理参考，不改现有前端样式或安装依赖。

## 生态与开放边界

| 部分 | 内容 | 对optDSH的意义 |
|---|---|---|
| AI4Optics | 光学仿真、成像与设计项目的文档/生态入口 | 研究资料和组件发现入口，并非单一开源应用 |
| DeepO | 托管光学工作台：编辑、分析、优化、成像与AI助手 | 学习产品组织、提案及状态机制 |
| DeepLens | Apache-2.0可微光学库；几何、衍射和混合模型，PyTorch梯度 | 未来序列镜头候选探索、成像试验的独立实验后端 |
| AutoLens | 基于DeepLens的梯度优化和课程学习自动设计 | 借鉴分阶段优化，不能等同于LLM自主设计能力 |
| End2endImaging | 光学、传感器/ISP及重建网络的联合计算链 | 未来研究任务驱动成像时有价值，当前非序列查看器不需要引入 |
| DiffTMM | Apache-2.0可微薄膜传输矩阵计算 | 后续镀膜/滤光片光谱角度响应、逆向设计的候选工具 |

DeepO的[许可页](https://www.ai4optics.com/deepo/manual/about/license/)明确区分托管产品与开源deeplens。
访问网页并不授予产品软件、模型或品牌许可，因此不把DeepO当成可直接fork的开源前端。
开源库来源：[DeepLens](https://github.com/vccimaging/DeepLens)、[AutoLens](https://github.com/AI4Optics/AutoLens)、[End2endImaging](https://github.com/vccimaging/End2endImaging)、[DiffTMM](https://github.com/AI4Optics/DiffTMM)。实际源码复用前检查各版本及依赖许可。

## 技术判断

可微光学把曲率、厚度等连续参数放入计算图，通过损失梯度优化；LLM助手负责解释和提出操作，二者是不同能力。
研究脉络可查[DeepLens论文索引](https://github.com/vccimaging/DeepLens/blob/main/CITATION.md)：包含2021可微光线追踪、2022 dO、2024从零课程学习设计及折衍混合模型。这里核查了论文入口，未复现实验，不采信“全面超越商业软件”等宣传性比较。

对我们最关键的限制来自[官方Zemax交换说明](https://www.ai4optics.com/deepo/manual/file-formats/zemax/)：支持的是部分旋转对称序列处方，非序列内容、偏心、倾斜、坐标断点等不在支持子集中。文件转换也不是与本机活动Zemax的实时同步。
DeepLens README虽展示非序列/偏振研究方向，同时把非序列追迹、偏振和部分GPU优化列为尚未公开发布的内部扩展；不能据此声称公开仓库已有通用NSC能力。
DeepO [API页](https://www.ai4optics.com/deepo/manual/account/api-access/)明确标注当前1.1.19的个人API key尚未可用，页面代码示例属于预告，不能按已上线接口接入。

## 前端实际观察

- 深灰背景、低对比分隔线、少量蓝色强调；视觉焦点在镜片与光线，工具界面退后。
- 顶部紧凑菜单，左侧约五分之一宽的助手/参数/Console；中央布局与分析，右侧成像结果，下方参数表，底部状态条。
- 可调整面板而非把所有内容做成纵向大卡片；高密度参数有自己的表格空间。
- 页面已显示三维镜片与光线；本次DOM观察无canvas，官方也提及前端2D/3D布局SVG导出。不能仅凭三维外观推断Three/WebGL或React实现，更不能据此保证90对象性能。
- 当前未登录，AI能力按手册评估，未验证对话质量、优化结果或计费性能。

可重看[DeepO](https://ai4optics.com/deepo/)与[界面手册](https://www.ai4optics.com/deepo/manual/interface/tour/)。本地观察截图保留在artifacts/deepo-research/deepo-workspace.png。

## 给optDSH的具体借鉴

1. 视觉：增加可选深色工程主题，压缩顶栏高度与装饰卡片；保持可读字号和类别颜色，避免照搬超宽屏下的小字。
2. 布局：中央保留现有四视图；左侧对象树/助手，右侧属性/分析；底部可调整的参数表与独立运行监控。监控可与对话同时查看，不复制DeepO的Chat/Console互斥标签限制。
3. 编辑提案：采用[Proposal Cards](https://www.ai4optics.com/deepo/manual/ai-assistant/proposal-cards/)的可审查动作形式。结合本项目契约，展示对象、revision、变更前后、理由、验证结果与明确执行入口。
4. 例如矩形切割提案显示A镜片、B裁切体、A&B、半宽/长度变化及几何预览。草稿不改变Zemax；提交前检查expectedRevision。此项是未来设计，未实现写入口。
5. 当前状态：借鉴[助手上下文](https://www.ai4optics.com/deepo/manual/ai-assistant/overview/)中的当前镜头与近期外部编辑摘要；本项目用确定性快照差异生成，不让模型猜测刚发生的操作。
6. 性能：借鉴分析图过期标记与显式重算。几何、分析、对话分别失效；每分钟一次参数修改只更新依赖，旋转不跑布尔，布尔不自动触发光线追迹。
7. 状态条：固定显示模型/revision、最近成功采集、宿主忙闲和当前作业；过期图必须带原始revision。

优先级：先面板与状态组织，再做提案卡；独立光学计算库放在明确研究任务出现之后。当前Manifold＋Three＋ZOS-API链路继续保留。
