---
title: Wheel 轮盘
prev: false
next: false
---

# 轮盘菜单模块 <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="enhanced: 1.21.5 / 1.21.6 / 26.1" />

包 `dev.anvilcraft.lib.v2.wheel` 提供了一套高度可定制的**环形菜单（Radial Menu）**
系统，支持点按（Tap）和长按（Hold）两种打开模式、自定义扇形/圆点选中效果、子菜单以及自定义渲染器。

## 文档索引

| 文档                | 内容                                                     |
|-------------------|--------------------------------------------------------|
| [API 模型层](./api)  | `WheelMenuModel`、`WheelEntry`、`WheelMenuBuilder`、页面和分页 |
| [客户端渲染](./client) | `WheelWidget`、`WheelScreen`、输入控制、着色器管道                 |

## 架构概览

| 包                         | 职责                             |
|---------------------------|--------------------------------|
| `api`                     | 数据模型（条目、页面、分页、打开模式），不依赖客户端类    |
| `client.gui.component`    | `WheelWidget` 控件，处理鼠标交互、动画和渲染  |
| `client.gui.screen`       | `WheelScreen` 屏幕宿主，管理页面堆栈和模式触发 |
| `client.gui.render.state` | GUI 渲染状态（圆环、选中效果自定义着色器）        |
| `client.init`             | 着色器管道、动态 Uniform 缓冲            |
| `client.input`            | `WheelScreenController` 输入处理   |

## 注意事项

- `client` 包下的类仅能在物理客户端使用
- 动态 Uniform 使用帧内缓存，避免频繁重建 `WheelWidget`
- `GlobalRendererMixin`（来自渲染模块）必须存在方可显示自定义管道
- 子菜单仅支持一层嵌套（`WheelSubmenuBuilder`）
