---
name: expert-distribute
description: 将用户Agent中心的专家分发到本项目，兼容原项目命令入口。
---

# 专家分发项目入口

唯一源在C:/Users/admin/.agents/experts，完整分发说明在C:/Users/admin/.agents/skills/expert-distribute/SKILL.md。本目录scripts通过Junction引用中心实现；从此入口直接调用默认本项目，fleet可用原项目清单或用户中心清单。原tests/config保留作项目适配验证，不是第二份实现或专家源。

个人偏好和私人参考资料也在用户中心，同源引用；公开资源不输出它们。项目角色、公共包、技能及Hook继续通过原分发机制管理，不能手改生成物。
