# DSH 划词插件与市场调研

核验日期：2026-09-27。范围：官方 DSH Web 0.1.5-rc.3；后续按用户明确授权安装前两个候选，未开发界面。

## 划词候选

| 插件 | 能力与边界 | GitHub stars | npm近7日下载 |
|---|---|---:|---:|
| [dsh-ui-quote-selection](https://github.com/nekogpt/dsh-ui-quote-selection) | 用户/助手消息选区→原生引用标签；可多段，提交时附完整文本。优先用于简单引用 | 3 | 56 |
| [dsh-add-to-chat](https://github.com/choco9527/dsh-add-to-chat) | 助手回复选区→可移除批注上下文；下一条消息发送时提交 | 1 | 未核实 |
| [dsh-side-chat](https://github.com/AHGGG/dsh-side-chat) | Add to chat、More details、Ask in side chat；多段编号与可选评注。侧聊会创建真实分叉会话并可执行工具 | 11 | 123 |
| [dsh-selection-ask](https://github.com/lzbaclz/dsh-selection-ask) | 选区→浮动按钮→Markdown引用加入输入框 | 5 | 89 |

能力依据作者仓库README，尚未在本项目进行浏览器交互实测。多动作菜单优先评估Side Chat；只要发送到输入框时优先简单引用版。用户后续明确要求同时安装两者；菜单是否重叠或冲突待用户体验。通用可注册菜单动作能力尚未核实，不把预置多个按钮等同开放扩展API。

## 划词插件安装结果

- 已固定安装dsh-ui-quote-selection 0.1.0与@ahggg/dsh-side-chat 0.7.3到同一项目Web profile。未升级DSH核心、未自动安装旧版DSH peer依赖。
- Side Chat声明的DSH peer范围最高为0.1.2-rc.1，本项目0.1.5-rc.3在其声明范围之外；加载成功不能证明所有运行交互兼容。
- 市场接口确认无运行Agent和安装任务后，经项目脚本重启3080。市场installed接口对两个插件均回报activation.state=live，diagnostics.findings为空、brokenPlugins为空，启动stderr无报错。
- 用户选择不建Tabbit标签组、仅验证服务加载，自己体验。未运行浏览器自动化，未发模型请求；侧聊建会话/模型响应以及两个菜单共存尚未验证。
- 使用：刷新官方Web，选中已完成消息中的文字；引用版显示“引用到输入框”，Side Chat提供Add to chat、More details、Ask in side chat。若页面缓存旧资源可强制刷新。

### 客户端冲突修复

用户实际页面报告Side Chat加载失败：conversation.chat.node的user键在priority=-100重复。根因是本项目optdsh-agent-canvas与Side Chat都注册-100包装器；市场服务端live未覆盖客户端槽位注册。

已修改自有画板插件：使用-200外层包装，并在渲染时选取下一个有效优先级的组件，保留Side Chat的-100批注包装及官方原生消息。未修改node_modules。新增回归覆盖两个插件加载顺序、user/steering、普通/画板消息和Side Chat卸载回退；18项定向测试通过。全仓初测125/126，一项Windows临时文件rename EPERM；串行复测结果见temp/dsh-market-research/selection-fix-tests.txt。

Side Chat排查时临时停用，修复后恢复原profile patch、空闲重启3080，两插件服务端live。浏览器刷新加载与真实批注交互仍待用户确认，不将服务端结果当作客户端验收。

## 市场调研与安装

[dsh-market](https://github.com/dsh-market/dsh-market) 是社区插件市场，npm包名为dshmarket。GitHub API当前4674 stars、227 forks；[npm官方下载API](https://api.npmjs.org/downloads/point/last-week/dshmarket)统计2026-09-19至25共145277次下载。下载次数不等于独立用户。

按用户“使用量高则安装”授权，使用项目官方CLI安装dshmarket@1.66.2到data/dsh/profiles/web，精确版本与锁文件均落地。安装前profile清单与patch备份在temp/dsh-market-research。未升级DSH核心或全局工具。

安装命令须使用本项目DSH_HOME：

```powershell
$env:DSH_HOME = 'E:/Proj-2026-N06_optDSH/data/dsh'
node node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile web add dshmarket@1.66.2
```

已验证：官方plugin list；无运行中Agent后经项目脚本重启3080；认证后的/dsh-market/status回报1.66.2、pnpm=true、settingsNamespace=registered；capabilities返回200；registry返回200及4367条目录；30会话仍可读取。未操作3081或Zemax，未发模型请求。

使用入口：刷新官方Web，设置→Plugin Market/插件市场。尚未实测浏览器菜单点击或通过市场安装第二个插件。市场默认检测region=china，包含公共GitHub下载加速路由；本轮未配置同步、Gist或WebDAV。

卸载使用同一DSH_HOME下官方plugin --profile web remove dshmarket，随后在聊天空闲时通过项目脚本重启。不要通过市场升级DSH核心或覆盖项目启动方式。
