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

Per-level singleton and the central scheduler of the cached BER system. Access the current dimension's instance
via `CachedBlockEntityRenderingPipeline.getInstance()`. It maintains a `ChunkPos` to
`CachedRenderingChunk` map and manages compile and upload task queues.

Key methods:

| Method              | Description                                                                        |
|---------------------|------------------------------------------------------------------------------------|
| `update(be, true)`  | Marks a block entity dirty (second param is client interaction flag) and queues it |
| `blockRemoved(be)`  | Cleans up cached data when a block is removed                                      |
| `runTasks()`        | Executes compile/upload task queues (should be called from `LevelRenderer`)        |
| `render(frustum)`   | Renders all cached chunks within the frustum                                       |
| `forcedUpdate(pos)` | Forces an immediate update of the cache at the given position                      |

### CachedRenderingChunk

One instance per chunk, holding the compiled render state for all block entities within that chunk.
Lifecycle is managed by `CachedBlockEntityRenderingPipeline`.

### CachedBlockEntityRenderer&lt;T, S&gt;

Block entity renderer interface, similar to Vanilla's `BlockEntityRenderer`, but the render output is
cached rather than resubmitted every frame. The generic `S` must extend `CachedBlockEntityRenderState`.

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

Base render state class, extending `BlockEntityRenderState`, created by `CachedBlockEntityRenderer.createRenderState()`,
carrying the render data extracted from the block entity.

## Usage Guide

### Registering a Renderer

Register custom renderers in `FMLClientSetupEvent` via `CachedBlockEntityRenderDispatcher.INSTANCE`:

```java
@SubscribeEvent
public static void onClientSetup(FMLClientSetupEvent event) {
    event.enqueueWork(() -> {
        CachedBlockEntityRenderDispatcher.INSTANCE.registerRenderer(
            MyBlockEntityTypes.MY_BLOCK_ENTITY.get(),
            new MyCachedRenderer()
        );
    });
}
```

### Block Entity Pattern (Tile)

Override `setRemoved()` in your block entity to notify the pipeline to clean up cached data:

```java
@Override
public void setRemoved() {
    super.setRemoved();
    if (level != null && level.isClientSide()) {
        CachedBlockEntityRenderingPipeline.getInstance().blockRemoved(this);
    }
}
```

### Block Pattern

When a client-side change requires re-rendering the block entity, call `update` to mark it dirty:

```java
@Override
public InteractionResult use(BlockState state, Level level, BlockPos pos,
                              Player player, InteractionHand hand, BlockHitResult hit) {
    if (level.isClientSide()) {
        BlockEntity be = level.getBlockEntity(pos);
        if (be != null) {
            CachedBlockEntityRenderingPipeline.getInstance().update(be, true);
        }
    }
    return InteractionResult.sidedSuccess(level.isClientSide());
}
```

### Render State Class

Custom render states must extend `CachedBlockEntityRenderState` (which itself extends `BlockEntityRenderState`):

```java
public class MyRenderState extends CachedBlockEntityRenderState {
    // Holds render data extracted from the block entity
    public float someValue;
    public int someColor;
}
```

### Custom Renderer

Implement the three methods of the `CachedBlockEntityRenderer` interface:

```java
public class MyCachedRenderer implements CachedBlockEntityRenderer<MyBlockEntity, MyRenderState> {

    @Override
    public MyRenderState createRenderState() {
        return new MyRenderState();
    }

    @Override
    public void extractRenderState(MyBlockEntity be, MyRenderState state,
                                    float partialTicks, Camera camera) {
        // Extract data from block entity into render state
        state.someValue = be.getSomeValue();
        state.someColor = be.getSomeColor();
    }

    @Override
    public void submit(MyRenderState state, PoseStack poseStack,
                       VertexConsumer collector, Camera camera) {
        // Compile render data into collector
        // ...
    }
}
```

### Bloom Integration

To output bloom/glow effects in submit, obtain a Compound storage from the bloom instance:

```java
@Override
public void submit(MyRenderState state, PoseStack poseStack,
                   SubmitNodeCollector collector, CameraRenderState camera) {
    CompoundSubmitNodeStorage compoundSubmit =
        ALRPostEffects.getBloomPostEffect().createCompoundSubmitStorage(collector);

    // Use compoundSubmit for glow portions
    state.blockModelRenderState.submit(poseStack, compoundSubmit, light, overlay, 0);
    // ...
}
```
