# Forms原生YAML与幂等验证

2026-10-18；产品dev.18，Forms0.4.0，光学公共包0.4.1。

## 已验证

- 新建官方Home、独立workspace、空DSH_AGENTS_HOME。仅复用本机模型连接配置，未复制旧聊天或全局Skill。GLM-5.3-Flash实际调用forms_open_yaml，在标准会话右侧打开Rx随包示例并标记指定字段。
- 浏览器实际显示完整61项参数、灰注释和字段高亮；聊天同时可用。修改H扫描点数3→5并连续保存，仍为同一文档和Run。提交后只读，官方队列回投到同一会话，Agent按原任务停留在参数准备。截图已由Codex实际读取审查。
- 源码运行器只执行离线plan，领取原prepared Run runs/rx-fov/261018-01，输入SHA不变、目录不新增。未连接Zemax。
- 存储测试覆盖多次修改/保存/重开/进程重载后文件数不增长；维护文件冲突和单份备份；重复提交快照/投递计数不增长；重复派生复用子草稿；重复执行拒绝，不能另建Run规避领取。
- 官方Web setPluginEnabled停用后Forms路由404，core仍ready；官方Profile remove卸载后重启，Forms为not-installed且路由404，资料保留。
- 泛用解析覆盖嵌套对象/数组/null/空集合/别名/特殊键/大整数/结构调整/注释。特殊结构保留原文，不承诺所有YAML标签都具备专属图形控件。

本机验证现场在独立validation/forms-native-20261018，私有认证、会话和模型配置不进Git。正式使用说明见[插件](../../plugins/optdsh-forms/README.md)。

## 验证边界

这是同机独立Home与官方Host的验证，不是Windows沙箱或公司实机验收。浏览器提交不自动授权分析；真实Zemax、复杂研究业务及其他模型需要按任务另验。崩溃或投递超时标记uncertain，不自动重复投递；需要查看原会话确认。

完整npm test退出0：192项插件、110项安装、11项PPT、142项光学、37项分发、56项架构工具，以及模拟DOM/文档检查通过。开发预览已显式安装加载Forms0.4，基础平台/画板/工作台/Forms均ready；原模型与用户课题资料保留。
