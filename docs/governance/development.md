# 开发与资料约定

## 开发入口

先读[当前状态](../../planning/STATUS.md)与[路线](../../planning/ROADMAP.md)，运行入口见[本地运行](../guides/local-runtime.md)。官方Web、模型接入和只读工作台已有实测，能力边界以当前状态为准。新安装仅进入项目隔离目录，不安装全局工具、不修改其他项目入口。

config/upstream-baseline.json 记录选型时看到的上游快照，candidatePackageVersion 是候选而非已验证版本。master SHA 与 npm 候选并非同一版本保证，查具体 API 应使用所安装版本对应源码。

## 配置

配置型Skill遵循[铁律OPT-14](project-rules.md#opt-14-skill配置范式)，包内提供config/xxx.example.yaml。DSH原生配置遵循上游格式；config/local.example.json是历史初始化草案，不可直接传给DSH。

本地配置可复制为 config/local.json，Git 忽略。不要填写示例密钥，不把凭据写入代码。个人与公司部署配置分开；公司端接入遵循公司的管理方式，认证、网关内容和日志保持本地。

除模型请求外，还需要核验遥测、反馈、搜索、插件和自动更新的出口；禁止将“仅改了 base URL”当作已满足出口要求。

## 产物与验证

- docs：长期架构、协议、说明与来源。planning：状态和里程碑。
- examples：合成、小型、可公开的数据；不要把真实商业模型当测试 fixture。
- runs/<workflow>/YYMMDD-NN/：正式分析、评测与仿真的自包含证据包，默认离线HTML、配置快照与校验清单；详见[运行包规范](run-bundles.md)。artifacts保留服务日志、诊断及历史结果，均默认不入Git。
- 仿真大数组使用适合读取方式的二进制格式，Git 不跟踪 ZRD、CAD、模型原件及原始会话。
- 初始化检查：python scripts/check_project.py。后续针对模型引用、坐标转换、重复提交与版本冲突建立行为测试。
- 删除和清理使用本机 safe-delete 规范。未经任务授权不修改活动 Zemax 会话。

## 状态表述

设计完成、模拟运行、已配置、已接入、已实测分开记录。能渲染样例不代表 Zemax 联通；日志记录成功不代表桌面展示通过；API 返回成功不代替模型回读。
