# 版本、构建与本地测试包

产品当前开发线为0.2.0-dev.1；官方DSH依赖版本与独立组件版本分别管理，不机械同号。阶段顺序通常为dev.N、beta.N、rc.N、正式版；只有确认交付的测试包才递增预发布号，日常修改由Git提交及dirty状态追踪。当前仅授权本地提交和测试包，不推送、不正式发布。

## 命令

```powershell
npm run version:show
npm run version:check
npm run version:set -- 0.2.0-dev.2
npm run version:set -- 0.2.0-dev.2 --apply
node scripts/maintenance/version.mjs component optdsh-bundle 0.2.0-dev.2 --apply
npm run release:check
npm run release:local -- <全新输出目录> <可选光学wheel>
```

set默认只预览；加--apply才写入，并在本仓忽略的.backup/version-set保留原件。产品升版同步根package.json、锁文件根条目、README和CHANGELOG；组件升版同步组件package及锁条目。自动生成的变更记录占位需要人工补充，构建门禁会拒绝未完成的版本说明。

## 发布检查及追踪

本地测试包要求版本元数据一致、版本说明完整、Git工作树干净且有提交；已有同名v标签或本机版本预留/构建记录时拒绝重复版本。先提交源代码，再构建。本机只写.runtime/release-versions，不创建远程发布、不推送；Git标签须在验证成功后由明确的本地流程标记，不移动历史标签。

发布清单含产品版本、构建ID、完整Git提交、精确DSH版本、组件版本与SHA256。build-info.json为不可变构建身份，安装器校验其哈希并保留；installation-receipt记录产品版本/构建ID/源提交。失败构建若已预留版本，不直接覆盖记录；先查明失败并保留证据，再明确处理，或推进下一开发版本。

## 查看正在运行的版本

- 源码：npm run version:show。
- 安装版：在终端运行optdsh.exe version、optdsh.cmd version或--version。
- 已认证Web：打开/api/optdsh-version，返回本次Host启动时的产品版本、渠道、源码提交/dirty状态和实际Node版本，不返回模型配置或凭据。

源码查询反映当前工作区，运行API反映启动时快照；改源码后用重启DSH.cmd。独立安装版不调用开发仓库的Git，读包内构建身份。当前没有另做“关于”界面面板，版本查询通过CLI和认证API提供。

## 不混入测试包的内容

独立Home、模型凭据、浏览器登录密钥、历史会话、真实研究和全局.agents均不随包。插件安装选择用公开快照描述，Profile实际依赖及配置留在用户选择的Home；升级不应清空这些内容。
