# 风格预设的读取与应用

一个预设是“视觉图 + DESIGN.md + 来源拆解”。参数写在DESIGN.md的YAML frontmatter中，Markdown说明应用理由与范围。不要另建同值YAML；x-preset记录截图/HTML哈希和取值性质。

- code-exact：从冻结实现提取，可作为直接套用基线。
- reference-derived：从截图归纳；已测值和建议值明确区分，不保证像素级还原。
- palette-only：只确认颜色，字体与布局沿用项目规则。

| 参考风格 | 参数档 |
|---|---|
| Heron 工程纸面 | [DESIGN.md](styles/technical-craft/DESIGN.md) |
| Anthropic 人文科技阅读 | [DESIGN.md](styles/editorial/anthropic.DESIGN.md) |
| Conductor 多面板工作台 | [DESIGN.md](collections/product-ui/conductor.DESIGN.md) |
| Mirror 暗色语义卡片 | [DESIGN.md](collections/product-ui/mirror.DESIGN.md) |
| Lightyear 2024 分阶段技术表达 | [DESIGN.md](collections/product-ui/lightyear-2024.DESIGN.md) |
| Anytype 2022 对象集合 | [DESIGN.md](collections/product-ui/anytype.DESIGN.md) |
| WOW-page 大字与模块对比 | [DESIGN.md](collections/product-ui/wow-page.DESIGN.md) |

个人已认可预设与私人截图仅从主会话提供的偏好入口读取，不包含在公共包中。私人A/C预设不能因参考资料同步而公开发布。

用户明确选择某个预设、已有模板或确认同类场景默认，且业务范围清楚时，直接按该预设实施，不重新做风格问卷或A/B。只询问会影响内容或适用性的缺项。未选定时仍使用简短确认和小样流程。Agent自行核验字体可用、主次层级、对比、溢出与业务语义；无需用户逐个决定字号和间距。

若形成长期产品样式，可从选定预设整理项目的DESIGN.md，再与项目CSS变量/组件保持同步。原预设不随每个项目改动；项目差异留项目内，避免多个事实源互相覆盖。
