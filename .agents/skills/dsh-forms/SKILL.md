---
name: dsh-forms
description: 在optDSH当前会话右侧打开完整YAML参数编辑器，维护原配置或准备本次Run；支持字段高亮、注释和提交回当前会话。参数填写不连接Zemax、不自动授权分析。
---

# YAML参数配置

optDSH产品Agent优先调用原生工具，平台通过官方Profile加载本能力及随包Skill，不依赖旧会话记忆或用户全局.agents。

1. 用户仅讨论插件时直接解释；需要填表、审阅或修改时确定实际配置来源。已有配置优先复用；演示可用`example:rx-scan.example.yaml`。
2. `forms_open_yaml({file, mode, workflow, focusPaths})`打开当前会话右侧完整配置。`mode=maintenance`维护明确指定的原文件；`mode=run`准备一次运行，Rx的workflow为`rx-fov`。高亮使用JSON Pointer，例如`/controls/scanner_h/range/num`。
3. 返回后说明右侧已准备，结束本轮等用户提交，不轮询、不现场生成HTML、不替用户提交。用户提交后官方队列自动回投当前会话。
4. `forms_focus({documentId,paths})`只更新讨论重点。`forms_read({documentId})`读取状态、修订、哈希及实际配置路径；业务执行仍由原Skill和执行器负责。
5. 同会话、来源和用途默认复用一个草稿及Run。反复编辑/保存/重开不另建YAML/JSON/Run；只有用户明确新任务才`newDocument=true`。已提交只读；继续修改派生一个子草稿，重复派生请求复用该草稿。
6. Run提交后输入冻结；执行器领取回执中的`configurationPath`，复用同一个prepared Run，不能重新导出配置或另分配Run。维护模式按哈希检查外部修改，并保留一份基线备份。

一份YAML显示全部参数，注释灰色显示；特殊YAML结构保留在原文区，不能默默丢弃。配置编辑/提交不代表物理校验通过或新增追迹授权。不修改历史Run。

实现说明见[Forms插件](../../../plugins/optdsh-forms/README.md)。非DSH宿主没有原生工具时，可按该说明使用保留的旧CLI/Study接口；该兼容入口不具备原生右侧栏与自动回投，不冒充新链路。