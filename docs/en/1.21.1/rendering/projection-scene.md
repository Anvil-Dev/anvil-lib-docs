# Projection Scene & Mesh (`ProjectionScene` / `ProjectionShaders`)

When rendering translucent "ghost building projections" in the world or blueprint UIs, iterating structure coordinates and calling `BlockRenderDispatcher` every frame causes heavy per-frame allocations, face-culling overhead, and internal translucent face fighting.

`dev.anvilcraft.lib.v2.rendering.projection` solves this by **separating scene snapshots from shaders**:

1. `ProjectionScene` acts as a read-only `BlockAndTintGetter`, collecting blocks, optional block entities, fluids, and entities while redirecting biome tint coordinates.
2. `ProjectionShaders` auto-registers the translucent projection core shader `anvillib_rendering:projection` in client `RegisterShadersEvent` and signals renderers to rebuild after resource reloads.

## Building a Projection Scene (`ProjectionScene`)

### Design Intent

Vanilla block and fluid renderers require a `BlockAndTintGetter` to query neighbor blocks (for face culling and AO), fluid connections, and biome tints (`ColorResolver`) for water/grass:

- Passing the real `ClientLevel` directly causes incorrect culling at the boundary between the structure and real-world blocks.
- Creating a completely empty level loses the current biome's colors on water and leaves.

`ProjectionScene` serves as an isolated block view with **world-independent coordinates but biome tinting delegated to a reference level**:

- Stores only structure blocks added via `put(...)` and entities added via `addEntity(...)`; unwritten coordinates return `Blocks.AIR.defaultBlockState()`.
- `getBlockTint(pos, resolver)` maps queries to the reference `level` and anchor `tintPos` instead of using local structure coordinates, keeping biome colors consistent anywhere.
- All light queries (`getBrightness`, `getRawBrightness`) return full `15`, and `isOutsideBuildHeight` returns `false`, keeping projections clearly visible in dark caves or at any Y level.

### Full Code Example

The example below populates a `ProjectionScene` with structure blocks and a custom machine entity and specifies the sampling anchor:

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
        // Construct ProjectionScene with real level and structure anchorPos
        ProjectionScene scene = new ProjectionScene(level, anchorPos);

        // 1. Write regular blocks (using local relative coordinates, e.g., starting at (0, 0, 0))
        scene.put(BlockPos.ZERO, Blocks.STONE_BRICKS.defaultBlockState(), null);
        scene.put(new BlockPos(1, 0, 0), Blocks.WATER.defaultBlockState(), null);

        // 2. Write blocks with BlockEntities (e.g., chest, for rendering animated chest lids)
        BlockPos chestPos = new BlockPos(0, 1, 0);
        BlockState chestState = Blocks.CHEST.defaultBlockState();
        if (chestState.getBlock() instanceof ChestBlock) {
            ChestBlockEntity chestBe = new ChestBlockEntity(chestPos, chestState);
            scene.put(chestPos, chestState, chestBe);
        }

        // 3. Write static display entities (also in scene-local space)
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
        // Pre-bake into GPU VBO at 160/255 opacity
        renderer.rebuild(scene, 160);
    }
}
```

### Custom Biome Tint Hook

To override the default `tintPos` delegation to `level.getBlockTint(...)` (e.g., forcing a fixed water tint in a worldless GUI preview), use the constructor taking `ToIntBiFunction<BlockPos, ColorResolver>`:

```java
ProjectionScene fixedTintScene = new ProjectionScene(
    level,
    BlockPos.ZERO,
    (pos, resolver) -> 0x3F76E4
);
```

## Shader Registration & Reload Generation (`ProjectionShaders`)

`ProjectionShaders` listens to `RegisterShadersEvent` on the client mod bus via `@EventBusSubscriber(modid = AnvilLibRendering.MOD_ID, value = Dist.CLIENT)`. Developers **do not need to register anything manually**—just note how it affects renderer validity:

- On startup and every resource reload (e.g., `F3+T` shader/resource pack reload), NeoForge fires `RegisterShadersEvent`.
- `ProjectionShaders.register(RegisterShadersEvent)` loads `anvillib_rendering:projection` (`DefaultVertexFormat.BLOCK`), increments the internal `generation` counter, and clears cached `ProjectionRenderTypes`.
- On the next render, `isValid()` on old `ProjectionRenderer`s returns `false`, prompting callers to `rebuild(...)` for the new shader instance.

## Internal Mesh & Buffer Architecture

To keep the public API clean, the following components in `dev.anvilcraft.lib.v2.rendering.projection` are **package-private**:

| Internal Component | Brief Responsibility |
| --- | --- |
| `ProjectionMesh` | Collects all structure coordinates during `rebuild`, assigns per-coordinate render-layer slices (`vertexEnds`), and uploads static `VertexBuffer`s per layer |
| `GhostConsumer` | Wraps `VertexConsumer` to modulate alpha to target projection opacity and force fullbright lightmap coords |
| `ProjectionBuffers` | Manages temporary `ByteBufferBuilder`s and layered `MultiBufferSource.BufferSource` during `rebuild` |
| `ProjectionRenderTypes` | Generates translucent or depth-only projection `RenderType`s from original block `RenderType`s and `depthOnly` flag |
| `ProjectionOverlay` | Builds and draws self-contained wireframe/highlight box buffers for "wrong state (yellow)" and "wrong block (red)" |

## Public API Signatures & Parameter Details

### `ProjectionScene`

Package: `dev.anvilcraft.lib.v2.rendering.projection` · Implements: `net.minecraft.world.level.BlockAndTintGetter`

#### Constructors

| Signature | Parameters | Description |
| --- | --- | --- |
| `ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)` | `level`: reference background view; `tintPos`: biome tint reference coord | Uses `level.getBlockTint(tintPos, resolver)` by default |
| `ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | `tint`: custom tint function receiving `(pos, resolver)` | Customizes all biome tinting logic |

#### Data Writing & Building Methods

| Method Signature | Parameters | Behavior |
| --- | --- | --- |
| `void put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | `pos`: scene-local coord; `state`: block state; `blockEntity`: optional BE | Stores state and expands internal min/max Y bounds; associates `blockEntity` if non-null |
| `void addEntity(Entity entity)` | `entity`: entity to render with projection | Adds entity to the scene entity list |

#### `BlockAndTintGetter` & Height Bounds Implementation

| Method Signature | Return / Behavior |
| --- | --- |
| `BlockState getBlockState(BlockPos pos)` | Returns `BlockState` at local `pos`, or `Blocks.AIR.defaultBlockState()` if unwritten |
| `FluidState getFluidState(BlockPos pos)` | Returns `getBlockState(pos).getFluidState()` |
| `@Nullable BlockEntity getBlockEntity(BlockPos pos)` | Returns associated `BlockEntity` at `pos` (nullable) |
| `int getHeight()` | Returns vertical span across all written blocks |
| `int getMinBuildHeight()` | Returns minimum Y coordinate of written blocks |
| `boolean isOutsideBuildHeight(BlockPos pos)` | Always returns `false` |
| `boolean isOutsideBuildHeight(int y)` | Always returns `false` |
| `float getShade(Direction direction, boolean shade)` | Delegates to constructor `level` |
| `LevelLightEngine getLightEngine()` | Delegates to constructor `level` |
| `int getBlockTint(BlockPos pos, ColorResolver colorResolver)` | Resolves color using `tintPos` / custom `tint` |
| `int getBrightness(LightLayer lightType, BlockPos pos)` | Always returns `15` |
| `int getRawBrightness(BlockPos pos, int amount)` | Always returns `15` |
| `ModelData getModelData(BlockPos pos)` | Returns `blockEntity.getModelData()` if a `BlockEntity` is present, else `ModelData.EMPTY` |

### `ProjectionShaders`

Package: `dev.anvilcraft.lib.v2.rendering.projection` · Annotation: `@EventBusSubscriber(modid = AnvilLibRendering.MOD_ID, value = Dist.CLIENT)`

| Method Signature | Trigger | Description |
| --- | --- | --- |
| `static void register(RegisterShadersEvent event)` | Client mod bus shader registration | Registers `anvillib_rendering:projection` (`DefaultVertexFormat.BLOCK`), increments generation, and clears internal render type cache |
