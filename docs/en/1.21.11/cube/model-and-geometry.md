# Model Decoding & Convex Geometry (`model` / `geometry`)

<BranchContextCard branch="1.21.11" />

This page covers the two core low-level packages of `module.cube`:
1. **`dev.anvilcraft.lib.v2.cube.client.model`**: Decodes Minecraft `1.21.11` `BlockElement`, `ResolvedModel`, and `BlockStateModel` (`SimpleModelWrapper`, `SingleVariantAccessor`, `WeightedModelAccessor`, `MultipartModelAccessor`) into convex polyhedral geometry;
2. **`dev.anvilcraft.lib.v2.cube.geometry`**: Provides 3D closed convex polyhedra **`ConvexShape`**, BVH-accelerated **`SelectionGeometry`**, coplanar culling & edge clipping **`OutlineBuilder`** / **`OutlineVisibility`**, compact float segment arrays **`PackedOutline`**, and background async **`OutlineCache`**.

Even without automatic JSON model capture, you can use `ConvexShape` and `SelectionGeometry` directly to build raycasting and culled outlines for procedural polyhedra.

---

## 1. Full Code Example: Manually Building Rotated Convex Geometry & Raycasting

```java
package com.example.mymod.client.geometry;

import com.mojang.math.Axis;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.OutlineBuilder;
import dev.anvilcraft.lib.v2.cube.geometry.PackedOutline;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

import java.util.List;

public final class ProceduralGeometryExample {
    private ProceduralGeometryExample() {
    }

    public static SelectionGeometry buildOctagonalPillarGeometry() {
        // 1. Create a base cuboid convex shape centered at (0.5, 0.5, 0.5)
        ConvexShape box0 = ConvexShape.box(new AABB(0.2, 0.0, 0.2, 0.8, 1.0, 0.8));

        // 2. Rotate 45° around the block center Y axis to create a second intersecting cuboid
        Matrix4f rot45 = new Matrix4f()
            .translate(0.5F, 0.5F, 0.5F)
            .rotate(Axis.YP.rotationDegrees(45.0F))
            .translate(-0.5F, -0.5F, -0.5F);
        ConvexShape box45 = box0.transformed(rot45);

        // 3. Combine into a BVH-accelerated SelectionGeometry (optionally pass unitsPerBlock as 2nd arg for scaled coords)
        return new SelectionGeometry(List.of(box0, box45));
    }

    public static void raycastAndBuildOutline(SelectionGeometry geometry) {
        // A. Perform precise ray intersection in local coordinates
        SelectionGeometry.RayHit hit = geometry.clip(
            new Vec3(-0.5, 0.5, 0.5),
            new Vec3(1.5, 0.5, 0.5)
        );
        if (hit != null) {
            Vec3 normal = hit.normal();     // Exact unit outward normal of the hit plane (e.g., 45° diagonal normal)
            double t = hit.fraction();      // [0, 1] ray hit fraction
        }

        // B. Immediately build compact outline segments with boolean clipping (removes internal intersecting edges)
        PackedOutline cleanOutline = OutlineBuilder.build(geometry);
    }
}
```

---

## 2. Geometry Core Package API Reference (`dev.anvilcraft.lib.v2.cube.geometry`)

### 1. `ConvexShape` (3D Closed Convex Polyhedron)

Immutable convex solid formed by outward-facing half-space planes (`Face`), polygon vertex rings, and edges (`Edge`).

| Constructor / Factory / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final int MAX_FACES = 32` | `int` | Maximum number of faces allowed per convex polyhedron (`[4, 32]`). |
| `public static ConvexShape box(AABB bounds)` | `ConvexShape` | Creates a 6-face cuboid convex shape from a non-degenerate 3D `AABB` (all axes `> 1e-6`). |
| `public static ConvexShape fromPlanes(List<Plane> planes)` | `ConvexShape` | Constructs a convex polyhedron from half-space planes `{ n · x <= d }` via half-space intersection (requires `[4, 32]` planes, bounded closure, and non-degenerate 3D volume, else throws `IllegalArgumentException`). |
| `public ConvexShape transformed(Matrix4f matrix)`<br>`public ConvexShape transform(Matrix4d matrix)` | `ConvexShape` | Transforms this convex shape by an invertible `float` or `double` matrix and returns a new `ConvexShape`. |
| `public boolean contains(Vec3 point, double tolerance)` | `boolean` | Tests whether `point` lies inside the convex polyhedron (signed distance `<= tolerance` for all faces). |
| `public AABB bounds()` / `List<Vec3> vertices()` / `List<Face> faces()` / `List<Edge> edges()` / `long estimatedBytes()` | Corresponding type | Returns outer bounds, deduplicated vertex list, face list, edge list, and estimated memory bytes. |

- **Inner record classes**:
  - `ConvexShape.Plane(Vec3 normal, double offset)`: plane equation `normal · x = offset`;
  - `ConvexShape.Face(Vec3 normal, double planeOffset, List<Vec3> vertices)`: provides `double signedDistance(Vec3 point)` (`normal.dot(point) - planeOffset`);
  - `ConvexShape.Edge(Vec3 start, Vec3 end, Vec3 firstNormal, Vec3 secondNormal)`: a convex edge and the outward normals of its two adjacent faces.

---

### 2. `SelectionGeometry` (BVH-Accelerated Geometry Collection)

| Constant / Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final int MAX_SHAPES = 1024`<br>`public static final int MAX_OUTLINE_SEGMENTS = 4096` | `int` | Maximum convex shapes (`1024`) and outline segments (`4096`) per geometry. |
| `public SelectionGeometry(List<ConvexShape> shapes)`<br>`public SelectionGeometry(List<ConvexShape> shapes, double unitsPerBlock)` | `SelectionGeometry` | Builds an immutable geometry collection with an auto-partitioned BVH tree and pre-built unclipped `fallbackOutline`. `unitsPerBlock` (default `1`) specifies geometry units per block. |
| `public @Nullable RayHit clip(Vec3 start, Vec3 end)` | `@Nullable RayHit` | Finds the closest intersection `RayHit(double fraction, Vec3 normal, boolean inside)` along `[start, end]` via BVH and Cyrus-Beck clipping. |
| `public List<ConvexShape> intersecting(AABB bounds)` | `List<ConvexShape>` | Queries all `ConvexShape`s intersecting `bounds` via BVH. |
| `public List<ConvexShape> shapes()` / `AABB bounds()` / `PackedOutline fallbackOutline()` / `long estimatedBytes()` | Corresponding type | Accessor methods. |

---

### 3. `OutlineBuilder`, `PackedOutline` & `OutlineCache`

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`OutlineBuilder`** | • `public static final int MAX_OPERATIONS = 200_000`<br>• `public static PackedOutline build(SelectionGeometry geometry)`<br>• `public record Segment(Vec3 start, Vec3 end)` | Performs deep edge clipping, coplanar seam culling, and collinear merging across all shapes in `SelectionGeometry`, precomputing `OutlineVisibility` tiny offset seams (safely falls back to `fallbackOutline()` if `200,000` operations are exceeded). |
| **`PackedOutline`** | • `public static final PackedOutline EMPTY`<br>• `public static PackedOutline of(List<OutlineBuilder.Segment> segments)`<br>• `public int segmentCount()`<br>• `public float coordinate(int segment, int offset)`<br>• `public PackedOutline forView(Vec3 camera)`<br>• `public long estimatedBytes()` | Packs all 3D line segments into a flat `float[]` array (9 `float`s per segment: `x0, y0, z0, x1, y1, z1, dx, dy, dz`). `forView(camera)` culls occluded interior segments for the current viewpoint in real time. |
| **`OutlineCache`** | • `public static final long MAX_BYTES = 16L * 1024 * 1024`<br>• `public PackedOutline get(SelectionGeometry geometry)`<br>• `public void clear()`<br>• `public Statistics statistics()` | Thread-safe LRU + background daemon thread (`"anvillib-cube-outline"`) outline cache with a 16 MB memory cap. |

---

## 3. Model Decoding Package API Reference (`dev.anvilcraft.lib.v2.cube.client.model`)

| Class / Interface | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`CubeModelDecoder`** | `public static List<ConvexShape> decode(List<BlockElement> elements, ModelState modelState)` | Decodes 1.21.11 `BlockElement` lists (supporting arbitrary rotation/Euler/scale via `rotation.transform()` and `ModelState` double-precision transforms) into block-space (`1/16` scale) `ConvexShape`s (throws `IllegalArgumentException` if empty or `> 1024`). |
| **`ModelCapture`** | • `public static synchronized void remember(ResolvedModel model, ModelState state, BlockModelPart baked)`<br>• `public static synchronized Map<BlockModelPart, Source> take()`<br>• `public record Source(List<BlockElement> elements, ModelState state)` | Called by `SimpleModelWrapperMixin` after `SimpleModelWrapper.bake(...)` returns `BlockModelPart` (reads `SimpleUnbakedGeometry` elements from `ResolvedModel#getTopGeometry()` and merges `NeoForgeModelProperties.TRANSFORM` into `ModelState`), temporarily storing `BlockModelPart -> Source` in a weak-keyed map until `take()` consumes and clears it after baking. |
| **`ModelSelections`** | • `public static final long MAX_GEOMETRY_BYTES = 16L * 1024 * 1024`<br>• `public static final int MAX_STATES = 32768`<br>• `public static Snapshot bake(Map<BlockState, BlockStateModel> models)`<br>• `public static Snapshot bake(Map<BlockState, BlockStateModel> models, Predicate<Block> enabled)`<br>• `public record Snapshot(Map<BlockState, ModelSelection> states, long geometryBytes, int unsupportedStates)` | Iterates all block states matching `enabled`, recursively resolves `BlockStateModel` trees via `SingleVariantAccessor`, `WeightedModelAccessor`, and `MultipartModelAccessor`, and deduplicates identical `SelectionGeometry` instances (16 MB total memory cap). |
| **`ModelSelection`** | Interface and its three internal implementation records:<br>• `record Fixed(SelectionPart part)`<br>• `record Weighted(List<ModelSelection> variants, List<Integer> weights, int totalWeight, AABB bounds)`<br>• `record Multipart(List<ModelSelection> parts, AABB bounds)`<br>• `void collect(RandomSource random, List<SelectionPart> output)`<br>• `AABB bounds()` | Represents a baked selection model tree for a single `BlockState`, collecting active `SelectionPart`s by `RandomSource` weight and multipart conditions. |
