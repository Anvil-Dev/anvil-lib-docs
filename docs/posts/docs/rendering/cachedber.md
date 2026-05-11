---
title: Cached BlockEntity 渲染
prev: false
next: false
---

# Cached BlockEntity 渲染 <Badge type="tip" text="26.1 only" />

包 `dev.anvilcraft.lib.v2.rendering.cachedber` 提供了一套**缓存式方块实体渲染管线**，通过将方块实体的渲染状态编译为
per-chunk 的缓存数据，在每帧渲染时避免重复上传，从而大幅降低 Draw Call 开销。

## 核心组件

### CachedBlockEntityRenderingPipeline

Per-level 单例，是缓存 BER 系统的核心调度器。它维护一个 `ChunkPos` 到 `CachedRenderingChunk` 的映射表，管理编译任务队列和上传任务队列。

主要方法：

| 方法                | 说明                              |
|-------------------|---------------------------------|
| `update(be)`       | 标记方块实体为脏，加入重建队列               |
| `blockRemoved(be)` | 方块被移除时清理缓存数据                   |
| `runTasks()`       | 执行编译/上传任务队列（应在 `LevelRenderer` 中调用） |
| `render(frustum)`  | 渲染视锥体内的所有缓存渲染区块                |
| `forcedUpdate(pos)` | 强制立即更新指定位置的缓存                  |

### CachedRenderingChunk

每个区块一个实例，持有该区块内所有方块实体编译后的渲染状态。由 `CachedBlockEntityRenderingPipeline` 管理生命周期。

### CachedBlockEntityRenderer&lt;T, S&gt;

方块实体渲染器接口，类似 Vanilla 的 `BlockEntityRenderer`，但渲染结果会被缓存而非每帧重新提交。

```java
public interface CachedBlockEntityRenderer<T extends BlockEntity, S extends CachedBlockEntityRenderState> {
    S createRenderState();
    void extractRenderState(T be, S state, float partialTicks, Camera camera);
    void submit(S state, PoseStack pose, VertexConsumer collector, Camera camera);
}
```

### CachedBlockEntityRenderDispatcher

渲染调度单例，管理所有注册的 `CachedBlockEntityRenderer`，在编译阶段调用各渲染器的 `extractRenderState`
和 `submit` 方法生成缓存数据。

### RebuildTask

重建任务，代表一个待处理的脏方块实体。`CachedBlockEntityRenderingPipeline`
在 `runTasks()` 中消费这些任务，调用 `CachedBlockEntityRenderDispatcher` 重新编译并上传渲染数据。

### CachedBlockEntityRenderState

渲染状态基类，由 `CachedBlockEntityRenderer.createRenderState()` 创建，承载从方块实体提取的渲染数据。
