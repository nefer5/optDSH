---
name: optdsh-rx-collection-efficiency
description: 在optDSH中准备或执行Rx收光效率与H/V视场扫描。用户要填写Rx扫描参数、打开配置表单、读取已提交配置、做FOV扫描或查看转镜/Rx/SPAD收光效率时使用；参数收集不连接Zemax，不属于装调公差或PDE分析。
metadata:
  version: "0.4.0"
  maturity: experimental
---

# Rx收光效率与FOV扫描

先区分本轮是收集参数、读取提交，还是检查/执行光学模型；不要因为Skill涉及Zemax就把每次调用都做成仿真预检。

## 只准备填写页面

在optDSH内优先调用`forms_open_yaml`：`file`用用户现有配置，缺省演示用`example:rx-scan.example.yaml`；一次运行选择`mode=run, workflow=rx-fov`；维护用户明确指定原配置用`mode=maintenance`。讨论重点用`focusPaths`，如`/controls/scanner_h/range/num`。

固定引擎显示完整YAML和注释，不生成HTML、不提前检查Zemax。打开后说明右侧已准备并结束本轮，用户提交会自动回到当前会话。重复打开、保存和高亮复用文档及Run；只有明确新任务才`newDocument=true`。

## 用户已提交

读取`forms_read`及会话中的提交回执，使用其`configurationPath`；该文件已位于本次prepared Run，执行器按哈希领取同一目录，不能再导出一份或新建Run。冻结配置不可覆盖；若继续改动，使用右侧“继续修改”生成新草稿。提交只确认参数，不新增分析或追迹授权。

非DSH宿主缺少原生工具时，才使用[旧表单交接](references/form-input.md)的CLI兼容路径；旧路径不支持自动回投，需按回执ID读取，不能宣称已打开原生侧栏。

## 真正检查或执行分析

先读取当前Workspace的README、领域定义与所选配置；缺少轴/物理角度/归一化定义时明确缺项，不从其他课题猜测。用户要求真实模型检查、离线扫描计划或执行后，再读取[执行参考](references/execution.md)，按当前身份、配置、只读预检及确认推进。表单提交只确认填写内容，不自动授权追迹；REPLACE_* 和未确认项不能当作真实模型事实。执行器独立校验业务约束，用户填完或Agent回答完成不代表仿真完成。

当前服务入口见已安装optDSH的docs/runtime.md；运行指南仅在入口失败或用户询问环境时按需读取。不要改全局配置或切换模型来掩盖失败。

分析通过本项目光学公共包直连ZOS-API；光学工作台不负责求解，表单引擎是可选输入方式。当前CLI仍有桥接端口存活门禁，不能把期望的解耦当成已实现；遇到门禁按执行参考处理，不在DSH短命令中启停常驻服务。

`efficiency.max_receive_area_mm2`是用户/Study指定的参考面积，不能拿源面积或某个探测器面积自动替换。优先沿用当前已提交配置并注明依据；样例值不是专家确认。结果须区分执行完成与定量可信，重复点明显不一致时报告异常，不直接归因几何。

## 停止条件与步骤职责

判断：先分流参数收集、离线计划或真实执行；确认：当前Workspace未定义物理轴、归一化口径或身份不一致时停止并报告缺项；脚本：只调用相应安装资源，失败保留证据。不得用其他课题的旧配置填补缺项，不得自动连接、追迹或改主模型。
