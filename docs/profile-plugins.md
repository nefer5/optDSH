# 官方Profile插件管理

画板桥optdsh-agent-canvas、光学工作台optdsh-workbench和Forms参数编辑器optdsh-forms已统一官方Profile安装、启停、升级和卸载。源码保留plugins，运行副本安装在Home/profiles/web；Bundle仅提供推荐/默认，启动器不恢复关闭/卸载的功能。Experts/信息策略等其他组件仍需收敛，见[优先级](../planning/ROADMAP.md)。

## 用户日常操作

- 在官方Web“插件”界面启用、停用或卸载。卸载本地tgz安装的插件与其他Profile插件走同一入口。
- 停用/卸载保留画板、会话、绑定、课题与报告；不自动关闭共享编辑器/光学服务。
- 升级须先结束活动任务、停止同一Home/Profile的Host，再显式安装新本地tgz；当前不承诺在线热升级。

## 开发与本地包

```powershell
npm pack ./plugins/optdsh-workbench --pack-destination ./temp/<本次任务>
# 先安全停止相同Home/Profile；预览默认不写，确认参数后加-Apply
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/windows/install-profile-component.ps1 -InstallRoot <程序根> -Home <资料根> -Component workbench -Operation Upgrade -Package <本地tgz> -Apply
```

画板桥使用-Component canvas；参数编辑器使用-Component forms；Install/Upgrade需要Package，Remove不需要Package。Install保留已有包和开关，Upgrade保留用户disabled patch，Remove不删除资料。开发源码改变后单纯重启不会升级Profile安装副本。不同源码/应用副本遮蔽Profile时应修复安装，不修改node_modules。

## 配置与隔离

Profile显式设置优先于Home默认。Home/config/canvas.json指定独立编辑器；工作台自动检测Python并通过Web保存Home/config/optics.json。官方SDK使用宿主peer，避免卸载时带走共享依赖。

光学服务启动保持延迟连接，普通打开和轮询不采集。连接窗口内选择旧版（2021及以前）/新版（2022起，默认），核对实例与实际探测身份后确认；19和2025已实测，其他具体年份待验。Windows后台用同环境pythonw静默运行；状态和脱敏日志在“高级与诊断”，停止仅处理已确认归属且空闲的后台，不关闭Zemax。

[画板接入](installation/canvas.md) · [工作台操作](workbench.md) · [当前验证](../planning/STATUS.md) · [历史资料](archive/README.md)
