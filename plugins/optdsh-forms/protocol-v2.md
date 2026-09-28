# 结构化表单协议 v2

此协议用于信息采集，支持长期课题配置与临时 Skill 请求。顶层 `version: 2`、`title`、`groups`，组内 `fields` 递归定义参数。仅解析声明式数据，不执行配置中的代码。

## 值结构与布局

字段 `id` 是其父对象下的键，兄弟字段不可重名；不同层级可复用 min、max 等键。例：object(id=analysis) → select(id=method) 对应 `values.analysis.method`。表格和卡片只改变布局，不改变数据结构。

| type | 存储结构 | 编辑方式 |
|---|---|---|
| text / textarea | string | 单行/多行文本 |
| number | number | 单位、整数、min/max、exclusiveMin/exclusiveMax |
| boolean | boolean | 是/否，可留未确认 |
| select | string | options 枚举 |
| object | object | fields 子字段分组 |
| array | object[] | 可增删卡片；layout: table 为参数表 |
| record | object，有限键 | 从 options 添加行；行内 fields；如 axes.x.min |
| reference | string ID | source 资源候选、可选 filter |
| multiselect | string ID[] | 多选，禁止重复和候选外值 |
| list | 标量/JSON值数组 | items定义元素类型；增删原始数组项 |
| json | JSON兼容值 | 类型未知或混合时的明确回退；无效JSON阻止保存 |

共同字段：label、help、placeholder、required、when。number 的 unit 为定义元数据，不重复写入数值；读取时必须连同表单定义理解单位。array/record 支持 minItems/maxItems；array 可选 uniqueBy、ascendingBy（直接子列键）。未知数据键、非法类型、NaN/Infinity、非法引用拒绝保存。required、minItems 在临时请求正式提交时强制，草稿和长期配置可部分保存。

v0.3增补：list.items支持基础标量及json，最多1000项，可声明uniqueItems；nullable字段保留显式null。自动推断不增加原文件不存在的业务约束；后端类型检查和原业务模块的配置校验是不同层次。JSON编辑中的未完成文字在页面分组切换时保留并阻止保存，修正或删除对应行后解除；尚未保存的文字仍属于浏览器草稿。

用户清空输入（包括普通字段、JSON编辑器）时，明确保存null并保留键；数值列表内清空一个值保留其位置。多选全部取消保留空数组，显式移除列表/record行才删除条目。required/nullable决定提交时是否允许空，不决定是否删除字段。未触碰、原本缺失的字段不会自动补值。

最小结构示例：

```yaml
version: 2
title: 方法配置
groups:
  - id: settings
    title: 设置
    fields:
      - id: analysis
        type: object
        label: 方法参数
        fields:
          - {id: method, type: select, label: 方法, options: [OD, DLS]}
          - {id: cycles, type: number, label: 循环数, integer: true, min: 1}
```

## 条件与投影

`when: {path: /analysis/method, equals: coordinate}` 从根读取；`when: {path: method, in: [OD, DLS]}` 从当前字段所在父对象读取。路径按 `/` 分隔，不执行表达式。仅支持 equals/in，不提供任意逻辑语言。

隐藏字段保留在 `values`，重新选回该模式可继续编辑；`activeValues` 是只含可见分支的结构化投影，`summary` 也只描述当前分支。隐藏字段仍接受类型/范围检查，但不触发必填及跨字段关系校验。投影不做单位换算、物理推导或σ范围计算，不自动填默认值。调用方不得混合所有分支当作同时生效。

## 对象候选

调用方在 `form.resources.<source>` 提供 `label`、`revision`、`notice` 和 `options`。每项 `{value: 稳定ID, label: 显示名称}`，可增加 kind 等属性；字段通过 `source` 引用，`filter: {kind: lens}` 只显示等值匹配项。选择结果只存 ID，候选名称和版本随请求定义一起保存。候选是本次请求的冻结快照，不是对当前外部对象仍有效的保证。

通用引擎不引用工作台、Zemax 或具体对象服务。实时读取、版本复核、领域约束由调用方承担。合成示例不提供当前模型身份。

## 联合校验

object 的 rules 作用于该对象；array/record 的 rules 作用于每行；form.rules 作用于根。路径支持上面的根/相对规则，且规则可用 when：

- `lessThan`：left/right 为数值字段，要求 left < right。
- `excludes`：left 为多选列表、right 为单个 ID，列表不得包含此 ID。
- `disjoint`：两列表不得有相同元素；`by: objectId` 比较对象指定键。

规则只在所需值已存在且分支生效时判断；不完整草稿不会伪造缺失值。浏览器与后端使用同一个 `shared/schema.js`，后端仍独立校验所有保存/提交。

## 控件扩展与限制

`web/renderer.js` 导出 `registerWidget(name, render)`；受信任的插件源码可注册控件，在既有数据 type 上通过 `widget` 选择。它是开发接口，没有开放从 Study 上传/执行 JS，也不是动态插件市场。增加全新数据类型或校验算子仍须升级公共协议和测试。

当前没有 CSV 导入、电子表格粘贴、拖拽排序、远程异步候选、公式计算、自动回调或自动恢复已结束的 Agent。这些均不作为现有能力宣称。v1 表单继续兼容；v2 定义不自动改写已有配置或历史请求。
