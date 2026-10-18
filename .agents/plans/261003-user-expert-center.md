# 两专家迁移到用户Agent中心

L2：用户已明确授权迁移和两项目分发，追加确认个人偏好属于长期用户资产，完整随源迁移。

- 权威源：C:/Users/admin/.agents/experts/{visual-designer,software-architect}；包含preferences.md、private/、参考资料和kit。
- 分发实现：C:/Users/admin/.agents/skills/expert-distribute；公共注册表与本机fleet在用户中心。
- optDSH与AgentTyvate保留源目录链接和现有命令入口，分发目标仍为原四宿主/三宿主。用户偏好留权威源，不进入公开包。
- 先备份与全文件哈希；复制到中心并核对，再可恢复移动原目录、建立链接。源中未提交修改全部保留，不提交/推送。
- 分发器脱离optDSH YAML解析依赖，DSH版本从目标项目读取；中央入口显式选择目标，项目兼容入口保留目标默认。
- 验证：分发器生命周期测试、迁移哈希、两项目预检/apply/check、偏好不公开、兼容入口；配置/文件分发与宿主实际加载分别报告。不自动重启DSH或模型。
- 完成后更新权威说明及共享环境记录。恢复材料在temp/expert-user-center/和用户shared-env报告目录。
