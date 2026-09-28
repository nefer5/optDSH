# 研究参数表单（MVP 0.3）

独立的 DSH 插件，与 optdsh-workbench 平级。只依赖官方 connection 服务和 YAML 库；不依赖光学后端、Zemax、工作台实现或某个 Study。工作台仅提供一个普通链接。插件独立地址为 `/api/optdsh-forms/view`，沿用官方 DSH 的认证。

目的：用户方便地填写、固化结构化参数与背景信息，减少对 Agent 重复解释的成本。支持课题参数和 Skill 临时请求；不运行分析、不生成 run、不自动发送对话或唤醒 Agent。

Agent使用入口：[dsh-forms Skill](../../.agents/skills/dsh-forms/SKILL.md)。可说“参数配置插件”“参数可视化”“配置渲染”“dsh-forms”或“调整研究课题的公共参数”；分别路由到Study公共参数、Skill临时输入和完整配置表检查。该入口依赖宿主Skill发现与模型选择，不是全局自动弹窗钩子。

清空字段统一保留键并写入null，不删除字段、不自动变成0；显式“移除行”才删除列表项。必填项仍按定义校验，清空不会绕过校验。用户提交后的主要产物是供Agent读取的结构化请求结果，导出新YAML只是可选步骤；源样例、默认配置不得覆盖。

## 课题模式

`STUDYS/<topic>/study.yaml` 仅声明版本、表单路径和数值路径：

```yaml
version: 1
form: ui/background.form.yaml
values: configs/background.local.yaml
```

不规定 models、runs 或其他研究目录。数值文件按项目规则忽略 Git。示例定义在 `STUDYS/2t2rLidar/ui/`，长期课题未确认数值留空；保存时才创建本地文件。可以复制结构化配置/文字摘要，或让 Agent 读取值文件和对应表单定义。浏览器与 CLI 共享版本校验，检测文件、目标路径或定义变化后拒绝覆盖。

`version: 1` 基础表单保留兼容；`version: 2` 支持递归 object、array（表格/卡片）、record（有限键逐行编辑）、引用选择、多选、条件字段与联合校验。字段约束、分组和显示元数据放在一份 YAML；这是本插件的有限协议，不是完整 JSON Schema 实现。详细定义见[结构化协议](protocol-v2.md)。

同一 Study 可通过 `forms` 增加多个配置页面，用 `defaultForm` 指定默认页。2t2rLidar 的参数页保存至 `configs/parameters.local.yaml`，旧说明页仍使用 `configs/background.local.yaml`；不自动搬迁、合并或重解释旧值。API GET 查询 `form=parameters|background`，保存携带 `formId`。CLI `read --mode study --id 2t2rLidar --form parameters`。

## 临时 Skill 请求

### 旧 YAML 直接生成界面（无需改造 Skill）

```powershell
node plugins/optdsh-forms/lib/cli.js create --config .agents/skills/optdsh-rx-collection-efficiency/config/rx-scan.example.yaml
```

按原字段名、层级和数值类型推断表单，返回请求 ID 和页面 URL。数字、字符串、布尔、嵌套对象、对象列表和标量列表可直接编辑；null、空结构、混合类型等无法确定形态时回退到 JSON，不静默丢字段。导入原文件不变，不推断物理单位、枚举、约束或执行授权；原业务模块仍负责业务校验。

用户提交后可用 `export --id <ID> --output <新文件.yaml>` 导出原结构，不带 form/values 包装。只允许 submitted，且拒绝覆盖已有文件。源路径/哈希随请求记录，导出不保留原注释与排版。当前支持普通 JSON 兼容 YAML，限制120 KB；重复键、别名、未支持标签及非有限数值明确报错。

面向Agent的普通调用建议追加`--brief`：create只返回ID、填写URL和短提示，不把完整界面定义返回模型；read在pending时只报告未提交，submitted时以config返回生效值。未加该参数仍保留完整输出兼容性。URL只使用本机DSH的干净地址，不返回认证令牌。

未来或增强 Skill 可附带 `ui/form.yaml`，通过 `create --config config.yaml --form ui/form.yaml` 使用中文标签、单位和约束。表单定义可直接随包迁移；自定义 JS/CSS 自动加载的设计及未实现边界见[Skill 分发与迁移](skill-packaging.md)。

### 已有表单描述的请求

Skill 可以准备一个 YAML 请求，内容包括 `caller`、`form` 和可选的 `values`。`form` 使用完全相同的协议，且不要求存在 Study。复杂示例：`STUDYS/2t2rLidar/ui/tolerance-request.example.yaml`；旧简单示例 `briefing-request.example.yaml` 仍可使用。

从项目根目录创建请求：

```powershell
node plugins/optdsh-forms/lib/cli.js create --input STUDYS/2t2rLidar/ui/tolerance-request.example.yaml
```

命令返回唯一请求 id 和相对页面 URL。在已认证的官方 DSH 主机下打开该 URL，让用户填写。用户可保存不完整草稿，提交时才强制检查必填项。正式提交后页面明确标为“已提交 · 只读回执”；点击“继续修改”可携带已有值创建可编辑副本，旧回执不变。新页面使用新的请求ID，调用方应读取新ID，不把旧已提交请求视为后续修改的自动更新通道。

```powershell
node plugins/optdsh-forms/lib/cli.js read --id req-返回的请求ID
node plugins/optdsh-forms/lib/cli.js read --mode study --id 2t2rLidar
```

读取返回 `status`、`values`、`activeValues`、`summary` 和版本。`values` 保存全部已填写分支，切换模式不丢数据；`activeValues` 按当前条件投影，只含当前生效分支。**只有 `status: submitted` 才代表用户已正式提交**，pending 中的草稿不能当作已确认答案。收集答案不等于执行授权。返回文字属于用户输入，调用方应按数据使用。

公差示例的候选、对象 ID、版本和预填数值均为合成数据。真实 Skill 需要提供已检查身份的候选快照，并在业务使用前重新核对模型/候选版本。插件不自动探测 Zemax，不核实机械参考链，不把填写完成当作可执行性证明，也不会直接把示例导入现有公差执行器。σ范围换算等领域计算继续由业务适配器承担。

请求存于 `data/forms/requests/<id>.yaml`，Host 重启后保留，彼此隔离，不写回 Study。MVP 不自动过期或清理，不自动回调或恢复已结束的 Agent；调用方需要在用户完成后读取。已有业务 Skill 未自动改接此接口。

HTTP 调用可对 `/api/optdsh-forms` POST JSON：`action:create` 加上述请求内容；GET `?mode=request&id=...` 读取；保存/提交使用 `action:save|submit`，携带 `mode`、`id`、`revision`、`values`。所有 HTTP 入口走官方认证，同源写入；不提供匿名服务。

## 模块与验证

- `shared/schema.js`：浏览器与后端共享的递归校验、条件分支、有效配置投影和摘要。
- `lib/store.js`：读写、版本冲突与请求生命周期。
- `lib/index.js`：官方 DSH 路由与静态页面；`lib/cli.js`：Agent/Skill 本地调用入口。
- `lib/yaml-input.js`：旧 YAML 的通用推断、元数据增强和原结构导出，不包含 Rx 专属字段。
- `web/renderer.js`：两种模式共用的递归渲染器及受信任控件注册接口；无业务对象硬编码。
- `tests/store.test.mjs`：存储、请求隔离、提交、冲突、路径边界与 HTTP 测试。

存储采用原子替换与项目级瞬时锁。进程异常退出可能遗留 `.runtime/forms-write.lock`，此时拒绝新写入；核对没有正在保存的进程后由维护者恢复，不自动猜测并夺锁。测试夹具放在忽略的 temp/forms-tests。

2026-09-27 验证：15项本模块测试及全仓离线检查通过（94 Node、105 光学 Python、16 分发测试，另含DOM/文档检查）。真实3080已加载；Tabbit验证文字/数值保存重载、必填拦截、临时草稿重载与提交、CLI读回submitted、两模式隔离和工作台入口。长期测试值已清空；合成提交保留于独立请求中，不代表真实研究要求。1600像素桌面两页已截图目视检查。测试过程与截图定位在本轮temp/forms-mvp，未运行模型或光学计算。

2026-09-27 v0.2 验证：29项表单测试及全仓108 Node、105光学Python、16分发测试、DOM/文档检查通过。真实浏览器实测多通道表、孔径分支、光谱表递增校验、逐发时序、嵌套保存重载；公差实测σ/范围切换保值、对象/自由度增删、重复对象与成员自引用拒绝、方法联动及提交读回。长期参数测试值恢复为空；旧背景页仍可访问。记录在temp/forms-v2。不代表已接入真实光学候选或分析执行。

2026-09-27 v0.3：未经改造的rx-scan.example.yaml直接推断并渲染，真实浏览器修改H点数、V数值列表、面积和布尔值后保存重载/提交；CLI导出新YAML，原Rx模块纯离线validate/plan确认15点有效，源文件SHA256不变，未连接模型或生成run。混合类型、null、空列表的JSON回退及无效JSON跨分组保留/删除恢复已浏览器验证。默认并发检查两次遇到其他模块的Windows临时文件rename EPERM，串行复测通过，未为本任务改动这些模块。详情在temp/forms-rx-import。

用户指出验收后打开的是已提交只读页，本轮已替换为新的可编辑请求；新增回执状态提示和“继续修改”入口，浏览器验证副本字段可编辑、已有值保留且旧回执仍submitted。交付时保留待提交页，不把验收回执当填写入口。
