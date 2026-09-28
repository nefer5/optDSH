# 表单随 Skill 分发与迁移

## 已实现的两条入口

旧 Skill 无 UI 信息：`create --config <skill>/config/example.yaml` 自动推断结构，原 Skill 无需改造。未知类型使用 JSON 回退，不猜物理语义。

增强 Skill：将表单描述放在 Skill 内，`create --config <skill>/config/example.yaml --form <skill>/ui/form.yaml`。显示标签、分组、单位、选项和规则由 form.yaml 携带；原值来自配置。表单与配置分开，未把课题参数写死在引擎中。这条显式加载入口已实现，不需要宿主修改网页代码。

迁移包可以采用：

```text
my-skill/
  SKILL.md
  config/example.yaml
  ui/form.yaml             # 可选，声明式 UI
  ui/widgets/              # 未来：特殊控件 JS/CSS
  scripts/                 # 本 Skill 原有业务脚本
```

现有引擎是独立 DSH 插件，运行环境需要 Node、声明的 YAML 依赖和 DSH 的认证/页面宿主。Skill 本身不带 node_modules；依赖按锁文件安装。不同位置调用 CLI 时传 `--root <目标项目>`，相对资源应由 Skill 所在目录解析，不能写死开发机盘符。请求实际数据存储于目标项目 data/forms，而不是写入只读安装的 Skill 包。

## 自定义渲染代码随包：可行，自动加载尚未实现

当前引擎已有受信任源码的 `registerWidget` 开发接口，但没有自动扫描、加载 Skill 中任意 JS/CSS 的机制。`ui/widgets/` 是未来设计位置，不能因目录存在就宣称控件已加载。

后续建议增加一个带版本的 UI 清单，声明所需表单协议、最低引擎版本、控件入口与离线资源；控件只通过稳定的数据读写/校验接口工作，不访问光学工作台内部 DOM、私有会话对象或任意文件。宿主负责注册及卸载，逐包隔离样式和错误，版本不兼容时明确提示并保留数据。是否采用 iframe 等隔离方式留给专门实现验证。

分发边界：通用引擎单独维护一份，Skill 携带自己的表单和专用控件；若需要完全离线迁移，可把引擎发布包和若干 Skill 一同打包。当前没有实施独立于 DSH 的桌面/浏览器运行器，也没有构建全局安装或插件市场。

本轮只验证 YAML 导入、显式表单元数据加载、结构化提交/导出，以及复制配置到另一项目根后的存储隔离；未宣称任意 Skill 的业务依赖可随 UI 自动迁移。
