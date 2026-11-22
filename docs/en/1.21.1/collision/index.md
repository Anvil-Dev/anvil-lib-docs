# Collision Detection Utilities (`module.collision`)

<BranchContextCard branch="1.21.1" />

`module.collision` (artifact `anvillib-collision-neoforge-1.21.1`, package `dev.anvilcraft.lib.v2.collision`) provides **`AnvilLibCollision`**, a pure-math, zero-world-coupling **3D AABB vs. arbitrary triangle mesh Separating Axis Theorem (SAT) collision detection utility**.

Vanilla Minecraft's `VoxelShape` can only represent combinations of axis-aligned cuboids; when mods introduce sloped blocks, rotating mechanical parts, triangle-mesh terrain, or non-axis-aligned entity colliders, vanilla collision can only approximate them with stepped boxes. `AnvilLibCollision` implements full 13-axis SAT (3 coordinate axes + 1 triangle face normal + 9 edge cross products) on JOML vectors (`Vector3dc` / `Vector3fc`) for static overlap testing, vanilla-style 3-axis independent swept collision, and true combined-direction swept collision.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.1`, this module is included automatically. To depend on `collision` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-collision-neoforge-1.21.1:2.0.0")
}
```

---

## 2. Three Collision Modes & Use Cases

`AnvilLibCollision` provides three core detection modes taking `Vector3fc[] triangles` (every 3 consecutive elements `triangles[i * 3]`, `triangles[i * 3 + 1]`, `triangles[i * 3 + 2]` form one world-space triangle):

1. **Static Overlap Test (`intersectsAABBTriangle(min, max, triangles, epsilon)`)**:
   Tests whether a stationary AABB overlaps any triangle (gap $\le \text{epsilon}$). Performs a fast AABB-AABB broadphase first, then exact 13-axis SAT testing.
2. **3-Axis Independent Swept Collision (`intersectsAABBTriangle(min, max, motion, triangles, epsilon)`)**:
   Computes maximum safe displacement **independently** along X, Y, and Z. Keeps Y and Z fixed during the X sweep, matching vanilla `Entity#collide` behavior for standard entity push-out and anti-tunneling.
3. **Combined-Direction True Swept Collision (`sweptCollisionAABBTriangle(min, max, motion, triangles, epsilon)`)**:
   Translates the AABB along the true 3D combined `motion` direction, solving for the safe displacement vector $\text{motion} \times t\ (t \in [0, 1])$ at first contact—ideal for high-speed projectiles, diagonal rails, and angled piston pushes.

---

## 3. Full Code Example: Entity Motion Collision Correction Against a Sloped Triangle Mesh

```java
package com.example.mymod.physics;

import dev.anvilcraft.lib.v2.collision.AnvilLibCollision;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;
import org.joml.Vector3dc;
import org.joml.Vector3f;
import org.joml.Vector3fc;

public final class SlopeCollisionHelper {
    private static final double COLLISION_EPSILON = 1e-5;

    private SlopeCollisionHelper() {
    }

    /**
     * Build a single-triangle mesh for a 45-degree sloped block at the block position (ramp formed by two triangles)
     */
    public static Vector3fc[] buildSlopeTriangles(BlockPos pos) {
        float x0 = pos.getX();
        float y0 = pos.getY();
        float z0 = pos.getZ();
        float x1 = x0 + 1.0f;
        float y1 = y0 + 1.0f;
        float z1 = z0 + 1.0f;

        return new Vector3fc[]{
            // Triangle 1: (x0, y0, z0) -> (x1, y0, z0) -> (x1, y1, z1)
            new Vector3f(x0, y0, z0),
            new Vector3f(x1, y0, z0),
            new Vector3f(x1, y1, z1),
            // Triangle 2: (x0, y0, z0) -> (x1, y1, z1) -> (x0, y1, z1)
            new Vector3f(x0, y0, z0),
            new Vector3f(x1, y1, z1),
            new Vector3f(x0, y1, z1)
        };
    }

    /**
     * Clip an entity's desired deltaMovement against the ramp mesh using 3-axis independent sweep
     */
    public static Vec3 clipEntityMovement(Entity entity, Vec3 desiredMotion, BlockPos slopePos) {
        AABB box = entity.getBoundingBox();
        Vector3d min = new Vector3d(box.minX, box.minY, box.minZ);
        Vector3d max = new Vector3d(box.maxX, box.maxY, box.maxZ);
        Vector3d motion = new Vector3d(desiredMotion.x, desiredMotion.y, desiredMotion.z);

        Vector3fc[] mesh = buildSlopeTriangles(slopePos);

        // 1. Check if already embedded inside the ramp
        if (AnvilLibCollision.intersectsAABBTriangle(min, max, mesh, COLLISION_EPSILON)) {
            return Vec3.ZERO;
        }

        // 2. Compute safe displacement via 3-axis independent sweep
        Vector3dc safeMotion = AnvilLibCollision.intersectsAABBTriangle(
            min, max, motion, mesh, COLLISION_EPSILON
        );
        return new Vec3(safeMotion.x(), safeMotion.y(), safeMotion.z());
    }

    /**
     * Run true swept collision along combined motion direction for high-speed projectiles
     */
    public static Vec3 clipProjectileMovement(AABB projectileBox, Vec3 velocity, Vector3fc[] mesh) {
        Vector3d min = new Vector3d(projectileBox.minX, projectileBox.minY, projectileBox.minZ);
        Vector3d max = new Vector3d(projectileBox.maxX, projectileBox.maxY, projectileBox.maxZ);
        Vector3d motion = new Vector3d(velocity.x, velocity.y, velocity.z);

        Vector3dc safeMotion = AnvilLibCollision.sweptCollisionAABBTriangle(
            min, max, motion, mesh, COLLISION_EPSILON
        );
        return new Vec3(safeMotion.x(), safeMotion.y(), safeMotion.z());
    }
}
```

---

## 4. `AnvilLibCollision` Public API Reference

Located in `dev.anvilcraft.lib.v2.collision.AnvilLibCollision`.

| Method Signature | Parameters | Return Value & Boundary Conditions |
| :--- | :--- | :--- |
| `public static boolean intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3fc[] triangles, double epsilon)` | • `min` / `max`: world-space AABB min/max corners<br>• `triangles`: vertex array (length must be a multiple of 3; trailing `< 3` elements ignored)<br>• `epsilon`: collision tolerance (gap $\le \text{epsilon}$ counts as overlap) | `boolean`: returns `true` if at least one triangle overlaps the AABB. Degenerate triangles (near-zero-area lines or points) skip the face normal axis and test with coordinate and valid edge-cross axes. |
| `public static Vector3dc intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | • `min` / `max`: world-space AABB min/max corners<br>• `motion`: desired max displacement per axis (positive or negative)<br>• `triangles`: triangle vertex array<br>• `epsilon`: collision tolerance | `Vector3dc`: safe displacement after 3-axis independent sweep. Overlapping axes return `0.0`; non-colliding axes keep original `motion`; displacements `< 1e-15` clamp to `0.0`. |
| `public static Vector3dc sweptCollisionAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | Same as above | `Vector3dc`: max safe displacement vector $\text{dir} \times \min(t_{\text{hit}})$ along combined `motion`. Returns `(0, 0, 0)` on initial overlap, or `motion` if no collision occurs. |
| `public static boolean overlapOnAxis(Vector3dc axis, Vector3dc v0, Vector3dc v1, Vector3dc v2, Vector3dc boxHalfExtents, double epsilon)` | • `axis`: separating axis (need not be unit-length)<br>• `v0, v1, v2`: triangle vertices in **local coordinates centered at AABB center**<br>• `boxHalfExtents`: AABB half-extents `(hx, hy, hz)`<br>• `epsilon`: tolerance | `boolean`: tests whether the triangle's projection $[t_{\min}, t_{\max}]$ on `axis` intersects the origin-centered AABB projection $[-r - \epsilon, r + \epsilon]$. Subtract the AABB center from triangle vertices before calling this low-level primitive. |
