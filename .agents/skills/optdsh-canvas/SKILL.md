---
name: optdsh-canvas
description: 在optDSH官方Web当前会话画板中读取、绘制或修改图形和文字，生成建议稿供用户预览并应用；适用于在画板上画、补标注、移动改色、删除图形等请求。使用DSH原生canvas工具，不操作独立AgentCanvas的共享收件箱。
---

# optDSH 会话画板

这是本项目DSH专项Skill；不是本机通用agent-canvas CLI流程。会话顶部打开的画板由当前DSH会话绑定，原生工具自动选择正确board，不接受模型指定其他session或本地路径。

## 操作闭环

1. 用户要求看图、画图或修改时，先调用 `canvas_read` 获取当前已保存的revision、元素ID与坐标。图形坐标单位为px；未发送或尚未自动保存的鼠标草稿不保证已进入工具。
2. 需要修改时调用 `canvas_propose_edit`，传入刚读取的baseRevision、简短summary和operations；不要只回复“我无法画图”，也不要去探测4173/CLI接口。
3. 结果为proposed时说明“建议稿已生成，在画板下方预览并应用”。此时原图未改。用户应用后，重新 `canvas_read` 才能据实际状态说已应用。
4. 版本冲突时重新读取当前画板，结合用户最新内容生成新提案；不要把旧元素列表整体覆盖回去。用户从“拒绝”中发送修改意见后，按反馈重新读图和生成建议稿。

## 修改词汇

- `add`：type为rectangle/ellipse/diamond/text/line/arrow；x/y为位置。形状使用width/height；text使用text/fontSize；line/arrow使用endX/endY表示终点。新增ID由宿主生成。
- `update`：id必须来自读取结果，可改位置、尺寸、文字、颜色、线宽。不能改变type；线段改变终点使用endX/endY。
- `delete`：仅传op和id。删除同样只是建议稿，用户决定是否应用。
- 每次1–50项；颜色使用#RRGGBB或transparent。用户绘制的内容同样允许修改，不按作者限制。移动原图必须update原ID，不用新建副本冒充移动。
- 带文字的方框可以直接移动、缩放、改色或删除：绑定文字随之移动，连接箭头端点联动；删除容器会删除其标签并解除连线绑定。text可以直接修改方框的绑定标签，也可用标签ID修改文字。
- 已有图片和手绘笔画允许移动、缩放或删除；这不等于识别图片/手写内容。locked可显式调整；不要因为存在绑定或用户来源就拒绝修改草稿。
- 普通画图任务无需调用Zemax工具。只有用户询问真实光学参数时才按光学基础规则调用只读optics工具；画板修改不是Zemax模型修改。

## 边界

- 不使用本机通用 `agent-canvas wait/inbox/complete`，不领取旧项目提交，不用shell直接修改.runtime画板JSON。
- 不把形状靠近当作物理连接，不把手绘/图片摘要当像素理解；当前只支持结构化元素。
- 建议稿未应用、被拒绝或版本过期都不能称为已修改。原画板应用后可使用撤销；只说实际完成的状态。
- 正常回复用自然语言说明改了哪里及如何预览，默认省略proposalId/revision、CLI/API/端口、数据协议和冗长“非光学事实”水印；只有用户要求诊断时才展开技术细节。
- 原生工具缺失时报告“当前DSH未加载画板工具，需要检查插件”，而非猜测HTTP写接口。

说明见[会话画板](../../../docs/workbench.md)。
