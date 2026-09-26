# Codex 项目初始化

## 已落地

Codex 的 `/init` 用于生成 AGENTS.md。这里依据真实项目背景直接创建并整理了相同的规则入口，没有声称执行过交互式 `/init` 命令，也不再用通用模板覆盖它。

- 根 [AGENTS.md](../../AGENTS.md)：自动发现的项目指令入口。
- [项目铁律手册](project-rules.md)：规则理由与验收边界，按需读取。
- `.agents/skills/`：项目级 skills，随仓库维护，不安装到用户全局目录。
- [当前状态](../../planning/STATUS.md)：交接入口；普通进度不写共享环境记忆。

## 项目 skills

| Skill | 使用场景 |
|---|---|
| [optdsh-model-baseline](../../.agents/skills/optdsh-model-baseline/SKILL.md) | 选择/接入/更换模型或比较 Harness 配置时，建立有证据的非顶尖模型基线 |
| [optdsh-optics-contract](../../.agents/skills/optdsh-optics-contract/SKILL.md) | 新增/修改场景快照、对象选择、姿态与版本契约时，检查语义和一致性 |

可以显式请求“用 `$optdsh-model-baseline` 做接入验证”或“用 `$optdsh-optics-contract` 检查这个对象引用”。默认允许按任务匹配。

它们是指令资源，不是 DSH 代码插件。2026-09-26 实测发现当前 DSH Standard 已将项目 skill 纳入目录，MiniMax 在测试中实际调用了 optdsh-optics-contract。后续新增 skill 时须考虑它也可能进入产品 Agent，不要把仅适用于开发维护的授权误用于产品操作。其他宿主仍需分别验证加载。

## 加载与验证边界

文件已创建并进行格式/链接验证，不等于当前已启动任务的技能目录一定即时刷新。后续 Codex 任务从本仓库打开；若技能列表未出现，重启会话后检查，或显式指定文件路径读取。无需为项目初始化修改全局配置或创建空 `.codex/config.toml`。

## 官方依据

- [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [项目 skills](https://learn.chatgpt.com/docs/build-skills)
- [开发命令与 /init](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
