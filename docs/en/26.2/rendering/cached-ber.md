# Cached Block Entity Rendering (`CachedBlockEntityRenderer` / `CachedBER`)

<BranchContextCard branch="26.2" />

In vanilla Minecraft, all block entities with a `BlockEntityRenderer` (`BER`) re-extract `BlockEntityRenderState`, rebuild vertices on the CPU, and issue draw calls **every single frame**, even when completely static or rarely changing (display cases, static pipes, multiblock decorations). Placing thousands of such block entities in a base causes client frame rates to plummet.

`dev.anvilcraft.lib.v2.rendering.cachedber` provides a **chunk-batched (`ChunkPos`) baked-VBO cached block entity rendering pipeline (`CachedBlockEntityRenderingPipeline`)**:
- All block entities with a registered `CachedBlockEntityRenderer` in the same chunk (16×16 horizontal area) have their geometry baked offline into that chunk's `CachedRenderingChunk` vertex buffer (`GpuBuffer`);
- As long as the block entity state does not change, each chunk and `RenderType` **only issues a single `drawIndexed` per frame** (with zero per-frame CPU iteration over block entities);
- When a block entity's data updates, calling `CachedBlockEntityRenderingPipeline.getInstance().update(blockEntity)` triggers an incremental rebuild of its chunk;
- Translucent layers (`renderType.sortOnUpload() == true`) automatically re-sort their index buffers via `ALRMeshSorting.byDistance` when the camera moves, with native `ALRRenderTypeExtension` bloom layer support!

---

## 1. Full Code Example: Implementing & Registering `CachedBlockEntityRenderer`

### 1. Step 1: Define RenderState & `CachedBlockEntityRenderer`

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
        // Note: RebuildTask has already translated poseStack to the block's chunk-relative coordinates (x - minChunkX, y, z - minChunkZ) before calling submit
        poseStack.translate(0.5f, 1.25f, 0.5f);
        state.displayedItem.submit(poseStack, collector, state.lightCoords, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY, 0);
        poseStack.popPose();
    }
}
```

### 2. Step 2: Register on Client Init & Notify Updates on Data Change

```java
package com.example.mymod.client;

import com.example.mymod.block.entity.PedestalBlockEntity;
import com.example.mymod.client.renderer.PedestalCachedRenderer;
import com.example.mymod.init.ModBlockEntities;
import dev.anvilcraft.lib.v2.rendering.cachedber.pipeline.CachedBlockEntityRenderingPipeline;
import dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderDispatcher;

public final class PedestalClientHelper {
    public static void onClientSetup() {
        // Register the cached block entity renderer
        CachedBlockEntityRenderDispatcher.INSTANCE.registerRenderer(
            ModBlockEntities.PEDESTAL_BE,
            new PedestalCachedRenderer()
        );
    }

    /**
     * Call this on the client when a block entity sync packet arrives or state changes to trigger chunk cache rebuild
     */
    public static void notifyPedestalChanged(PedestalBlockEntity be) {
        CachedBlockEntityRenderingPipeline pipeline = CachedBlockEntityRenderingPipeline.getInstance();
        if (pipeline != null) {
            // Pass forced = true to force recompiling the current chunk's cached mesh
            pipeline.update(be, true);
        }
    }
}
```

---

## 2. Public Classes & Interfaces API Reference

### 1. `CachedBlockEntityRenderer<T, S>` & `CachedBlockEntityRenderState`

| Interface / Class | Method Signatures | Description |
| :--- | :--- | :--- |
| `CachedBlockEntityRenderState` | `public abstract class CachedBlockEntityRenderState extends BlockEntityRenderState` | Base render state class for cached block entities. **Note**: ensure `state.blockEntityType = blockEntity.getType()` is set in `extractRenderState`, as `CachedBlockEntityRenderDispatcher#submit` looks up the renderer by `renderState.blockEntityType`! |
| `CachedBlockEntityRenderer<T, S>` | • `S createRenderState()`<br>• `S extractRenderState(T blockEntity, S state, float partialTicks, Camera camera)`<br>• `void submit(S renderState, PoseStack poseStack, SubmitNodeCollector submitNodeCollector, CameraRenderState camera)` | Cached block entity renderer interface. `extractRenderState` and `submit` are invoked during chunk mesh rebuild (`RebuildTask`). |

### 2. `CachedBlockEntityRenderDispatcher` (Renderer Registry & Dispatcher)

Located in `dev.anvilcraft.lib.v2.rendering.cachedber.renderer.CachedBlockEntityRenderDispatcher`, accessed via `CachedBlockEntityRenderDispatcher.INSTANCE`:

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public <T extends BlockEntity, S extends CachedBlockEntityRenderState> void registerRenderer(BlockEntityType<T> type, CachedBlockEntityRenderer<T, S> renderer)` | `void` | Registers a cached renderer for the specified `BlockEntityType`. |
| `public <T extends BlockEntity, S extends CachedBlockEntityRenderState> void registerRenderer(Supplier<BlockEntityType<T>> type, CachedBlockEntityRenderer<T, S> renderer)` | `void` | Convenience overload accepting a `Supplier` (such as `DeferredHolder` / `BlockEntityEntry`). |
| `public boolean hasRenderer(BlockEntity be)` | `boolean` | Checks whether the given block entity has a registered `CachedBlockEntityRenderer`. |
| `public <E extends BlockEntity, S extends CachedBlockEntityRenderState> @Nullable S tryExtractRenderState(E blockEntity, float partialTicks, Camera camera)` | `@Nullable S` | Creates and extracts the render state for the given block entity. |
| `public <S extends CachedBlockEntityRenderState> void submit(S renderState, PoseStack poseStack, SubmitNodeCollector submitNodeCollector, CameraRenderState camera)` | `void` | Submits the render state to the collector. |

### 3. `CachedBlockEntityRenderingPipeline` (Chunk Cached Rendering Pipeline)

Located in `dev.anvilcraft.lib.v2.rendering.cachedber.pipeline.CachedBlockEntityRenderingPipeline`.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static @Nullable CachedBlockEntityRenderingPipeline getInstance()` | `@Nullable CachedBlockEntityRenderingPipeline` | Returns the pipeline instance for the current `ClientLevel`, or `null` if not in a world. |
| `public void update(BlockEntity be)` / `public void update(BlockEntity be, boolean forced)` | `void` | Notifies the pipeline that a block entity was loaded or updated. Note: if `be` is already in the set and unremoved, 1-arg `update(be)` (`forced = false`) will not re-trigger a rebuild; **when an existing block entity's internal state changes and its model must refresh, call `update(be, true)` or `forcedUpdate(be.getBlockPos())`**. |
| `public void blockRemoved(BlockEntity be)` | `void` | Notifies the pipeline that a block entity was removed (called automatically by client chunk-unload/BE-removal hooks). |
| `public void forcedUpdate(BlockPos pos)` / `public void forcedUpdate()` | `void` | Forces recompiling the cached mesh of the chunk at `pos` or all chunks in the world. |
| `public CachedRenderingChunk getRenderRegion(ChunkPos chunkPos)` | `CachedRenderingChunk` | Gets or creates the cached render region for `chunkPos`. |
| `public static boolean isCameraMoved()` | `boolean` | Checks whether the camera position moved compared to the previous frame (used to trigger translucent mesh re-sorting). |
