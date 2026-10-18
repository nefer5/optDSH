# Agent、Skills与专家

官方DSH Web与工作台共用同一会话与Standard循环。当前DSH固定0.2.1-rc.2；产品功能与开发本项目的Codex分开，GLM-5.3-Flash是近期产品验收路线，不自动限制用户全部普通会话。

## 产品Skills

光学Skills在`packages/optics/skills`，PPT在其包内`skills`，Canvas与Forms在各自插件内。通过官方Provider或注册服务进入`skill`工具；外部课题无需复制源码目录。各技能引用的脚本与样例跟随Skill，实际分析仍遵守当前课题配置、身份与授权门禁。

用户级/项目级发现入口与优先级见[架构发现表](architecture.md)。源码`.agents/skills`保留开发用途；Forms开发导航在`.agents/development-skills/dsh-forms`，产品唯一源在[Forms Skill](../plugins/optdsh-forms/skills/dsh-forms/SKILL.md)。

## 官方专家Preset与子Agent

Experts插件通过官方Profile安装。它的Bundle声明`optdsh-visual-designer`、`optdsh-software-architect`两位官方Preset，保留标准会话为默认。用户可在新会话选择专家，也可由主Agent调用`expert_visual_designer`或`expert_software_architect`；这两个工具使用官方`dsh-tool-subagent`绑定Preset和`spawn`。

工具启动后返回子会话身份，官方完成通知携带结果；官方控制工具管理消息、取消和子会话。独立spawn专家不自动看到父会话全文，委派任务应包含必要上下文。继承模型和权限的具体行为以官方机制及当前设置为准；Preset不构成安全沙箱。

`AGENTS.md`是规则手册，不创建专家；产品不再扫描`.agents/dsh-presets/*/expert.json`。旧生成的`agent.cordis.yml`只属于开发分发历史，文件存在不代表已注册。

## 必要的资源适配

`expert_resource(expert, resource)`按包内清单读取`library/START.md`、`library/<路径>`或`kit/<路径>`。校验当前官方Agent和真实路径，不限定会话cwd为源码目录。公共包不含私人偏好/图片；`preferences.md`明确返回未配置说明，课题规则通过官方文件工具读取。

资源实体与快照在`plugins/optdsh-experts/resources`，构建入口为`scripts/build-resources.py`。源中心仅为开发维护入口，公共白名单快照随版本分发，不把本机Junction作为用户运行依赖。

## 生命周期与验证

Experts的资源工具、Preset和派工工具属于同一个Profile组；停用/卸载后不会由Bundle或源码fallback重新注册。新实例使用当前定义；历史会话恢复仍需相应Preset存在，失败应如实报告而不自动改回Standard。

本轮验收见[dev.21](verification/product-resources-dev21.md)。不以角色列表可见替代实际派工，不把一次合成任务扩展为所有专家能力保证。

## 开发专家与Hook

开发者入口仍在[.agents README](../.agents/README.md)，用户中心是开发专家源；不能把开发角色、私人偏好或Hook自动带进所有产品会话。架构开工、视觉选择与提交检查按根AGENTS执行。Git pre-commit只报告暂存问题，不运行模型或自动续轮。
