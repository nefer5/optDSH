# Skill临时参数可视化

## 从当前配置快速生成

读取目标Skill的SKILL.md，定位其配置入口。优先用用户指定或现有任务配置；没有才用包内`config/*.example.yaml`，明确样例值和占位项待核对。不要为简单渲染先启动业务预检或读遍实现。

```powershell
node plugins/optdsh-forms/lib/cli.js create --config <配置.yaml> --brief
# 若Skill提供了匹配当前配置的表单定义：
node plugins/optdsh-forms/lib/cli.js create --config <配置.yaml> --form <skill>/ui/form.yaml --brief
```

两条命令二选一，不为同一任务创建两个请求。旧YAML可直接推断对象、列表、数值等结构；null、空结构或混合类型可能显示JSON编辑器。自动推断不会补单位、枚举、可选参数或领域约束。导入限制120 KB和JSON兼容YAML；不支持的标签/别名等应说明限制，保留源文件，不悄悄转换含义。

随包form.yaml需与配置键结构一致；未知键可能被拒绝。遇到不匹配先解释差异，普通填写可退回自动推断，完整检查则按[审查流程](full-review.md)。已有`{caller, form, values}`请求描述可用`create --input <request.yaml> --brief`，与普通业务YAML的`--config`不同。

## 提交与交回业务Skill

创建返回请求ID与链接，说明“保留原配置已有值，核对后提交，再告诉我”。用户完成后读取一次：

```powershell
node plugins/optdsh-forms/lib/cli.js read --id <req-id> --brief
# 仅当下游需要文件时：
node plugins/optdsh-forms/lib/cli.js export --id <req-id> --output <新配置.yaml>
```

- `ready:false`表示pending，提示尚未提交，不把草稿交给执行器、不循环查询。
- `submitted`读取生效配置，结合原Skill的校验/执行流程继续；空值不补默认。只收集参数不意味着需要执行分析。
- 原样例永远不覆盖，export拒绝已有目标文件；导出不保留YAML注释和排版。请求原值、来源路径/哈希及表单存在`data/forms/requests/<id>.yaml`，不写回安装的Skill包或Study。
- 已提交请求只读；“继续修改”会克隆为新ID。用户交付新ID后改读新请求，不反复查询旧回执。

## 分发边界

业务Skill可以携带`config/example.yaml`、可选`ui/form.yaml`；通用引擎单独维护。使用`--form`显式加载，当前不按文件名自动发现，不自动执行Skill自带JS/CSS。跨环境仍需安装引擎的声明依赖与DSH页面宿主；业务执行器依赖另行满足。这里只建立输入通道，不让每个Skill依赖光学工作台内部接口。
