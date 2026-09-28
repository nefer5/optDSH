# Study公共参数契约

用于跨多次任务复用的课题背景和公共参数，不能因某次Skill临时调整就默认回写。当前任务特定覆盖留在临时请求；只有用户明确要求维护公共参数时才更新Study。

## 定位与打开

先读目标`STUDYS/<topic>/README.md`和`study.yaml`。已知topic直接读取；未确定时可列出可用课题：

```powershell
node plugins/optdsh-forms/lib/cli.js list
node plugins/optdsh-forms/lib/cli.js read --mode study --id <topic>
node plugins/optdsh-forms/lib/cli.js read --mode study --id <topic> --form <form-id> --brief
```

完整read用于确定表单、单位、候选、存储与版本；已知定义后用brief减少上下文。返回的`url`已带课题与表单定位，交给用户保存后再读同一ID/form。Study的`status: editable`是正常状态，不等待submitted；brief的ready不意味着所有研究参数已完整。

## 文件及版本

最小入口（路径相对该Study）：

```yaml
version: 1
form: ui/background.form.yaml
values: configs/background.local.yaml
```

- `study.yaml`的入口版本固定1；`form`指向独立的v1/v2表单定义，不是参数值。
- 参数文件限定在该Study的`configs/*.local.yaml`，保存结构为`{version: 1, updatedAt, values}`；不能把包装当作业务执行器原始YAML。单位、选项等语义在表单定义中，需要一起理解。
- 支持`forms: {<id>: {title, form, values}}`和`defaultForm`；基础form/values构成background页，额外页分别保存，不自动合并。现有2t2rLidar默认parameters，旧background仍保留。
- 只约定入口、表单和值文件，不规定models目录，也不由表单管理runs。公共平台不导入具体课题实现。

若目标课题没有入口，先报告缺失；用户要求建立时才按本契约新增。复用已有配置语义，未确认值留空，不从演示中编造真实参数。创建或改版界面定义遵守项目视觉设计询问规则；仅打开已有表单不属于界面改版。

## 保存与后续使用

网页保存走引擎的原子写入与revision冲突校验。当前CLI没有study-save子命令，不能编造；自动化写入如确有需要，按插件已定义的HTTP save接口提交mode/id/formId/revision/values，不绕过冲突检查直接覆盖。

课题保存允许不完整值；Agent使用前检查任务所需字段，缺少时定向补充。参数优先级由业务流程明确：用户当次选择可覆盖该次运行，不静默改变公共值；如需把修改提升为公共配置，按用户意图单独保存。当前没有Study→所有Skill自动合并/同步机制。
