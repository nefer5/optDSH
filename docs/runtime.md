# 安装、启动与后台运行

普通用户先看[安装说明](installation/README.md)，开发者看[开发与验证](development.md)。Node>=24由用户安装；纯平台不要求Python。光学另需Python3.12+及声明依赖、用户安装的Zemax和许可证。PowerShell7不是普通用户前置。

## 开发机日常入口

- 根目录“启动DSH.cmd”：复用身份匹配的服务，无则启动。
- “重启DSH.cmd”：显式停止身份匹配的旧Host再启动，用于加载最新平台源码。
- “启动光学工作台.cmd”：打开已启用的Profile工作台，默认不启动光学执行器、不连接Zemax。

本机开发参数由被Git忽略的.runtime/development.json和preview.json选择，不能当成发布默认。启动器按系统默认浏览器打开认证入口，不更改浏览器设置。认证链接和令牌不粘贴到报告或远程仓库。

## 安装版与路径

薄optdsh.exe与optdsh.cmd读取外置启动配置，支持Home、Profile、Workspace、StateRoot与端口。Home默认可为用户目录/.optdsh，但用户可指定其他盘。所有课题可共用独立Home；课题可位于任意外部目录。

官方Web可在同一Home下管理多个项目/会话，每个会话有自己的cwd。启动参数指定初始工作目录，不把整个平台锁定为单一课题。需要改变Host级配置时先结束活动任务再显式重启，不启动两个写入同一Profile的Host。

## 状态、认证与停止

scripts/runtime下的status-dsh.ps1、stop-dsh.ps1使用与启动相同的配置。PID、开始时间、程序身份、Home、workspace和端口需要匹配；未知占用者不会被接管。关闭浏览器不停止后台。凭据记录只保存在本机.runtime，认证过期时重新走正式启动入口。

## 光学后台与模型

工作台“详情”或“连接/切换模型”进入同一窗口：自动检测环境、选择版本和实例。显式探测才准备服务并读取模型，确认连接不保存模型。Windows服务通过pythonw静默运行，日志即时落到StateRoot/logs/optics/web-service.log；高级与诊断提供状态、启停和脱敏日志。

停止按钮只停止本平台已核验归属且空闲的光学服务，不关闭Zemax，不保存模型。采集、仿真或恢复未确认时拒绝停止；停止Agent回答不取消Zemax任务。开发排障脚本start-optics.ps1是独立显式启动入口，其默认可采集行为不替代Web延迟连接流程。

## 日志与恢复

Home、StateRoot、workspace不在程序目录中清空；卸载插件不删除真实资料。升级用新安装位置和原Home，先做备份与停止写入。具体回退/卸载见[安装说明](installation/README.md)，模型身份/保存门禁见[光学契约](contracts.md)。旧3080/data/dsh现场和历史配置已归档说明，不作为新默认。

## 安装后的模块端口

端口以安装目录PORTS.md及Home/config/ports.json为准。默认数字仅是首选，安装器会探测并避让；Launcher、工作台与PPT读取最终配置。配置记录不表示服务已经启动；Web/Canvas身份检查及光学显式启动保持独立。
