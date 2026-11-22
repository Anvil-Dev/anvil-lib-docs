# Projection Scene & Mesh (`ProjectionScene` / `ProjectionMesh`)

`ProjectionScene` is a local static block and entity container completely decoupled from world ticks, providing neighbor occlusion, fluid, and biome tint queries for `ProjectionRenderer` when baking ghost meshes.

## `ProjectionScene` Deep Dive

`ProjectionScene` implements vanilla `BlockAndTintGetter`, enabling accurate baking of all vanilla and modded block models (including CTM, connected textures, water surface culling, and redstone/grass biome tinting) without placing blocks in the real world.

### Construction & Population API

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `new ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)` | `ProjectionScene` | Initializes with a real world (e.g., `ClientLevel`) and reference `tintPos`, using `level::getBlockTint` for biome coloring by default |
| `new ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | `ProjectionScene` | Allows overriding the coordinate-to-color resolver; `tint` receives **world coordinates**, while the scene stores **local coordinates** starting at `(0,0,0)` |
| `put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | `void` | Writes a block state and optional static `BlockEntity` at local `pos` (passing `null` removes any existing BE there), dynamically expanding `minY`/`maxY` |
| `addEntity(Entity entity)` | `void` | Adds virtual entities to the scene (rendered only in the ghost projection feature pass; never added to or ticked in the real world) |
| `getBlockState(BlockPos pos)` / `getFluidState(BlockPos pos)` / `getBlockEntity(BlockPos pos)` | Corresponding object | `BlockAndTintGetter` queries; unwritten positions return `Blocks.AIR.defaultBlockState()` |
| `getMinY()` / `getHeight()` / `isOutsideBuildHeight(int y)` | `int` / `boolean` | Provides vertical bounds aligned with the current scene span |
| `getShade(...)` / `getLightEngine()` / `getBrightness(...)` / `getRawBrightness(...)` / `getModelData(...)` | Light & model data | Forwards `level` lighting and `ModelData` (prefers `blockEntity.getModelData()` if a `BlockEntity` is present) |

> [!TIP]
> Populate **all blocks and necessary neighbors** in `ProjectionScene` via `put(...)` before calling `ProjectionRenderer.rebuild(scene, alpha)`. Face culling runs during mesh baking, so adding corner blocks in separate batches would cause incorrect culling.

### Example: Building a `ProjectionScene` from a `StructureTemplate`

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

import java.util.Map;

public final class BlueprintSceneFactory {
    public static ProjectionScene fromBlocks(
        BlockAndTintGetter world,
        BlockPos placementOrigin,
        Map<BlockPos, BlockState> localBlocks,
        Map<BlockPos, BlockEntity> localBlockEntities
    ) {
        ProjectionScene scene = new ProjectionScene(world, placementOrigin);
        localBlocks.forEach((localPos, state) -> {
            BlockEntity be = localBlockEntities.get(localPos);
            scene.put(localPos, state, be);
        });
        return scene;
    }
}
```

## Internal Mesh, Culling & `GhostConsumer`

Understanding the mesh construction helps diagnose performance bottlenecks and visual details in complex projections:

1. **Position-ordered vertex slicing (`ProjectionMesh`)**: During `ProjectionRenderer.rebuild(...)`, all local blocks (and non-empty `FluidState`s) are rendered into a single direct `ByteBuffer`, recording `[start, end)` vertex slice offsets `vertexEnds[]` per local coordinate.
2. **Dynamic visibility bitset (`BitSet visible`)**: During frame rendering, instead of re-drawing models per block, the `visible` bitset determines which blocks still need ghost previews. Only when `visible` changes from the previous frame are visible vertex slices stitched and uploaded to `VertexBuffer`.
3. **Alpha & offset interception (`GhostConsumer`)**: Wraps `VertexConsumer` to override vertex alpha with `opacity` during block mesh baking, and shifts local origin offsets via `ProjectionScene.shifted(pos)` when drawing fluids.
