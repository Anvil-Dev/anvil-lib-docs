# Structure Projection Rendering System (`Projection`)

When rendering multiblock structure blueprints or moveable structure previews in the world, mods commonly face three challenges:

1. Calling `BlockRenderDispatcher` per block is too expensive and translucent blending self-occludes poorly;
2. When multiple structures are previewed side by side or overlapping, later-rendered ghost blocks bleed through earlier ones or show sorting artifacts;
3. Each blueprint block must be compared against the real world, highlighting "wrong block type (red)" or "wrong block state (yellow)" with translucent overlays.

The `dev.anvilcraft.lib.v2.rendering.projection` suite solves all three: it provides the offline read-only `ProjectionScene`, mesh-baking and multi-structure depth-prepass engine `ProjectionRenderer`, block entity/entity ghost wrapper `ProjectionFeatures`, and `ProjectionRenderTypes`.

---

## Core Render Flow

```
Build ProjectionScene ──► ProjectionRenderer.rebuild(scene, alpha)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       Single Draw (render)             Multi-Batch (prepare + renderAll)
  1. Depth Prepass (depth-only)      1. Unified Depth Prepass across all Prepared
  2. Translucent Color Pass          2. Unified Translucent Color Pass across all Prepared
  3. BE/Entity Ghosts & Overlay      3. Per-projection Overlay & BE/Entity Ghosts
```

> [!IMPORTANT]
> Always call `ProjectionRenderer.render(...)` or `ProjectionRenderer.renderAll(...)` after world geometry finishes rendering (e.g., NeoForge's `RenderLevelStageEvent.Stage.AFTER_LEVEL` or equivalent post-level stage), with camera translation applied to the passed `PoseStack`.

---

## Full Example: Batch In-World Multiblock Blueprint Projection

The client renderer below caches multiple blueprint projections, handles model reload invalidation, and renders them to the world using a shared depth pass:

```java
package com.example.mymod.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class BlueprintProjectionOverlay {
    private static final List<Placement> ACTIVE_PLACEMENTS = new ArrayList<>();

    public record Placement(BlockPos origin, Map<BlockPos, BlockState> pattern, ProjectionRenderer renderer) {}

    public static void addPlacement(Level level, BlockPos origin, Map<BlockPos, BlockState> relativeBlocks) {
        ProjectionRenderer renderer = new ProjectionRenderer();
        ProjectionScene scene = new ProjectionScene(level, origin);
        relativeBlocks.forEach((relPos, state) -> {
            BlockEntity be = state.hasBlockEntity() ? null : null;
            scene.put(relPos, state, be);
        });
        // Ghost opacity (0–255); 140 is ~55% opacity
        renderer.rebuild(scene, 140);
        ACTIVE_PLACEMENTS.add(new Placement(origin, relativeBlocks, renderer));
    }

    public static void clearAll() {
        for (Placement placement : ACTIVE_PLACEMENTS) {
            placement.renderer().close();
        }
        ACTIVE_PLACEMENTS.clear();
    }

    public static void onRenderLevelStage(RenderLevelStageEvent event) {
        if (event.getStage() != RenderLevelStageEvent.Stage.AFTER_LEVEL || ACTIVE_PLACEMENTS.isEmpty()) {
            return;
        }
        Minecraft mc = Minecraft.getInstance();
        Level level = mc.level;
        if (level == null) {
            return;
        }

        Vec3 cameraPos = event.getCamera().getPosition();
        PoseStack poseStack = event.getPoseStack();
        List<ProjectionRenderer.Prepared> preparedList = new ArrayList<>(ACTIVE_PLACEMENTS.size());

        for (Placement placement : ACTIVE_PLACEMENTS) {
            if (!placement.renderer().isValid()) {
                // Rebuild meshes after model resource reload (ModelEvent.BakingCompleted)
                ProjectionScene rebuiltScene = new ProjectionScene(level, placement.origin());
                placement.pattern().forEach((pos, state) -> rebuiltScene.put(pos, state, null));
                placement.renderer().rebuild(rebuiltScene, 140);
            }

            poseStack.pushPose();
            poseStack.translate(
                placement.origin().getX() - cameraPos.x,
                placement.origin().getY() - cameraPos.y,
                placement.origin().getZ() - cameraPos.z
            );
            ProjectionRenderer.Prepared prepared = placement.renderer().prepare(poseStack, level, placement.origin());
            if (prepared != null) {
                preparedList.add(prepared);
            }
            poseStack.popPose();
        }

        // All structures share the depth prepass, eliminating bleed-through and double-blending
        ProjectionRenderer.renderAll(preparedList);
    }
}
```

---

## API Reference

### `ProjectionScene`

Implements `net.minecraft.world.level.BlockAndTintGetter`, providing an isolated world snapshot for offline block models, fluids, and biome tinting.

#### Constructors & Mutators

| Signature | Description |
| :--- | :--- |
| `public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)` | Samples biome colors (grass, foliage, water) via the reference level's `getBlockTint` at `pos.offset(tintPos)` |
| `public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | Constructs a scene view with a custom tint function |
| `public void put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | Writes a block state and optional block entity at local `pos`, expanding vertical bounds (`minY` / `maxY`) dynamically |
| `public void addEntity(Entity entity)` | Adds a regular entity to render as a ghost in the projection |
| `public BlockAndTintGetter shifted(BlockPos origin)` | Returns a read-only view shifted to local origin `origin` (for fluid rendering etc. that queries neighbors from `(0,0,0)`) |

#### Query Behavior & Lighting Conventions

- `getBlockState(BlockPos)`: returns `Blocks.AIR.defaultBlockState()` if unwritten and `level` has none; air does not block neighbor air checks.
- `getBrightness(LightLayer, BlockPos)` and `getRawBrightness(BlockPos, int)`: always return max light `15` so blueprint projections are unaffected by real-world cave shadows.
- `getModelData(BlockPos)`: delegates to `blockEntity.getModelData()` if a `BlockEntity` is present at `pos`, else returns `ModelData.EMPTY`.

---

### `ProjectionRenderer`

Core controller and lifecycle manager for structure projections (implements `AutoCloseable`). Internally manages `ProjectionMesh`, wrong-state/wrong-block `ProjectionOverlay`, and `ProjectionFeatures`.

| Method Signature | Description |
| :--- | :--- |
| `public boolean isValid()` | Checks whether the baked mesh is still valid; automatically invalidated on `ModelEvent.BakingCompleted` resource reload |
| `public void rebuild(ProjectionScene view, int alpha)` | Recollects static block models and fluid meshes from `view`, uploads to GPU vertex buffers at opacity `alpha` (`0..255`), and records block entity and entity references |
| `public void render(PoseStack pose)` | Renders all blocks and entities in the scene directly without comparing to the real world or drawing validation overlays |
| `public void render(PoseStack pose, BlockGetter level, BlockPos origin)` | Equivalent to `prepare(pose, level, origin)` followed by immediate render; hides blocks that already match in the real world |
| `public @Nullable Prepared prepare(PoseStack pose, BlockGetter level, BlockPos origin)` | Compares each scene position against `level.getBlockState(origin.offset(pos))`: matched blocks are culled from the visibility bitset; non-air mismatched blocks are marked "Wrong Block (red `0x70FF3333`)"; same-block mismatched properties are marked "Wrong State (yellow `0x70FFCC00`)". Returns `null` if unbuilt or nothing is missing/present. |
| `public static void renderAll(List<Prepared> projections)` | Batch-renders multiple prepared projections: runs depth-only prepass for all first, then translucent color meshes, BE/entity ghosts, and finally red/yellow validation overlays |
| `public void close()` | Frees owned GPU vertex/index buffers and entity buffer memory; must be called on cleanup or screen close |

#### Internal Batch Token: `ProjectionRenderer.Prepared`

Immutable record returned by `prepare(...)`, holding the render snapshot (`Matrix4f pose`, real comparison `origin`, `missing` block `BitSet`, `wrongStates` yellow `BitSet`, `wrongBlocks` red `BitSet`) for consumption by `ProjectionRenderer.renderAll(...)`.

---

### `ProjectionFeatures`

Implements `AutoCloseable`; renders `BlockEntity`s and `Entity`s inside the projection, supporting translucent tinting and depth-only prepass.

| Method Signature | Description |
| :--- | :--- |
| `public void render(List<BlockEntity> blockEntities, List<Entity> entities, PoseStack pose, int alpha)` | Renders the given block entities and entities at `LightTexture.FULL_BRIGHT` with `alpha` (`0..255`). Uses original `RenderType`s when `alpha == 255` and not depth-only; otherwise clones pipelines to translucent/depth-only ghost variants and fixes winding under mirror scaling (negative determinant) |
| `public void close()` | Frees internal `ByteBufferBuilder` memory |

---

### `ProjectionRenderTypes`

Provides the `RenderType` and pipeline adaptation support used by structure projections (also provides internal variants like `ghost`):

| Public Method / Field | Return Type | Description |
| :--- | :--- | :--- |
| `ProjectionRenderTypes.blocks()` | `RenderType` | Returns `anvillib_rendering:structure_projection` for structure block projections (binds `BLOCK_SHEET_MIPPED` and `LIGHTMAP`, uses `anvillib_rendering:core/structure_projection` fragment shader, enables `BlendFunction.TRANSLUCENT`, disables depth writes) |

---

### `ProjectionRenderEvents`

Client bus listener (`@EventBusSubscriber(modid = AnvilLibRendering.MODID, value = Dist.CLIENT)`):

| Method Signature | Listened Event | Responsibility |
| :--- | :--- | :--- |
| `public static void pipelines(RegisterRenderPipelinesEvent event)` | `RegisterRenderPipelinesEvent` | Registers structure projection color pipeline (`structure_projection`) and depth prepass pipeline (`structure_projection_depth`) |
| `public static void reload(ModelEvent.BakingCompleted event)` | `ModelEvent.BakingCompleted` | Invalidates all `ProjectionRenderer` cached resources and clears pipeline variant caches on model bake/reload so subsequent frames rebuild automatically |

> [!TIP]
> `ProjectionRenderer` tracks active instances via a weak-reference set: calling `close()` or GC prevents memory leaks; after `ModelEvent.BakingCompleted`, `isValid()` immediately returns `false` to signal callers to rebuild.
