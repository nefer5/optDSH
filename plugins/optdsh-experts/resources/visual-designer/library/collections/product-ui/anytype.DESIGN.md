---
version: alpha
name: Anytype 2022 对象集合
description: 项目库、模型与结果集导航
colors:
  primary: '#183238'
  background: '#7dbcc3'
  surface: '#ffffff'
  accent: '#315d61'
  secondary: '#527c80'
  border: '#9ec8cb'
typography:
  h1-zh:
    fontFamily: Microsoft YaHei
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.4px
  h1-latin:
    fontFamily: Segoe UI
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.4
  h2:
    fontFamily: Microsoft YaHei
    fontSize: 21px
    fontWeight: 700
    lineHeight: 1.5
  body-zh:
    fontFamily: Microsoft YaHei
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.7
  body-latin:
    fontFamily: Segoe UI
    fontSize: 18px
    fontWeight: 400
  code:
    fontFamily: Consolas
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  panel: 10px
  code: 4px
spacing:
  paragraph: 14px
  row: 10px
  panel-y: 17px
  panel-x: 21px
x-preset:
  id: anytype
  revision: '1'
  recorded_on: '2026-10-03'
  evidence: reference-derived
  parameter_policy: proposed-reproduction-values-not-original-css
  references:
  - file: anytype.png
    sha256: 4d36d54a399d1efabbbd226174070da79d3ee3919d5515ae0a2ecbfae280cb24
  original_notes: anytype.md
---

## Overview

项目库、模型与结果集导航。这是一份可执行的近似复现建议，不是从原站CSS完整逆向得到。除明确列出的测量证据外，字体、字号、间距、圆角和部分颜色都属于专家初始参数，不能说用户已逐项认可。

参考画面（公共包未附原图，请查看来源链接）

[原有拆解与来源](anytype.md)。

### 取值依据

- background #7DBCC3及surface #FFFFFF来自截图像素；带阴影/蒙层区域不视为单一平面色。

## Colors

YAML中的background是底色，primary是主要文字或主前景；surface承载分组，accent用于少量注意力。颜色角色按本预设解释，不因为名称叫primary就把它铺满按钮。颜色来自截图时只是像素证据，不能当CSS测量；对比度需在实际字号与背景组合上检查。

## Typography

中文正文与拉丁正文分别使用 YAML 的 body-zh / body-latin；标题使用 h1-zh / h1-latin。正文必须小于标题，代码用独立等宽层级。拉丁片段沿用中文段落行盒，不因内联字号变动制造不齐行距。实际字体不可用时先说明替代，不悄悄声称原样复现。

## Layout

上方搜索和筛选、下方对象卡片集合；统一图标/名称/类型位置。

## Elevation & Depth

优先用色阶与分隔组织主次，阴影只在有层级意义时使用。参考图中的品牌图片和装饰不属于可直接复用资产。

## Shapes

rounded是当前复现参数；保持同类容器一致，不以统一大圆角抹掉信息层级。

## Components

柔和环境色、清晰白卡片、显式选中态。

## Do's and Don'ts

- 卡片导航不代替高密度参数表；始终保留对象标识、版本和状态；仅取2022归档。
- 用户明确点名预设且任务范围完整时，简短说明采用哪一版后直接实现，不重新做风格A/B；必要业务信息缺失时只问缺项。
- 需要改变核心配色、字体角色或密度时再确认变化，不要求用户逐项审查设计参数。
- 每次应用由Agent检查渲染、字体实际加载、文字/图表溢出与单位/状态完整性；不能承诺不再需要任何视觉检查。
- x-preset是本库溯源扩展字段；主体按Google DESIGN.md alpha组织，已做YAML语法和本地引用检查，未运行官方CLI，未宣称严格兼容验证通过。
