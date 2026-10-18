# 开发、交付与验证

## 本机目录分工

| 目录 | 用途 | Git/发布关系 |
|---|---|---|
| E:/Proj-2026-N06_optDSH-dev | 新开发工作树，codex/platform-dev | 从这里提交并推送受跟踪源码/测试/文档 |
| E:/Proj-2026-N06_optDSH | 保留原现场 | 与新工作树共用Git对象库，不随意删除.git |
| E:/Proj-2026-N06_optDSH-releases | 每个版本的不可变tgz/wheel/EXE/文档/SHA | 不整体提交Git，选定产物供Release附件 |
| E:/Proj-2026-N06_optDSH-validation | 全新case、独立app/Home/workspace和日志 | 本机验证现场，不推送 |

这些是本机开发布置，产品不硬编码这些路径。真实课题外置，不在源码区建STUDYS。

## 开发与验证入口

安装根依赖执行npm ci；可选PPT有独立锁文件，按该模块说明准备。纯平台不依赖个人专家中心；光学能力单独安装Python依赖和本项目wheel。开发资源bootstrap只恢复本机开发引用，不修改中心权威源。

日常双击“启动DSH.cmd”；平台源码变化用“重启DSH.cmd”。画板桥/工作台从Profile运行，修改源码后先npm pack再显式Upgrade，见[插件说明](profile-plugins.md)。本机预览配置以.runtime/preview.json为准：当前使用外部2T2R课题和source-home/source-state，模型/插件已迁入配置，不能沿用早期“全新空Home”描述。

```powershell
npm test
npm run version:check
npm run release:check
# 干净本地提交后，输出必须是全新目录
npm run release:local -- <新产物目录> <可选optics-wheel> <可选AgentCanvas-tgz>
```

必要检查按变更范围执行，不自动跑tests/live、真实模型推理、Zemax追迹或保存。验证发布物用packaging/windows/verify-installation.ps1，指定独立的ValidationRoot；它只管理本次身份匹配的进程，凭据和原始日志留本机。

## 四层验证

1. 源码/模块测试：逻辑及协议回归，合成服务不能当作真实Zemax验收。
2. 仓库外安装：独立程序、Home、缓存和Python环境，检查漏文件/依赖、构建身份和插件组合。
3. 真实产品验收：官方会话、实际模型、独立编辑器、Zemax，按授权分别记录。
4. 干净Windows/公司环境：操作系统、权限、网络、许可证与部署恢复；当前暂缓。

分目录测试共享开发机操作系统，不代表沙箱/新机通过。[剩余事项与配合](../planning/ROADMAP.md)和[Windows验证方案](installation/windows-validation.md)是后续入口。

## GitHub放什么

Git推送提交和分支，不上传整个开发文件夹。node_modules/.venv/私人Home/模型/日志/真实课题不进入提交。当前源码远程为https://github.com/nefer5/optDSH.git；本机目录改名不改变它。先推codex/platform-dev供备份与审阅，再按后续决定合入主分支。正式安装包另作GitHub Release附件，不把整个releases目录放进源码树。

开发分支推送已获本轮用户授权；不因此自动合并主分支、强制推送、公开npm或正式Release。具体命令与标签规则见[版本与发布](versioning.md)。
