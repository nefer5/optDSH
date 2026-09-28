# ppt-slidewise 0.1

独立SlideWise编辑页、文件稿件存储和PPTX导出。项目Skill在`.agents/skills/ppt-slidewise`，不安装全局Skill。

安装：本目录`npm ci`、`npm run build`；Node 24及Microsoft Edge用于无界面导出。`node cli.mjs`查看命令。

模型使用@textcortex/slidewise 1.21.1（MIT，保留npm包许可）；项目无外部全局源码依赖。构建期适配器只增加中文字体菜单、关闭Google Fonts尝试，不修改node_modules。静态页CSP禁止外部字体。字体文件来自本机，不打包分发。

API/网页监听127.0.0.1:3314，拒绝非同源浏览器写入；稿件文件在data/ppt-slidewise。保存采用revision校验和排他写锁，历史保留。保存后由用户返回原聊天，未实现后台唤醒。此边界不是OS沙箱。

首版为从内容计划新建PPT；复杂导入/母版继承不在范围。公开函数和UI改动均须实际预览及导出检查，不能以HTTP 200替代渲染验证。


## 0.2 制作工具

新增语义版式analysis/comparison/patent-card，本地图片自动等比嵌入；read默认隐藏base64，diff核对用户修改，template-capture/apply复用已确认布局，check检查几何/图片/字面事实，stage记录流程依据。render按页缓存浏览器预览，export按revision/内容/构建/文件哈希复用，no-op保存不增版本。制作说明见项目Skill的references/production.md；任意PPTX母版导入和全自动内容正确性判定仍未实现。
