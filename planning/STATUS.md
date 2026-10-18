# 当前状态

2026-10-19；产品 **0.2.0-dev.26**，开发分支`codex/platform-dev`。Forms原生YAML重构阶段已实现；完整产品仍有待验事项。

本轮目录与Skills收尾：日常源码Home迁入E:/.optdsh-source（3380），validation只保留安装验证。当前人工核验dev.25在validation/当前核验/dev.25（3080），已应用明确记录的Skills组件维护；原dev.25 ZIP不变，新安装逻辑以dev.26发行。源码.dsh/skills、开发Home/skills及安装Home/skills都有5个受管入口，三种会话的官方catalog和正文读取通过。251个根unit与源码Forms/STUDYS夹具已归档回收，后续测试按批次退出；28个旧case归历史记录。详见[路径及验证回执](../docs/verification/source-home-skills-20261019.md)。

追加完成：路径选择卸载（课题永久排除）与安装端口自动避让/记录；真实测试程序已回收，6项数据哈希不变。最终dev.25用户包已从顶层EXE完成源码外安装、启动和随包卸载日志验证，保留供人工核验。见[交付回执](../docs/verification/dev25-user-release.md)。

旧验证安装已按用户授权收尾：17份旧程序及可重建依赖可恢复回收，保留Home/课题/结果/回执，验证区只留一份dev.25；3382份保留文件哈希不变。新增test:quick实测12.47秒通过，完整安装/回归门禁保留。见[清理与提速记录](../docs/verification/old-install-cleanup-20261019.md)。

本轮已实现：产品Skills归所属包并接入官方Provider；Experts0.2使用官方Preset与spawn派工，保留公共资源适配，官方Profile管理整组生命周期；新增中文图形安装向导与独立安装入口。源码外study、空共享根下真实GLM会话已读取Rx Skill、派工架构专家、读取公共资源并收到官方完成通知；停用Experts并重启后Preset消失且core ready。原型真实安装及视觉专家审查通过，完整离线回归通过。最终dev.25用户包的实际安装、5组件ready及卸载EXE已另行复验。见[本轮验证](../docs/verification/product-resources-dev21.md)。

新增共享编辑器：AgentCanvas0.2.4与Canvas桥0.7.0复用完整右栏，DSH日常接入全局同一安装（CLI/编辑器/嵌入一致）；课题与提交仍归官方会话，不混入独立收件箱。原程序、连接及409份资料已备份，切换后首次打开前哈希全一致。187项编辑器界面、181项服务、76项DSH相关检查通过，真实合成会话的发送/去重/历史只读/建议应用已验。详见[统一画板验证](../docs/verification/canvas-shared-editor-20261018.md)。

当前修复：日常Profile组合曾因Canvas桥自带第二份dsh-tools使官方工具报prepare未定义，已升级Canvas0.6.2为宿主peer。原失败会话内glob/grep/read/forms_open_yaml及真实右侧栏已恢复；113项相关回归通过。Forms-only隔离成功不能代表插件组合已验，后续组合测试包含官方普通工具调用。

本轮新增：Forms0.4通用YAML引擎、完整配置/注释/字段高亮、原生右侧栏、工具及随包Skill发现，提交自动回当前官方会话；维护原文件和本次Run分别保存。重复编辑/保存/重开复用文档与Run；重复提交不增加快照/回投，重复派生复用子草稿。光学0.4.1执行器领取同一个prepared Run并检查输入哈希。

隔离官方Host内，空共享技能目录、全新会话的GLM-5.3-Flash已实际调用原生工具；Rx完整61项、右侧栏、修改/重复保存、冻结及同会话回投通过。Rx离线计划沿用Forms的261018-01，未新建Run；未连接Zemax。Forms官方Web停用后路由404/core ready；卸载并重新启动后仍not-installed，用户数据保留。详细回执见[Forms验证](../docs/verification/forms-native-20261018.md)。

领域边界收尾：课题正文已在外部workspace，现已回收平台残留的三个旧导航占位文件。外部原术语、角度及说明快照的SHA256均与迁入回执一致；平台不再保留课题专属docs目录。历史dev.17包保持不变，本轮另建dev.18本地测试包。

| 能力 | 已实现/验证 | 实际限制 |
|---|---|---|
| 独立平台 | 官方DSH 0.2.1-rc.2、Node>=24、独立Home、任意外部workspace、CMD/薄EXE、版本及构建身份 | 薄EXE与本地浏览器图形向导已实际安装dev.25；新机仍待验 |
| 插件装配 | 画板桥、工作台、Forms与Experts官方Profile安装/启停/升级/卸载；重启不复活；坏插件不拖垮core | Experts也已收敛；信息策略等剩余装配继续维护 |
| 画板接入 | 独立编辑器已有/全新本地包路径；iframe握手、外部课题保存回读和重启保持已验 | 已实测合成会话产品Agent提交/建议；跨宿主通用文档协议仍未统一 |
| 光学工作台 | 统一连接窗口、自动检测Python、两类版本、红字错误、Web启停/日志 | 当前服务就绪不等于模型连接 |
| 静默后台 | 工作台0.13.4；真实Web启动/状态/日志与Windows无控制台通过，模型文件哈希不变 | 本轮无探测/绑定/保存/追迹；当时无运行中的OpticStudio进程 |
| 双版本 | 正式optics0.4.1（连接沿用0.4.0已验实现）；19与2025 Web只读探测/绑定92对象、文件哈希保护已验 | 18及其他年份未测；旧版写入、追迹和公司数值一致性待验 |
| 交付 | 推荐插件快照重放、完整依赖独立安装/synthetic、构建SHA、历史dev.16测试包 | Sandbox/持久VM/公司实机暂缓；无正式发布 |
| 文档 | 四张当前Archify图、目录、优先级及181项历史ZIP/逐文件哈希 | 图依据固定源码，不能替代部署和研究验收 |

最近运行代码回归：82项工作台；完整npm test（187项插件、124项安装、11项PPT、142项光学、37项分发、56项架构kit）及模拟DOM/文档检查通过。此为离线和所列现场范围，不包含真实研究业务。

本轮dev.17打包、图形与归档检查结果见[交付回执](../docs/verification/dev17-docs-release.json)。[静默服务回执](../docs/verification/refactor-20261018/workbench-silent-service.json)和[双版本组件说明](../docs/verification/zemax-connection.md)保留原验证范围。

下一步推荐：人工核验dev.25安装与产品资源，再完善升级恢复和可选共享导出；完整优先级、可独立推进/需用户配合见[ROADMAP](ROADMAP.md)。本轮本地提交；远程推送、合主分支、正式Release或公开npm按后续决定。

开发预览已显式安装Forms0.4.0，core/画板/工作台/Forms实际ready；保持原模型、插件与用户课题资料。手工验证可从原启动DSH.cmd进入当前会话，对Agent说‘打开Rx默认YAML，仅编辑参数，不连接Zemax’。
