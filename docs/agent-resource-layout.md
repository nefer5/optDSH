# Agent资源与官方装配

2026-10-19；dev.21实现范围。决定入口为[Q8](decisions.md)，默认路径与发现表见[架构说明](architecture.md)。

## 当前目录与职责

| 位置 | 归属与加载 |
|---|---|
| 源码`.agents/skills`、`development-skills` | 开发平台的协作入口，不是产品运行资源全集 |
| `packages/optics/skills` | 光学Skill实体源；`optdsh-optics-skills`是声明文件白名单的本地npm资源包 |
| `packages/ppt-slidewise/skills` | PPT Skill与可执行CLI同包，路径从安装位置解析 |
| `plugins/optdsh-agent-canvas/skills`、Forms包`skills` | 插件产品技能，按插件启停，注册到官方Skills服务 |
| `plugins/optdsh-experts/resources` | 固定版本公共专家文本/脚本快照及白名单/哈希，不包含私人偏好或图片 |
| `plugins/optdsh-experts/cordis.patch.yml` | 官方Preset与官方派工工具的声明，连同资源适配由一个官方Profile组管理 |
| 用户`~/.agents`与课题`.agents` | 用户自己的规则、技能和定制，默认不改写、不复制到发布物 |

## 官方能力与自建部分

官方DSH提供Skills发现/注册、Agent Preset注册与组合、spawn子Agent、消息/结果通知/取消和恢复。Preset注册表不扫描`.agents/experts`或`dsh-presets`，AGENTS只作为规则文本。

optDSH保留公共专家内容、构建期白名单快照与宿主声明、`expert_resource`参考资料适配。已去掉产品运行时的专家目录扫描、自建同步派工和源码cwd限制。两位专家工具名保留，但由官方派工插件实现；模型路线与权限由官方机制继承，不额外切模型或扩大权限。

## 发布与开发一致性

开发运行按已声明的工作区包解析产品Skill位置；安装运行按独立程序依赖解析。Bundle挂载官方文件系统Provider，将资源标为bundled（rank 600），保留用户/课题技能的官方覆盖顺序。不存在自建磁盘全盘扫描器，也不把开发技能暴露到所有产品会话。

源码专家唯一中心继续通过开发链接维护；发布基线由`plugins/optdsh-experts/scripts/build-resources.py`白名单导出，固定版本随Git与安装包。构建不读取私人偏好/截图，不修改中心源。固定Standard组合随DSH升级重新生成，避免把过时组合当成自动继承。

## 仍为后续计划

可选共享到用户.agents、按不同宿主生成角色/Hook、安装哈希回执及用户修改冲突处理尚未完整产品化。默认包内能力不依赖这一步。真实全局共享写入需要单独授权，不把产品光学规则注入用户全局AGENTS。

本轮验证与局限见[dev.21验证](verification/product-resources-dev21.md)。安装后的发现、工具可用和真实调用分别记录，不以打包成功代替运行验收。
