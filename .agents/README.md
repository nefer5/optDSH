# optDSH 开发专家中心

专家唯一权威在C:/Users/admin/.agents/experts，本目录通过链接引用，产品规则按目标项目路由。当前专家：

| 专家 | 显示名 | 内容 |
|---|---|---|
| [visual-designer](experts/visual-designer/instructions.md) | 视觉设计专家 | 五类基础参考与产品界面专题，[图册](experts/visual-designer/library/index.html) |
| [software-architect](experts/software-architect/instructions.md) | 软件架构专家 | 原则/模式/语言清单/模板（library），扫描器、技能 arch-plan/arch-review、hook 规格（kit） |

- `experts/<name>/` 保存角色源（agent.json 含 title）、统一偏好、`resources.json`（schema 2 白名单，library/ 与 kit/）。
- [expert-distribute](development-skills/expert-distribute/SKILL.md) 是开发维护 Skill，不放进 DSH 产品 `.agents/skills`。
- `distribution.json` 是内部宿主格式注册表；生成角色到 `.codex/agents`、`.opencode/agents`、`.claude/agents` 及 DSH `.agents/dsh-presets`，公共包到 `.agents/resources/<name>/`，技能到 `.agents/skills/` 与 `.claude/skills/`，hook 合并进 `.codex/hooks.json`、`.claude/settings.local.json` 并写 `.agents/dsh-hooks/<name>.json`。架构专家仅保留SessionStart；Git提交检查独立安装仓库pre-commit，四宿主共用，不在Stop运行。
- 生成副本、分发收据与备份 Git 忽略；克隆后运行分发。更新源后重新分发；不手改生成文件，不覆盖手工冲突。
- 用户Agent中心维护唯一源；optDSH与AgentTyvate的专家目录通过本机Junction直接引用用户中心，分发入口转发中心。统一个人偏好在各专家 preferences.md，原始图片在 private/，均不进入公共包。

使用、命令及验证边界见 [开发专家指南](../docs/agents.md)。

DSH原生接入：官方新会话选择“视觉设计专家”或“软件架构专家”；Standard或光学工作台主会话可调用 `expert_visual_designer`、`expert_software_architect`。`expert_resource` 以 `expert` 参数选择资料包。原生工具与权限审批保持一致，不增加光学工作台白名单。

2026-09-27：增加[仿真与工具界面专题](experts/visual-designer/library/collections/product-ui/README.md)，含 Conductor、Mirror、Lightyear 2024、Anytype、WOW-page 及 One Page Love 来源。

## 中心分发

在optDSH根目录运行（`--expert` 默认 all，可写单个或逗号列表）：

```powershell
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml --apply
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml --check
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml --expert software-architect
```

本机清单包括optDSH四宿主、AgentTyvate三宿主；路径配置Git忽略，可从Skill的config/targets.example.yaml复制恢复。先检查所有目标与专家的冲突再写入，各目标保留收据和备份。源目录链接是即时共享；宿主生成文件仍须分发，运行中模型不会自动改写已有上下文；Codex 项目 hook 变化后需在 `/hooks` 重新信任。

公开包、私人资料和第三方截图的区别见[专家发布说明](experts/visual-designer/PUBLICATION.md)。原始双源及迁移收据在data/expert-authority和Tyvate的.agents/.distribution/backups，本轮不删除旧证据、不发布远端。

权威入口C:/Users/admin/.agents/experts/README.md，分发实现位于用户中心skills/expert-distribute；项目distribution.json链接中心注册表。恢复先配置中心源和链接再分发，原件与旧脚本保留.backup/expert-user-center-2026-10-03。
