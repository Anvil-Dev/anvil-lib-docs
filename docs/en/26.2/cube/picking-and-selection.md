# Precise Picking & Dynamic Part Providers (`CubePicking` / `BlockSelectionProvider` / `SelectionPart`)

<BranchContextCard branch="26.2" />

In addition to static JSON block models, many mechanical or magic mod blocks have moving parts rendered dynamically by a `BlockEntityRenderer` (BER) (such as rotating gear shafts, extending mechanical arms, or floating crystals). `module.cube` provides `BlockSelectionProvider` and `SelectionPart` so block entities can align client crosshair picking and sloped outlines with rotating/translating dynamic parts without modifying server-side collision boxes.

---

## 1. Problem & Usage

1. **Combining Static Models with Dynamic BER Parts**:
   Using `CubeSelection.registerDynamic(block, maximumBounds, includeStaticModel, provider)`, you can register a `BlockSelectionProvider` that computes part matrices each frame from `partialTick`.
   - If `includeStaticModel = true`, the base's static JSON model is automatically kept and merged with the moving parts returned by `provider` into a single picking/highlighting target;
   - If the moving part's geometry also comes from a block state's static JSON model, call `CubeSelection.modelParts(state, pos)` inside `provider` to obtain the static `SelectionGeometry`, then wrap it with the current frame's rotation/translation `Matrix4f` into a new `SelectionPart`.
2. **Overhang Cross-Block Picking**:
   When mechanical arms or long diagonal beams extend outside `[0, 1]^3` (within `[-2, 3]`), even if the player's crosshair does not point at the anchor block's own `1×1×1` voxel, `CubePicking.pick` automatically searches neighboring blocks within `searchRadius()` (up to 2 blocks) along the ray to accurately select the overhanging part.

---

## 2. Full Code Examples

The example below shows how to register dynamic precise picking and sloped outline highlighting for a machine block with a "static base + time-rotating top rotor":

```java
package com.example.mymod.client;

import com.example.mymod.block.entity.RotorBlockEntity;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.SelectionPart;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.AABB;
import org.joml.Matrix4f;

import java.util.List;

public final class RotorCubeSelection {
    // 1. Pre-build immutable local geometry for the rotor blade (reuse across frames! Never new SelectionGeometry per frame)
    //    Important: geometry must be reused across frames, otherwise OutlineCache treats every frame as new geometry and re-queues outline builds!
    private static final SelectionGeometry BLADE_GEOMETRY = new SelectionGeometry(List.of(
        ConvexShape.box(new AABB(2.0 / 16.0, 10.0 / 16.0, 6.0 / 16.0, 14.0 / 16.0, 14.0 / 16.0, 10.0 / 16.0)),
        ConvexShape.box(new AABB(6.0 / 16.0, 10.0 / 16.0, 2.0 / 16.0, 10.0 / 16.0, 14.0 / 16.0, 14.0 / 16.0))
    ));

    // 2. Declare the maximum bounding box reachable during rotation (must be within [-2, 3])
    private static final AABB MAX_ROTOR_BOUNDS = new AABB(-0.25, 0.0, -0.25, 1.25, 1.25, 1.25);

    private RotorCubeSelection() {
    }

    public static void register() {
        CubeSelection.registerDynamic(
            ModBlocks.ROTOR_BLOCK.get(),
            MAX_ROTOR_BOUNDS,
            true, // Also keep the base's static JSON model
            (level, pos, state, partialTick) -> {
                if (!(level.getBlockEntity(pos) instanceof RotorBlockEntity rotor)) {
                    return List.of();
                }
                // Compute the exact same interpolated angle as BlockEntityRenderer
                float angleRad = Mth.lerp(partialTick, rotor.prevAngle, rotor.currentAngle) * Mth.DEG_TO_RAD;

                // Build an affine transform matrix rotating around block center (0.5, 0.5, 0.5) on the Y axis
                Matrix4f localToBlock = new Matrix4f()
                    .translate(0.5F, 0.5F, 0.5F)
                    .rotateY(angleRad)
                    .translate(-0.5F, -0.5F, -0.5F);

                // Reuse BLADE_GEOMETRY and only update this frame's transform matrix
                return List.of(new SelectionPart(BLADE_GEOMETRY, localToBlock));
            }
        );
    }
}
```

---

## 3. Public Classes & Interfaces API Reference

### 1. `BlockSelectionProvider` (Dynamic Part Provider Interface)

```java
@FunctionalInterface
public interface BlockSelectionProvider {
    List<SelectionPart> parts(ClientLevel level, BlockPos pos, BlockState state, float partialTick);
}
```

| Parameter / Return Value | Description & Notes |
| :--- | :--- |
| `level`, `pos`, `state`, `partialTick` | Current client level, block position (immutable copy), block state, and frame interpolation fraction. |
| Return value `List<SelectionPart>` | Returns the list of all dynamic parts for this block on the current frame.<br>**Core performance rule**: the `SelectionGeometry` inside `SelectionPart` **must be reused across frames as a static constant or cached instance**; each frame should only allocate a new `Matrix4f` and `SelectionPart(geometry, matrix)` wrapper. `OutlineCache` keys background outline builds by `SelectionGeometry`, so allocating a new `SelectionGeometry` every frame defeats outline caching. |

### 2. `SelectionPart` (Selection Part with Local Transform)

Located in `dev.anvilcraft.lib.v2.cube.client.SelectionPart`, pairing a reusable `SelectionGeometry` with an invertible affine matrix `localToBlock` from local space to block space.

| Constructor / Method Signature | Return Type | Parameters, Math Semantics & Boundary Conditions |
| :--- | :--- | :--- |
| `public SelectionPart(SelectionGeometry geometry)` | — | Constructs a part with identity transform (no rotation/translation/scaling); `bounds` equals `geometry.bounds()`. |
| `public SelectionPart(SelectionGeometry geometry, Matrix4fc localToBlock)` | — | Constructs a part with an affine transform.<br>• **Validation**: `localToBlock` must satisfy `isFinite()`, `isAffine()`, and `Math.abs(determinant()) >= 1.0E-9` (invertible), or `IllegalArgumentException("Expected an invertible affine transform")` is thrown. Pre-computes the inverse matrix via `invertAffine` and transforms the 8 corners of the local AABB to compute block-space `bounds`. |
| `public SelectionGeometry geometry()` | `SelectionGeometry` | Returns the underlying immutable geometry object. |
| `public AABB bounds()` | `AABB` | Returns the axis-aligned bounding box transformed into block space. |
| `public Vec3 localPosition(Vec3 blockPosition)` | `Vec3` | Transforms a block-space coordinate (such as local camera position) back into the part's local geometry space using the pre-computed inverse matrix. |
| `public List<ConvexShape> blockSpaceShapes()` | `List<ConvexShape>` | Multiplies all underlying `ConvexShape`s by `transform` to produce block-space convex polyhedra. **Only for merging static multipart models during resource baking**; never call this per frame for dynamic animations. |
| `public void apply(PoseStack stack)` | `void` | If a transform matrix is present, pushes it onto the render matrix stack via `stack.mulPose(this.transform)`. |
| `public SelectionGeometry.@Nullable RayHit clip(Vec3 start, Vec3 end)` | `SelectionGeometry.RayHit` | Transforms block-space ray `start` and `end` into local space via the inverse matrix to run `geometry.clip(...)`; on hit, transforms the hit face normal back to block space using the **inverse transpose matrix** and normalizes it, ensuring the hit face (`Direction`) stays accurate under non-uniform scaling or mirroring. |

### 3. Dynamic Registration & Target Query APIs in `CubeSelection`

| Method / Record Signature | Return Type | Description & Boundary Conditions |
| :--- | :--- | :--- |
| `public static void registerDynamic(Block block, AABB maximumBounds, boolean includeStaticModel, BlockSelectionProvider provider)` | `void` | Registers a dynamic part provider for `block`.<br>• `maximumBounds`: maximum block-space bounding box reachable by all dynamic parts during motion (inflated by `0.5` if the block has `hasOffsetFunction()`), which must lie within `[-2, 3]` or `IllegalArgumentException` is thrown.<br>• At runtime, if any `SelectionPart.bounds()` returned by `provider` exceeds `maximumBounds.inflate(1.0E-5)`, `target(...)` treats it as out-of-bounds and returns `null` (safely falling back to vanilla). |
| `public static @Nullable List<SelectionPart> modelParts(BlockState state, BlockPos pos)` | `@Nullable List<SelectionPart>` | Collects the immutable `SelectionPart` list of `state`'s static baked model using vanilla's position seed `state.getSeed(pos)` for reuse in custom `BlockSelectionProvider`s. Returns `null` if the block is permanently excluded, has no model, or has `> 32` parts. |
| `public static @Nullable Target target(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable CubeSelection.Target` | Gets the **precise model picking** target: delegates to `outlineTarget(...)` only when the block's effective rule is `MODEL`, returning `null` in `OUTLINE` or `VANILLA` mode (preserving vanilla ray picking). |
| `public static @Nullable Target outlineTarget(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable CubeSelection.Target` | Gets the **shared geometry target for outline & preview** (responds to both `MODEL` and `OUTLINE` modes, caching up to 256 positions per frame). Returns `null` if excluded, has neither model nor dynamic provider, total parts `> 32`, or total convex shapes `> SelectionGeometry.MAX_SHAPES (1024)`. |
| `public record Target(BlockState state, List<SelectionPart> parts, Vec3 offset, @Nullable AABB bounds)` | `record` | Represents a block's combined selection target for the current frame. Provides `public @Nullable BlockHitResult clip(BlockPos pos, Vec3 start, Vec3 end)`, finding the smallest positive hit `fraction` across all `parts` and generating a vanilla `BlockHitResult` via `Direction.getApproximateNearest`. |

### 4. `CubePicking` (Crosshair Ray Picking Entry Point)

Located in `dev.anvilcraft.lib.v2.cube.client.CubePicking`, hooked into the local player's crosshair picking path via Mixin.

| Constant / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final double MAX_RANGE = 64` | `double` | Maximum ray distance (64 blocks) for precise model picking; beyond this distance, delegates directly to vanilla `entity.pick`. |
| `public static HitResult pick(Entity entity, double range, float partialTick, boolean fluids)` | `HitResult` | Main client crosshair ray-picking entry point.<br>1. Reentrancy-safe via `ThreadLocal<Context>`; starts the frame with `CubeSelection.beginFrame` (so dynamic geometry in `OUTLINE`-only mode also updates per frame).<br>2. Checks `!CubeSelection.active() || range > MAX_RANGE` and falls back to vanilla `entity.pick` if inactive or out of range.<br>3. Calls `entity.pick(range, partialTick, fluids)` first (executing `Target.clip` on in-cell blocks along the ray via `BlockGetterMixin`).<br>4. If `CubeSelection.searchRadius() > 0`, scans overhanging blocks (`CubeSelection.extendsBlock(state)`) within `[-radius, radius]^3` around each voxel along the sightline using `BlockGetter.traverseBlocks`, deduplicating with `LongOpenHashSet visited` and returning the closest hit to the eye. |
| `public static CubeSelection.@Nullable Target target(BlockGetter getter, BlockPos pos, BlockState state)` | `CubeSelection.Target` | Queried by `BlockGetterMixin` during crosshair ray traversal under the current thread context. Non-crosshair calls (normal physics collisions, projectiles, or server raycasts) have `context.level == null` and return `null` immediately without interfering with physics. |

### 5. `OutlineRenderer` (Batch Outline Line Renderer)

Located in `dev.anvilcraft.lib.v2.cube.client.OutlineRenderer`, shared by block outlines and custom entity/debug outlines.

| Method Signature | Return Type | Parameters & Description |
| :--- | :--- | :--- |
| `public static void render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha)` | `void` | Renders an outline using the default max segments `SelectionGeometry.MAX_OUTLINE_SEGMENTS (4096)` and default line width `2.5F`. |
| `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments)` | `int` | Renders an outline with the specified `maximumSegments` and default line width `2.5F`, returning the number of segments actually submitted. |
| `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments, float lineWidth)`<br>`public static int render(PoseStack.Pose pose, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments, float lineWidth)` | `int` | Full-parameter render method (also accepts `PoseStack.Pose` directly for `SubmitNodeCollector#submitCustomGeometry` callbacks). Transforms each segment's tangent direction vector via `pose.pose().transformDirection(...)` (rather than the inverse transpose surface normal matrix, keeping screen-space line width accurate under non-uniform scaling), and writes both endpoints, color, tangent normal, and `lineWidth` to `consumer`. Returns the number of segments actually drawn. |
