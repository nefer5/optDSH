---
version: alpha
name: Mirror 暗色语义卡片
description: 状态概览、分类卡片、轻量产品介绍
colors:
  primary: '#e9e7d7'
  background: '#111111'
  surface: '#1a1a1a'
  accent: '#e9e7d7'
  category-mint: '#99d8ba'
  category-yellow: '#efda78'
  border: '#343434'
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
  id: mirror
  revision: '1'
  recorded_on: '2026-10-03'
  evidence: reference-derived
  parameter_policy: proposed-reproduction-values-not-original-css
  references:
  - file: mirror.png
    sha256: 69c45abe0804ec58abb6e860ad6383c4dadd2615db6620f2d080994748c9bbe4
  original_notes: mirror.md
---

## Overview

状态概览、分类卡片、轻量产品介绍。这是一份可执行的近似复现建议，不是从原站CSS完整逆向得到。除明确列出的测量证据外，字体、字号、间距、圆角和部分颜色都属于专家初始参数，不能说用户已逐项认可。

参考画面（公共包未附原图，请查看来源链接）

[原有拆解与来源](mirror.md)。

### 取值依据

- background #111111、surface #1A1A1A为归档截图高频像素；其他颜色与排印为复现建议。

## Colors

YAML中的background是底色，primary是主要文字或主前景；surface承载分组，accent用于少量注意力。颜色角色按本预设解释，不因为名称叫primary就把它铺满按钮。颜色来自截图时只是像素证据，不能当CSS测量；对比度需在实际字号与背景组合上检查。

## Typography

中文正文与拉丁正文分别使用 YAML 的 body-zh / body-latin；标题使用 h1-zh / h1-latin。正文必须小于标题，代码用独立等宽层级。拉丁片段沿用中文段落行盒，不因内联字号变动制造不齐行距。实际字体不可用时先说明替代，不悄悄声称原样复现。

## Layout

低亮度容器搭配柔和分类色，卡片大小服务信息层级；桌面任务不沿用手机壳装饰。

## Elevation & Depth

优先用色阶与分隔组织主次，阴影只在有层级意义时使用。参考图中的品牌图片和装饰不属于可直接复用资产。

## Shapes

rounded是当前复现参数；保持同类容器一致，不以统一大圆角抹掉信息层级。

## Components

暗底暖白、分组色、适度圆角。

## Do's and Don'ts

- 颜色必须配文字/图标；不把红黄告警语义混成装饰，也不继承人格分类业务含义。
- 用户明确点名预设且任务范围完整时，简短说明采用哪一版后直接实现，不重新做风格A/B；必要业务信息缺失时只问缺项。
- 需要改变核心配色、字体角色或密度时再确认变化，不要求用户逐项审查设计参数。
- 每次应用由Agent检查渲染、字体实际加载、文字/图表溢出与单位/状态完整性；不能承诺不再需要任何视觉检查。
- x-preset是本库溯源扩展字段；主体按Google DESIGN.md alpha组织，已做YAML语法和本地引用检查，未运行官方CLI，未宣称严格兼容验证通过。
