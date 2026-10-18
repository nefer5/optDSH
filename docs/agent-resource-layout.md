# Agent资源与DSH_HOME：已确认设计

2026-10-18。用户希望安装时识别/创建共享.agents，并携带优化的专家提示词、经验、脚本和配置；用户已确认采用“包内完整能力＋可选共享＋按宿主适配”。当前只在新开发目录推进，禁止改写本机全局.agents；完整公共资源包及共享安装器尚未实现，不把设计确认当作功能完成。决定权威入口为[Q8](decisions.md)。

## 已核对的机制

- 官方DSH分别解析DSH_HOME与DSH_AGENTS_HOME，后者缺省用户.agents；项目级.agents/skills也可按会话工作目录发现。
- Agent Skills规范统一SKILL.md及脚本/参考/资产组织；不等于所有宿主统一了专家角色、模型、工具权限或Hook格式。
- OpenAI官方文档确认Codex读取用户/仓库.agents/skills，同名技能不自动合并；OpenCode亦支持两种共享路径。
- Claude Code专家角色使用其原生.claude/agents目录；我们的.agents/experts是中心组织约定，不能假定所有工具会自动识别。

## 已确认：包内基线与可选共享导出

1. 插件/资源包携带完整、固定版本的公共专家基线；optDSH无需用户共享目录也能启用选装专家。
2. 安装时提供本产品内使用/共享给选定Agent的选择。读取现有.agents，缺失时在所选作用域创建；仅安装本产品拥有且有命名空间的资产。
3. 技能按通用格式导出；专家角色和Hook/MCP等按目标宿主适配。中性提示词/经验/脚本与宿主文件分离，宿主未知就不声称兼容。
4. 不覆盖用户已有同名文件；维护版本/来源/已安装哈希及路径清单，更新先识别用户修改并保留，卸载仅处理产品拥有且未改动的导出项。
5. 用户定制留共享目录或课题目录；产品升级只替换包内基线。共享目录损坏/缺失不拖垮主平台，故障和回退明确报告。
6. 不将光学业务要求自动追加到用户全局AGENTS.md；公共资源不含开发机路径、私人偏好/截图、凭据和真实研究。

## 目录职责

| 位置 | 内容 |
|---|---|
| installRoot下的插件资源 | 固定版本公共基线，随产品发放 |
| DSH_HOME | 官方Profile/会话、optDSH设置与自有状态、分发回执 |
| 用户.agents | 用户自有共享技能/中性专家资产，可选安装输出 |
| workspace/.agents | 当前课题特定规则、技能和定制 |
| 源码.agents | 开发本平台的协作配置；当前混有产品Skill源码，归属拆分另列T8，不假称已完成 |

上述示例强调职责，不要求资料根和共享根必须同盘或同父目录。真实研究仍在外部workspace。

## 官方依据

- [Agent Skills规范](https://agentskills.io/specification)
- [Codex Skills加载位置](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)
- [OpenCode Skills](https://opencode.ai/docs/skills/)
- [Claude Code专家角色作用域](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)
- [DSH 0.2.1发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1)

## 后续实现与验证边界

- 专家插件拥有公共基线及角色适配，optdsh-bundle负责选择与装配，Windows安装器负责显式安装选项；公共定义不依赖开发机中心或邻接项目。
- 先在测试临时目录验证共享计划、命名空间、版本/哈希回执和用户修改冲突，再对各宿主格式及发现机制验收。测试的用户根必须显式注入，不能指向本机用户.agents。
- 默认安装仅使用包内资源；选择共享才允许生成对应宿主文件。目标不受支持时报告该项失败，纯平台仍应可用。
- 宿主文件生成、工具发现、角色可调用和实际行为分别验收；尚无完整真实宿主验证，不宣称跨工具全部兼容。
