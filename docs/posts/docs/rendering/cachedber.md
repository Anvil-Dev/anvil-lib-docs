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

Per-level 单例，是缓存 BER 系统的核心调度器。通过 `CachedBlockEntityRenderingPipeline.getInstance()` 获取当前维度的实例。
它维护一个 `ChunkPos` 到 `CachedRenderingChunk` 的映射表，管理编译任务队列和上传任务队列。

主要方法：

| 方法                  | 说明                                  |
|---------------------|-------------------------------------|
| `update(be, true)`  | 标记方块实体为脏（第二个参数为客户端交互标记），加入重建队列      |
| `blockRemoved(be)`  | 方块被移除时清理缓存数据                        |
| `runTasks()`        | 执行编译/上传任务队列（应在 `LevelRenderer` 中调用） |
| `render(frustum)`   | 渲染视锥体内的所有缓存渲染区块                     |
| `forcedUpdate(pos)` | 强制立即更新指定位置的缓存                       |

### CachedRenderingChunk

每个区块一个实例，持有该区块内所有方块实体编译后的渲染状态。由 `CachedBlockEntityRenderingPipeline` 管理生命周期。

### CachedBlockEntityRenderer&lt;T, S&gt;

方块实体渲染器接口，类似 Vanilla 的 `BlockEntityRenderer`，但渲染结果会被缓存而非每帧重新提交。
泛型 `S` 必须继承自 `CachedBlockEntityRenderState`。

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

渲染状态基类，继承自 `BlockEntityRenderState`，由 `CachedBlockEntityRenderer.createRenderState()` 创建，
承载从方块实体提取的渲染数据。

## 使用指南

### 注册渲染器

在 `FMLClientSetupEvent` 中通过 `CachedBlockEntityRenderDispatcher.INSTANCE` 注册自定义渲染器：

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

### 方块实体模式 (Tile)

方块实体需要覆写 `setRemoved()` 方法来通知管线清理缓存：

```java
@Override
public void setRemoved() {
    super.setRemoved();
    if (level != null && level.isClientSide()) {
        CachedBlockEntityRenderingPipeline.getInstance().blockRemoved(this);
    }
}
```

### 方块模式 (Block)

当方块实体在客户端发生需要重渲染的变化时，调用 `update` 方法标记为脏：

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

### 渲染状态类

自定义渲染状态需继承 `CachedBlockEntityRenderState`（其本身继承 `BlockEntityRenderState`）：

```java
public class MyRenderState extends CachedBlockEntityRenderState {
    // 存放从方块实体提取的渲染数据
    public float someValue;
    public int someColor;
}
```

### 自定义渲染器

实现 `CachedBlockEntityRenderer` 接口的三个方法：

```java
public class MyCachedRenderer implements CachedBlockEntityRenderer<MyBlockEntity, MyRenderState> {

    @Override
    public MyRenderState createRenderState() {
        return new MyRenderState();
    }

    @Override
    public void extractRenderState(MyBlockEntity be, MyRenderState state,
                                    float partialTicks, Camera camera) {
        // 从方块实体提取数据到渲染状态
        state.someValue = be.getSomeValue();
        state.someColor = be.getSomeColor();
    }

    @Override
    public void submit(MyRenderState state, PoseStack poseStack,
                       VertexConsumer collector, Camera camera) {
        // 编译渲染数据到 collector
        // ...
    }
}
```

### 发光 (Bloom) 集成

如需在 submit 中输出发光效果，通过 bloom 实例获取 Compound 存储：

```java
@Override
public void submit(MyRenderState state, PoseStack poseStack,
                   SubmitNodeCollector collector, CameraRenderState camera) {
    CompoundSubmitNodeStorage compoundSubmit =
        ALRPostEffects.getBloomPostEffect().createCompoundSubmitStorage(collector);

    // 使用 compoundSubmit 提交发光部分
    state.blockModelRenderState.submit(poseStack, compoundSubmit, light, overlay, 0);

    // 使用普通 collector 提交非发光部分
    // ...
}
```
