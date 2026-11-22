# Precise Picking & Outline Render Pipeline (`dev.anvilcraft.lib.v2.cube.client`)

<BranchContextCard branch="1.21.4" />

This page dives into `module.cube`'s client runtime core: **`CubeSelection`** (state hub), **`SelectionPart`** (transformable geometry part), **`BlockSelectionProvider`** (dynamic part callback), **`CubePicking`** (crosshair neighborhood ray-picker), and **`OutlineRenderer`** (edge line renderer).

---

## 1. Core Public Classes & Interfaces API Reference

### 1. `CubeSelection` (Client Selection & Outline Registry Hub)

Located in `dev.anvilcraft.lib.v2.cube.client.CubeSelection`.

| Constant / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final int MAX_PARTS = 32` | `int` | Maximum number of `SelectionPart`s allowed per block target (falls back to vanilla if > 32). |
| `public static void enableNamespace(String namespace)` | `void` | Enables model precise picking and sloped outline highlighting for all blocks under `namespace` (validates via `ResourceLocation.fromNamespaceAndPath`). |
| `public static void exclude(Block block)` | `void` | Permanently excludes `block` from model geometry picking and outlines. |
| `public static void registerTargetExclusion(ResourceLocation id, Predicate<BlockState> exclusion)` | `void` | Registers a runtime dynamic exclusion rule keyed by `id`. When any rule returns `true`, `target` and `outlineTarget` return `null`, falling back to vanilla picking and outlines. Re-registering the same `id` overwrites the old rule. |
| `public static boolean unregisterTargetExclusion(ResourceLocation id)` | `boolean` | Unregisters the runtime exclusion rule for `id`; returns `true` if removed. |
| `public static boolean isTargetExcluded(BlockState state)` | `boolean` | Checks whether `state` is excluded by `exclude(Block)` or any runtime exclusion rule. |
| `public static void registerDynamic(Block block, AABB maximumBounds, boolean includeStaticModel, BlockSelectionProvider provider)` | `void` | Registers a real-time part provider for dynamic-rendered blocks (such as those with a `BlockEntityRenderer`).<br>• `maximumBounds`: max envelope bounding box across all part motion (must satisfy `supportedBounds` after `hasOffsetFunction()` expansion, else throws `IllegalArgumentException`);<br>• `includeStaticModel`: whether to also include static parts from the block's JSON model;<br>• `provider`: callback supplying dynamic `List<SelectionPart>` each frame. |
| `public static boolean isEnabled(Block block)` | `boolean` | Checks whether `block` is in a non-`VANILLA` mode under active rules (both `MODEL` and `OUTLINE`-only modes participate in model geometry baking). |
| `public static boolean supportedBounds(AABB bounds)` | `boolean` | Validates that bounding box coordinates are finite and within `[-2, 3]` inclusive. |
| `public static void install(ModelSelections.Snapshot snapshot)` | `void` | Installs a new baked model selection snapshot and rebuilds the overhang search radius cache (while clearing the previous outline and frame caches). |
| `public static void beginFrame(ClientLevel level, float fraction)` | `void` | Resets the current frame's position cache and records the current `ClientLevel` and `partialTick`. |
| `public static void clearWorld()` | `void` | Clears the current frame cache, world reference, and background outline cache (typically called on server disconnect). |
| `public static @Nullable List<SelectionPart> modelParts(BlockState state, BlockPos pos)` | `@Nullable List<SelectionPart>` | Gets the static model part list for `state` at `pos` (using vanilla's position seed `state.getSeed(pos)`), for reuse in custom BERs. |
| `public static @Nullable Target target(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable Target` | Precise picking entry point: delegates to `outlineTarget(...)` only when the block is in `MODEL` mode; returns `null` directly in `OUTLINE` or `VANILLA` mode. |
| `public static @Nullable Target outlineTarget(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable Target` | Shared geometry entry for outline and preview: resolves and caches (up to 256 positions per frame) the combined `Target` for a block position. Safely returns `null` if excluded, dynamic parts exceed `maximumBounds`, part count `> 32`, or total convex shapes `> 1024`. |
| `public static boolean extendsBlock(BlockState state)` | `boolean` | Checks whether the static or dynamic geometry of a `MODEL`-mode block state extends beyond the standard `[0, 1]^3` unit cube. |
| `public static OutlineCache outlines()` | `OutlineCache` | Returns the background async outline cache instance. |
| `public static int searchRadius()` | `int` | Maximum overhang block radius (`0–2`) across all active `MODEL`-mode static and dynamic blocks. |
| `public static boolean active()` | `boolean` | Whether at least one baked model or dynamic block in `MODEL` mode exists. |
| `public static Statistics statistics()` | `Statistics` | Returns a snapshot of baked state count, geometry memory bytes, unsupported state count, and outline cache stats. |

#### Inner Record Classes: `CubeSelection.Target` & `CubeSelection.Statistics`

| Record & Methods | Description |
| :--- | :--- |
| `record Target(BlockState state, List<SelectionPart> parts, Vec3 offset, @Nullable AABB bounds)`<br>• `public @Nullable BlockHitResult clip(BlockPos pos, Vec3 start, Vec3 end)` | Represents the combined selection target of a single block position for the current frame. `clip` transforms the world ray `[start, end]` into block-local space (subtracting `pos + offset`), finds the nearest intersection across all `SelectionPart`s, and constructs a `BlockHitResult` with exact hit face (`Direction.getApproximateNearest`). |
| `record Statistics(int states, long geometryBytes, int unsupportedStates, OutlineCache.Statistics outlines)` | Diagnostic statistics record. |

---

### 2. `SelectionPart` & `BlockSelectionProvider`

#### `BlockSelectionProvider` (Functional Interface)

```java
@FunctionalInterface
public interface BlockSelectionProvider {
    List<SelectionPart> parts(ClientLevel level, BlockPos pos, BlockState state, float partialTick);
}
```

#### `SelectionPart` (Geometry Part with 4×4 Rigid/Affine Transform)

Located in `dev.anvilcraft.lib.v2.cube.client.SelectionPart`. A `SelectionPart` pairs an immutable local `SelectionGeometry` with an optional `Matrix4f` transform matrix (taking a matrix-free fast path when identity):

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public SelectionPart(SelectionGeometry geometry)` | `SelectionPart` | Creates a geometry part with no extra transform (identity matrix). |
| `public SelectionPart(SelectionGeometry geometry, Matrix4f pose)` | `SelectionPart` | Creates a geometry part with a `pose` transform matrix. **Note**: `pose` must be finite and invertible (`|det| > 1e-12`), else `IllegalArgumentException("SelectionPart pose must be finite and invertible")` is thrown. |
| `public SelectionGeometry geometry()` | `SelectionGeometry` | Returns the underlying immutable geometry. |
| `public AABB bounds()` | `AABB` | Returns the block-local bounding box after applying `pose`. |
| `public boolean isIdentity()` | `boolean` | Checks whether the transform matrix is the identity matrix. |
| `public @Nullable SelectionGeometry.RayHit clip(Vec3 start, Vec3 end)` | `@Nullable RayHit` | Transforms local ray endpoints into the geometry's internal space via `inverse`, intersects, and transforms the hit surface normal back to block-local space via the transpose inverse `(M^-1)^T`. |
| `public Vec3 localPosition(Vec3 position)` | `Vec3` | Transforms a block-local coordinate (e.g., camera-relative position) into this part's internal geometry space via `inverse` (used for view-dependent seam culling). |
| `public void apply(PoseStack stack)` | `void` | If non-identity, multiplies `pose` onto `stack.last()` (updating both pose and normal matrices). |
| `public List<ConvexShape> blockSpaceShapes()` | `List<ConvexShape>` | Transforms all `ConvexShape`s in the underlying `SelectionGeometry` by `pose`, returning block-space convex polyhedra. |

---

### 3. `OutlineRenderer`, `CubePicking` & Event Handlers

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`OutlineRenderer`** | • `public static void render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha)`<br>• `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments)` | Writes 3D line segments from `PackedOutline` into `RenderType.lines()` `VertexConsumer` (transforming tangent directions via `pose.pose().transformDirection` and normalizing), returning the number of segments drawn. |
| **`CubePicking`** | • `public static final double MAX_RANGE = 64`<br>• `public static HitResult pick(Entity entity, double range, float partialTick, boolean fluids)`<br>• `public static @Nullable CubeSelection.Target target(BlockGetter getter, BlockPos pos, BlockState state)` | Called by `GameRendererMixin` during crosshair raycasting. Also hooks vanilla `BlockGetter#clipWithInteractionOverride` via `BlockGetterMixin` and scans neighboring overhanging model parts along the sightline when `searchRadius() > 0`. |
| **`CubeHighlightEvents`** | • `public static void highlight(RenderHighlightEvent.Block event)`<br>• `public static void disconnect(ClientPlayerNetworkEvent.LoggingOut event)` | Listens to `RenderHighlightEvent.Block` (`LOWEST` priority); when `CubeSelection.outlineTarget(...)` is non-null, draws sloped outlines (falling back to `ShapeRenderer.renderLineBox` if segments exceed `SelectionGeometry.MAX_OUTLINE_SEGMENTS = 4096`) and cancels the vanilla outline via `event.setCanceled(true)`. |
| **`CubeModelEvents`** | • `public static void prepare(ModelEvent.ModifyBakingResult event)`<br>• `public static void apply(ModelEvent.BakingCompleted event)` | Reads resource-pack `CubeSelectionRules` during model baking, calls `ModelSelections.bake(event.getBakingResult().blockStateModels(), ...)`, and installs the snapshot into `CubeSelection`. |

---

## 2. Code Example: Reusing `OutlineRenderer` in a Custom BER or World Render

To highlight a machine part's model outline in your own `RenderLevelStageEvent`, fetch `PackedOutline` from `CubeSelection.outlines()` and call `OutlineRenderer.render`:

```java
package com.example.mymod.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.OutlineRenderer;
import dev.anvilcraft.lib.v2.cube.client.SelectionPart;
import dev.anvilcraft.lib.v2.cube.geometry.PackedOutline;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

import java.util.List;

public final class CustomMachineOutlineRenderer {
    private CustomMachineOutlineRenderer() {
    }

    public static void renderCustomColorOutline(PoseStack poseStack, BlockPos pos, BlockState state) {
        List<SelectionPart> parts = CubeSelection.modelParts(state, pos);
        if (parts == null || parts.isEmpty()) return;

        Minecraft mc = Minecraft.getInstance();
        Vec3 camera = mc.gameRenderer.getMainCamera().getPosition();
        VertexConsumer lineBuffer = mc.renderBuffers().bufferSource().getBuffer(RenderType.lines());

        poseStack.pushPose();
        poseStack.translate(pos.getX() - camera.x, pos.getY() - camera.y, pos.getZ() - camera.z);

        Vec3 localCamera = camera.subtract(pos.getX(), pos.getY(), pos.getZ());
        for (SelectionPart part : parts) {
            PackedOutline baseOutline = CubeSelection.outlines().get(part.geometry());
            PackedOutline viewOutline = baseOutline.forView(part.localPosition(localCamera));

            poseStack.pushPose();
            part.apply(poseStack);
            // Render model edges in bright cyan (R=0.0, G=0.9, B=1.0, A=0.8)
            OutlineRenderer.render(poseStack, lineBuffer, viewOutline, 0.0f, 0.9f, 1.0f, 0.8f);
            poseStack.popPose();
        }
        poseStack.popPose();
    }
}
```
