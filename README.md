# optDSH

当前版本：**v0.1.1 · 功能预览**。[更新记录](CHANGELOG.md) · [版本规则](docs/governance/versioning.md)

面向光学建模、镜头设计与非序列布局的专家—Agent 协作工作台。

以 **官方 DeepSeek Harness Web + Standard 模式 + 可替换的非顶尖模型**为起点，通过独立光学服务、结构化场景和可交互面板，让专家与 Agent 看同一份模型状态，在可检查的小步骤中协作。GLM 是需求来源中的公司使用场景，不是项目绑定的模型。

## 当前状态

**本期01/02/03已接入：独立光学工作台与完整DSH共用会话，画板按需弹窗；Tabbit双页面及三轮GLM实测通过。** 打开方法与边界见[同会话工作台](docs/guides/shared-workbench.md)。3081提供只读光学数据，工作台页面由官方3080承载；下翻分析区延期。

**2026-09-26：方案04已实现为双视图四列工作台，支持45°画面旋转、全局方向标、多选对象嵌入草稿、28px单行列表和紧凑顶栏。06:21本轮宿主采集恢复成功，GLM多引用查询已实测；此前间歇性NotAuthorized原因仍待定位。近期模型测试固定glm-5.3-flash。**

DSH 0.1.5-rc.3及三家模型接入曾实测；近期只测GLM。桥接复用opt-assist连接，世界坐标来自GetMatrix；Three.js显示近似形状。官方Web独立会话画板已获用户实机确认，现新增项目optdsh-canvas Skill与Agent回画建议稿；真实GLM已调用新工具生成图形。新预览/应用/撤销的浏览器点击待验。像素理解、网页Zemax写入和完整6D公差优化尚未实现；独立Tx功能执行器已实测。

## 从这里开始

Tx已完成独立内存副本上的18工况功能测试（未补偿）；使用[Tx Skill](.agents/skills/optdsh-tx-tolerance/SKILL.md)与配置驱动入口，结果及分辨率限制见[当前进度](planning/STATUS.md)。网页产品仍只读，完整6D装调优化尚未实现。

| 入口 | 内容 |
|---|---|
| [文档导航](docs/README.md) | 按规范、架构、操作、工作流、调研和历史分类 |
| [项目铁律](docs/governance/project-rules.md) | 光学事实、权限、性能与YAML Skill配置 |
| [运行包规范](docs/governance/run-bundles.md) | 短ID、当次配置快照与离线HTML |
| [本地运行](docs/guides/local-runtime.md) | 启动、认证、状态与停止 |
| [Tx Skill](.agents/skills/optdsh-tx-tolerance/SKILL.md) | YAML配置、独立Tx功能测试 |
| [当前状态](planning/STATUS.md) | 已实测、待验证与下一步 |

## 第一个交付目标

> 在网页选择一个真实非序列对象，询问其参考坐标与姿态；Agent 通过只读工具查询，准确回答；独立运行区显示工具调用与模型版本。

后续才增加“提出修改 → 专家确认 → 执行 → 回读 → 分析 → 刷新布局”。

## 目录

```text
docs/                  长期设计、接口、开发说明与来源
.agents/skills/        项目级可复用工作流
planning/              当前状态、里程碑与验收计划
examples/              可公开的合成接口样例
config/                无凭据的配置样例与上游基线
scripts/               本项目维护和验证工具
src/optdsh_optics/     只读采集、快照规范化与确定性查询
web/optics/            Three.js近似几何查看器（独立于DSH）
tests/                光学契约与服务边界测试
artifacts/             本地运行结果（按需生成，Git 忽略）
```

后续按里程碑引入独立光学服务及 DSH 插件代码，不在初始化阶段复制上游或生成空应用。

## 本地检查

在项目根目录执行：

```powershell
python scripts/check_project.py
git diff --check
```

检查仅验证文档链接、JSON 可解析及样例中的引用一致性，不验证模型或 Zemax 功能。

官方 Web 启动：`./scripts/start-dsh.ps1 -OpenBrowser`。已运行时用 `./scripts/open-dsh.ps1` 打开认证入口。详见本地运行文档；本机凭据保存在Git忽略的独立运行目录，新机器需重新配置。

M2查看器：`./scripts/start-optics.ps1 -OpenBrowser`；已运行时 `./scripts/open-optics.ps1`。数据模式与目标模型由本机 config/optics.local.json 显式配置；不会自动打开或替换Zemax文件。
