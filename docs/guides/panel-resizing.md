# 工作台面板分隔线

2026-09-26。窗口缩放与手动拖动是两种不同操作：前者保持已保存比例，后者移动指定边界。

## 操作规则

- 竖向分隔线跟随鼠标。优先仅修改相邻两栏，宽度一增一减；拖物件列表左边界时，列表右边界及后面的栏保持不动。
- 只有被压缩的相邻栏达到最小宽度，剩余位移才按距离向外传递。这让聊天仍可扩大到屏幕一半，不以所有栏同比缩放来凑宽度。
- 上下视图之间的横向分隔条可拖动，条宽8px，并有扩大后的命中区和悬停高亮。两块视图各保留至少96px面板高度；空间不足时平分。
- 双击横线恢复上下各半；双击竖线恢复四栏默认比例。分隔线聚焦后方向键微调，Shift加大步进，Home复位；拖动中Esc撤销本次操作。
- 指针捕获保证鼠标移出分隔条仍可拖动；拖动时禁止选中文字，暂时阻止iframe抢走指针。松开结束并保存，失去焦点也结束拖动。
- 保存仍使用v5比例配置，保留已有主题和相机操作；默认比例不因这次修复改变。

## 与成熟实现的对应

[Blender区域调整](https://docs.blender.org/manual/en/5.2/interface/window_system/areas.html#resizing)采用直接拖动两区域间边界的交互。
[VS Code SplitView源码](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/splitview/splitview.ts)把窗口同比布局与sash拖动分开；拖动从边界两侧最近视图开始消耗位移，达到约束后向更远视图传递。

本项目借鉴这种交互和尺寸分配规则，在现有原生JS/CSS布局中实现，不复制其整套布局框架或引入新依赖。未实现Blender拆分/合并区域或VS Code完整停靠系统。

## 上下视图问题与修复

实机复现：DOM下视口从约498px变成418px，但GPU viewport仍为498px。原ResizeObserver只监测共享WebGL容器，内部上下分配没有改变容器总尺寸，因而未触发重绘。

现观察每个view-surface，使用requestAnimationFrame合并重绘；两视图仍共享同一WebGL画布和几何。同时移除view-surface多余的30px相对偏移，修复视口越过面板底部及负的GPU viewport Y。

## 验收

- Tabbit：物件list左边界-80px，右边界和后两栏不动；上下边界+100px，DOM和真实WebGL viewport同步。
- 刷新恢复、Esc回退、双击50/50、会话扩大半屏通过。
- 17项相关Node测试通过；真实模块DOM冒烟验证观察内部视口且每帧合并回调（其WebGL为stub，实际GPU证据来自Tabbit）。
- 证据：runs/splitters/260926-01/report.html。截图后恢复默认四栏及上下各半；没有改光学模型或重做长期性能评测。
