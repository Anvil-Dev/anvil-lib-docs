---
title: Rendering 渲染
prev: false
next: false
---

# 渲染模块 <Badge type="tip" text="26.1 only" />

> **可用性**: 本模块**仅**在 Minecraft **26.1** 版本中存在。所有更早的版本（1.21.1 至 1.21.11）均不包含此模块。

包 `dev.anvilcraft.lib.v2.rendering` 提供了泛光（Bloom）后处理效果以及一套通用的 UBO（Uniform Buffer Object）布局定义框架，并通过
Mixin 集成到 Minecraft 的 GUI 渲染和主渲染流程中。

## 文档索引

| 文档                    | 内容                                                           |
|-----------------------|--------------------------------------------------------------|
| [泛光后处理](./bloom)      | `BloomPostEffect`、`BloomRenderCallback`、多 Pass 处理链           |
| [UBO 框架](./ubo)       | `UboObject`、`UboLayoutDefinition`、`UboLayoutEntry`、STD140 布局 |
| [渲染集成](./integration) | `ALRendering`、Mixin、`LibGuiElementRenderState`、着色器管线         |
| [SDF 2D 图形](./sdf)    | `SdfGraphics`、`Sdf2d`、`SdfParameters`、7 种图形类型                |

## 模块结构

- **主类**: `ALRendering` — 模组入口，创建管线，注册事件
- **后处理**: `BloomPostEffect` — 泛光效果多 Pass 处理链
- **UBO 框架**: `foundation.ubo` 包 — 类型安全的 ST140 布局定义
- **着色器**: `blit.vsh`, `blur.fsh`, `apply_bloom.fsh`, `down_sample.fsh`, `up_sample.fsh`
- **Mixin**: `GuiRendererMixin`, `MinecraftMixin` — 渲染流程嵌入

> 该模块仅在 Minecraft 26.1 版本中存在（`module.rendering`）。

## 注意事项

- 泛光效果依赖大量 RenderTarget 创建，限定客户端环境
- 所有 GPU 资源由 `GpuDevice` 创建，生命周期跟随 `BloomPostEffect` 实例
- Mixin 修改 `GuiRenderer` 内部行为，可能与其它渲染模组冲突
