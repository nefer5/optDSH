# 2t2rLidar 领域契约

2026-09-27，从用户自有N02光学助手项目整理沿用。本目录是跨具体模型、研究和Skill可复用的领域语言契约，不是平台全局规则，也不承载分析执行流程。

| 契约 | 内容 |
|---|---|
| [术语与命名](terminology.md) | 扫描输出、Tx/Rx硬件、时间测距和仿真采样的层级边界 |
| [H/V角度与坐标](angles.md) | 观察方向、正负号、投影角、Rx方向取反、模型控制量与图表映射 |

## 采用范围

- **沿用**：限定Channel/Pixel/Bin所属层级，线数与die/仿真网格区分，H/V物理方向及独立投影角定义，模型轴到H/V显式映射。
- **当前已确认沿用**：`H=-2*(scanner_h-45)`、`V=-echo_v`。用户于2026-09-27明确确认当前2t2rLidar研究仍采用这组关系，没有变化；不再列为当前研究的待确认项。适用范围不扩展到任意其他模型。
- **不迁入通用契约**：旧对象编号、材料/波长配置、4-die或4条纹计数、1020 mm²归一口径、追迹参数及研究验收阈值。这些由Study配置和当次run保存。
- **不扩写标准状态**：源稿关于ISO/ASTM等标准的现行版本本轮未复核，因此未复制其标准状态章节。本目录是项目工作约定，不宣称跨厂商统一标准。

[Study入口](../../STUDYS/2t2rLidar/README.md)保存具体模型、配置与结果；业务Skill拥有执行和恢复流程。公式/术语在这里单一维护，Skill只链接，不再次复制全文。

## 来源与追溯

以下路径和哈希记录本次提取来源；运行、阅读和发布本契约均不依赖N02存在。未修改N02、现有执行器或历史run，也未据此声称当前模型的H/V方向已重新实测。

| 来源 | 原始路径 | SHA-256 |
|---|---|---|
| 术语源稿 | `E:/Proj-2026-N02_opt-assist/STUDYS/PROJ-26-N01-dualLidar/2T2R线扫LiDAR术语规范.md` | `0a7cb743dcc11be730f6b114dc3b91d7c85753579ec5fbed3bea9866b9f660cb` |
| H/V物理定义 | `E:/Proj-2026-N02_opt-assist/.agents/skills/opt-assist/SKILL.md` | `3d127cc7f691e12eab6b7880ab4660cc8dded927178d0b9329f217e53b1b569e` |
| 旧模型控制角映射 | `E:/Proj-2026-N02_opt-assist/docs/superpowers/specs/2026-08-05-lidar-fov-efficiency-scan-run-isolation-design.md` | `fce3a95dd750d5a2edb351f6aa57d15ca8a0081bc9059ac3b392792571ba6355` |
| 探测面到角域 | `E:/Proj-2026-N02_opt-assist/.agents/skills/lidar-lambertian-echo-synthesis/references/lambertian-model.md` | `5af6d412263e86eca94c30b75346f1251304475a8f8fab40f63a82eb0e3612d7` |
