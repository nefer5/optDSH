# 架构专家触发逻辑简化

状态：已完成；配置分发与确定性/宿主协议验证通过，真实模型首请求遵循未验收。用户于 2026-10-02 确认方案并授权实施；L2，涉及公共扫描接口、专家分发与 Git 入口。

## 已确认设计

- 会话开始/恢复注入简短规范：提示目录归属、L0/L1/L2 与 arch-plan/arch-review；不扫描、不维护已审状态。
- 删除 Codex、Claude Code、DSH 的架构 Stop handler；旧版本 handler 尚未卸载时，新的 stop 入口直接静默，不读 Git/状态。
- Git pre-commit 运行一次确定性检查，读取真实 Git index（支持部分暂存及初次提交），默认报告而不阻断，不调用模型、不启动对话。
- 用户明文请求通过 arch-review 进入人工/专家审查；不再要求 --record 消除提醒。
- 唯一源为 .agents/experts/software-architect；用 expert-distribute 更新四宿主及本机已登记的 optDSH/AgentTyvate 托管副本，不手改宿主生成文件。
- Git hook 安装只管理本项目仓库的 hook；不改全局 core.hooksPath，不覆盖已有用户 hook；冲突在预览阶段报告。现有回执/备份机制继续保留。
- 兼容旧 --record 与 [review] 字段，但不让它们恢复 Stop 自动续轮；不删除历史状态或止血配置。

## 归属与接口

| 落点 | 职责 |
|---|---|
| 专家 kit/scripts/archkit/hook.py + kit/hooks/spec.json | 仅 SessionStart；遗留 Stop 静默 |
| 专家 kit/scripts/archkit/index.py | index 清单、blob 读取、staged diff 与配置视图 |
| 专家 kit/scripts/arch_scan.py + archkit/scan_cmd.py | 新 --staged 接口，复用现有检查与报告 |
| 专家 kit/scripts/arch_commit.py | pre-commit 薄入口，报告/故障均不阻断 |
| 分发器 scripts/git_hooks.py + distribute.py | manifest 声明 Git hook，预览/安装/回执/冲突保护 |
| 专家 instructions、技能、参考模板及项目说明 | 同步三入口行为及各宿主边界 |

依赖：入口 → 编排 → index/files/git IO 与既有检查；分发器不依赖业务/光学执行器来运行 hook。

## 任务与验证

- [x] 核对原开发日志、四宿主配置、两个目标仓库 Git hook 与既有改动；不覆盖用户 WIP。
- [x] 简化 SessionStart/Stop 与技能提示；验证所有 host 的 Stop 无 Git/扫描/状态调用，SessionStart 内容正确。
- [x] 实现 --staged 与提交入口；验证工作树与 index 不同、部分暂存、未暂存/未跟踪排除、删除、初次提交、暂存配置、路径空格、索引环境变量、纯检查无写入。
- [x] Git hook 分发：现有配置保留、Stop 片段移除、重复分发幂等、手工 hook/自定义 hooksPath 冲突保护。
- [x] 更新计划/文档/STATUS，kit 与分发单元测试、npm test、check_project；收尾人工架构审查。
- [x] 预览并分发两个登记项目，回读四宿主产物；隔离仓库实际 git commit 验证一次调用、报告不阻断、工作区不污染。
- [x] 核对现有 DSH 桥接是否支持配置热读取；先核对热加载；用户后续明确授权DSH重启且无任务，已通过官方项目启动器-Restart执行；模型服务不动。文件分发、宿主加载和真实会话效果分别报告。

## 验收边界

不调用真实模型、Zemax，不提交/推送用户仓库。临时测试仓库可以创建测试提交。Codex/Claude 新 SessionStart 的宿主信任/重新加载可能需要用户操作；不能以文件存在宣称已经重载。

## 验证结果与证据

- 原开发会话：819147d7-13ac-4a66-bef2-a53e1e9a7dc8；19轮概要与839行压缩原日志。原方案是SessionStart+Stop提醒，无Git hook；OpenCode仅专家/技能。
- npm test全部通过：插件138、PPT11、光学105、分发37、架构kit56，合计347项；工作台DOM冒烟、check_project通过。新增模块均归现有kit/分发器，无新第三方依赖。
- Git真实提交证据：temp/architecture-trigger/git-smoke-evidence.json；隔离仓库smoke-c5e408ab，暂存告警/工作树无告警仍正确报告，提交不阻断；--only临时index未混入另一个已暂存文件，未产生已审状态，未改用户index或提交用户仓库。
- DSH协议证据：temp/architecture-trigger/bridge-smoke-evidence.json。使用实际安装桥与部署后hook文件，Agent/shell服务受控；25次Stop零脚本/零steer，SessionStart一次执行/一次注入。不是实时模型对话验证。
- 本机分发：optDSH Codex/OpenCode/Claude/DSH、AgentTyvate Codex/OpenCode/Claude。只更新托管架构专家，备份/回执保留；两个仓库pre-commit已安装，--fleet --check通过。Claude权限与其他hook不受影响；历史state和off配置未删除。
- DSH运行：先尝试启停API，disable返回overridden，未当重载成功。增加显式10秒默认hook超时并按配置差异协调；用户随后授权重启，最终使用scripts/runtime/start-dsh.ps1 -Restart完成冷加载。
- 冷启动证据：temp/architecture-trigger/restart-evidence.json；DSH PID46292、HTTP200/认证Ready、optdsh-experts/架构桥/专家preset active，73会话可读、0运行；模型仍69432/1235，health ok，正式ID保留。没有模型请求、Zemax或云端调用。
- 人工架构自查由主Agent执行，非独立审查：入口→kit编排→Git/index IO→既有检查，hook不依赖扫描/状态，分发Git入口单独归git_hooks.py。扫描疑似凭据仍需人工判断，未为消除历史误报放宽规则。

## 使用与恢复

会话开始遵循开场规范；提交时Git自动报告暂存区检查。需要深入审查/整改时明文请求或调用arch-review。Git --no-verify可跳过pre-commit；扫描CLI --staged保留0/1/2退出语义，只有Git包装入口统一返回0。克隆/迁移后重新expert-distribute安装Git hook；已有用户hook、自定义hooksPath或项目外worktree路径需显式集成。

本轮未新开Codex/Claude/OpenCode真实模型会话，也未确认DSH首个模型请求包含规范。生成文件与DSH冷加载已核验；已有对话历史中的旧开场规则不会自动改写。保留分发备份供恢复，不恢复旧Stop自动续轮作为正常使用方式。
