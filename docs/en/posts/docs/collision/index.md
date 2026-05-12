---
title: Collision Detection
prev: false
next: false
---

# Collision Detection Module <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.collision` provides **SAT (Separating Axis Theorem)** based collision detection
between AABBs and triangle meshes. Supports static overlap detection, per-axis swept collision, and true-direction swept
collision.

> **Performance**: 1000 triangles / static 2μs / true swept 67μs

## Core API

`AnvilLibCollision` provides 4 public methods:

### intersectsAABBTriangle — Static Collision Detection

Checks whether an AABB overlaps with any triangle in a set.

```java
public static boolean intersectsAABBTriangle(
    Vector3dc min,       // AABB min corner
    Vector3dc max,       // AABB max corner
    Vector3fc[] triangles, // Triangle array, vertices[3*i] to vertices[3*i+2]
    double epsilon       // Collision tolerance (gap ≤ epsilon counts as overlap)
)
```

**Returns**: `true` if at least one triangle overlaps with the AABB.  
**Algorithm**: Bounding-box pre-filter (AABB-AABB quick rejection) followed by full SAT with 13 separating axes (3
coordinate + 1 face normal + 9 edge cross-product axes).

### intersectsAABBTriangle — Per-Axis Swept Collision

Sweeps the AABB independently along X, Y, and Z axes, computing the maximum safe displacement for each axis.

```java
public static Vector3dc intersectsAABBTriangle(
    Vector3dc min,       // AABB min corner
    Vector3dc max,       // AABB max corner
    Vector3dc motion,    // Maximum displacement per axis (components may be positive or negative)
    Vector3fc[] triangles, // Triangle array
    double epsilon       // Collision tolerance
)
```

**Returns**: The actual safe displacement vector. Component signs match `motion`, magnitude ≤ `|motion|`.

| Return Value          | Meaning                             |
|-----------------------|-------------------------------------|
| `motion` itself       | No collision along entire path      |
| Zero vector           | Already overlapping at start        |
| `0 < result < motion` | Collision encountered during motion |

**Why per-axis independence**: Matches vanilla Minecraft collision behavior — each component is "pushed away" by its
respective obstacle, avoiding slope-sliding issues.

### sweptCollisionAABBTriangle — True Swept Collision

Translates the AABB along the composite `motion` direction, finding the displacement at first triangle impact.

```java
public static Vector3dc sweptCollisionAABBTriangle(
    Vector3dc min,       // AABB min corner
    Vector3dc max,       // AABB max corner
    Vector3dc motion,    // Displacement vector (direction + magnitude)
    Vector3fc[] triangles, // Triangle array
    double epsilon       // Collision tolerance
)
```

**Returns**: `motion * t` where t ∈ [0,1] is the safe fraction.

| t Value   | Meaning                                  |
|-----------|------------------------------------------|
| t = 1     | No collision (returns original `motion`) |
| t = 0     | Already overlapping (returns zero)       |
| 0 < t < 1 | Collision encountered during motion      |

Unlike per-axis sweeping, this method sweeps along the composite motion direction, suitable for precise diagonal
collision detection.

### overlapOnAxis — Single Axis Projection Overlap

Tests whether a triangle and an AABB's projections overlap on a given axis.

```java
public static boolean overlapOnAxis(
    Vector3dc axis,         // Projection axis
    Vector3dc v0, v1, v2,   // Triangle vertices in local space (AABB center already subtracted)
    Vector3dc boxHalfExtents, // AABB half-extents
    double epsilon          // Collision tolerance
)
```

## Usage Example

```java
Vector3dc boxMin = new Vector3d(0, 0, 0);
Vector3dc boxMax = new Vector3d(1, 1, 1);
Vector3dc motion = new Vector3d(0.5, 0.3, 0.2);
Vector3fc[] triangles = { ... };
double eps = 0.001;

// 1. Static: is there a collision at the current position?
boolean hit = AnvilLibCollision.intersectsAABBTriangle(boxMin, boxMax, triangles, eps);

// 2. Per-axis sweep: how far can we safely move?
Vector3dc safePerAxis = AnvilLibCollision.intersectsAABBTriangle(boxMin, boxMax, motion, triangles, eps);

// 3. True swept: how far along the composite direction?
Vector3dc safeSwept = AnvilLibCollision.sweptCollisionAABBTriangle(boxMin, boxMax, motion, triangles, eps);
```

## Algorithm Details

### SAT — 13 Separating Axes

For each AABB triangle pair, 13 candidate separating axes are tested:

| Count | Type                    | Axes                      |
|-------|-------------------------|---------------------------|
| 3     | AABB face normals       | (1,0,0), (0,1,0), (0,0,1) |
| 1     | Triangle face normal    | `f0 × f1`                 |
| 9     | Edge cross-product axes | AABB edge × triangle edge |

If any axis separates the two projection intervals, there is no collision.

### Bounding Box Pre-Filter

Before full SAT, a quick AABB-AABB rejection test discards triangles whose bounding boxes don't intersect the target,
dramatically reducing the number of cross-product computations.

### Per-Axis vs True Swept

| Mode       | Method                                                     | Approach                        | Use Case                                         |
|------------|------------------------------------------------------------|---------------------------------|--------------------------------------------------|
| Per-axis   | `intersectsAABBTriangle(min,max,motion,triangles,eps)`     | Sweep along X/Y/Z independently | Vanilla Minecraft physics, block collisions      |
| True swept | `sweptCollisionAABBTriangle(min,max,motion,triangles,eps)` | Sweep along composite `motion`  | Precise diagonal collision, projectile detection |

## Benchmark

Test conditions: AABB `(0,0,0)→(2,2,2)`, motion `(0.5,0.3,0.2)`, epsilon=0, triangles randomly distributed in `[-10,12]`
cube, ~50% intersecting.

| Triangles | Static SAT | Per-Axis Swept | True Swept |
|-----------|------------|----------------|------------|
| 1         | 85 ns      | 361 ns         | 197 ns     |
| 10        | 145 ns     | 2.1 μs         | 654 ns     |
| 100       | 2.0 μs     | 21.9 μs        | 10.3 μs    |
| 1000      | 12.3 μs    | 260 μs         | 67.0 μs    |
| 10000     | 161 μs     | 2.17 ms        | 841 μs     |

## Test Coverage

`CollisionTest` includes 40 test cases (all passing):

| Group                   | Tests                                                                                                                                                                             |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A: Static Detection** | Inside, outside ±X/±Y/±Z, piercing, touching face, gap tolerance, point, line, triangle contains AABB, batch intersect, batch no intersect, cross-axis, negative-extent AABB (17) |
| **B: Single Axis**      | Overlap, separated, gap eps=0, gap eps=0.01 (4)                                                                                                                                   |
| **C: Per-Axis Swept**   | No obstacle ±X/±Y/±Z, blocked, initial overlap→0, one-way blocked other free, gap tolerance, moving away, diag blocked X+Y (10)                                                   |
| **D: True Swept**       | Axis-aligned blocked, diag slides past narrow wall, initial overlap, diag no obstacle, large wall diag blocked, zero motion, gap tolerance (7)                                    |

## Dependency

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-collision-neoforge-26.1:2.0.0"
}
```

## Notes

- All methods use `Vector3dc`/`Vector3fc` (JOML) — ensure correct precision types
- `epsilon` controls collision strictness: 0 = contact-only collision; larger values provide earlier "sensing"
- Triangle array length must be a multiple of 3
- Per-axis sweeping most closely matches vanilla Minecraft collision behavior
- True swept is suitable for precise diagonal collision scenarios, with slightly lower performance than per-axis
