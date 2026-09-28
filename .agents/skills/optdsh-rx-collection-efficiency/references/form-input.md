# 用表单收集 Rx 扫描配置

通用插件位置、Study公共参数契约或“完整检查Skill配置表”的请求，转读[dsh-forms入口](../../dsh-forms/SKILL.md)；当前页保留Rx快速创建/读取流程。

用户不想手改 YAML 时，从项目根运行：

```powershell
node plugins/optdsh-forms/lib/cli.js create --config .agents/skills/optdsh-rx-collection-efficiency/config/rx-scan.example.yaml --brief
```

也可将 `--config` 指向已有本地配置。命令直接按 YAML 的层级和值类型生成一次性表单，不要求 Skill 原先存在 UI 定义。`--brief`返回ID、DSH填写URL和短回执，原值已载入页面，不是空白表单。将链接交给用户即可；当前官方DSH主机存在时URL为不含令牌的绝对地址，主机信息缺失时返回相对地址。不打开模型、不追迹、不生成run。

用户提交后主要由Agent读取处理，不需要先导出文件：

```powershell
node plugins/optdsh-forms/lib/cli.js read --id req-实际ID --brief
# 仅后续工具需要文件或用户要求时才导出：
node plugins/optdsh-forms/lib/cli.js export --id req-实际ID --output STUDYS/2t2rLidar/configs/rx-scan.form.local.yaml
```

`ready:false`时不返回未确认草稿，说明用户尚未提交后结束，不循环查询。`ready:true`时config即生效配置，清空字段保留null。仅接受`status: submitted`为正式提交；导出目标必须是新文件，绝不覆盖原样例或已有配置。原始controls、pickups、source、detectors等结构保留，占位身份和合成值也保留，不自动变成真实值。

自动生成只验证原始数据类型，不推断单位、枚举或跨字段关系；不会从旧配置猜测 range/deltas 切换规则。需要切换结构或增加字段时，由 Agent 修改配置副本后重新创建请求，或以后提供随 Skill 分发的 `ui/form.yaml` 并显式传 `--form`。目前未给本 Skill 增加定制表单，以验证旧配置零改造接入。

**填写提交只是参数收集，不是专家审阅或执行授权。** 导出后继续按原 Skill 做离线配置校验；真实工作仍须 inspect、核对模型身份/角度约定、只读预检和对应确认。示例的 REPLACE_* 不能用于真实连接。自动 UI 不替代 `rx_scan.validate()` 的角色去重、点数、列号、角度系数及其他业务校验。

迁移时可将 Skill 与独立引擎一起安装到新环境，CLI 的 `--root <目标项目>` 明确请求存储位置。未来随包 UI 的布局与当前能力边界见[引擎分发说明](../../../../plugins/optdsh-forms/skill-packaging.md)。
