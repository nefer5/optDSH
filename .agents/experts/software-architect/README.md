# 软件架构专家 · 0.2.0

一个可复用的软件架构设计、变更方案与审查专家，覆盖 Python、TypeScript/JavaScript，兼顾 C++。它把“要模块化、别硬编码”落成文件落点、接口、项目约束文件和自动检查；按任务分级决定流程轻重，简单任务不走复杂流程。

## 源与维护

本目录是唯一源。`agent.json` 定义身份与版本，`instructions.md` 定义角色行为，`library/` 存放参考资料，`kit/` 存放就近维护的脚本、技能、hook 规格和配置样例，`resources.json` 是分发白名单。四宿主生成文件不手改，修改源后重新分发。

| 任务 | 建议输入 | 交付 |
|---|---|---|
| 设计（L2） | 目标、规模与寿命、语言/运行环境、允许范围 | 分段设计 → 计划文件 → 骨架 |
| 变更方案（L1/L2） | 需求、相关模块、允许范围 | 文件落点表、依赖影响、取舍、验证 |
| 体检（只读） | 项目根、关注范围或本次改动 | 位置 → 证据 → 影响 → 改法 → 优先级 |
| 约束落地 | 体检结论或用户规则 | ARCHITECTURE.md、`.agents/architecture.toml`、检查接入 |

## 目录

```
software-architect/
  agent.json  instructions.md  README.md  resources.json  preferences.example.md
  library/   参考：START、原则与分档、模式、反模式、语言清单、工具、模板、few-shot
  kit/
    scripts/arch_scan.py      确定性扫描器（标准库，Python ≥3.11）
    scripts/arch_hook.py      宿主 hook 适配（Codex / Claude Code / DSH 桥接共用）
    scripts/archkit/          扫描与 hook 的实现模块
    config/architecture.example.toml  项目约束样例
    skills/arch-plan/         分级“先设计后计划”技能
    skills/arch-review/       手动/被提醒时的架构审查技能
    hooks/spec.json           宿主无关的 hook 规格，由分发器渲染为各宿主格式
    tests/                    kit 单元测试（不分发）
```

## 三个触发入口

| 时机 | 行为 | 宿主 |
|---|---|---|
| 会话开始/恢复 | SessionStart仅注入简短架构规范，不读Git、不扫描、不记录状态 | Codex / Claude Code / DSH；OpenCode沿用项目AGENTS与专家/技能 |
| Git提交前 | 仓库pre-commit检查真实index一次，包含暂存配置和依赖视图；只报告、不阻断 | 四宿主与普通终端共用同一个Git hook |
| 用户明文要求 | arch-review进行审查/整改；架构规划用arch-plan | 四宿主技能及software-architect专家 |

不注册Stop handler，不在普通对话结束扫描或自动续轮。遗留/宿主缓存的`--event stop`也直接静默，完全不读payload、Git或状态。

分发时自动预览/安装仓库本地`.git/hooks/pre-commit`，回执、备份与冲突保护复用分发器；不会改全局core.hooksPath，也不会覆盖用户hook。非Git目录仅导出专家包；已有hook、自定义hooksPath或hook目录在项目外的worktree需显式集成。普通clone后重新分发即可安装，支持路径空格。

手工证据：`python .agents/resources/software-architect/kit/scripts/arch_scan.py --staged`（只读index，退出码0/1/2仍表示检查结果）；Git入口`arch_commit.py`统一返回0，并将超时/错误明确报为检查未完成。支持部分暂存、初次提交、删除与Git提供的临时GIT_INDEX_FILE，不checkout、不产生状态文件、不调用模型。Git pre-commit可被`--no-verify`跳过。

arch-review优先复用提交检查结果；需要深入时按需取证/委派，不要求--record。旧--record和[review]字段仍可解析，仅兼容历史手工审计，不能恢复Stop。

## 个性化与产品规则

[偏好模板](preferences.example.md)可公开；`preferences.md` 是本机个人记录，不公开分发。目标项目规则与本次指示优先。

## 验证边界

文件分发、宿主发现/加载、hook 实际触发与专家审查质量分别验证，不以文件哈希一致代替宿主加载。
