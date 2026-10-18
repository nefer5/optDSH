# 当前架构与目录

当前产品开发版 **0.2.0-dev.17**；官方DSH固定 **0.2.1-rc.2**。运行源码基线为5d6920e，本轮只整理文档、交付入口和版本。交互图见[当前架构页面](architecture/index.html)，剩余工作见[优先级](../planning/ROADMAP.md)。

## 图怎么看

- 运行关系：用户、官方Agent会话、插件、独立编辑器、光学服务和Zemax如何协作，接近C4容器/组件关注视角。
- 源码包边界：这些职责由scripts、packages、plugins承担，属于代码组织映射；目录树不等于完整C4代码视图。
- 安装与数据：程序、共享Home、任意课题和StateRoot分别放什么，属于部署与数据归属视角。

三张图都描述当前实现；未来建议只在[路线图](../planning/ROADMAP.md)中列出，不画成已运行的能力。图源、源码范围和自动校验回执随图保留。

## 模块与边界

| 模块 | 实际职责 | 当前边界 |
|---|---|---|
| 官方DSH | Web、Standard循环、会话、模型、认证及Profile | 唯一会话事实源，不修改node_modules |
| packages/optdsh-bundle | 组装、版本、能力状态、启动配置 | 不恢复用户停用/卸载的画板桥或工作台 |
| plugins/optdsh-agent-canvas | 会话画板工具、提交/建议、BoardStore与编辑器桥接 | 官方Profile生命周期；通用文档权威仍在桥内，尚未完全独立 |
| 独立AgentCanvas | 独立安装的编辑器与宿主无关入口 | 已有安装/全新本地包接入，不依赖N05源码 |
| plugins/optdsh-workbench | 模型视图、同会话聊天、光学代理和服务管理 | 官方Profile生命周期；缺服务不影响基础平台 |
| packages/optics | 可安装CLI/HTTP/MCP、版本连接、身份/实例锁与确定性分析 | legacy/modern复用组件；19和2025只读已验，其他版本及业务另验 |
| Forms/Experts/信息策略/PPT | 可选表单、专家资源与公共工具 | 包已拆分，其他自有插件的Profile全生命周期尚需收敛 |

## 开发源码组织

```text
optDSH源码/
├── plugins/                    # 工作台、画板桥、表单、专家等源码
├── packages/                   # Bundle、光学公共包、PPT模块
├── scripts/runtime/            # 开发CMD与安装版共用的生命周期实现
├── scripts/maintenance/        # 版本、打包、检查、文档构建
├── packaging/windows/          # 安装、选装、校验和迁移工具
├── tests/                      # 跨包安装测试；真实业务默认不执行
├── config/                     # 可分发示例，私人配置忽略Git
├── .agents/skills/             # 包内公共产品技能
├── planning/                   # 当前状态、优先级和里程碑
└── docs/                       # 现行说明、架构图、验证及历史归档
```

源码不建立STUDYS；具体课题背景、专用Skill、模型、配置和完整run归任意外部workspace。

## 安装与持久数据

```text
<InstallRoot>/                 # 版本化程序：官方DSH、Bundle、运行脚本
<独立Home>/                    # 所有课题共用，路径可配置
  profiles/web/                # 官方Profile的包、bundle选择和用户patch
  config/                      # canvas.json、程序管理的optics.json
  state/web/                   # 默认StateRoot，也可显式另选
    data/                      # 绑定、快照、恢复与回执
    logs/                      # Web可读的光学启动日志等
    .runtime/                  # PID、令牌、锁；不随包
<独立AgentCanvas安装区>/       # 编辑器程序，与桥分开升级
<任意课题>/                   # 无须放在平台旁边
  .agent-canvas/optdsh/boards/  # 当前DSH会话画板
  .agents/                     # 可选的课题专用能力
  configs/ models/ runs/       # 由具体课题约定，不是平台强制模板
```

Home与用户级/课题级.agents职责不同。公共能力随包保留，可选分享及冲突预览方案已确认，自动分享尚未实现，不改本机全局.agents。

## 生命周期与验证

画板桥/工作台通过官方Profile安装、启停、升级和卸载；源码改动要显式打包升级安装副本。光学后台由Web显式启动，Windows使用同环境pythonw静默运行，状态和脱敏日志在高级诊断；打开/轮询不连接Zemax，保存独立授权。

[Profile操作](profile-plugins.md) · [安装与数据](installation/README.md) · [实测摘要](../planning/STATUS.md) · [已确认决定](decisions.md) · [历史归档](archive/README.md)
