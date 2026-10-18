# optdsh-workbench

光学工作台是官方DSH的可选Profile插件，源码保留本目录，安装副本位于所选Home/Profile。0.9.0起不通过app/source fallback加载；用户停用、升级、卸载都走官方机制，普通启动不恢复用户关停。

## 运行边界

- 与官方Web共用会话和权限；不创建另一套聊天事实源。
- UI、对象引用和光学HTTP代理属于本插件；真正的ZOS-API连接/求解/保存属于独立光学执行器。
- 不要求Python、Zemax、Canvas或Forms才能加载界面。缺光学服务时503 OPTICS_UNAVAILABLE，基础平台与普通会话继续；业务拒绝仍保持原状态，不擅自降级。
- 不随安装或页面打开自动启动光学服务。用户应显式配置和启动相应执行器；真实模型连接、追迹和写盘须另行授权/验收。

## 安装和配置

本地npm pack产生tgz，用官方 `dsh plugin --profile web add <tgz> --config.auto-install-peers=false` 安装，必要时先安装官方Cordis peer。产品发行包已提供包装脚本 `packaging/windows/install-profile-component.ps1 -Component workbench`；显式Install/Upgrade/Remove，运行中Profile拒绝离线包操作。Profile已有包默认保留版本/开关；升级需先停服，Web管理可启停/卸载。

显式Profile配置优先；默认stateRoot来自运行环境或Home/state/profile，workspaceRoot来自所选运行环境/cwd。editorUrl可使用Home/config/canvas.json的可选默认，但不依赖画板包，损坏默认也不阻止工作台加载。会话绑定按官方session.meta.cwd核对；新建会话和报告的默认目录来自运行配置，不内置课题路径。

光学代理仅消费stateRoot/.runtime/optics-access.json的已授权回环服务地址与令牌，白名单路径/方法保持；它不会扫描旧目录或猜测连接。静态资源、Three/manifold及测试由本包负责。停用时清理插件注册和光学提示词，卸载不删除绑定/课题/报告或终止共享执行器。

## 验证状态

本轮已通过离线配置、真实HTTP合成代理、独立Profile与生命周期测试；无真实Zemax/模型调用。许可证与公开发布仍另行确认，当前private=true，仅本地测试包。

## 宿主SDK与插件依赖

@deepseek-ai/cordis与@deepseek-ai/dsh-llm按宿主peer声明，使用兼容DSH提供的接口，不为工作台重装一份共享LLM SDK。Three/manifold仍是插件自身依赖。0.9.2修复了旧打包方式在卸载时移除共享SDK、令官方热重载报failed的问题；独立Profile与严格卸载回读已重新验证。
