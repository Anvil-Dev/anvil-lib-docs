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
| [Cached BlockEntity Rendering](./cachedber) | CachedBER pipeline, CachedBlockEntityRenderer, RebuildTask |

## Module Structure

- **Main class**: `AnvilLibRendering` (formerly `ALRendering`) -- ALR to AnvilLib rename, mod entry point, creates pipelines, registers events
- **CachedBER pipeline**: `cachedber` package -- `CachedBlockEntityRenderingPipeline`, `CachedRenderingChunk`, `RebuildTask`, `CachedBlockEntityRenderDispatcher`, `CachedBlockEntityRenderer<T,S>`
- **Post-processing**: `BloomPostEffect` -- Bloom effect multi-pass processing chain, `ALRPostEffects` -- bloom post effect singleton, `runBloomDraws()`
- **UBO framework**: `foundation.buffers.ubo` package (moved from `foundation.ubo` after `foundation/` restructuring) -- Type-safe STD140 layout definitions
- **Foundation reorganization**: `foundation/` directory restructured: `buffers/ubo/`, new `compound/` package (`CompoundSubmitNode`), new `ALRMeshSorting.java`, `BloomSubmitNodeStorage.java`; new in `buffers/`: `EmptyBufferSource`, `EmptyOutlineBufferSource`, `EmptyVertexConsumer`, `FullyBufferedBufferSource`, `VertexBufferHost`
- **Render types**: `extension/ALRRenderTypeExtension.java` -- render type extension, `mixins/RenderTypeMixin.java` -- render type mixin
- **Shaders**: `blit.vsh`, `blur.fsh`, `apply_bloom.fsh`, `down_sample.fsh`, `up_sample.fsh`
- **Mixin**: `GuiRendererMixin`, `MinecraftMixin` -- Rendering pipeline embedding

> This module only exists in Minecraft 26.1 (`module.rendering`).

## Notes

- The bloom effect depends on creating a significant number of RenderTargets, restricted to client-side environments
- All GPU resources are created by `GpuDevice`, with lifecycle tied to the `BloomPostEffect` instance
- Mixin modifies `GuiRenderer` internal behavior and may conflict with other rendering mods
