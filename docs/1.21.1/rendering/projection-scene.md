# 结构投影场景与网格 (ProjectionScene / Shaders)

在世界或蓝图界面中渲染半透明“幽灵建筑投影”时，传统做法往往在每帧遍历结构坐标并直接调用 `BlockRenderDispatcher`，不仅每帧都会产生大量 Java 对象分配与方块面剔除开销，还会使同一模型内的重叠半透明面相互打架。

`dev.anvilcraft.lib.v2.rendering.projection` 通过**场景快照与着色器分离**解决上述问题：

1. 使用 `ProjectionScene` 作为只读 `BlockAndTintGetter`，集中收集需要投影的方块、可选方块实体、流体与实体快照，并重定向生物群系着色坐标。
2. `ProjectionShaders` 在客户端 `RegisterShadersEvent` 自动注册半透明投影核心着色器 `anvillib_rendering:projection`，并在资源重载后通知渲染器重建网格。

## 构建投影场景 (`ProjectionScene`)

### 设计意图

原版方块和流体渲染器需要一个 `BlockAndTintGetter` 来查询邻接方块（用于面剔除和环境光遮蔽 `AO`）、流体连接形态以及水/草地等的生物群系染色（`ColorResolver`）。

- 如果直接把真实世界 `ClientLevel` 传给方块渲染器，结构边缘与真实世界方块的交界处会发生错误剔除。
- 如果完全新建空世界，水、树叶等染色方块又会丢失当前所在生物群系的色调。

`ProjectionScene` 的职责正是充当一个**坐标系独立于世界、但生物群系着色代理自参考关卡**的隔离方块视图：

- 内部仅保存通过 `put(...)` 写入的结构方块和 `addEntity(...)` 添加的实体；未写入的坐标统一返回 `Blocks.AIR.defaultBlockState()`。
- `getBlockTint(pos, resolver)` 不会用局部结构坐标去查询染色，而是将其映射为绑定到参考 `level` 与锚点 `tintPos` 的着色结果，从而让远离锚点放置的结构模板在各处都能保持正确或一致的生物群系颜色。
- 所有亮度查询（`getBrightness`、`getRawBrightness`）固定返回满亮度 `15`，`isOutsideBuildHeight` 固定返回 `false`，保证投影在黑暗矿洞或任意 Y 轴位置均清晰可见。

### 完整代码示例

下面演示如何将一组结构坐标与自定义机器实体写入 `ProjectionScene`，并指定渲染时的统一采样锚点：

```java
package com.example.examplemod.client;

import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public final class BlueprintProjectionExample {
    public static ProjectionScene buildDemoScene(ClientLevel level, BlockPos anchorPos) {
        // 以真实世界 level 和结构基准点 anchorPos 构造投影场景
        ProjectionScene scene = new ProjectionScene(level, anchorPos);

        // 1. 写入普通方块（使用局部相对坐标，例如从 (0, 0, 0) 开始）
        scene.put(BlockPos.ZERO, Blocks.STONE_BRICKS.defaultBlockState(), null);
        scene.put(new BlockPos(1, 0, 0), Blocks.WATER.defaultBlockState(), null);

        // 2. 写入带方块实体的方块（例如箱子，用于后续渲染动态宝箱盖）
        BlockPos chestPos = new BlockPos(0, 1, 0);
        BlockState chestState = Blocks.CHEST.defaultBlockState();
        if (chestState.getBlock() instanceof ChestBlock) {
            ChestBlockEntity chestBe = new ChestBlockEntity(chestPos, chestState);
            scene.put(chestPos, chestState, chestBe);
        }

        // 3. 写入静态展示实体（坐标同样处于场景局部空间）
        ArmorStand previewStand = new ArmorStand(level, 1.5, 1.0, 0.5);
        scene.addEntity(previewStand);

        return scene;
    }

    public static void bakeIntoRenderer(ProjectionRenderer renderer, BlockPos anchorPos) {
        ClientLevel level = Minecraft.getInstance().level;
        if (level == null) {
            return;
        }
        ProjectionScene scene = buildDemoScene(level, anchorPos);
        // 以 160/255 透明度预烘焙为 GPU VBO
        renderer.rebuild(scene, 160);
    }
}
```

### 自定义生物群系着色钩子

如果需要覆盖默认按 `tintPos` 委托给参考 `level.getBlockTint(...)` 的行为（例如强制在无世界的 GUI 预览中为水染上固定色调），可以使用带 `ToIntBiFunction<BlockPos, ColorResolver>` 的重载构造器：

```java
ProjectionScene fixedTintScene = new ProjectionScene(
    level,
    BlockPos.ZERO,
    (pos, resolver) -> 0x3F76E4
);
```

## 着色器注册与重载代数 (`ProjectionShaders`)

`ProjectionShaders` 通过 `@EventBusSubscriber(modid = AnvilLibRendering.MOD_ID, value = Dist.CLIENT)` 监听客户端模组总线上的 `RegisterShadersEvent`。开发者**无需手动调用注册方法**，仅需了解其对渲染器有效性的影响：

- 启动时及每次资源重载（如玩家按 `F3+T` 切换光影/材质包）时，NeoForge 触发 `RegisterShadersEvent`。
- `ProjectionShaders.register(RegisterShadersEvent)` 会加载核心着色器 `anvillib_rendering:projection`（顶点格式 `DefaultVertexFormat.BLOCK`），递增内部代数计数器 `generation`，并清空内部缓存的 `ProjectionRenderTypes`。
- 下次调用渲染时，旧 `ProjectionRenderer` 的 `isValid()` 将返回 `false`，提示调用方重新 `rebuild(...)` 以匹配新着色器实例。

## 内部网格与缓冲区架构说明

为了保持外部 API 简洁，以下组件在 `dev.anvilcraft.lib.v2.rendering.projection` 中声明为**包级私有（package-private）**：

| 内部组件 | 职责简述 |
| --- | --- |
| `ProjectionMesh` | 在 `rebuild` 时收集所有结构坐标，为每个坐标分配渲染层分片（`vertexEnds`）并按层上传静态 `VertexBuffer` |
| `GhostConsumer` | 包装顶点写入器，将颜色 Alpha 通道调制为投影目标透明度，同时固定光照坐标为全亮 |
| `ProjectionBuffers` | 管理 `rebuild` 期间使用的临时 `ByteBufferBuilder` 与 `MultiBufferSource.BufferSource` 分层缓冲 |
| `ProjectionRenderTypes` | 根据方块原始 `RenderType` 与 `depthOnly` 标记生成半透明或纯写深度的投影 `RenderType` |
| `ProjectionOverlay` | 生成并绘制用于“状态错误（黄框）”与“方块错误（红框）”的自包含线框/高亮盒缓冲 |

## 公开 API 签名与参数细节

### `ProjectionScene`

包名：`dev.anvilcraft.lib.v2.rendering.projection` · 实现：`net.minecraft.world.level.BlockAndTintGetter`

#### 构造器

| 签名 | 参数说明 | 说明 |
| --- | --- | --- |
| `ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)` | `level`: 参考背景视图；`tintPos`: 生物群系染色参考坐标 | 默认通过 `level.getBlockTint(tintPos, resolver)` 获取染色 |
| `ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | `tint`: 自定义染色函数，入参为请求的 `(pos, resolver)` | 自定义全部生物群系染色计算逻辑 |

#### 数据写入与构建方法

| 方法签名 | 参数说明 | 行为说明 |
| --- | --- | --- |
| `void put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | `pos`: 场景局部坐标；`state`: 方块状态；`blockEntity`: 可选方块实体 | 存入状态并自动扩展场景内部记录的最小/最大 Y 轴范围；若 `blockEntity != null` 则关联到该坐标 |
| `void addEntity(Entity entity)` | `entity`: 需随投影一起渲染的实体 | 将实体加入场景实体列表 |

#### `BlockAndTintGetter` 与高度边界实现

| 方法签名 | 返回值 / 行为 |
| --- | --- |
| `BlockState getBlockState(BlockPos pos)` | 返回对应局部坐标的 `BlockState`，未存入时返回 `Blocks.AIR.defaultBlockState()` |
| `FluidState getFluidState(BlockPos pos)` | 返回 `getBlockState(pos).getFluidState()` |
| `@Nullable BlockEntity getBlockEntity(BlockPos pos)` | 返回对应坐标关联的方块实体（可为 `null`） |
| `int getHeight()` | 返回所有已写入方块构成的垂直跨度高度 |
| `int getMinBuildHeight()` | 返回已写入方块的最小 Y 坐标 |
| `boolean isOutsideBuildHeight(BlockPos pos)` | 恒返回 `false` |
| `boolean isOutsideBuildHeight(int y)` | 恒返回 `false` |
| `float getShade(Direction direction, boolean shade)` | 委托给构造传入的 `level` |
| `LevelLightEngine getLightEngine()` | 委托给构造传入的 `level` |
| `int getBlockTint(BlockPos pos, ColorResolver colorResolver)` | 使用构造传入的 `tintPos` / 自定义 `tint` 解析颜色 |
| `int getBrightness(LightLayer lightType, BlockPos pos)` | 恒返回 `15` |
| `int getRawBrightness(BlockPos pos, int amount)` | 恒返回 `15` |
| `ModelData getModelData(BlockPos pos)` | 检查 `BlockEntity` 存在时返回 `blockEntity.getModelData()`，否则返回 `ModelData.EMPTY` |

### `ProjectionShaders`

包名：`dev.anvilcraft.lib.v2.rendering.projection` · 注解：`@EventBusSubscriber(modid = AnvilLibRendering.MOD_ID, value = Dist.CLIENT)`

| 方法签名 | 触发时机 | 说明 |
| --- | --- | --- |
| `static void register(RegisterShadersEvent event)` | 客户端模组事件总线触发着色器注册时 | 注册 `anvillib_rendering:projection`（`DefaultVertexFormat.BLOCK`），更新代际并刷新内部渲染层缓存 |
