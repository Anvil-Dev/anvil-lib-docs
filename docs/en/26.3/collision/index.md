# Collision Detection Utilities (`module.collision`)

<BranchContextCard branch="26.3" />

`module.collision` (artifact `anvillib-collision-neoforge-26.3`, package `dev.anvilcraft.lib.v2.collision`) provides high-precision static collision detection and continuous swept collision calculation between axis-aligned bounding boxes (AABB) and arbitrary 3D triangle meshes based on the **13-axis Separating Axis Theorem (SAT)**.

When a mod includes sloped blocks, rotating mechanical structures, irregular polyhedral entities, or custom physics colliders, Minecraft's vanilla collision system—which only supports axis-aligned `VoxelShape` (AABB collections)—creates a "stair-step" feel or fails to hug slopes smoothly. `AnvilLibCollision` runs SAT tests directly in double precision (`double`) on triangle vertex arrays without discretizing slopes into tiny AABBs.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.3`, this module is included automatically. To depend on `collision` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-collision-neoforge-26.3:2.0.0")
}
```

---

## 2. Core Algorithm & Comparison of Three Collision Modes

`AnvilLibCollision` translates triangle vertices from world space into a local coordinate system centered on the AABB, then tests **13 potential separating axes** in `double` precision:

1. **3 AABB face normal axes**: X `(1,0,0)`, Y `(0,1,0)`, Z `(0,0,1)`.
2. **1 triangle face normal axis**: `f0 × f1` (automatically skipped if the triangle is degenerate as a line or point).
3. **9 edge cross-product axes**: cross products of the 3 triangle edge vectors `f0, f1, f2` with the 3 coordinate axes.

Built around this SAT core, `AnvilLibCollision` provides three public collision modes:

| Mode | Method | Motion Handling | Typical Use Cases |
| :--- | :--- | :--- | :--- |
| **Static Overlap Test** | `intersectsAABBTriangle(min, max, triangles, epsilon)` | No motion vector; performs AABB broadphase followed by 13-axis SAT static overlap test | Checking whether an entity/region currently intersects a slope or triangle mesh, trigger volume checks |
| **3-Axis Independent Sweep** | `intersectsAABBTriangle(min, max, motion, triangles, epsilon)` | Splits `motion` into independent X, Y, Z components and finds the maximum safe displacement along each axis (Y and Z stay at initial positions during X sweep) | Matches vanilla `Entity.collide` 3-axis push-out semantics, preventing unintended lateral sliding on slopes |
| **Combined-Vector True Sweep** | `sweptCollisionAABBTriangle(min, max, motion, triangles, epsilon)` | Sweeps directly along the combined `motion` direction vector, solving for first time-of-impact `t ∈ [0, 1]` and returning `motion * t` | Projectiles, high-speed entities, and exact continuous collision detection (CCD) diagonally through narrow gaps |

> **Why distinguish "3-Axis Independent Sweep" from "Combined-Vector True Sweep"?**
> Suppose an AABB moves diagonally from `(0,0,0)->(2,2,2)` with `motion = (5, 5, 0)`, and there is a low wall at `x = 5, y ∈ [0, 2]`:
> - **3-Axis Independent Sweep** hits this wall when testing the X axis alone, returning `(3, 5, 0)` (conservative, matching vanilla axis-by-axis movement);
> - **Combined-Vector True Sweep** translates along the 45° diagonal as a whole; by the time the AABB reaches `x = 5`, its Y coordinate is already past `y = 2`, so it clears the wall and returns the full `(5, 5, 0)`.

---

## 3. Full Code Example

The example below demonstrates building a sloped triangle mesh and invoking static detection, 3-axis independent sweep, and combined-direction true sweep in entity movement logic:

```java
package com.example.mymod.physics;

import dev.anvilcraft.lib.v2.collision.AnvilLibCollision;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;
import org.joml.Vector3dc;
import org.joml.Vector3f;
import org.joml.Vector3fc;

public final class RampCollisionHelper {
    // Define a 45-degree ramp made of two triangles (every 3 Vector3fc elements form 1 triangle)
    private static final Vector3fc[] RAMP_TRIANGLES = new Vector3fc[] {
        // Triangle 0
        new Vector3f(0.0f, 0.0f, 0.0f),
        new Vector3f(1.0f, 1.0f, 0.0f),
        new Vector3f(1.0f, 1.0f, 1.0f),
        // Triangle 1
        new Vector3f(0.0f, 0.0f, 0.0f),
        new Vector3f(1.0f, 1.0f, 1.0f),
        new Vector3f(0.0f, 0.0f, 1.0f)
    };

    private static final double EPSILON = 1e-4;

    private RampCollisionHelper() {
    }

    /**
     * Check whether the entity's current bounding box already touches the ramp mesh
     */
    public static boolean isTouchingRamp(AABB entityBox) {
        Vector3dc min = new Vector3d(entityBox.minX, entityBox.minY, entityBox.minZ);
        Vector3dc max = new Vector3d(entityBox.maxX, entityBox.maxY, entityBox.maxZ);
        return AnvilLibCollision.intersectsAABBTriangle(min, max, RAMP_TRIANGLES, EPSILON);
    }

    /**
     * Clip the entity motion vector axis-by-axis in vanilla style
     */
    public static Vec3 clipPerAxis(AABB entityBox, Vec3 deltaMovement) {
        Vector3dc min = new Vector3d(entityBox.minX, entityBox.minY, entityBox.minZ);
        Vector3dc max = new Vector3d(entityBox.maxX, entityBox.maxY, entityBox.maxZ);
        Vector3dc motion = new Vector3d(deltaMovement.x, deltaMovement.y, deltaMovement.z);

        Vector3dc safeMotion = AnvilLibCollision.intersectsAABBTriangle(
            min, max, motion, RAMP_TRIANGLES, EPSILON
        );
        return new Vec3(safeMotion.x(), safeMotion.y(), safeMotion.z());
    }

    /**
     * Perform continuous swept collision along the combined motion direction (ideal for high-speed projectiles)
     */
    public static Vec3 clipTrueSwept(AABB projectileBox, Vec3 velocity) {
        Vector3dc min = new Vector3d(projectileBox.minX, projectileBox.minY, projectileBox.minZ);
        Vector3dc max = new Vector3d(projectileBox.maxX, projectileBox.maxY, projectileBox.maxZ);
        Vector3dc motion = new Vector3d(velocity.x, velocity.y, velocity.z);

        Vector3dc safeMotion = AnvilLibCollision.sweptCollisionAABBTriangle(
            min, max, motion, RAMP_TRIANGLES, EPSILON
        );
        return new Vec3(safeMotion.x(), safeMotion.y(), safeMotion.z());
    }
}
```

---

## 4. `AnvilLibCollision` Public API Reference

### 1. Method Signatures & Parameter Details

| Method Signature | Return Type | Parameters & Behavior |
| :--- | :--- | :--- |
| `public static boolean intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3fc[] triangles, double epsilon)` | `boolean` | **Static SAT collision test**.<br>• `min` / `max`: world-space min and max corners of the AABB (`min <= max` required; inverted ranges like `min > max` yield negative half-extents and return `false`).<br>• `triangles`: flattened triangle vertex array where every 3 consecutive elements `(triangles[3*i], triangles[3*i+1], triangles[3*i+2])` form one triangle; trailing remainder elements `< 3` are ignored via `triangles.length / 3`.<br>• `epsilon`: collision tolerance; gap `<= epsilon` counts as overlapping. |
| `public static Vector3dc intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | `Vector3dc` | **3-axis independent swept collision**.<br>• Computes maximum safe displacement independently for X, Y, and Z.<br>• If an axis component has `|d| < 1e-15`, it is clamped to `0.0`.<br>• If at initial state (`t = 0`) the AABB already overlaps any triangle (or gap `<= epsilon`), all non-zero motion axes return `0.0`.<br>• If moving away from obstacles or no collision occurs, returns the original component `d`. |
| `public static Vector3dc sweptCollisionAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | `Vector3dc` | **Combined-vector true swept collision**.<br>• Sweeps along the unit direction `dir = motion / |motion|`.<br>• If `motion.length() < 1e-15`, returns zero vector `(0, 0, 0)`.<br>• If already overlapping initially, returns `(0, 0, 0)`; if no collision occurs, returns a vector equal to `motion`; if collision occurs at ratio `t`, returns `motion * t`. |
| `public static boolean overlapOnAxis(Vector3dc axis, Vector3dc v0, Vector3dc v1, Vector3dc v2, Vector3dc boxHalfExtents, double epsilon)` | `boolean` | **Single-axis projection overlap test (low-level primitive)**.<br>• Tests whether the origin-centered AABB with half-extents `boxHalfExtents` overlaps the local-space triangle `(v0, v1, v2)` along `axis`.<br>• `v0, v1, v2` **must already be in local space with the AABB center subtracted**! Passing world-space vertices causes projection offset bugs.<br>• `axis` need not be normalized, but `epsilon` is added directly to projection values, so non-unit axes scale the physical tolerance by `1 / |axis|`. |

### 2. Boundary Conditions & Common Pitfalls

1. **Triangle vertex array length must be a multiple of 3**: `triangles` uses a flat array instead of nested objects to avoid allocations and cache misses during large mesh tests. Ensure `triangles.length % 3 == 0`.
2. **Degenerate triangle (point/segment) compatibility**: When three vertices are collinear (line segment) or coincident (point), `f0.cross(f1)` has squared length `<= 1e-15`; `AnvilLibCollision` safely skips the face normal axis and completes exact testing via the 3 coordinate axes and 9 edge cross-product axes without `NaN` pollution.
3. **Initial overlap return behavior**: When `epsilon` is too large or an entity is already embedded inside a triangle, both swept methods (`intersectsAABBTriangle` and `sweptCollisionAABBTriangle`) detect initial overlap and return `0` displacement. In game physics loops, pair a moderate `epsilon` (e.g., `1e-4`–`1e-3`) with a tiny skin width after applying safe displacement to avoid landing in `gap <= epsilon` on the next tick.

---

## 5. Internal Self-Test & Benchmark Tool (`CollisionTest`)

| Class | Signature | Description |
| :--- | :--- | :--- |
| `CollisionTest` | `@ApiStatus.Internal public class CollisionTest` | Built-in standalone verification and microbenchmark class (with `static void main()`), covering 32 edge cases (inside/outside, penetration, flush contact, `epsilon` tolerance, degenerate points/lines, negative half-extents, 3-axis sweep vs diagonal true sweep) and nanosecond benchmarks for 1–10,000 triangles. For library developer regression testing only; do not call from mod code. |
