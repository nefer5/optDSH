# 工作树与发布验证区分离

2026-10-18；用户已明确授权本地提交、回退点和指定路径。未推送、未切换原现场、未移动真实资料，沙箱暂缓。

## 目录及版本

| 用途 | 目录 | 当前角色 |
|---|---|---|
| 原现场 | E:/Proj-2026-N06_optDSH | 原分支codex/platform-plugin-refactor，保留源文件和既有资料 |
| 新开发 | E:/Proj-2026-N06_optDSH-dev | codex/platform-dev，后续重构落点，共用原仓库Git对象库 |
| 发布 | E:/Proj-2026-N06_optDSH-releases | 每次构建新的子目录，六个npm包、光学wheel及哈希/说明 |
| 验证 | E:/Proj-2026-N06_optDSH-validation | 每case独立app/home/workspace/npm-cache/Python环境，失败证据保留 |

完整源码快照：原现场.backup/worktree-transition/20261018-134459。初始本地提交ed6fbda；checkpoint/optdsh-pre-worktree-20261018指向该提交。rollback/optdsh-source-baseline-20261018仅指向原已提交4cb306b，早先未提交的内容另有完整快照，不能只靠该标签恢复。

## 干净工作树验证

- 新node_modules和.venv均为本目录真实目录，没有链接或复制旧环境。npm ci、Python锁定依赖安装、本包editable安装和pip check/import已完成。
- 本机默认Node已为26，不属于本项目当前24.x范围；本轮以已存在Node24在测试进程内选择，没有改全局Node或用户PATH。路径记录在本机忽略的.runtime/development.json，不成为产品配置。
- 专家源留在用户中心，项目取消重复跟踪。bootstrap只建立忽略的本机引用；开发资源按中心白名单生成，无宿主hook分发和源修改。它不代表公共专家产品完整发行已完成。
- 新旧工作树文件独立，用户中心引用仍共享，普通重构不得写其目标。原现场Git状态、监听情况及测试回执在本轮temp报告保留。

## 新目录中继续完成的工作

- T8/T9：新增可重复安装验证脚本verify-installation.ps1，以发布物在仓库外安装，检查认证、所选组件和官方client加载图/脚本，再只停止本次进程；超时、失败、路径重叠和令牌隔离有专门测试。
- T5：回归捕获Windows EPERM原子替换失败；增加10/25/50ms有界重试，只重试已写好的临时文件替换，不重放画板编辑或Agent投递。重试耗尽保留原文件和待写副本，三个故障测试通过。
- 补齐可重建工作簿的维护脚本，运行根由脚本位置解析，不再写死旧源码目录。

完整回归及外部真实安装回执将在最终结果中注明；本机分目录通过不代表沙箱/公司实机通过。Zemax18桥、独立Canvas协议、真实业务和公开发布的未完成项仍见[首轮实施记录](implementation.md)。

## Codex界面边界

指定路径使用Git原生worktree创建。Codex托管工作树登记工具拒绝该自定义路径（not a managed worktree），未修改应用内部数据库或自动创建替代目录。本聊天的命令已显式在新工作树执行；以后可从新目录打开开发。不要把应用未托管与Git工作树无效混淆。

本轮新环境中已补齐独立PPT依赖；分发器测试使用夹具源并保留完整新版Standard插件栈比较；文档检查区分Git忽略的历史run证据与真实源码断链。未复制历史run来让检查通过。
