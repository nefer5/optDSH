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

官方Web的工作区选择独立于启动默认cwd：先选择课题再打开本会话画板。草稿保存不发送，提交才进入当前聊天；本轮不发送真实模型请求。独立Canvas通用文档协议仍未统一，不能宣称薄桥重构已完成。

## 课题与公共能力

本机2T2R课题入口E:/Proj-2026-N06_2T2R-LiDAR/README.md；206份原件/历史设计快照按哈希复制，原资料不删除。商业模型和联合审计原始聊天未迁；历史报告旧路径仅作来源证据，不是新运行依赖。研究参数尚需用户确认，旧modelId/revision不可直接用于新环境执行。

平台公共Skill不内置2T2R假设，不依赖旧平台目录；课题自己的Skill承接领域背景与特定采用约定。公共执行器真实算法限制如实声明。历史run保持原字节，不能批量替换路径。更广范围的公共领域资源拆包、协议统一和真实业务仍待验收。
