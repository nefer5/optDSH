# 会话内 YAML 参数编辑器

入口来自 Agent 的 `forms_open_yaml` 原生工具。插件在官方右侧栏注册“参数”面板，不新增常驻会话标题按钮。`forms_open_yaml`、`forms_focus`、`forms_read` 的工具结果可渲染紧凑的“打开参数”卡片，便于再次查看。

编辑器采用固定 HTML/JavaScript 渲染任意受支持的 YAML 语法树；完整配置始终展示。Agent 更新 `focusPaths` 只改变高亮，不重新组织网页。字段、参数键与数组项可修改，原文区支持保留注释的整份编辑；特殊结构保留原文，由原文区编辑，不静默丢弃。

保存用途由请求指定，前端展示维护原文件或本次 Run 的实际目标；不提供随意输入服务器文件路径的控件。保存只更新文件，提交才回交当前会话。提交后配置只读；“继续修改”通过 `fork` 创建新请求，Run 模式由服务端创建新 Run，保留原提交。

iframe 从父页面接收同源主题消息，传递宿主实际 DSH 颜色与字体变量，且同时校验 `event.origin` 和 `event.source`。右侧宽度和关闭行为由官方侧栏负责。每秒读取当前请求：相同 revision 更新重点与回交状态，保留输入 DOM；远端版本变化遇到本地输入则保留输入并提示冲突，不直接重绘覆盖。

## 前端验证

运行 `node --test plugins/optdsh-forms/tests/yaml-client.test.mjs plugins/optdsh-forms/tests/yaml-editor.test.mjs`。

这些测试运行实际前端源码和模拟 API，覆盖原生工具标记、自动打开不反复抢占、未失焦输入与重点更新、直接保存的顺序和版本、精确大整数、原文错误保留、提交只读与继续修改。它们不替代真实 DSH 浏览器、主题和实际会话回交验收。
