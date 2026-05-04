# 数学 Util

`dev.anvilcraft.lib.v2.util.MathUtil` 提供常用数学与向量操作：

- `rotationDegrees(Vector2f, float)` / `rotate(Vector2f, float)` – 向量旋转
- `angle(Vector2f, Vector2f)` / `angleDegrees(...)` – 两向量夹角
- `isInRange(double, double, double)` / 二维版本 – 数值范围判断
- `dist(BlockPos, BlockPos)` – 块坐标差值（`Vec3i`）
- `getDirection(BlockPos, BlockPos)` – 从起点到终点的方向
- `safeDiv(float/ double, float/ double)` – 安全除法（0 返回 0）
- `clampWithProportion(float, float, float)` – 按区间循环 clamp（如角度归一化）
