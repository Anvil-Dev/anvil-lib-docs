# Block Collision Box Util

`dev.anvilcraft.lib.v2.util.ShapeUtil` provides merging, cutting, rotation, and mirroring of block collision boxes (
`VoxelShape`).

## Single-threaded Operations

- `merge(VoxelShape...)` / `merge(AABB...)` – merges multiple shapes (`OR` operation)
- `cut(VoxelShape base, VoxelShape... cutters)` – cuts cutters from the base shape
- `cut(AABB base, AABB... cutters)` – same as above, with AABB input
- `rotate(Direction.Axis, float angle, VoxelShape)` – rotates shapes (counterclockwise)
- `rotate(Direction.Axis, float angle, AABB...)` – rotates collision boxes (16-pixel coordinate system)
- `mirror(Direction.Axis, VoxelShape)` / `mirror(Direction.Axis, AABB...)` – mirrors

## Multi-threaded Merging

`threadedJoin(List<VoxelShape>, BooleanOp, ExecutorService)` – merges a large number of shapes in batched parallel
operations, returns `Future<VoxelShape>`, suitable for use during initialization.

## Helper Methods

- `box(AABB)` – converts a 16x16 AABB to a `VoxelShape` (equivalent to `Block.box(...)`)
