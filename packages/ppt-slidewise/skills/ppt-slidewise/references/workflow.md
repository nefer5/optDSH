# 首版命令与修改

环境：项目`packages/ppt-slidewise`内执行`npm ci`、`npm run build`一次。Node 24；headless导出使用本机Microsoft Edge。运行端口3314仅回环，本机命令启动不保证Windows Job之外常驻；中断后再次open即可。浏览器普通编辑无需模型调用。

输入示例见config/smoke.yaml。页面固定1920×1080，坐标为px，字体大小为编辑器px。短正文通常4–6行；表格用字符串二维数组。默认source注明合成示意。

修改文件是JSON数组：

```json
[{"slideId":"s2","elementId":"s2-title","set":{"text":"先确认内容，再优化视觉"}}]
```

patch支持text/fontFamily/fontSize/x/y/w/h/color；改变图片、增加删除元素时使用完整deck save。直接用户修改保存在同一模型中，read能获取最新内容。未保存的浏览器草稿不在文件里。

字体可用名称：黑体、等线、等线 Light、微软雅黑、微软雅黑 Light、楷体、仿宋；计划也接受SimHei/DengXian/Microsoft YaHei/KaiTi/FangSong别名。不要因为字体缺失就静默换字体。

导出使用SlideWise序列化，再补齐文本run的a:ea与a:cs；不会嵌入Windows字体文件。公司机器缺字体时PowerPoint仍可能替换，须现场检查。

首版不导入现成PPTX母版；用户给公司模板时说明此限制，不伪称已继承母版。独立编辑页保存到文件，AI扩展按钮不是模型接口。没有自动回调；用户保存后回原聊天继续。
