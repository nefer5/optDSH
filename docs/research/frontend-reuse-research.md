# 前端与光学Agent开源复用调研

核验日期：2026-09-26。用户提供的 [AI讨论](discussions/前端的技术栈与开源项目.md)作为线索，不作为能力或许可证证据。

用户追加参考的AI4Optics/DeepO已单独核验：[项目与界面分析](ai4optics-deepo-review.md)。DeepO托管产品与DeepLens开源库分开判断；优先借鉴面板、提案和缓存失效交互。

## 决策

保留Python ZOS-API权威数据链、Three.js查看器和DSH薄适配；优先复用布尔内核与交互实现。
本次找到若干可复用组件，但没有核实到可以直接替换整个“活动Zemax NSC＋布尔镜片＋网页专家交互＋DSH”链路的开源成品。
这是本次检索范围内的结论，不是宣称全网不存在。

| 项目与一手来源 | 已核实能力及适配判断 | 决定 |
|---|---|---|
| [Manifold](https://github.com/elalish/manifold) | Apache-2.0；网格布尔、WASM/Python入口，有官方Three互操作例；输出仍是网格，不是光学求解器 | 已固定npm 3.5.4，Worker内用于镜片裁切 |
| [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) | MIT；Three原生CSG，接入轻；官方明确experimental并列出数值边界、可能非流形问题 | 备用评测，不同时维护两套内核 |
| [Online3DViewer](https://github.com/kovacsv/Online3DViewer) | MIT；通用浏览器模型查看、导入与交互；没有据此证明支持Zemax NSC语义 | 借鉴对象树、隔离、导入和检查体验；未来CAD预览时再评估组件接入 |
| [webworn/zemax-mcp-server](https://github.com/webworn/zemax-mcp-server) | 作者描述ZOS-API MCP桥和自然语言操作 | 参考工具边界；尚未核实可复用许可证文件，不直接复制；不是已验的网页布尔查看器 |
| [MoMoJee/ZOSAgent](https://github.com/MoMoJee/ZOSAgent) | README介绍CLI及MCP路径、多模型接入 | 借鉴工具分层；未实装、未证明本项目NSC覆盖，复用前逐文件核查许可 |
| [Optiland](https://github.com/optiland/optiland) | 有光学分析、非序列模块；但其[Zemax导入parser](https://optiland.readthedocs.io/en/latest/_modules/optiland/fileio/zemax/reader/parser.html)明确拒绝非序列模式 | 不以它替换本项目NSC权威读取器；有非序列引擎不等于能导入Zemax非序列文件 |
| [RayOptics](https://github.com/mjhoptics/ray-optics) | Python几何光学与序列系统分析、Zemax导入 | 尚未核实完整NSC Boolean Native导入，不将“支持zmx”外推为本项目可用 |
| [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) | Three图形路径追踪渲染 | 后续外观演示候选；不替代Zemax探测器能量、镀膜/散射、真实光线求解 |

上述“借鉴”未下载或集成项目源码。只有Manifold依赖已在本项目实际使用，其许可证保留在node_modules/manifold-3d/LICENSE；若以后分发包需携带依赖许可。

## 对讨论材料的修正

1. Optiland非序列能力与其Zemax导入器支持范围是两件事，当前parser不能作为本项目NSC导入器。
2. 免费网页版不自动等于开源可复用。[OpticsBench官网](https://opticsbench.com/)本轮未取得足够的一手开源许可/完整仓库证据，不列为可直接复用依赖；同名图像退化benchmark和光学实验台软件不能混为一谈。
3. 图形渲染中的折射/路径追踪不等于工程光学非序列求解。权威光线和分析继续从Zemax取得。
4. 本地Python服务＋浏览器已经能够访问受控本地ZOS-API，无需为了本地访问而强制改为Electron。
5. React是界面组织选项；当前原生JS＋Three已满足首版，不因“技术栈完整”而重写。复杂状态增长后再评估组件化。

## 后续复用顺序

先完善布尔切割语义和边界样例，再接Zemax真实光线/探测器可视化，最后完善DSH内嵌提交。
继续复用相邻opt-assist连接和已验证契约；性能遵循 [布尔裁切约定](../architecture/boolean-cuts.md)。
不要先替换追迹引擎或引入整套Web CAD，这会增加模型一致性、维护和性能成本。
