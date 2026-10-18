# 版本、构建与本地测试包

产品当前开发版本为0.2.0-dev.25；官方DSH依赖版本与独立组件版本分别管理，不机械同号。阶段顺序通常为dev.N、beta.N、rc.N、正式版；只有确认交付的测试包才递增预发布号，日常修改由Git提交及dirty状态追踪。本轮已本地提交；远程推送、Release、主分支合并及公开npm分别按用户授权执行。

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

## Git源码、标签与Release附件

源码仓库为`https://github.com/nefer5/optDSH.git`；本机目录规则统一见[开发目录分工](development.md)。发布文件需要版本管理和可追溯，但不需要另建Git仓库，也不把每版ZIP/EXE提交进源码Git历史。

| 对象 | 管理位置 | 如何对应 |
|---|---|---|
| 源码、测试、规则、构建脚本、版本与脱敏验收说明 | 当前开发仓库Git提交/分支 | 完整commit SHA |
| 某版对应的源码状态 | 同一Git仓库的版本标签 | `v0.2.0-dev.25`指向该包实际构建提交 |
| 给用户下载的安装ZIP及校验文件 | 本机releases区及GitHub Release附件 | 版本号、清单中的sourceRevision与SHA256 |
| 安装验证程序、Home、缓存、完整日志 | 本机validation区 | 验收摘要可进源码Git，现场不上传 |

标签像给源码某次提交贴上版本号；Release是在这个标签下放更新说明和下载附件。推送源码分支不会自动上传本机ZIP，下载GitHub自动生成的“Source code (zip)”也不是安装包。用户应下载我们单独附加的`optDSH-<版本>.zip`。

## 本项目发布顺序

1. 在开发目录修改、检查并提交源码；在既有releases根内构建新版本原件与用户包。
2. 在既有validation根内完成独立安装和必要自验，记录构建SHA、包哈希及验证范围；用户完成人工核验后决定是否对外分享。
3. 获得上传授权后，推送包含构建提交的源码分支；创建并推送版本标签，标签必须指向包内`sourceRevision`，不能随手指向后续文档提交或最新HEAD。开发预发布可指向开发分支中的提交，不强制提前合并主分支。
4. 在GitHub创建Release草稿，选择该标签，附上用户ZIP、SHA256校验文件和更新说明。`dev`/`beta`/`rc`勾选Pre-release，不标为稳定最新版。
5. 核对附件、标签提交及版本后发布；下载远端附件再核对SHA256。只推源码、已上传草稿、已正式公开是三个不同状态。

本次包为`0.2.0-dev.25`，实际构建提交是`db862c008049cfeee1f8d1a43b18493dd3e87c6d`，之后的目录/验收文档提交不改变这一事实。当前仅本地完成；未创建版本标签、未上传Release。分享对象为：

```text
E:/Proj-2026-N06_optDSH-releases/
  optDSH-0.2.0-dev.25.zip
  optDSH-0.2.0-dev.25.zip.sha256
```

可以附加对应原始构建中的`release-manifest.json`方便审计；不要上传整个原始release树、validation目录、账号/会话或私人模型。

## GitHub网页操作

下列是操作说明，本次未执行远程发布。需要仓库写权限。

1. 打开仓库首页，进入 **Releases → Draft a new release**。
2. **Choose a tag**选择已推送的`v0.2.0-dev.25`；本项目优先预先创建精确提交标签，避免网页默认Target选错提交。
3. 填写标题和更新说明，说明功能、Node24前置、联网要求、已验证与待验范围；不要写入凭据或认证链接。
4. 将上述ZIP和`.sha256`拖进附件区域。单独上传薄EXE会缺少_support资源，因此当前必须上传完整用户ZIP。
5. 勾选 **This is a pre-release**；先 **Save draft**检查，确认后 **Publish release**。

GitHub官方入口：[管理Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。若启用不可变Release，应先在草稿中附齐附件再发布；发布后不能替换其附件或移动对应标签。本项目无论是否启用该平台功能，都保留版本产物不可覆盖的规则。

## 开发者可选命令

普通安装用户不运行这些命令。下面示例用于将来明确授权后的发布操作，不是自动执行步骤。

```powershell
# 从开发仓库推送源码，不强制覆盖远端
git push -u origin codex/platform-dev

# 先核对标签不存在，再把标签固定到真实构建提交
git tag -a v0.2.0-dev.25 db862c008049cfeee1f8d1a43b18493dd3e87c6d -m "optDSH 0.2.0-dev.25"
git push origin refs/tags/v0.2.0-dev.25

# 已安装并登录GitHub CLI时，可创建带附件的预发布草稿
gh release create v0.2.0-dev.25 `
  "E:/Proj-2026-N06_optDSH-releases/optDSH-0.2.0-dev.25.zip" `
  "E:/Proj-2026-N06_optDSH-releases/optDSH-0.2.0-dev.25.zip.sha256" `
  --repo nefer5/optDSH --verify-tag --draft --prerelease `
  --title "optDSH 0.2.0-dev.25" `
  --notes "开发预发布：图形安装、端口避让及选择性卸载；需Node.js24+与网络，真实光学业务待验。"
```

CLI中`--verify-tag`要求远端已有该标签，避免自动按默认分支创建标签；`--draft`只存草稿，不直接公开。正式发布说明可从验收回执提炼，去掉本机路径与内部过程。推送后核对远端分支/标签SHA，上传后核对附件名称、数量与下载哈希；已有分叉先检查并协调，不force推送。详见[官方CLI说明](https://cli.github.com/manual/gh_release_create)。

