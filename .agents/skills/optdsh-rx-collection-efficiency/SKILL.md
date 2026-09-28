---
name: optdsh-rx-collection-efficiency
description: 在optDSH中准备或执行Rx收光效率与H/V视场扫描。用户要填写Rx扫描参数、打开配置表单、读取已提交配置、做FOV扫描或查看转镜/Rx/SPAD收光效率时使用；参数收集不连接Zemax，不属于装调公差或PDE分析。
---

# Rx收光效率与FOV扫描

先区分本轮是收集参数、读取提交，还是检查/执行光学模型；不要因为Skill涉及Zemax就把每次调用都做成仿真预检。

## 只准备填写页面

用户要配置参数、不想手改YAML或只看表单时，从项目根执行一次：

```powershell
node plugins/optdsh-forms/lib/cli.js create --config .agents/skills/optdsh-rx-collection-efficiency/config/rx-scan.example.yaml --brief
```

用户提供了本地配置则替换 `--config` 路径。普通YAML可直接生成界面，无需读源码、编写表单定义或修改样例。`--brief`只返回请求ID、可点击URL和下一步，避免整份界面定义挤占上下文。

向用户给出Markdown填写链接与一句“已保留原配置中的样例值/当前值，请核对后提交，再告诉我”；保留请求ID并结束当前回合。不要把“未替用户修改”说成“未填任何值”或“空白表单”。官方DSH页面已有认证，直接使用返回的同源链接，不另跑浏览器自动化、截图或认证排障来证明打开。未实际打开浏览器时说“填写入口已准备好”，不能说“已在浏览器打开”。此分支无需读执行参考、inspect模型、创建run或替用户填写/提交，也不自动等待或反复轮询。

## 用户已提交

优先复用本会话记录的请求ID，不重新创建表单：

```powershell
node plugins/optdsh-forms/lib/cli.js read --id req-实际ID --brief
```

`ready:false` 表示尚未提交，说明状态后结束；`ready:true` 的 `config` 是本次生效配置，供Agent接收处理。清空值保留为null，不补回默认值、不删除字段。源样例/默认参数文件不得覆盖；仅在后续工具需要文件或用户要求时，使用CLI的export导出新文件。详细格式和可选导出见[表单交接](references/form-input.md)。点击“继续修改”会产生新ID，用户明确交付新ID时以新请求为准。

## 真正检查或执行分析

用户要求真实模型检查、离线扫描计划或执行后，再读取[执行参考](references/execution.md)，按当前身份、配置、只读预检及确认推进。表单提交只确认填写内容，不自动授权追迹；REPLACE_* 和未确认项不能当作真实模型事实。执行器独立校验业务约束，用户填完或Agent回答完成不代表仿真完成。

当前服务入口见项目docs/runtime.md；运行指南仅在入口失败或用户询问环境时按需读取。不要改全局配置或切换模型来掩盖失败。

分析通过本项目光学公共包直连ZOS-API；光学工作台不负责求解，表单引擎是可选输入方式。当前CLI仍有桥接端口存活门禁，不能把期望的解耦当成已实现；遇到门禁按执行参考处理，不在DSH短命令中启停常驻服务。

`efficiency.max_receive_area_mm2`是用户/Study指定的参考面积，不能拿源面积或某个探测器面积自动替换。优先沿用当前已提交配置并注明依据；样例值不是专家确认。结果须区分执行完成与定量可信，重复点明显不一致时报告异常，不直接归因几何。
