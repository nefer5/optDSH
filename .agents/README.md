# optDSH 开发专家中心

唯一专家为 [visual-designer](experts/visual-designer/instructions.md)，当前统一源版本0.7.0；本目录为跨项目唯一权威，产品规则按目标项目路由。

- `experts/` 保存角色源、统一偏好、五类基础参考与产品界面专题；[图册](experts/visual-designer/library/index.html)。
- [expert-distribute](development-skills/expert-distribute/SKILL.md) 是开发维护 Skill，不放进 DSH 产品 `.agents/skills`。
- `distribution.json` 是内部宿主格式注册表；生成配置到 `.codex/agents`、`.opencode/agents`、`.claude/agents` 及 DSH `.agents/dsh-presets`，共用 `.agents/resources/<name>/library/`（与源library层级一致）。
- 生成副本、分发收据与备份 Git 忽略；克隆后运行分发。更新源后重新分发；不手改生成文件，不覆盖手工冲突。
- optDSH维护唯一源；AgentTyvate的专家目录通过本机Junction引用这里，分发入口转发中心。统一个人偏好在preferences.md，原始图片在private/，均不进入公共包。

使用、命令及验证边界见 [开发专家指南](../docs/agents.md)。

DSH原生接入：官方新会话选择“视觉设计专家”；Standard或光学工作台主会话可调用 `expert_visual_designer`。原生工具与权限审批保持一致，不增加光学工作台白名单。

2026-09-27：增加[仿真与工具界面专题](experts/visual-designer/library/collections/product-ui/README.md)，含 Conductor、Mirror、Lightyear 2024、Anytype、WOW-page 及 One Page Love 来源。四宿主文件分发与37项公共资源核对完成，16项分发测试通过。本轮未重载运行中Host；DSH需空闲后重载并使用新会话核对新版正文。

公共素材统一从分发包读取：DSH expert_resource与四宿主指令都使用resources/visual-designer/library。源experts目录负责维护；本项目私有preferences仍留源目录，不随公共素材外发。

## 中心分发

在optDSH根目录运行：

```powershell
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml --apply
python .agents/development-skills/expert-distribute/scripts/distribute.py --fleet .agents/distribution-targets.local.yaml --check
```

本机清单包括optDSH四宿主、AgentTyvate三宿主；路径配置Git忽略，可从Skill的config/targets.example.yaml复制恢复。先检查所有目标冲突再写入，各目标保留收据和备份。源目录链接是即时共享；宿主生成文件仍须分发，运行中模型不会自动改写已有上下文。

公开包、私人资料和第三方截图的区别见[专家发布说明](experts/visual-designer/PUBLICATION.md)。原始双源及迁移收据在data/expert-authority和Tyvate的.agents/.distribution/backups，本轮不删除旧证据、不发布远端。
