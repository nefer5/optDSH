# 光学公共包

- src/optdsh_optics：连接、采集、几何、保存、Tx/Rx确定性执行器与报告。
- scripts：HTTP服务、worker、MCP薄入口。
- tests：离线测试。
- requirements.txt / pyproject.toml：独立Python依赖和可安装包。

不再导入N02源码或使用其虚拟环境；原始来源哈希在UPSTREAM.md。真实宿主使用本机Zemax ZOS-API，默认只采用Interactive Extension。配置文件的python相对项目根解析。
