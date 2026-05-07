# Math Util

`dev.anvilcraft.lib.v2.util.MathUtil` provides common math and vector operations:

- `rotationDegrees(Vector2f, float)` / `rotate(Vector2f, float)` – vector rotation
- `angle(Vector2f, Vector2f)` / `angleDegrees(...)` – angle between two vectors
- `isInRange(double, double, double)` / 2D version – numeric range check
- `dist(BlockPos, BlockPos)` – block position difference (`Vec3i`)
- `getDirection(BlockPos, BlockPos)` – direction from origin to destination
- `safeDiv(float/ double, float/ double)` – safe division (returns 0 when divisor is 0)
- `clampWithProportion(float, float, float)` – clamps cyclically within a range (e.g., angle normalization)
