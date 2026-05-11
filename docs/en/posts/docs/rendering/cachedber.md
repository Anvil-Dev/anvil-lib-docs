---
title: Cached BlockEntity Rendering
prev: false
next: false
---

# Cached BlockEntity Rendering <Badge type="tip" text="26.1 only" />

The package `dev.anvilcraft.lib.v2.rendering.cachedber` provides a **cached block entity rendering pipeline**.
It compiles block entity render states into per-chunk cached data, avoiding repeated uploads each frame
and dramatically reducing draw call overhead.

## Core Components

### CachedBlockEntityRenderingPipeline

Per-level singleton and the central scheduler of the cached BER system. It maintains a `ChunkPos` to
`CachedRenderingChunk` map and manages compile and upload task queues.

Key methods:

| Method              | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `update(be)`        | Marks a block entity dirty and queues it for rebuild                        |
| `blockRemoved(be)`  | Cleans up cached data when a block is removed                               |
| `runTasks()`        | Executes compile/upload task queues (should be called from `LevelRenderer`) |
| `render(frustum)`   | Renders all cached chunks within the frustum                                |
| `forcedUpdate(pos)` | Forces an immediate update of the cache at the given position               |

### CachedRenderingChunk

One instance per chunk, holding the compiled render state for all block entities within that chunk.
Lifecycle is managed by `CachedBlockEntityRenderingPipeline`.

### CachedBlockEntityRenderer&lt;T, S&gt;

Block entity renderer interface, similar to Vanilla's `BlockEntityRenderer`, but the render output is
cached rather than resubmitted every frame.

```java
public interface CachedBlockEntityRenderer<T extends BlockEntity, S extends CachedBlockEntityRenderState> {
    S createRenderState();
    void extractRenderState(T be, S state, float partialTicks, Camera camera);
    void submit(S state, PoseStack pose, VertexConsumer collector, Camera camera);
}
```

### CachedBlockEntityRenderDispatcher

Render dispatcher singleton that manages all registered `CachedBlockEntityRenderer` instances. During
the compile phase it calls each renderer's `extractRenderState` and `submit` methods to produce cached data.

### RebuildTask

A rebuild task representing one pending dirty block entity. `CachedBlockEntityRenderingPipeline`
consumes these tasks in `runTasks()`, delegating to `CachedBlockEntityRenderDispatcher` to recompile
and upload render data.

### CachedBlockEntityRenderState

Base render state class, created by `CachedBlockEntityRenderer.createRenderState()`, carrying the
render data extracted from the block entity.
