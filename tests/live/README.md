# 显式在线验收

这些脚本不进入npm test；需要正在运行的官方DSH，可能创建会话、操作合成画板并消耗模型调用。必须按当前任务授权单独运行。

- validate-canvas-http.py：会话画板HTTP隔离与提交。
- validate-canvas-edit.py、validate-canvas-v4.py：Agent回画和拒绝反馈。
- validate-workbench.py：已有验收会话的多轮追问。OPTDSH_VALIDATION_RUN指向含session.json的当次run；未指定时仅供导入RPC辅助函数，不能凭空复用未知会话。

临时诊断输出在temp/live，作为正式交付时由调用者归档进同一run。凭据只从.runtime/web-launch.json读取，不能复制到报告。不要使用data/archive中的旧探针或认证脚本。
