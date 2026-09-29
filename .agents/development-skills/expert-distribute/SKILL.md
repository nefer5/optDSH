---
name: expert-distribute
description: 在本项目维护自定义专家的单一源定义，预览、分发并核验 Codex、OpenCode、Claude Code 和 DSH 原生 Agent 配置。用于新增专家、同步专家、检查角色漂移；不负责直接执行视觉设计，也不修改全局铁律。
---

# 专家分发

源目录为本 Skill 所在仓库的 `.agents/experts/<name>/`，目标注册表为 [distribution.json](../../distribution.json)。角色正文只改 `instructions.md`，名称、描述和版本只改 `agent.json`。四个宿主的生成文件不手改。

专业参考资料放专家的 `library/`，用 `resources.json` 明确列出允许分发的文件。脚本保留源目录的`library/`层级，复制到目标项目`.agents/resources/<name>/library/`，并在上一级分发`resources.json`白名单。四个宿主共用一份，正文的`{{RESOURCE_ROOT}}`替换为library目录；DSH公共资源工具读取同一份分发产物。图片和说明同步校验，不只分发提示词。`preferences.md` 是用户偏好，默认排除；源项目或显式链接至同一权威专家目录的本机项目，提示词指向统一偏好文件；其他外部导出不携带此引用或内容。

## 分发对象表

| 对象 / 参数 | 项目级目标 | 原生格式 | 当前核对 CLI | 模型与能力 |
|---|---|---|---|---|
| Codex / `codex` | `.codex/agents/<name>.toml` | name、description、developer_instructions | 0.157.0 | 不固定模型；权限和工具由宿主及任务约束 |
| OpenCode / `opencode` | `.opencode/agents/<name>.md` | v1 frontmatter，mode=subagent | 1.17.14 | 不写 v2 字段；不固定模型 |
| Claude Code / `claude` | `.claude/agents/<name>.md` | name、description、model=inherit + 正文 | 2.1.205 | 仅基础字段；不依赖新版 omitClaudeMd 等能力 |
| DSH / `dsh` | `.agents/dsh-presets/<name>/` | Standard声明patch agent.cordis.yml、说明preset.yml、expert.json | 0.2.0-rc.2 | 原生专家会话＋具名子Agent；不固定模型 |
| 公共参考包 / 随选定宿主共用 | `.agents/resources/<name>/library/` | 同级resources.json文件白名单 | 与角色源版本一起校验 | 不分发个人偏好、实验资料或整个源目录 |

默认是表内全部四家，`--only` 或 `--exclude` 临时筛选，不改注册表缩减范围。Gemini、Claude 的其他 profile 和个人级目录不在本轮分发对象中；未来显式新增目标时另行核对。版本字段仅表示核对基线，不代表已验证模型调用。

## 工作流

1. 阅读待分发专家源定义及目标产品规则。只分发公开专业内容，不夹带私有案例、答案、优化历史或控制侧路径。
2. 运行默认预览，明确列出目标、动作与实际版本。版本变化时停止自动应用，先查该版本官方接口并更新注册表；不要猜兼容或自动升级工具。
3. 已获用户分发授权即可 `--apply`，不反复确认。没有授权时仅预览。遇同名非托管文件或手工漂移先保留，核对差异后通过源定义解决；脚本不强制覆盖或删除。
4. 运行 `--check` 对照生成内容、文件指纹和源版本。更新前备份在目标 `.agents/.distribution/backups/`；状态登记在同目录 `state.json`，按需保留，不自动清理。
5. 分开报告：已生成/分发、宿主已发现/加载、真实调用已验证。不能用文件哈希相同代替宿主加载与专家质量验证。按需要在新会话中核对；日常子代理不适合作为天然隔离的被试。

## 命令

在仓库根运行（其他位置用脚本绝对路径）：

```powershell
python .agents/development-skills/expert-distribute/scripts/distribute.py
python .agents/development-skills/expert-distribute/scripts/distribute.py --apply
python .agents/development-skills/expert-distribute/scripts/distribute.py --check
python .agents/development-skills/expert-distribute/scripts/distribute.py --only claude
python .agents/development-skills/expert-distribute/scripts/distribute.py --exclude opencode
```

默认专家为 `visual-designer`；`--expert <name>` 选其他已存在源定义。`--project-root <外部产品目录>` 可导出到用户指定的现有产品；先读取目标规则并核对范围。只生成选定专家与白名单参考包，不复制控制侧或 Skill 到被试目录。默认根目录为源仓库，不取决于终端 cwd。首次进入外部产品时由主会话提供获准的偏好摘要，不要求专家回读源仓库。

本 Skill 存放于开发专用目录，不进入 DSH 产品业务 Skill 目录。通过 AGENTS.md 的入口读取并执行；不要求宿主自动发现开发 Skill。

分发脚本不负责安装本 Skill。本项目不建立全局或项目 Skill 链接。

## 维护和验证

新增专家沿用现有 `agent.json` + `instructions.md`，需要图文资料时加 `library/` 和 `resources.json`，具体能力边界保持在角色正文。资源总量上限 20 MiB；删减白名单但仍有旧托管资源时停止分发，先通过 safe-delete 处理旧文件并核对对应本机收据，不自动清理。改宿主适配先验证生成格式、更新、幂等性、冲突保护、资料可达性与偏好不外发，再跑本项目规定检查。

官方依据与差异见 [宿主设计说明](../../../docs/agents.md)。首期专业包为 [visual-designer](../../experts/visual-designer/instructions.md)。角色文件继承可用工具，不自动提升权限，也不等于文件系统强隔离；工具使用遵守任务授权和产品规则。

## YAML 配置

复制 [distribution.example.yaml](config/distribution.example.yaml) 到项目 `config/expert-distribution.local.yaml`，使用 `--config config/expert-distribution.local.yaml`，可再加 `--apply` 或 `--check`。必填 expert；only/exclude 为逗号分隔宿主名且互斥，无物理单位。拒绝未知字段、空值及非法专家名。宿主格式注册表和资源白名单是内部 JSON 元数据。依赖项目现有 PyYAML 6.0.3。

分发属于开发配置维护，收据与备份在 `.agents/.distribution`，不创建分析 run；专家开展正式分析/报告时遵守项目公共 run 规范。

## DSH 产品适配

`--only dsh` 生成原生专家Preset及同正文的委派数据。DSH版本取项目安装包，不调用全局CLI。Standard模板签名不符会拒绝生成；不修改node_modules。启动器在新进程启动前同步DSH目标，已有服务不会因分发自动重启。

0.2基线从`@deepseek-ai/dsh-web-app/presets/standard.patch.yml`复制声明，保留原生工具组合与Cordis标签，只替换预设身份和persona。生成的`agent.cordis.yml`需由启动器以`--patch`加载；不再使用旧`agent-presets.roots`目录扫描。

本项目 `plugins/optdsh-experts` 接入专用spawn提供方和 `expert_visual_designer` 原生工具；它与Preset使用同一份生成正文。启动器加载生成的预设声明patch，默认仍为Standard。DSH导出到其他项目只生成文件，不自动修改对方启动策略或安装插件，须按[专家指南](../../../docs/agents.md)接线。子Agent沿用原生工具、审批与模型，不增加工作台白名单；目前为一次性前台返回，后续问题可再次委派。

## 唯一权威与多项目分发

optDSH是唯一源，已授权的AgentTyvate本机目录通过Junction引用专家源，旧Skill命令转发本中心。公共正文不混入光学项目约束；按目标项目AGENTS路由。个人preferences.md与private/在同一中心维护但Git忽略，不加入resources.json。

[多项目YAML样例](config/targets.example.yaml)复制到`.agents/distribution-targets.local.yaml`，`--fleet <该文件>`用于预览，加`--apply`分发、`--check`校验。根字段只允许非空projects列表，每项必须path和hosts；path相对此YAML位置，hosts为逗号分隔宿主名，拒绝重复项目/非法字段。与--config/--only/--exclude/--project-root互斥。先预检全部目标，防止第二项目冲突导致第一项目已写；后续磁盘故障靠各目标收据和备份恢复，不宣称跨磁盘事务。

第三方PNG是本机参考，可在公共克隆中缺失；只跳过缺失PNG，不跳过缺失文字资源。图片不存在时工具明确提示，不能伪造视觉验证。公共源码包用plugins/optdsh-experts/scripts/export-public.py输出新目录，排除所有截图、个人偏好和本机配置，并校验文本链接和SHA-256。
