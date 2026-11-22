# Structure Projection Rendering (`ProjectionScene` / `ProjectionRenderer` / `ProjectionFeatures`)

<BranchContextCard branch="26.3" />

For multiblock construction guides, blueprint previews, or machine work-area visualization, you often need a translucent **holographic structure projection (Ghost / Structure Projection)** in the real world—rendering static blocks, fluids, block entities (`BlockEntity`), and entities (`Entity`), while automatically comparing against real-world block states at corresponding coordinates:
- **Correctly placed blocks**: projection automatically hidden;
- **Air positions (not yet placed)**: translucent structure projection shown normally;
- **Right block type, wrong state properties (e.g., wrong facing)**: automatically overlaid with an **amber translucent highlight box** (`0x70FFCC00`);
- **Wrong block placed**: automatically overlaid with a **red translucent highlight box** (`0x70FF3333`).

`dev.anvilcraft.lib.v2.rendering.projection` implements this fully via **`ProjectionScene`**, **`ProjectionRenderer`**, and **`ProjectionFeatures`**, using two-pass **Depth Prepass + Color Blend Pass** rendering to eliminate messy internal face-overlap artifacts in translucent projections.

---

## 1. Core Design Mechanics

1. **Offline Scene Construction (`ProjectionScene`)**:
   Implements `BlockAndTintGetter`, completely independent of the real world. Call `scene.put(localPos, blockState, optionalBlockEntity)` and `scene.addEntity(entity)` to populate local-coordinate structures (block entities and entities are used only for render-state extraction and are never added to the real world or ticked).
2. **Mesh Baking & Resource Reload Awareness (`ProjectionRenderer#rebuild`)**:
   Calling `renderer.rebuild(scene, alpha)` (`alpha` in `0..255`) bakes all static blocks and fluids into a single `ProjectionMesh` GPU vertex buffer, recording `vertexEnds` offsets per local coordinate. When the client reloads resource packs (`ModelEvent.BakingCompleted`), `ProjectionRenderEvents` increments a global `generation`, causing `renderer.isValid()` to automatically become `false` so callers know to rebuild.
3. **World Comparison, Negative-Determinant Mirror Winding Fix & Shared Depth Prepass (`prepare` + `renderAll`)**:
   - Calling `renderer.render(poseStack, cameraState, level, worldOrigin)` (or batching multiple projections via `prepare` + `ProjectionRenderer.renderAll(preparedList)`) compares `origin + localPos` in the real world, building `missing`, `wrongStates`, and `wrongBlocks` `BitSet`s;
   - If `poseStack` contains a mirror transform (`pose.determinant3x3() < 0`), `ProjectionMesh` and `ProjectionFeatures` automatically flip quad vertex winding (`reverseWinding`) so backface culling does not make mirrored structures invisible;
   - `renderAll` first runs `depthOnly = true` (depth-only write) across all projections, then `depthOnly = false` (translucent color blend with `LESS_THAN_OR_EQUAL` depth test), and finally renders `ProjectionOverlay` wrong-state/wrong-block highlight boxes.

---

## 2. Full Code Example: Building & Rendering a Multiblock Hologram with State Validation

```java
package com.example.mymod.client.render;

import com.example.mymod.MyMod;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;
import net.minecraft.world.phys.Vec3;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;

@EventBusSubscriber(modid = MyMod.MOD_ID, value = Dist.CLIENT)
public final class KilnProjectionPreview {
    private static final ProjectionRenderer RENDERER = new ProjectionRenderer();
    private static BlockPos previewAnchor = new BlockPos(0, 64, 0);
    private static boolean active = false;

    private KilnProjectionPreview() {
    }

    public static void enablePreviewAt(BlockPos anchor) {
        previewAnchor = anchor.immutable();
        active = true;
        rebuildScene();
    }

    public static void disablePreview() {
        active = false;
        RENDERER.close();
    }

    private static void rebuildScene() {
        ClientLevel level = Minecraft.getInstance().level;
        if (level == null) return;

        // 1. Create a ProjectionScene using previewAnchor as the biome tint reference point
        ProjectionScene scene = new ProjectionScene(level, previewAnchor);

        // 2. Populate local-coordinate blocks (e.g., 3x1x3 base + center furnace)
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                scene.put(new BlockPos(dx, 0, dz), Blocks.STONE_BRICKS.defaultBlockState(), null);
            }
        }
        scene.put(
            new BlockPos(0, 1, 0),
            Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.LIT, true),
            null
        );

        // 3. Bake mesh at alpha 160 (~63% opacity)
        RENDERER.rebuild(scene, 160);
    }

    /**
     * Render during RenderLevelStageEvent.AfterLevel to avoid shader packs altering hologram colors
     */
    @SubscribeEvent
    public static void onRenderAfterLevel(RenderLevelStageEvent.AfterLevel event) {
        if (!active) return;
        ClientLevel level = Minecraft.getInstance().level;
        if (level == null) return;

        // Automatically rebuild if resource pack reload invalidated the bake
        if (!RENDERER.isValid()) {
            rebuildScene();
        }

        CameraRenderState camera = event.getLevelRenderState().cameraRenderState;
        Vec3 camPos = camera.pos;

        PoseStack poseStack = new PoseStack();
        // Translate to previewAnchor origin in camera-relative space
        poseStack.translate(
            previewAnchor.getX() - camPos.x,
            previewAnchor.getY() - camPos.y,
            previewAnchor.getZ() - camPos.z
        );

        // Render and compare against real block states at previewAnchor in level
        RENDERER.render(poseStack, camera, level, previewAnchor);
    }
}
```

---

## 3. Public Classes & Methods API Reference

### 1. `ProjectionScene` (Local Projection Scene View)

Implements `net.minecraft.client.renderer.block.BlockAndTintGetter`. Light brightness methods (`getBrightness` / `getRawBrightness`) always return full brightness `15`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)`<br>`public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | — | Constructs a projection scene. `tintPos` is the world reference coordinate used to compute biome colors for grass, leaves, and water (`pos.offset(tintPos)`). |
| `public void put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | `void` | Sets a block state and optional block entity at local `pos` (passing `null` removes any previous block entity at that position). **Note**: populate all adjacent blocks before calling `rebuild` so fluid and glass culling hides internal shared faces properly. |
| `public void addEntity(Entity entity)` | `void` | Adds an entity to be previewed alongside the projection scene. |
| `public BlockAndTintGetter shifted(BlockPos origin)` | `BlockAndTintGetter` | Returns a local view with query origin shifted to `origin` (used by fluid renderers). |
| `getBlockState(BlockPos)` / `getFluidState(BlockPos)` / `getBlockEntity(BlockPos)` / `getModelData(BlockPos)` | Corresponding type | `BlockAndTintGetter` accessors (unpopulated positions return `Blocks.AIR.defaultBlockState()`). |

### 2. `ProjectionRenderer` & `ProjectionRenderer.Prepared`

Implements `AutoCloseable`.

| Method Signature | Return Type | Description & Boundary Conditions |
| :--- | :--- | :--- |
| `public boolean isValid()` | `boolean` | Checks whether this renderer has been built (`built`) and no client model reload has occurred since (`bakedGeneration == generation`). |
| `public void rebuild(ProjectionScene view, int alpha)` | `void` | Frees old GPU buffers and re-bakes blocks, fluids, block entities, and entities in `view` with opacity `alpha` (`0..255`; throws `IllegalArgumentException` if out of range). |
| `public void render(PoseStack pose, CameraRenderState camera)` | `void` | Renders the full projection directly in camera-relative space (no real-world comparison; displays everything). |
| `public void render(PoseStack pose, CameraRenderState camera, BlockGetter level, BlockPos origin)` | `void` | Compares the local scene block-by-block against `level` at `origin` and renders (auto-hides aligned blocks, draws highlight boxes for wrong states/blocks). |
| `public @Nullable Prepared prepare(PoseStack pose, CameraRenderState camera, BlockGetter level, BlockPos origin)` | `@Nullable Prepared` | Captures comparison results and matrix snapshot for a placement so `renderAll` can batch the shared depth prepass. |
| `public static void renderAll(List<Prepared> projections)` | `void` | Executes the depth-write pass for all `Prepared` projections first, then the translucent color pass, then error highlight boxes—ensuring exact occlusion across overlapping projections. |
| `public void close()` | `void` | Releases all GPU buffers owned by `ProjectionMesh`, `ProjectionFeatures`, and `ProjectionOverlay`. |

### 3. `ProjectionFeatures` & `ProjectionRenderTypes`

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| `ProjectionFeatures` | • `public ProjectionFeatures()`<br>• `public void render(List<BlockEntity> blockEntities, List<Entity> entities, PoseStack pose, CameraRenderState camera, int alpha)`<br>• `public void clear()` / `public void close()` | Reuses vanilla `FeatureRenderDispatcher` to render block entities and entities; when `alpha < 255`, automatically converts all `RenderType`s to translucent Ghost pipelines. Also reused by GUI PiP renderers `BlockStatePipRenderer` and `StructurePipRenderer`. |
| `ProjectionRenderTypes` | `public static RenderType blocks()` | Returns `BLOCK_GHOST` (`anvillib_rendering:structure_projection`), the translucent projection render type for static blocks and fluids. |
