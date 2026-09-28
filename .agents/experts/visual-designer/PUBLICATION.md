# 发布与引用边界

- 公共核心：agent.json、instructions.md、本README、偏好空模板、文本参考说明与来源。宿主适配实现随optDSH仓库提供；独立源码包不等于已安装运行时。
- 本机私人内容：preferences.md、private/、下游绝对路径和链接设置，均不进入公共包。
- 当前第三方PNG截图在sources.md明确为私人参考用途；本机保留，不将其当作已获公开再分发授权。公共源码包保留文字观察和原站链接，省略PNG与本地图册HTML。
- 用 `python plugins/optdsh-experts/scripts/export-public.py --output temp/visual-designer-public` 生成全新公共源码目录，拒绝覆盖。导出包含文件哈希清单，可检查后用于后续发布；本命令不上传、不推送、不宣称额外素材授权。
- 完整optDSH公开发布前沿Git清单检查私人内容与图片排除。运行时缺少本机PNG时应明确提示未提供图片，不能声称已看过；不影响文字参考分发。
