# 安装阶段可选市场与推荐插件

2026-10-18；L2，用户要求发布包携带推荐列表并在安装时自动装好；沿用已确认插件可选、固定版本、独立Home、纯平台可用的边界。默认none保留原纯平台行为，不在未选择时额外安装社区插件。图形安装向导未实现，不新增UI设计。

## 落点与接口

| 文件 | 职责 |
|---|---|
| packaging/windows/install.ps1 | 新增-PluginPreset none/market/recommended；预览列出固定版本；主程序就绪后调用已有官方Profile安装脚本 |
| packaging/windows/install-profile-plugins.ps1 | 新增-ReceiptPath，记录逐包installed/failed/pending；失败不谎报成功，保留日志和已安装主程序 |
| scripts/maintenance/export-release.mjs、plugins.snapshot.json | 公共清单随包，发布清单绑定其SHA256及目标DSH版本；不复制个人Home/账号/原node_modules |
| tests/installation/release.test.mjs与推荐安装夹具 | none不变、market只选市场、recommended选原启用项、无效/篡改清单拒绝、失败回执与已装主程序保留 |
| docs/installation/README.md、STATUS/CHANGELOG | 说明CLI自动流程及图形向导待办，产品推进dev.3，不覆盖旧测试包 |

```mermaid
flowchart LR
 P[选择none market recommended] --> V[校验发布清单与插件清单哈希]
 V --> C[安装平台及产品pnpm]
 C --> S{是否选择社区插件}
 S -->|否| R[可启动纯平台]
 S -->|是| I[官方DSH Profile安装固定版本]
 I --> R
 I -->|失败| F[保留主程序和Home 回执标明未完成]
```

## 验收

- [x] A1 总安装器接通预设及哈希校验，Home及凭据不覆盖。
- [x] A2 安装脚本输出逐项回执，未安装/失败与实际加载分开。
- [x] A3 三档预览/篡改拒绝/单项失败等定向测试；Windows内置5.1可用。
- [ ] A4 本地提交与dev.3测试包，独立目录推荐安装并核对Profile注册/加载；不推送、不正式发布、不调用真实模型。

升级暂不替换用户Home，不自动启用旧disabled项；已安装用户额外插件不删除。推荐清单不是每次启动都重放，而是用户选择安装模式时执行一次。

A4落点补充：既有verify-installation.ps1透传-PluginPreset，并在选装时检查Profile插件active、市场pnpm及客户端资产，默认none保持原夹具不变。
