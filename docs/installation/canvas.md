# 画板安装与外部课题

用户已授权本地开发/验证，不公开npm、不推送。AgentCanvas包名@nefer5/agent-canvas，CLI仍agent-canvas；0.2.3为具备机器可读接入契约的兼容起点。

## 已安装画板

在optDSH程序目录，用Windows自带PowerShell执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/runtime/setup-canvas.ps1 -Home <资料目录> -CanvasRoot <AgentCanvas安装根或app目录> -Port 4174 -Start
```

可省略CanvasRoot，按标准安装位置/当前PATH候选发现；明确指定位置更容易排查。只读integration-info检查包名/版本/安装身份/embed.dsh4。旧excalidraw-local 0.2.2缺机器契约，明确提示升级，不直接覆盖或错误连接现役旧服务。端口须空闲或属于同一兼容安装；不会杀占用者。

## 全新安装

在包含编辑器的本地发行包中：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/windows/install.ps1 -ReleaseRoot <发行目录> -InstallRoot <新平台目录> -Home <资料目录> -Workspace <课题目录> -Components core,canvas -InstallCanvas -CanvasInstallRoot <新画布程序目录> -CanvasPort 4174
```

已有编辑器则把InstallCanvas/CanvasInstallRoot替换为CanvasRoot。主程序安装成功与编辑器配置成功分别写入回执；中断保留主程序和Home。主安装器仍是CLI，图形向导待做。

已有平台只补装画板编辑器：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/runtime/setup-canvas.ps1 -Home <资料目录> -Package <本地画布tgz> -InstallRoot <新画布程序目录> -Port 4174 -Start
```

编辑器tgz包含预构建网页/CLI/服务与许可证；不要求用户编译、不带Node、不含用户数据。安装使用用户Node及npm，禁用安装生命周期脚本。不注册全局PATH、不改全局.agents；不覆盖已有安装目录。

## 数据与启动

连接信息存Home/config/canvas.json；重配前自动备份。仅选择canvas组件时按配置启动/复用编辑器；失败记录unavailable，core继续。编辑器与DSH生命周期独立，停止DSH不杀共享编辑器。编辑器自己的目录/日志在Home/state/canvas；DSH画板数据在各会话workspace/.agent-canvas/optdsh/boards。配置编辑器不等于已给任意既有平台安装桥包，需同时安装canvas组件。

官方Web的工作区选择独立于启动默认cwd：先选择课题再打开本会话画板。草稿保存不发送，提交才进入当前聊天；本轮不发送真实模型请求。独立Canvas通用文档协议仍未统一。0.2.4已复用完整右栏与诊断，DSH桥仅提供当前会话/课题/状态和操作传输，不再自建精简提交界面。共享编辑器程序不等于共享提交队列。

## 课题与公共能力

本机2T2R课题入口E:/Proj-2026-N06_2T2R-LiDAR/README.md；206份原件/历史设计快照按哈希复制，原资料不删除。商业模型和联合审计原始聊天未迁；历史报告旧路径仅作来源证据，不是新运行依赖。研究参数尚需用户确认，旧modelId/revision不可直接用于新环境执行。

平台公共Skill不内置2T2R假设，不依赖旧平台目录；课题自己的Skill承接领域背景与特定采用约定。公共执行器真实算法限制如实声明。历史run保持原字节，不能批量替换路径。更广范围的公共领域资源拆包、协议统一和真实业务仍待验收。

## 本机验证结果

最终交付测试版本dev.6，AgentCanvas0.2.3。已有/全新安装、Windows5.1首次后台启动和复用、真实iframe握手、外部2T2R绘图保存/DSH重启回读、异常时core降级均通过；独立发行包运行身份匹配。新装安装器路径在dev.5实测，后台拉起修复后的dev.6复用安装及运行通过。原临时case已停止；日常预览保留core+canvas，root启动/重启CMD沿用，网页选择已登记2T2R工作区再打开画板。证据见[evidence/canvas-installation-dev6.json](../verification/refactor-20261018/canvas-installation-dev6.json)。

完整回归通过后又完成19项最终定向；一次Windows临时文件EPERM重跑通过，保留原日志；不等于真实模型/光学分析/公司环境验收。

## 共享运行包与升级（dev.20）

本机日常DSH现连接LOCALAPPDATA/Programs/AgentCanvas/app，与agent-canvas全局CLI和快捷方式共用；原validation安装保留作历史回退。Home/config/canvas.json保存连接，Profile显式editorUrl仍优先。独立安装在同一路径兼容升级后，DSH校验实际安装身份/契约/服务版本，再更新版本记录；不会静默接入别的安装或抢占端口。

右栏复用独立AgentCanvas组件，显示课题/会话、元素数、内容版本、说明、提交和连接诊断；历史只读、保存不发送。说明及提交身份可在同源浏览器草稿中跨重开保留。独立模式继续按CLI接收流程；DSH提交自动进入同一官方会话，不调用独立inbox。

[验证与回退](../verification/canvas-shared-editor-20261018.md)；N05源码即开发目录，发布物和独立验证分开，现役程序继续位于用户安装区。无需为日常开发复制第二份源码；并行版本才另开worktree。
