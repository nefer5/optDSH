# 0.2 制作与检查

## 内容组织

先把每页写成“本页要回答的问题 → 结论标题 → 2–3组依据 → 对读者的含义”。分析页不能只列术语；对比页使用同一维度对齐各路线；从总体判断过渡到专利实例时，说明实例支撑哪一条工程判断。

专家听众：优先写机制、权衡、约束、接口和研究判断。省去反复出现的“本轮未验证/专利自述”等泛化说明；具体数据的条件仍需保留，事实不能编造。专利卡把问题、技术方案、独立权利要求必要组合、从属细化及研究启示分开。不要把从属项自动抬为独立项限制。

事实清单和来源保存在笔记/源文件，不要求把过程说明塞满页面。普通主题也按“结论有依据、数字有来源、比较口径一致”检查。

## 确定性版式

优先写一份 YAML，调用 create 一次完成。无需先造占位稿、输出图片base64或手写几百行坐标。完整通用例子见 ../config/production.example.yaml；内容和图片路径替换为当前材料。

- analysis：2–3组sections，每组heading/body，底部takeaway。
- comparison：rows二维字符串数组，首行为表头，总计2–5行、1–5列，底部takeaway。建议正文34px，长段拆分而非一直缩字。
- patent-card：meta身份行、3–6组sections、右侧1–2张images（path/caption），imageArrangement可选horizontal（默认）或vertical。caption写图号/页码。
- 图片路径相对YAML所在目录，也可绝对路径；PNG/JPEG/WebP自动嵌入并等比放置。frame自动使用#FFFFFF00，避免透明色被导出成不透明黑色。
- theme统一设置background/ink/blue/muted/line/panel/accent/titleFont/bodyFont/bodySize。用户给公司模板时可先复用已确认SlideWise页，不能声称能导入任意PPT母版。

版式不够用时才通过read --full --output导出源文件并局部调整。查看简版read即可核对文本与位置；图片显示hash/尺寸，不打印base64。**简版不是可直接save的源文件。**

## 用户修改与模板复用

保存上一轮revision；用户保存后运行diff --id ID --from N。比较文字、位置、尺寸、字体、颜色、图片和页面顺序；先保留用户改动，再patch明确的变化。布局编辑无需反复提问，实质内容变化同步策划稿。未保存的浏览器草稿无法从CLI读取。

已确认样例可用template-capture保存布局：slots.json为{"title":"s1-title","body":"s1-body-0","image":"s1-image-0"}这样的槽位→真实元素ID映射（先read确认ID）。必须把所有应变内容列为槽位；其余文字会作为固定标签保留。template-apply输入为title及slides列表，每页有id、values槽位键值；所有槽位必须提供，避免漏换上件专利。模板文件可能包含源文字/图片，只在本任务允许目录保存。支持text/image/shape/line，不支持任意PPTX母版导入。

## 最短交付闭环

1. create：完整计划直接生成；已获直接制作授权不重复R1/R2。
2. stage --stage production --basis "任务已确认主线与样式并要求直接制作"：记录实际依据。其他阶段planning/content-reviewed/sample-reviewed/delivered。此记录是Agent填写的过程信息，不是机器验证的用户批准。
3. check：检查画布越界、图片数据/比例、透明边框，提示文字估计溢出/重叠。可用--facts facts.json附加文献号、单位、日期等字面核对。格式：{"expectedSlides":3,"slides":[{"id":"s1","required":["已核实的单位名"],"forbidden":["错误文献号"]}]}。语义、权要归纳及产业判断须Agent对照原文审查，机器检查不替代它。
4. render：自动生成所有页PNG；--slides s2,s3仅看选中页，内容未变页复用缓存。实际查看图片再修改；不能把JSON合法当作排版通过。
5. export：真实PPTX；同revision、内容、前端构建、成品哈希均一致才复用。重复导出不增加revision。
6. 对交付PPTX用宿主可用的WPS、PowerPoint或LibreOffice渲染抽查，复杂/修改页必查。render只是SlideWise浏览器预览，WPS按Office平替接受，实际打开或渲染PPTX即可满足本轮Office成品检查要求；不把WPS/PowerPoint软件称呼差异列为质量问题。记录实际工具即可，只有用户明确要求微软PowerPoint特有兼容性时才核对具体宿主。

先修check硬错误，再看警告与实际画面；不要机械清除合理重叠（例如图注/背景）。导出CLI拦截硬错误，浏览器直接导出仍需Agent事前检查。新增/改图/改字后重复相关页检查即可，不要反复全量安装依赖。

视觉专家仅在用户选择后交接：内容稿、来源、锁定结论/数字、确认样页、可调整字段；专家改视觉后重新核对文字/图片及成品。未调用就明确主Agent独立完成，不虚构专家介入。
