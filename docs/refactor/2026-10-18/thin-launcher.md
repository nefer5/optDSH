# Windows薄启动器与Node版本验收

2026-10-18。用户已确认Q9/Q10：开发保留CMD、正式发布薄EXE、配置外置、不要求额外安装PowerShell7；Node>=24，不设仅24的上限。

## 已实现

EXE负责定位运行时、共用Node入口和转发退出码；Node调用现有Windows生命周期逻辑，已适配系统内置5.1。身份、认证、端口/profile互斥检查复用，未新增第二套服务事实源。安装器和发布器包含EXE及哈希，生成外置optdsh-launcher.json。Node/Python/Zemax不随包携带。

本机系统Node26与Codex工具运行时的Node24是不同安装目录。仅切换本项目忽略的开发配置为Node26，未安装/卸载Node、未更改全局PATH，也未修改全局.agents。

## 验证证据

| 检查 | 结果与范围 |
|---|---|
| Node26完整npm test | 147插件、45安装、11PPT、121光学、37分发、56架构kit全部通过；DOM使用WebGL stub |
| 内置5.1专项 | 14项路径/配置/身份/生命周期与Node入口测试通过 |
| 编译EXE | UTF8 BOM、中文空格路径、字面参数、失败退出码及缺失Node三项通过 |
| 安装器 | tarball及EXE哈希/路径越界拒绝测试通过；npm明确由同一个已选择Node调用 |
| 仓库外真实安装 | 008全新app依赖目录；Windows5.1执行安装，PATH无pwsh，显式复用下载缓存，不是冷网络测试 |
| 真实EXE | Node26.12.0和24.19.0分别认证HTTP200、重复打开同PID、四组件ready、node-pty/koffi加载、状态和停止全部通过 |

最终代码来源32cd67f；产物E:/Proj-2026-N06_optDSH-releases/20261018-thin-launcher-008。完整脱敏回执见[evidence/thin-launcher-node24-node26.json](evidence/thin-launcher-node24-node26.json)。测试后两套Host均停止。旧现场Git保留，服务和研究资料未接管。

## 排障与取舍

较早候选004的EXE实际联调发现配置参数前置后status/stop的解析缺口，已修复并补测。007测试用PowerShell管道捕获原生输出，子进程继承句柄导致测试等待；已按归属停止该测试Host，最终008使用输出文件及仅等待包装器进程，保留原失败日志，没有把失败写成通过。005是测试PATH漏掉npm的前置失败，006暴露npm.cmd可能选回其旁边另一版Node；安装器已改用选定node.exe运行npm-cli.js。旧候选和日志保留，不覆盖证据。

开发仍双击新开发目录启动DSH.cmd。发布测试EXE已经生成，但正式公开发行、签名、安装向导、沙箱/公司实机及真实业务验收仍未完成。安装目录的默认JSON与两套自动测试专用JSON分开，不要误把测试验证通过当作模型配置已经迁移。未来Node主版本允许尝试，但只有本次24/26具有实测证据。
