---
name: expert-distribute
description: 在本项目维护自定义专家的单一源定义，预览、分发并核验 Codex、OpenCode、Claude Code 和 DSH 原生 Agent 配置、公共参考包、技能与 hook。用于新增专家、同步专家、检查角色漂移；不负责直接执行专家任务，也不修改全局铁律。
---

# 专家分发

源目录为本 Skill 所在仓库的 `.agents/experts/<name>/`，当前有 [visual-designer](../../experts/visual-designer/instructions.md)（视觉设计专家）与 [software-architect](../../experts/software-architect/instructions.md)（软件架构专家）。目标注册表为 [distribution.json](../../distribution.json)。角色正文只改 `instructions.md`；名称、显示名 `title`、描述和版本只改 `agent.json`（四个字段均必填）。宿主生成文件不手改。

## 公共包：resources.json schema 2

```json
{"schema_version": 2,
 "files": ["library/START.md", "kit/scripts/arch_scan.py", "kit/hooks/spec.json"],
 "skills": ["kit/skills/arch-plan"],
 "hooks": "kit/hooks/spec.json",
 "git_hooks": {"pre-commit": "kit/scripts/arch_commit.py"}}
```

- `files` 只允许 `library/`（.md .json .png .html）与 `kit/`（另允许 .py .toml）；`kit/tests/` 不分发。`skills`、`hooks`、`git_hooks` 可省略。Git hook仅支持声明已分发的kit/scripts/*.py作为pre-commit入口。只按白名单复制，不递归复制源目录；脚本保留层级写到目标 `.agents/resources/<name>/`，并随包分发处理后的 resources.json。
- 所有分发的 .md（正文、library、kit、技能）把 `{{RESOURCE_ROOT}}` 替换为 `.agents/resources/<name>/library`、`{{KIT_ROOT}}` 替换为 `.agents/resources/<name>/kit`；.py/.toml/.json 原样。占位符指向的包内无对应文件时拒绝分发。
- 公开文本（含 kit .py）拒绝本机绝对路径与控制侧身份；PNG 校验文件头，缺失的第三方 PNG 跳过。总量上限 20 MiB。`preferences.md` 与 `private/` 不进入公共包。

## 分发对象表

| 对象 / 参数 | 项目级目标 | 原生格式 | 当前核对 CLI |
|---|---|---|---|
| Codex / `codex` | `.codex/agents/<name>.toml` | name、description、developer_instructions | 0.157.0 |
| OpenCode / `opencode` | `.opencode/agents/<name>.md` | v1 frontmatter，mode=subagent | 1.17.14 |
| Claude Code / `claude` | `.claude/agents/<name>.md` | name、description、model=inherit + 正文 | 2.1.205 |
| DSH / `dsh` | `.agents/dsh-presets/<name>/` | Standard声明patch agent.cordis.yml、preset.yml、expert.json | 0.2.0-rc.2 |
| 公共参考包 | `.agents/resources/<name>/` | library/、kit/ 与 resources.json | 随专家版本校验 |
| 技能 | Codex/OpenCode/DSH 任一选中：`.agents/skills/<skill>/`；Claude：`.claude/skills/<skill>/` | 整个 `kit/skills/<skill>/`，SKILL.md frontmatter name 须等于目录名 | 共用目录 shared；Claude 目录随 Claude 版本 |
| Hook | Codex `.codex/hooks.json`、Claude `.claude/settings.local.json`、DSH `.agents/dsh-hooks/<name>.json` | 由 `kit/hooks/spec.json` 渲染（见下） | 随对应宿主版本 |

默认四宿主，`--only`/`--exclude` 临时筛选。OpenCode 不渲染 hook。不固定模型、不提升权限；版本字段只表示核对基线，不代表已验证模型调用。

## Hook 渲染

spec.json（schema 1）每项含 event（SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop）、可选 matcher、相对 kit 根的 .py script、args、timeout、status；渲染时追加 `--host codex|claude|dsh`，Python 在 Windows 用 `python`，其他平台 `python3`。

- Codex：`command`（python3）与 `commandWindows`（python）分写，脚本用无引号的绝对路径；Windows 下命令可能经 PowerShell 或 `cmd /C "<命令>"` 执行，路径含空格等需引号的字符时拒绝渲染。新增或变化的 hook 需在 Codex `/hooks` 中重新信任。
- Claude Code：exec form（`command` + `args`），脚本路径为 `${CLAUDE_PROJECT_DIR}/.agents/resources/<name>/kit/...`，不经 shell。
- DSH：独立托管文件（Claude Code hooks 格式），供 `@deepseek-ai/dsh-hooks-claude-code` 桥接读取；桥接只执行 shell 形式 `command`，经 DSH shell（Windows 为 pwsh）在会话 cwd 运行，因此使用本项目 kit 脚本的绝对路径。

Codex 与 Claude 文件是结构化托管合并：带 `.agents/resources/<name>/kit/` 的 handler 视为该专家托管，其余键和 hook 原样保留；收据按“文件#专家”记录托管片段哈希。片段被手改、或无收据却已有带标记的 handler 时视为冲突，不覆盖；从 spec 删除 hook 时只移除本专家托管的 handler。写入前备份整文件。

## Git 提交入口

声明git_hooks时，在目标Git仓库安装一份宿主共用的pre-commit包装器，使用Git实际提供的index，检查一次且只报告。安装复用现有分发预检/备份/回执；已有非托管或漂移hook拒绝覆盖。非Git目录不安装；自定义core.hooksPath、项目外worktree hook目录拒绝自动安装，不修改全局/仓库Git配置。POSIX导出时设置执行位。hook脚本不可调用模型或自动提交；Git的--no-verify会跳过它。

## 工作流

1. 阅读待分发专家源定义及目标产品规则。只分发公开专业内容，不夹带私有案例、答案、优化历史或控制侧路径。
2. 运行默认预览，明确目标、动作与实际版本。版本变化时停止自动应用，先查该版本官方接口并更新注册表；不猜兼容或自动升级工具。
3. 已获用户分发授权即可 `--apply`，不反复确认；无授权只预览。遇同名非托管文件或手工漂移先保留，核对差异后通过源定义解决；脚本不强制覆盖或删除。
4. 运行 `--check` 对照生成内容、文件指纹和源版本。更新前备份在目标 `.agents/.distribution/backups/`；状态在同目录 `state.json`，不自动清理。
5. 分开报告：已生成/分发、宿主已发现/加载、真实调用已验证。文件哈希相同不代表宿主已加载或专家质量合格。

## 命令

在仓库根运行（其他位置用脚本绝对路径）：

```powershell
python .agents/development-skills/expert-distribute/scripts/distribute.py
python .agents/development-skills/expert-distribute/scripts/distribute.py --apply
python .agents/development-skills/expert-distribute/scripts/distribute.py --check
python .agents/development-skills/expert-distribute/scripts/distribute.py --expert software-architect --only claude
python .agents/development-skills/expert-distribute/scripts/distribute.py --expert visual-designer,software-architect --exclude opencode
```

`--expert` 默认 `all`（experts/ 下含 agent.json 的全部源），也可给单个名称或逗号列表；多个专家先全部预检再写入，共享 hook 文件按专家顺序合并。`--project-root <外部产品目录>` 可导出到用户指定的现有产品；先读取目标规则并核对范围。默认根目录为源仓库，不取决于终端 cwd。首次进入外部产品时由主会话提供获准的偏好摘要，不要求专家回读源仓库。

本 Skill 存放于开发专用目录，不进入 DSH 产品业务 Skill 目录，通过 AGENTS.md 入口读取执行；分发脚本不安装本 Skill，也不建立全局或项目 Skill 链接。

## 维护和验证

新增专家需要 `agent.json` + `instructions.md`，有资料、脚本、技能或 hook 时加 `resources.json`。删减白名单或技能但仍有旧托管文件时停止分发，先用 safe-delete 处理旧文件并核对本机收据，不自动清理。改宿主适配先验证生成格式、更新、幂等性、冲突保护、资料可达性与偏好不外发，再跑本项目规定检查。官方依据与差异见[宿主设计说明](../../../docs/agents.md)。

## YAML 配置

复制 [distribution.example.yaml](config/distribution.example.yaml) 到项目 `config/expert-distribution.local.yaml`，使用 `--config config/expert-distribution.local.yaml`，可再加 `--apply` 或 `--check`。必填 expert（名称、逗号列表或 all）；only/exclude 为逗号分隔宿主名且互斥。拒绝未知字段、空值、非法专家名及与 CLI 选择混用。依赖项目现有 PyYAML 6.0.3。分发属于开发配置维护，不创建分析 run。

## DSH 产品适配

`--only dsh` 生成原生专家Preset、委派数据、`.agents/skills` 技能与 DSH hook 文件。DSH版本取项目安装包，不调用全局CLI；Standard模板签名不符拒绝生成，不修改node_modules。0.2基线从`@deepseek-ai/dsh-web-app/presets/standard.patch.yml`复制声明，只替换预设身份、显示名（title）和persona；persona 末尾注明 `expert_resource` 的 `expert=<name>`。

启动器 `start-dsh.ps1` 在新进程启动前运行 `--expert all --only dsh --apply`，并为每个 `.agents/dsh-presets/*/agent.cordis.yml` 加一个 `--patch`；已有服务不会因分发自动重启。`plugins/optdsh-experts` 为每个已分发专家注册 `expert_<name>` 委派工具（`-` 换 `_`），共用一个 spawn 提供方 `optdsh-experts`。DSH hook 桥接在 [dsh.local-policy.yml](../../../config/dsh.local-policy.yml) 按专家显式配置 configPath，进程级生效。导出到其他项目只生成文件，不修改对方启动策略或安装插件，须按[专家指南](../../../docs/agents.md)接线。

## 唯一权威与多项目分发

optDSH是唯一源，已授权的AgentTyvate本机目录通过Junction引用专家源，旧Skill命令转发本中心。公共正文不混入光学项目约束；按目标项目AGENTS路由。个人preferences.md与private/在中心维护但Git忽略，不加入resources.json。

[多项目YAML样例](config/targets.example.yaml)复制到`.agents/distribution-targets.local.yaml`，`--fleet <该文件>`预览，加`--apply`分发、`--check`校验，可配合 `--expert`（默认 all）。根字段只允许非空projects列表，每项必须path和hosts；path相对此YAML位置。与--config/--only/--exclude/--project-root互斥。先预检全部项目与专家，防止后续项目冲突导致前面已写；磁盘故障靠各目标收据和备份恢复，不宣称跨磁盘事务。

第三方PNG是本机参考，可在公共克隆中缺失；只跳过缺失PNG，不跳过缺失文字资源。公共源码包用plugins/optdsh-experts/scripts/export-public.py输出新目录，排除截图、个人偏好和本机配置，并校验文本链接和SHA-256。
