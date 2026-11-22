# Model Capture, Decoding & Geometry Outline Cache (`dev.anvilcraft.lib.v2.cube.client.model` / `geometry`)

<BranchContextCard branch="26.1" />

This page covers the low-level core of `module.cube`: how raw cuboid elements are captured from Minecraft 26.1 baked models, how they are decoded into renderer-independent closed convex polyhedra (`ConvexShape`) with BVH spatial indexing (`SelectionGeometry`), and how outer contours with coplanar and tiny offset seams removed are computed on a background thread (`OutlineBuilder` / `OutlineCache` / `PackedOutline`).

If a mod needs to construct precise ray picking and union outer outlines directly for **custom entities, multiblock previews, or non-standard geometry**, you can use the public classes in `dev.anvilcraft.lib.v2.cube.geometry` directly.

---

## 1. Core Geometry & Outline Pipeline Design

1. **Model Capture & Deduplicated Baking (`ModelCapture` → `CubeModelDecoder` → `ModelSelections`)**:
   - During model baking, `ModelCapture` uses Guava `MapMaker().weakKeys()` to associate each `BlockStateModelPart` with its unbaked `List<CuboidModelElement>` and root-transformed `ModelState`;
   - `CubeModelDecoder.decode(...)` converts each `CuboidModelElement` (including `from` / `to` and `CuboidRotation` supporting single-axis and 26.1 tri-axis Euler angles) into a `ConvexShape`;
   - `ModelSelections.bake(...)` recursively resolves `SingleVariant`, `Weighted` (random variant models), and `Multipart` (composite models). When all subparts of a `Multipart` model are static `Fixed` parts, their convex polyhedra are merged into a single `SelectionGeometry`, **automatically eliminating internal seam lines between flush multipart parts**.
2. **Union Outline Extraction & Budget Protection (`OutlineBuilder` & `OutlineCache`)**:
   - When multiple rotated or orthogonal `ConvexShape`s are combined, drawing all 12 edges of every cuboid produces numerous redundant lines intersecting inside the model or on coplanar flush faces.
   - `OutlineBuilder.build(...)` first partitions intersecting convex polyhedra into connected components (Islands) via BVH, collects raw edges and pairwise face intersection lines, splits segments at intersections, samples along normals and tangents at each segment midpoint to test whether the edge is a true crease on the union surface, and merges collinear adjacent segments.
   - Because boolean union contour computation is expensive, `OutlineCache` builds asynchronously on a single-threaded background daemon pool (per-build budget: `100 ms`, max `1,000,000` operations, max `4096` output segments). While pending or over budget, the render thread returns the non-blocking `geometry.fallbackOutline()`.
3. **View-Dependent Culling of Tiny Offset Seams (`OutlineVisibility`)**:
   - To avoid Z-fighting, many detailed models intentionally offset adjacent cuboid faces by less than `0.1` pixels (`distance < 0.1 / 16.0` block units).
   - `OutlineVisibility` pre-identifies parallel offset seam intervals with spacing in `(2e-7, 0.1/16)` during outline construction; each frame, `PackedOutline.forView(localCamera)` projects convex polyhedron frustums from the current camera viewpoint, **hiding tiny offset seams inside the model's visual interior while preserving segments lying on the outer silhouette**.

---

## 2. Full Code Example: Building Custom Polyhedral Picking & Outlines

The example below uses `ConvexShape`, `SelectionGeometry`, `OutlineCache`, and `OutlineRenderer` directly without a block JSON model to perform raycasting and outline rendering for custom composite geometry:

```java
package com.example.mymod.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.OutlineRenderer;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.PackedOutline;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4d;

import java.util.List;

public final class CustomPillarGeometry {
    // Build an immutable SelectionGeometry composed of a base + a 45-degree rotated center pillar
    public static final SelectionGeometry PILLAR_GEOMETRY = createGeometry();

    private static SelectionGeometry createGeometry() {
        ConvexShape base = ConvexShape.box(new AABB(0.125, 0.0, 0.125, 0.875, 0.25, 0.875));
        Matrix4d rotate45Y = new Matrix4d()
            .translate(0.5, 0.5, 0.5)
            .rotateY(Math.toRadians(45.0))
            .translate(-0.5, -0.5, -0.5);
        ConvexShape shaft = ConvexShape.box(new AABB(0.25, 0.2, 0.25, 0.75, 1.0, 0.75))
            .transform(rotate45Y);
        return new SelectionGeometry(List.of(base, shaft));
    }

    /**
     * Perform precise ray intersection in local space
     */
    public static SelectionGeometry.RayHit clipLocalRay(Vec3 localStart, Vec3 localEnd) {
        return PILLAR_GEOMETRY.clip(localStart, localEnd);
    }

    /**
     * Render outer contours with internal intersecting lines removed
     */
    public static void renderPillarOutline(
        PoseStack poses,
        VertexConsumer lineConsumer,
        Vec3 localCameraPos
    ) {
        // Fetch union outline from global background cache (returns fallbackOutline automatically if not ready)
        PackedOutline outline = CubeSelection.outlines()
            .get(PILLAR_GEOMETRY)
            .forView(localCameraPos);

        OutlineRenderer.render(poses, lineConsumer, outline, 0.0F, 0.0F, 0.0F, 0.4F);
    }
}
```

---

## 3. `dev.anvilcraft.lib.v2.cube.client.model` Package API

### 1. `ModelCapture` (Temporary Capture During Model Baking)

| Method / Record Signature | Description |
| :--- | :--- |
| `public static synchronized void remember(ResolvedModel model, ModelState state, BlockStateModelPart baked)` | Called when `baked` is a `SimpleModelWrapper` and top-level geometry is non-empty `UnbakedCuboidGeometry`; merges `NeoForgeModelProperties.TRANSFORM` root transform and stores in weak-keyed `SOURCES`. |
| `public static synchronized Map<BlockStateModelPart, Source> take()` | Exports a snapshot of all currently captured `Source`s and immediately clears `SOURCES` to prevent holding textures and unbaked models in memory. |
| `public record Source(List<CuboidModelElement> elements, ModelState state)` | Holds the unbaked cuboid element list and combined `ModelState`. |

### 2. `CubeModelDecoder` (Cuboid Model Element Decoder)

| Method Signature | Parameters, Return Value & Exceptions |
| :--- | :--- |
| `public static List<ConvexShape> decode(List<CuboidModelElement> elements, ModelState modelState)` | Converts a JSON model's `CuboidModelElement` list (coordinates divided by `16.0` into block units) with `modelState` transform and each element's `CuboidRotation` applied into `List<ConvexShape>`.<br>• **Supports inverted outline shells**: elements with `from > to` are treated as solid volumes just like normal cuboids.<br>• **Exceptions**: throws `IllegalArgumentException` (caught by `ModelSelections` to fall back to vanilla selection box) if `elements` is empty, exceeds `SelectionGeometry.MAX_SHAPES (1024)`, or contains zero-thickness planes (such as crossed grass/torch planes) causing `ConvexShape` to throw `IllegalArgumentException("Zero-volume shape")`. |

### 3. `ModelSelection` & `ModelSelections` (Baked Model Selectors)

| Class / Interface / Method Signature | Description |
| :--- | :--- |
| `public interface ModelSelection` | Defines `void collect(RandomSource random, List<SelectionPart> output)` and `AABB bounds()`.<br>Includes three immutable implementation records:<br>• `ModelSelection.Fixed(SelectionPart part)`: single custom geometry part;<br>• `ModelSelection.Weighted(List<ModelSelection> variants, List<Integer> weights, int totalWeight, AABB bounds)`: picks a variant by position-seeded weight;<br>• `ModelSelection.Multipart(List<ModelSelection> parts, AABB bounds)`: collects multiple subparts with derived random seeds. |
| `ModelSelections.MAX_GEOMETRY_BYTES` | `16L * 1024 * 1024` (16 MB), global memory budget cap for shared `SelectionGeometry` of static models. |
| `ModelSelections.MAX_STATES` | `32768`, maximum number of enabled `BlockState`s supported. |
| `public static Snapshot bake(Map<BlockState, BlockStateModel> models)` | Iterates all block states in `BuiltInRegistries.BLOCK` where `CubeSelection.isEnabled(block)` is true, resolves and shares `SelectionGeometry`, and returns `ModelSelections.Snapshot(Map<BlockState, ModelSelection> states, long geometryBytes, int unsupportedStates)`. Recursion depth is capped at 16. |

---

## 4. `dev.anvilcraft.lib.v2.cube.geometry` Package API

### 1. `ConvexShape` (Closed Convex Polyhedron)

Represents a bounded closed convex polyhedron in block coordinate units (vertices, face normals/offsets, undirected edges, and AABB bounds).

| Constructor / Method Signature | Return Type | Description & Validation |
| :--- | :--- | :--- |
| `public ConvexShape(List<Vec3> vertices, int[][] faces)` | — | Constructs a convex polyhedron and automatically orients all face normals outward.<br>**Strict validation** (throws `IllegalArgumentException` if violated):<br>1. `vertices.size()` and `faces.length` must be in `[4, 256]`, with all vertex coordinates finite;<br>2. Each face must have `[3, 256]` vertex indices and must not be collinear/degenerate (squared normal length `>= 1e-20`);<br>3. Signed distance from geometric center to each face must be `< -1.0E-10` (rejects zero-volume thin sheets/planes);<br>4. Signed distance from all vertices to any face must be `<= 1.0E-6` (rejects non-convex/concave polyhedra). |
| `public static ConvexShape box(AABB bounds)` | `ConvexShape` | Constructs a standard 8-vertex, 6-face, 12-edge convex hexahedron from a non-degenerate `AABB`. |
| `public ConvexShape transform(Matrix4dc transform)` | `ConvexShape` | Transforms all vertices by the double-precision matrix `transform` and returns a new `ConvexShape`. |
| `public List<Vec3> vertices()` | `List<Vec3>` | Returns the immutable list of vertices. |
| `public List<Face> faces()` | `List<ConvexShape.Face>` | Returns the list of outward-facing planes. `Face(Vec3 normal, double planeOffset)` provides `double signedDistance(Vec3 point)` (`<= 0` inside, `> 0` outside). |
| `public List<Edge> edges()` | `List<ConvexShape.Edge>` | Returns the deduplicated list of undirected edges `Edge(Vec3 start, Vec3 end)`. |
| `public AABB bounds()` | `AABB` | Returns the axis-aligned bounding box of this convex polyhedron. |
| `public boolean contains(Vec3 point, double epsilon)` | `boolean` | Tests whether `point` lies inside all face half-spaces (`face.signedDistance(point) <= epsilon` for every face). |
| `public long estimatedBytes()` | `long` | Conservatively estimates memory usage in bytes for this object, vertices, faces, edges, and index arrays. |

### 2. `SelectionGeometry` (BVH-Accelerated Geometry Collection)

| Constant / Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final int MAX_SHAPES = 1024` | `int` | Maximum number of `ConvexShape`s allowed in a single `SelectionGeometry`. |
| `public static final int MAX_OUTLINE_SEGMENTS = 4096` | `int` | Maximum number of line segments allowed in a single geometry outline. |
| `public SelectionGeometry(List<ConvexShape> shapes)` | — | Builds an immutable geometry collection partitioned recursively by longest-axis median (BVH), and pre-generates a lightweight `fallbackOutline` (keeps all raw edges if total `<= 4096`, otherwise falls back to the 12 edges of the overall bounding box). Throws `IllegalArgumentException` if `shapes` is empty or `> 1024`. |
| `public List<ConvexShape> shapes()` | `List<ConvexShape>` | Returns the immutable list of convex polyhedra. |
| `public AABB bounds()` | `AABB` | Returns the root node's overall bounding box. |
| `public PackedOutline fallbackOutline()` | `PackedOutline` | Returns the fallback outline ready for immediate use without background computation. |
| `public long estimatedBytes()` | `long` | Returns estimated memory bytes including BVH nodes, convex polyhedra, and fallback outline. |
| `public List<ConvexShape> intersecting(AABB bounds)` | `List<ConvexShape>` | Queries all `ConvexShape`s whose bounding box intersects `bounds` via the BVH tree. |
| `public @Nullable RayHit clip(Vec3 start, Vec3 end)` | `SelectionGeometry.RayHit` | Performs BVH-accelerated Cyrus-Beck convex polyhedron ray intersection on segment `start -> end` in local space.<br>On hit, returns `RayHit(double fraction, Vec3 normal, boolean inside)` with `fraction ∈ [0, 1]`; if the start point is already inside (`inside == true` and `enter == 0`), the normal points opposite the ray direction. Returns `null` on miss. |

### 3. `OutlineBuilder`, `OutlineCache` & `PackedOutline` (Union Outline Building & Caching)

| Class | Key Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| `OutlineBuilder` | `public static PackedOutline build(SelectionGeometry geometry, long maxNanos, long maxOperations)` | Computes true outer contour segments of the union of all convex polyhedra in `geometry` and builds the `OutlineVisibility` seam visibility table. Throws `OutlineBuilder.BudgetExceededException` if time budget `maxNanos`, operation budget `maxOperations`, or segment cap `4096` is exceeded. Exposes `OutlineBuilder.Segment(Vec3 start, Vec3 end)` for a single contour segment. |
| `OutlineCache` | `MAX_CACHED_BYTES = 4 MB`<br>`MAX_PENDING_BYTES = 16 MB`<br>`MAX_ENTRIES = 128`<br>`MAX_PENDING = 8` | Thread-safe LRU background outline cache (implements `AutoCloseable`).<br>• `public synchronized PackedOutline get(SelectionGeometry geometry)`: returns cached result immediately if ready; otherwise submits a background task (100 ms / 1M op budget) and returns `geometry.fallbackOutline()` immediately without blocking the render thread.<br>• `public synchronized void clear()`: cancels all queued tasks and clears the cache.<br>• `public synchronized Statistics statistics()`: returns `OutlineCache.Statistics(entries, retainedBytes, pending, pendingBytes, completed, limited, failed)`. |
| `PackedOutline` | `public static final PackedOutline EMPTY`<br>`public static final int STRIDE = 9`<br>`public static PackedOutline of(List<OutlineBuilder.Segment> segments)`<br>`public PackedOutline forView(Vec3 camera)`<br>`public int segmentCount()`<br>`public float coordinate(int segment, int component)`<br>`public long estimatedBytes()` | Compact `float[]` outline array wrapper where each segment takes 9 `float`s: `[startX, startY, startZ, endX, endY, endZ, dirX, dirY, dirZ]`.<br>• Calling `forView(Vec3 camera)` (with camera coordinates in the same local space as the outline) culls occluded `< 0.1/16` tiny offset seams from that viewpoint and keeps silhouette segments; safely falls back to the original `PackedOutline` if the `200,000`-step view budget is exceeded. |
