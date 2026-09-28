# PPT · SlideWise 首版

项目级Skill：`.agents/skills/ppt-slidewise/SKILL.md`；实现：`packages/ppt-slidewise/`。本轮按用户选择采用独立编辑页，不调用视觉专家，不接入全局Codex技能，不修改全局SlideWise演示。

## 使用

在DSH项目聊天说“用ppt-slidewise做一份PPT”，给受众、目标和已有材料。Agent先整理逐页结论，再提供编辑链接。页面可改字、移动、缩放对象；填修改意见后点“保存给Agent”，回原聊天说继续。没有自动唤醒。导出按钮可下载，也可请Agent导出后给文件路径。

## 内容策划

新任务第一轮先讨论材料的目的和方向：谁看、希望对方理解或决定什么、此次重点与范围。先利用已有材料，每次只补问1–2个关键问题，尽量每题三个选项加自定义输入；体量可粗选5–10分钟、10–30分钟或长篇，不追问精确页数。不先问配色、字体，也不立即生成逐页内容。用户要可点击填写时可用随Skill提供的用途/体量简短表单；普通聊天允许直接自由回复。

后续按六步推进：目的方向→事实/判断/假设/缺口整理→主线→逐页实际正文→内容逻辑稿审查→样例与整套。两个正式审查节点为R1内容逻辑稿（完整打印到聊天或提供可打开文档）与R2实际1–2页PPTX样例（配预览，审密度/配色/风格/布局）。不另增固定主线审批；R1通过才做样例，R2通过再展开整套。已有明确回答和定稿可复用；用户变更用途时更新主线及受影响内容。

Skill内`references/content-planning.md`给出具体流程和正反例，`assets/planning-template.md`为Agent内部工作稿。复杂任务保存planning.md，简单任务可留在聊天中。当前为模型行为指引，CLI未实现机器强制的策划状态门禁；不能仅因输出了模板字段就声称论证正确。

文稿事实源是`data/ppt-slidewise/<id>/document.json`，不是浏览器localStorage。保存校验revision并保留history；过期保存返回冲突。首版保留历史，不自动清理用户稿件。全局3303演示与本项目3314编辑器各自独立。

首次准备：在`packages/ppt-slidewise`运行`npm ci`与`npm run build`。CLI的create/open/export会启动本地服务；无开机自启。headless导出目前使用Microsoft Edge（Playwright），迁移目标需准备同等浏览器。依赖以package-lock.json锁定，不打包node_modules。

## 中文字体验证（2026-09-27，本机）

| 菜单字体 | 导出字体名 | 浏览器实际命中 | LibreOffice导出PDF实际字体 |
|---|---|---|---|
| 黑体 | SimHei | 已验证 | 已验证 |
| 等线 | DengXian | 已验证 | 已验证 |
| 等线 Light | DengXian Light | 已验证 | 已验证 |
| 微软雅黑 | Microsoft YaHei | 已验证 | 已验证 |
| 微软雅黑 Light | Microsoft YaHei Light | 已验证 | 已验证 |
| 楷体 | KaiTi | 已验证 | 已验证 |
| 仿宋 | FangSong | 已验证 | 已验证 |

原版菜单未列中文字体；项目构建适配增加七个选项并禁用Google Fonts请求。导出写标准英文名称，并补全Latin/eastAsia/cs。修复前部分中文名称在LibreOffice被替代，不能只看XML字段判断实际生效。其他楷体/仿宋变体尚未验证，不宣称兼容。

字体文件未嵌入、未复制分发；公司机器必须检查安装及使用条件。浏览器与LibreOffice均验证不等于Microsoft PowerPoint像素一致；本机没有用PowerPoint完成验收。

## 测试边界

证据：`runs/ppt/260927-01`。四页合成材料，直接调用和官方DSH+glm-5.3-flash两轮生成/修改/导出。测试脚本模拟用户保存图片与意见，另通过真实浏览器直接改字保存；不是用户亲手操作验收。包含版本冲突和跨源写入拒绝检查。详细模型轨迹与耗时随Run。

首版支持简单文本/图形/图片/表格和结构化计划；不保证复杂模板导入、原母版继承、跨机器字体一致或长文本自动排版。预览与PPT仍需真实渲染比对。


## 0.2 制作工具

新增语义版式analysis/comparison/patent-card，本地图片自动等比嵌入；read默认隐藏base64，diff核对用户修改，template-capture/apply复用已确认布局，check检查几何/图片/字面事实，stage记录流程依据。render按页缓存浏览器预览，export按revision/内容/构建/文件哈希复用，no-op保存不增版本。制作说明见项目Skill的references/production.md；任意PPTX母版导入和全自动内容正确性判定仍未实现。
