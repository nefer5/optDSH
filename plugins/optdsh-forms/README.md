# optDSH YAML参数编辑器（0.4）

Forms随optDSH交付，作为官方Profile管理的可选内部模块。Agent通过`forms_open_yaml`发起，完整配置在官方Web右侧栏显示，左侧保留对话；不需要常驻顶栏按钮或额外MCP服务。固定引擎渲染，模型不临时编写HTML。

支持完整YAML、键值/数组结构编辑、注释展示、原文编辑和JSON Pointer字段高亮。特殊标签、别名等保留原文，不猜测物理含义。单文件512KB、最多12000节点、深度100；超过范围明确报错。YAML语法校验与业务校验分开。

| 用途 | 保存位置 | 提交后 |
|---|---|---|
| maintenance，维护明确指定原文件 | 原路径，哈希冲突保护及一份基线备份 | 回投当前会话；不自动执行分析 |
| run，准备本次运行 | 当前workspace/runs/工作流/YYMMDD-NN/config/input.yaml | 冻结输入；执行器领取同一个Run |

同会话/来源/用途复用文档和Run草稿；普通改值、高亮、保存、重开不增加文件数量。草稿JSON原位更新，维护基线备份每文档一份，提交保留一次不可变审计快照。重复提交不增加快照或再次投递；交付不确定时显示诊断，避免自动重发。冻结后“继续修改”派生一个子草稿，重复请求复用该子草稿；明确新任务才新建。历史Run不覆盖。

原生工具为`forms_open_yaml`、`forms_focus`、`forms_read`，随包Skill在Profile启用时注册。工具绑定真实Agent及官方session.cwd，HTTP只能操作本会话已有文档，不能指定任意来源路径。关闭/卸载撤销工具、引导与界面；启动器不恢复用户关闭的Forms。

提交沿官方sessionController队列送回同一会话。提交确认参数，既有任务的执行授权仍由原业务Skill判断。Rx执行器校验prepared Run的工作流、workspace、输入哈希及单次领取，不连接Zemax即可验证离线计划。

当前新接口为`/api/optdsh-forms/yaml`与`/api/optdsh-forms/yaml/view`，供原生侧栏使用。字段高亮和UI元数据不写入业务YAML。详见[前端说明](web/YAML-EDITOR.md)。

## 旧Study/CLI兼容接口

以下0.3接口保留原行为，用于已有Study/非DSH宿主。它们不具有新原生工具/侧栏/自动回投能力，不作为新DSH会话的推荐入口。
## 课题模式

将任意外部课题目录作为 `workspaceRoot`，其根 `study.yaml` 可声明版本、表单路径和数值路径：

```yaml
version: 1
form: ui/background.form.yaml
values: configs/background.local.yaml
```

不规定 models、runs 或其他研究目录。数值文件按项目规则忽略 Git。合成表单示例定义在包内 `examples/`，长期课题未确认数值留空；保存时才创建本地文件。可以复制结构化配置/文字摘要，或让 Agent 读取值文件和对应表单定义。浏览器与 CLI 共享版本校验，检测文件、目标路径或定义变化后拒绝覆盖。

`version: 1` 基础表单保留兼容；`version: 2` 支持递归 object、array（表格/卡片）、record（有限键逐行编辑）、引用选择、多选、条件字段与联合校验。字段约束、分组和显示元数据放在一份 YAML；这是本插件的有限协议，不是完整 JSON Schema 实现。详细定义见[结构化协议](protocol-v2.md)。

根 manifest 可选 `id`（ASCII 标识）；省略时 API/CLI 使用固定 `workspace`，不会从中文或空格目录名推断 id。无 study.yaml 的普通目录仍可创建/保存/提交临时请求，无需补建课题入口或 STUDYS。

旧父目录中的 `STUDYS/<id>/study.yaml` 仅作只读兼容，保存返回明确错误，不创建或迁移该目录。显式将某个旧课题目录自身指定为 workspaceRoot 后，其根 study.yaml 按正常独立课题处理。

同一 Study 可通过 `forms` 增加多个配置页面，用 `defaultForm` 指定默认页。例如参数页可保存至 `configs/parameters.local.yaml`，旧说明页仍使用 `configs/background.local.yaml`；实际文件由课题声明，不自动搬迁、合并或重解释旧值。API GET 查询 `form=parameters|background`，保存携带 `formId`。CLI `read --root "E:/任意 课题目录" --mode study --id workspace --form parameters`。

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

Skill 可以准备一个 YAML 请求，内容包括 `caller`、`form` 和可选的 `values`。`form` 使用完全相同的协议，且不要求存在 Study。复杂示例：`examples/tolerance-request.example.yaml`；旧简单示例 `briefing-request.example.yaml` 仍可使用。

从项目根目录创建请求：

```powershell
node plugins/optdsh-forms/lib/cli.js create --input plugins/optdsh-forms/examples/tolerance-request.example.yaml
```

命令返回唯一请求 id 和相对页面 URL。在已认证的官方 DSH 主机下打开该 URL，让用户填写。用户可保存不完整草稿，提交时才强制检查必填项。正式提交后页面明确标为“已提交 · 只读回执”；点击“继续修改”可携带已有值创建可编辑副本，旧回执不变。新页面使用新的请求ID，调用方应读取新ID，不把旧已提交请求视为后续修改的自动更新通道。

```powershell
node plugins/optdsh-forms/lib/cli.js read --id req-返回的请求ID
node plugins/optdsh-forms/lib/cli.js read --root "E:/任意 课题目录" --mode study --id workspace
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

## 安装目录与工作目录

插件资源从包内 lib/web/shared 加载。`workspaceRoot`（兼容 projectRoot）指定 Study、临时请求与锁的项目根，不依赖安装 checkout。CLI `--root` 可明确覆盖；省略时使用当前工作目录。Forms 可独立于工作台装配，禁用不影响官方聊天。Node.js 24+；包仍 private=true，公开发布和许可证待单独处理。

## 独立装配

包内 `dsh.bundle.patch` 指向 cordis.patch.yml。可先 `npm pack` 生成本地 tgz，再通过 DSH 官方插件/Bundle 安装入口选择该文件；启用前在 Profile overlay 注入上述 workspaceRoot/stateRoot（画板还可注入 editorUrl）。不把 checkout 路径写进包，外部运行依赖由用户准备。独立安装后的官方宿主加载仍需验收，不能把 tarball 校验当作端到端成功。

### 全新官方Profile的Cordis前置条件

通过官方 `dsh plugin --profile web add <本插件tgz>` 独立安装时，先在同一DSH_HOME/Profile执行 `dsh plugin --profile web add @deepseek-ai/cordis@4.0.5 --config.auto-install-peers=false`，再安装本插件。宿主范围是DSH 0.2.1-rc.2/Cordis ~4.0.5，不继承旧版豁免。已实测全新Profile仅装工作台会因传递包缺Cordis被预检禁用，补齐后加载通过；不要编辑node_modules解决。产品app安装器已提供宿主依赖，和Profile独立安装是不同路径。

## 本轮适用范围

workspaceRoot 是调用所在课题目录，不是 optDSH 平台根。当前 HTTP Forms 实例仍绑定装配配置中的单一 workspaceRoot；本轮没有实现随不同官方 session.cwd 自动切换表单目录，也没有新增 workspace 注册服务。需要另一课题时显式配置该根或通过 CLI --root 访问；不能宣称同时打开多个会话就已实现动态 Forms 隔离。CLI 分别指向两个外部中文/空格目录的存取和冲突保护已有离线测试。

examples/ 只有合成表单协议例子与带 REPLACE 占位符的 Rx 导入例子，不是真实课题资料，不含模型文件或真实模型路径；表单示例不证明业务执行器兼容，不授权运行光学分析。平台源码与发布不需要根 STUDYS。
