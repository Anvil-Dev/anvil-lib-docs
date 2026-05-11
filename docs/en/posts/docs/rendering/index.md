---
title: Rendering
prev: false
next: false
---

# Rendering Module <Badge type="tip" text="26.1 only" />

::: warning Availability
This module **only** exists in Minecraft **26.1**. All earlier versions (1.21.1 through 1.21.11) do not include this module.
:::

The package `dev.anvilcraft.lib.v2.rendering` provides bloom post-processing effects and a general-purpose UBO (Uniform
Buffer Object) layout definition framework, integrated into Minecraft's GUI rendering and main rendering pipeline via
Mixin.

## Document Index

| Document                               | Content                                                               |
|----------------------------------------|-----------------------------------------------------------------------|
| [Bloom Post-Processing](./bloom)       | `BloomPostEffect`, `BloomRenderCallback`, multi-pass processing chain |
| [UBO Framework](./ubo)                 | `UboObject`, `UboLayoutDefinition`, `UboLayoutEntry`, STD140 layout   |
| [Rendering Integration](./integration) | `ALRendering`, Mixin, `LibGuiElementRenderState`, shader pipelines    |
| [SDF 2D Graphics](./sdf)               | `SdfGraphics`, `Sdf2d`, `SdfParameters`, 7 shape types                |

## Module Structure

- **Main class**: `ALRendering` -- Mod entry point, creates pipelines, registers events
- **Post-processing**: `BloomPostEffect` -- Bloom effect multi-pass processing chain
- **UBO framework**: `foundation.ubo` package -- Type-safe STD140 layout definitions
- **Shaders**: `blit.vsh`, `blur.fsh`, `apply_bloom.fsh`, `down_sample.fsh`, `up_sample.fsh`
- **Mixin**: `GuiRendererMixin`, `MinecraftMixin` -- Rendering pipeline embedding

> This module only exists in Minecraft 26.1 (`module.rendering`).

## Notes

- The bloom effect depends on creating a significant number of RenderTargets, restricted to client-side environments
- All GPU resources are created by `GpuDevice`, with lifecycle tied to the `BloomPostEffect` instance
- Mixin modifies `GuiRenderer` internal behavior and may conflict with other rendering mods
