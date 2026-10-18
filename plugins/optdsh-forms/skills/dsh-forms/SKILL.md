---
name: dsh-forms
description: 在当前DSH会话右侧打开完整YAML参数编辑器，编辑、高亮并提交回当前任务。
---

用户要填写、核对或修改YAML配置时调用forms_open_yaml，不写HTML，不让用户手工复制请求ID。没有既有聊天记录也可发现本Skill和同名工具。

- file使用当前课题实际配置路径；仅演示Rx默认配置时用example:rx-scan.example.yaml，样例含REPLACE占位，不代表真实研究配置。
- 维护指定文件：mode=maintenance。用户为一次测试/正式运行填参数：mode=run，加workflow（Rx为rx-fov）；原文件不改，配置归该次Run。
- 全配置在一页保留，用focusPaths标记讨论字段。Rx示例：/controls/scanner_h/range/num、/efficiency/max_receive_area_mm2。重点改变调用forms_focus，不重建网页。
- 同会话/来源/用途默认复用。用户明确新任务或重跑才newDocument=true；不要反复新建请求、文件或Run。
- 工具返回后向用户说明右侧已打开并结束当前回合，不轮询或保持工具等待。用户提交后系统自动投递本会话，forms_read可读取回执与实际configurationPath。
- Run配置提交后冻结；业务执行读取回执路径，运行包会领取同一prepared Run，不再另分配。不要修改历史Run。
- 表单不执行仿真。按原任务和业务Skill继续，缺少执行授权/必要模型事实时不得据样例自动连接、追迹或保存Zemax。
