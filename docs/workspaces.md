# 课题目录与平台源码边界

用户已确认：研究可以在任意选定目录开展；平台安装、源码、发布包都不建立专属STUDYS根，不把真实课题作为产品内容。Study是可选声明，不是必须具有特定名称的目录。

```text
<任意课题根>/
  README.md
  AGENTS.md                 可选的课题协作指令
  study.yaml                可选的表单/公共参数入口
  .agents/skills/           可选的课题专用技能
  configs/ models/ runs/    按课题需要建立
  .agent-canvas/            该课题的画板资料
```

没有study.yaml也能打开普通会话、使用临时表单请求；长期公共参数表单需要该声明时明确提示缺失，不自动生成课题。存在声明时，默认API id为workspace，亦可显式设置manifest.id；目录名可以包含中文或空格。

## 官方能力与当前自有接入的区别

同一Host与同一DSH_HOME可以管理多个不同目录的Workspace/Session；当前官方SessionController的create接口接收workspaceId/cwd，Web工作区插件提供选择目录流程（需要组合可用的directory-picker后端）。启动参数Workspace是默认值，不应成为所有会话必须相同的目录限制。本轮已用隔离Host注册外部课题并在Web切换，画板按会话cwd保存；系统选择器会弹原生窗口，后续自动验证用显式路径注册，避免打扰用户。

画板已从session.meta.cwd确定归属并有双目录夹具；工作台可绑定不同目录的已有会话，但其create和部分报告仍取配置Workspace；Forms HTTP仍绑定一个配置目录。这些是自有插件剩余适配，不是官方会话不支持任意目录。全局optdsh命令是否登记与Web内多项目能力也是不同问题。

“必须停服务再换课题”的早先说明过宽。普通项目选择不需要重启服务；当前启动脚本若要更换其记录的默认目录/状态位置，才因归属一致性检查需要先停旧实例。后续统一按所选官方会话cwd完善自有功能，不让用户靠重启Host切课题。

## 实现约定

- 启动/会话选择workspace；表单从该目录的study.yaml读取，run默认归workspace/runs，输出路径不得逃出明确workspace。可选嵌套study.yaml和旧布局只作兼容。
- Forms当前HTTP插件仍绑定一个配置的workspace；CLI可显式指定任意根，不等于同一个HTTP实例已能随所有会话自动切换。此项仍属后续T4验收。
- 源码里的examples/和包内examples是合成/公开格式示例，测试夹具归所属包tests；它们不是用户的活动课题，不成为默认研究对象。
- 发布包不含真实课题，验证case仅有独立合成workspace，不建立平台专属studies根。

## 既有研究与本次处理

2T2R已建立源码外独立课题，背景/业务规范/配置/历史报告按映射复制，原资料保留；本机入口见[本轮安装与课题说明](installation/canvas.md)。旧报告中的绝对路径是历史记录，不能作为新运行入口。商业模型和原始聊天未迁，真实运行需另行显式配置。

公共Skill不依赖具体课题或旧平台根；课题Skill跟随Workspace。研究run按当前workspace归档；不得通过扫描相邻旧源码补齐配置。通用算法限制与课题采用约定分别声明。

## DSH_HOME与.agents（讨论边界）

DSH_HOME是产品自己的Profile/会话/状态资料根，workspace是实际研究工作目录。.agents可位于用户主目录（共享资源）或课题根（局部资源）；源码项目的.agents用于开发协作。新版官方分别解析DSH_HOME和DSH_AGENTS_HOME，目录归属不能混同。产品内置Skill如何归入插件资源包、源码.agents如何只保留开发配置仍在讨论，本轮没有迁移这些目录或改全局设置。
