# 缓存方块实体渲染 (`CachedBlockEntityRenderer` / `CachedBER`)

<BranchContextCard branch="26.2" />

在原版 Minecraft 中，所有带有 `BlockEntityRenderer` (`BER`) 的方块实体即使外观完全静止或极少变化（例如展示柜中的物品、静态管道、多方块组件装饰），也会在**每一帧**重新提取 `BlockEntityRenderState`、重新通过 CPU 组装顶点并提交绘制调用（Draw Call）。当基地内摆放了上千个此类方块实体时，客户端帧率会急剧下降。

`dev.anvilcraft.lib.v2.rendering.cachedber` 包提供了一套**按区块（`ChunkPos`）合并烘焙 VBO 的缓存方块实体渲染管线（`CachedBlockEntityRenderingPipeline`）**：
- 同一个区块（16×16 水平范围）内所有注册了 `CachedBlockEntityRenderer` 的方块实体，其几何体会被离线烘焙合并到该区块专属的 `CachedRenderingChunk` 顶点缓冲（`GpuBuffer`）中；
- 只要方块实体状态未发生变更，后续每一帧每个区块每个 `RenderType` **只需执行一次 `drawIndexed`**（无需每帧在 CPU 侧遍历方块实体）；
- 当某个方块实体数据更新时，调用 `CachedBlockEntityRenderingPipeline.getInstance().update(blockEntity)` 即可触发所属区块的增量重建；
- 半透明图层（`renderType.sortOnUpload() == true`）在相机移动时自动通过 `ALRMeshSorting.byDistance` 重新排序索引缓冲，并原生支持 `ALRRenderTypeExtension` 泛光图层联动！

---

## 一、 完整代码示例：实现并注册 `CachedBlockEntityRenderer`

### 1. 第一步：定义渲染状态与 `CachedBlockEntityRenderer`

```java
package com.example.mymod.client.renderer;

import com.example.mymod.block.entity.PedestalBlockEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderDispatcher;
import dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderState;
import dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderer;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

public class PedestalCachedRenderer implements CachedBlockEntityRenderer<PedestalBlockEntity, PedestalCachedRenderer.State> {

    public static class State extends CachedBlockEntityRenderState {
        public final ItemStackRenderState displayedItem = new ItemStackRenderState();
        public int lightCoords;
    }

    @Override
    public State createRenderState() {
        return new State();
    }

    @Override
    public State extractRenderState(PedestalBlockEntity be, State state, float partialTicks, Camera camera) {
        state.blockPos = be.getBlockPos();
        state.blockState = be.getBlockState();
        state.blockEntityType = be.getType();
        if (be.getLevel() != null) {
            state.lightCoords = LevelRenderer.getLightColor(be.getLevel(), be.getBlockPos().above());
        }
        ItemStack stack = be.getDisplayedItem();
        Minecraft.getInstance().getItemModelResolver().updateForTopItem(
            state.displayedItem,
            stack,
            ItemDisplayContext.FIXED,
            be.getLevel(),
            null,
            0
        );
        return state;
    }

    @Override
    public void submit(
        State state,
        PoseStack poseStack,
        SubmitNodeCollector collector,
        CameraRenderState camera
    ) {
        if (state.displayedItem.isEmpty()) return;
        poseStack.pushPose();
        // 注意：RebuildTask 在调用 submit 前已将 poseStack 平移到了该方块在区块内的相对坐标 (x - minChunkX, y, z - minChunkZ)
        poseStack.translate(0.5f, 1.25f, 0.5f);
        state.displayedItem.submit(poseStack, collector, state.lightCoords, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY, 0);
        poseStack.popPose();
    }
}
```

### 2. 第二步：在客户端初始化时注册，并在方块实体数据变更时通知更新

```java
package com.example.mymod.client;

import com.example.mymod.block.entity.PedestalBlockEntity;
import com.example.mymod.client.renderer.PedestalCachedRenderer;
import com.example.mymod.init.ModBlockEntities;
import dev.anvilcraft.lib.v2.rendering.cachedber.pipeline.CachedBlockEntityRenderingPipeline;
import dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderDispatcher;

public final class PedestalClientHelper {
    public static void onClientSetup() {
        // 注册缓存方块实体渲染器
        CachedBlockEntityRenderDispatcher.INSTANCE.registerRenderer(
            ModBlockEntities.PEDESTAL_BE,
            new PedestalCachedRenderer()
        );
    }

    /**
     * 当客户端收到方块实体同步包或状态改变时调用此方法触发所在区块缓存重建
     */
    public static void notifyPedestalChanged(PedestalBlockEntity be) {
        CachedBlockEntityRenderingPipeline pipeline = CachedBlockEntityRenderingPipeline.getInstance();
        if (pipeline != null) {
            // 传入 forced = true 强制重编译当前区块的缓存网格
            pipeline.update(be, true);
        }
    }
}
```

---

## 二、 公开类与接口 API 详解

### 1. `CachedBlockEntityRenderer<T, S>` 与 `CachedBlockEntityRenderState`

| 接口 / 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `CachedBlockEntityRenderState` | `public abstract class CachedBlockEntityRenderState extends BlockEntityRenderState` | 缓存方块实体渲染状态基类。**注意**：请确保在 `extractRenderState` 中为 `state.blockEntityType = blockEntity.getType()` 赋值，因为 `CachedBlockEntityRenderDispatcher#submit` 会根据 `renderState.blockEntityType` 查找对应的渲染器！ |
| `CachedBlockEntityRenderer<T, S>` | • `S createRenderState()`<br>• `S extractRenderState(T blockEntity, S state, float partialTicks, Camera camera)`<br>• `void submit(S renderState, PoseStack poseStack, SubmitNodeCollector submitNodeCollector, CameraRenderState camera)` | 缓存方块实体渲染器接口。在区块网格重建（`RebuildTask`）时调用 `extractRenderState` 与 `submit`。 |

### 2. `CachedBlockEntityRenderDispatcher`（渲染器注册与分发器）

位于 `dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderDispatcher`，通过静态单例 `CachedBlockEntityRenderDispatcher.INSTANCE` 访问：

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public <T extends BlockEntity, S extends CachedBlockEntityRenderState> void registerRenderer(BlockEntityType<T> type, CachedBlockEntityRenderer<T, S> renderer)` | `void` | 为指定 `BlockEntityType` 注册缓存渲染器。 |
| `public <T extends BlockEntity, S extends CachedBlockEntityRenderState> void registerRenderer(Supplier<BlockEntityType<T>> type, CachedBlockEntityRenderer<T, S> renderer)` | `void` | 接收 `Supplier`（如 `DeferredHolder` / `BlockEntityEntry`）的便捷注册重载。 |
| `public boolean hasRenderer(BlockEntity be)` | `boolean` | 检查指定方块实体是否注册了 `CachedBlockEntityRenderer`。 |
| `public <E extends BlockEntity, S extends CachedBlockEntityRenderState> @Nullable S tryExtractRenderState(E blockEntity, float partialTicks, Camera camera)` | `@Nullable S` | 创建并提取指定方块实体的渲染状态。 |
| `public <S extends CachedBlockEntityRenderState> void submit(S renderState, PoseStack poseStack, SubmitNodeCollector submitNodeCollector, CameraRenderState camera)` | `void` | 将渲染状态提交至收集器。 |

### 3. `CachedBlockEntityRenderingPipeline`（区块缓存渲染管线）

位于 `dev.anvilcraft.lib.v2.rendering.cachedber.pipeline.CachedBlockEntityRenderingPipeline`。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static @Nullable CachedBlockEntityRenderingPipeline getInstance()` | `@Nullable CachedBlockEntityRenderingPipeline` | 获取当前客户端世界（`ClientLevel`）对应的渲染管线实例；若未进入世界则返回 `null`。 |
| `public void update(BlockEntity be)` / `public void update(BlockEntity be, boolean forced)` | `void` | 通知管线某个方块实体已加载或更新。注意：若该 `be` 此前已在集合中且未移除，无参 `update(be)`（`forced = false`）不会重复触发重建；**当已存在的方块实体内部状态发生变化需要刷新模型时，请调用 `update(be, true)` 或 `forcedUpdate(be.getBlockPos())`**。 |
| `public void blockRemoved(BlockEntity be)` | `void` | 通知管线某个方块实体已被移除（由客户端区块卸载/方块实体移除钩子自动调用）。 |
| `public void forcedUpdate(BlockPos pos)` / `public void forcedUpdate()` | `void` | 强制重新编译指定坐标所在区块或全世界的全部缓存区块网格。 |
| `public CachedRenderingChunk getRenderRegion(ChunkPos chunkPos)` | `CachedRenderingChunk` | 获取或创建指定区块的缓存渲染区域对象。 |
| `public static boolean isCameraMoved()` | `boolean` | 判断当前帧相机位置相较上一帧是否发生了移动（用于触发半透明网格重新排序）。 |
