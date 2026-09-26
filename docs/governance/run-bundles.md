# 运行包规范

适用于本项目所有产生正式分析、评测或仿真交付的Skill和脚本。仅打印帮助、交互式预检与服务日志不强制创建run。公共实现为`src/optdsh_optics/run_bundle.py`，不依赖Zemax或DSH。

## 目录与命名

```text
runs/<workflow>/YYMMDD-NN/
  manifest.json        身份、时间、状态、来源、文件SHA-256
  config/input.yaml    原始输入配置，保留原格式（旧JSON输入为input.json）
  config/resolved.json 本次实际使用的完整参数
  config/runtime.json  必要运行环境字段（如适用，不含凭据）
  plan.json            工况计划（如适用）
  report.html          人读默认入口，离线可看
  result.json          机器读结果，失败也保留
  *.npz                大数组；按实际需要采用子目录
```

workflow使用tx、rx、baseline等短名。日期取分配时本地日期，序号至少两位、同一父目录递增，排他创建、不覆盖。开始只分配一次，所有阶段接收同一目录；不再嵌套时间戳或重复workflow。完整时间含时区，任务描述写manifest，不拼进目录。仓库相对路径按UTF-16计数，>180警告，>220拒绝，包含文件名。

当前无需照搬N02完整STUDYS层级；将来确有多个独立研究时，可以用`studies/<study>/runs/<workflow>/YYMMDD-NN/`，仍沿用同一公共分配器。

## 配置与证据

- 配置型Skill遵循[铁律OPT-14](project-rules.md#opt-14-skill配置范式)：优先YAML，Skill包内附带YAML样例。run保留输入原文和扩展名；规范化resolved快照可用JSON。Tx入口已支持YAML及旧JSON；run保留原始扩展名，实际参数统一保存为resolved.json。

- 先冻结配置，再执行；执行器消费run中resolved配置。后续修改项目config不改变旧run。
- 文件输入同时保存原始配置和已展开默认值/覆盖值的resolved配置；只有CLI参数的工具也保存完整解析参数。清晰区分业务配置与运行环境，不能只记录外部文件路径。
- 输入数据能随包携带时保存副本并核对哈希；商业模型/大型外部依赖可只保留身份、版本、哈希和获取条件，明确包不独立可复现。活动模型的dirty内存不等于磁盘版本。
- 凭据不随包复制。运行环境采用允许字段清单，记录凭据名称或位置，不保存值。run默认Git忽略，不等于允许存放秘密。
- 完整执行代码以提交版本或代码文件哈希记录；哈希用于识别，不代表已打包全部依赖。缺失信息写unknown，不用当前代码/配置补成历史事实。
- 成功、计划、失败、未完成、历史整理分开标记。失败时保留已冻结配置、已完成工况与错误。强制杀进程可能留下created/running，不能当成功。
- 完成时manifest列出包内文件大小和SHA-256（不递归哈希manifest自身）。完成后不覆盖；更改参数重跑创建新run，续跑仅在工作流明确支持时使用。

## 报告

默认`report.html`，UTF-8、离线、无CDN；桌面/窄屏可读。先给结果与限制，再给工况/图表、实际配置和原始证据链接。用户文字必须转义。JSON/CSV/NPZ保留为证据，Markdown只作索引或补充，不代替默认报告。

报告应能随整个run目录移动；内部引用相对路径。公共HTML模板可复用，专业图表由领域代码生成。图表必须标注单位/基准/统计口径，不能把计划展示成实测。

## 当前入口

- Tx：`python .agents/skills/optdsh-tx-tolerance/scripts/run_pilot.py config/tx-pilot.local.yaml`，默认产生plan包；`--execute`才实际运行。`--runs-root`可指定项目内父目录，程序分配短ID。
- 离线指标/对象清单：公共装调Skill的`baseline.py`，默认写`runs/baseline/`，输入副本随包。
- 历史Tx整理：`python scripts/import-tx-run.py artifacts/tx-tolerance/pilot-03`，校验复制到新run，保留旧证据；从旧result提取当时配置，不追迹、不冒充新执行。历史包缺失runtime/执行代码时保持未知。

## 参考N02的范围

已核对N02的AGENTS“Run路径铁律”、`docs/architecture/study-workflow-guide.md`、`src/auto_zemax/runtime/run_paths.py`及Study的`run_context.py`和HTML报告生成器。采用一次分配、短ID、配置随包、路径预算与离线HTML。未照搬旧报告脚本的“排序取最新目录”，入口必须显式绑定本次run；未修改N02，也未移植其自动保存活动模型或远端发布规则。
