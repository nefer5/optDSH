# 日常源码Home、官方Skills与目录整理回执

2026-10-19。按用户确认的路径方案及software-delivery-guardrails实施；机器记录见[JSON](source-home-skills-20261019.json)。全局.agents保持原样；用户后续已授权验证通过后合并、推送并上传开发预览Release，最终结果在本页追加。

## 用户现在使用的入口

| 用途 | 路径/启动方式 | 网页 |
|---|---|---|
| 日常源码 | E:/Proj-2026-N06_optDSH-dev/启动DSH.cmd；加载新代码用重启DSH.cmd | 3380 |
| 日常资料Home | E:/.optdsh-source；活动状态在state/web | 与源码版同一Host |
| 当前安装核验 | E:/Proj-2026-N06_optDSH-validation/当前核验/dev.25/program/optdsh.exe；validation根有明确快捷方式 | 3080 |
| 安装核验资料 | 上述dev.25下home；合成课题workspace；独立编辑器canvas-editor | 画板4174 |

日常源码Home及活动状态已经退出validation，不留下指回旧位置的兼容链接。旧地址只出现在历史记录中，迁移映射保留。新安装默认Home仍是用户~/.optdsh，不能把本机源码路径硬编码成产品默认。

## Skills：标准目录与实际官方发现

三个入口均已实际建立，按`<root>/<name>/SKILL.md`组织：

- 源码项目：E:/Proj-2026-N06_optDSH-dev/.dsh/skills。
- 源码跨课题：E:/.optdsh-source/skills。
- 当前安装版：E:/Proj-2026-N06_optDSH-validation/当前核验/dev.25/home/skills。

产品实体继续归所属包。源码入口指向当前packages/plugins源，安装入口指向安装程序与官方Profile资源；受管链接保留相对资源布局，PPT按真实路径定位CLI。Home/config/optdsh-skills.json与源码.dsh/optdsh-skills.json记录归属，同名用户内容不覆盖。

源码目录、源码版外部课题、安装版外部课题三种实际会话的官方`skills/list`均返回5个产品Skill，并允许模型调用。再用官方默认FileSystemSkillProvider逐一读取正文，共15次；外部场景从user-dsh根发现，源码场景从project-dsh根发现，未依赖用户共享.agents或自建发现API。本轮没有付费模型调用或真实Zemax操作，catalog/正文读取不冒充模型业务结果。

可选插件依据官方Profile/Loader事实投影，停用/移除只退出本程序拥有的链接；资源目标和用户Skill不处理。单测覆盖用户冲突保护、链接升级、停用及移除后官方默认发现。实际安装Profile停用Forms后，Home入口撤下；恢复原patch并重启后5个Skill恢复，原patch哈希一致。

新安装器也实装了一次独立core+光学资源场景，安装结束自动建立Home/skills，两项光学Skill从官方user-dsh根读取正文通过。随后归档48份配置/安装证据并可恢复退出整个合成批次，未再留下一个常用安装副本。

## 原始dev.25与维护现场的区别

原dev.25 ZIP保持不变，SHA256仍为`599eb0581ad3e3c497779455dfce918fb4937aaeb5d8ab43eadbfb7560ef8bc4`。当前dev.25核验程序通过npm声明的Bundle0.2.0-dev.26、PPT0.2.2维护组件补齐本功能，没有手改node_modules。维护包及哈希在releases/维护组件/20261019-skills-paths，现场回执在home/config/skills-maintenance-20261019.json。

修订后的完整发行使用dev.27；不能承诺重新安装原dev.25 ZIP会自动得到本轮变化。固定构建的最终ZIP/源提交在发布清单中另行记录。

## 目录整理与数据保护

- 日常Home/状态迁移前后186份资料文件哈希匹配；当前核验迁移前后161份文件匹配，再仅修改当前路径配置/连接身份。历史会话与旧回执不全量替换路径。
- 28个旧case及31项旧发布目录/文件归入已有根的历史区域；14791份非缓存/依赖文件迁移前后哈希匹配。旧Home、结果、模型、画板与日志随原case保留，没有把它们当旧程序删除。
- 根目录251个unit合成夹具共1697份文件，完整归档逐文件校验后可恢复回收。39个夹具链接逐项处理；旧源码temp/forms-tests的1383份合成文件同样归档保留，再回收夹具。
- 新的安装验证、Forms旧路径兼容和产品Skill测试使用validation/临时测试下独立批次，退出时归档并调用随包safe-delete；不再向验证根铺unit，也不在源码temp中反复生成STUDYS。
- 原始回执中若出现manual-preview/source-home、261019-resources或旧版本发布地址，按历史记录中的目录迁移映射定位。记录保留当时事实，不将它们改写成新位置执行的证据。
- 回收可恢复，未自动清空同盘回收区；不宣称已释放其中全部磁盘占用。

## 分支及STUDYS

本工作树当前只有一个检出分支codex/platform-dev。旧工作树codex/platform-plugin-refactor是其祖先，改动已被包含；main原为较早祖先；用户已授权本轮验证通过后快进合入并推送，完成状态见最终交付段。

当前开发根没有真实STUDYS；此前源码temp/forms-tests中的STUDYS是只读旧路径兼容夹具，现已迁出并收尾。原E:/Proj-2026-N06_optDSH/STUDYS属于保留原现场，没有清理授权，本轮不动。

## 检查范围

完整npm test通过：187项插件、127项安装、11项PPT、142项光学、37项分发、56项架构kit，另有模拟DOM及项目检查。随后调整产品Skill测试批次退出，相关4项复验通过。测试结束根unit为0、临时批次标记为0。

仍待用户人工核验及干净Windows/公司环境；没有进行真实光学分析。本轮数据哈希覆盖有明确边界：活跃运行状态会自然变化，依赖/下载缓存及部分重建目录没有逐文件内容哈希，不将这些检查表述为整盘无变化。

## 经验库交付

.experience的README与两份经验均由Git管理。dev.27导出原文与experience-manifest.json，主清单校验经验清单哈希，安装器逐文件校验后保存到Home/.experience。未修改的受管条目可升级，用户修改或新增保留。安装后的文档链接适配实际程序路径；历史run仅留来源说明。源码使用仓库原文，安装版通过官方systemPrompt服务提供Home索引入口；索引注入不等于模型已实际阅读。

经验库及安装变更完成后，安装组129项与test:quick重新通过；完整回归的其余组沿用同轮未改动代码的通过记录。
