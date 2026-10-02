# 最新资讯提示规则

仅向DSH系统提示注册静态 `optdsh:current-information` 段落，提醒时效性查询先检查时间并核对官方来源和发布日期。不采样时间、不联网、不设置版本白名单。

时间由官方 `@deepseek-ai/dsh-time-context@0.2.0-rc.2` 提供。本机配置在 `data/dsh/profiles/web/cordis.patch.yml`：Asia/Singapore、refreshIntervalMs=600000。本插件在profile使用绝对模块路径，移动项目后需更新；说明见 `docs/runtime.md`。

间隔是模型步骤的最小注入间隔，空闲时不发消息。现有Standard已实测；其他complete系统提示预设仍受上游作用域控制，未逐个验收。
