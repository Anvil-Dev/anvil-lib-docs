# 方块碰撞箱 Util

`dev.anvilcraft.lib.v2.util.ShapeUtil` 提供方块碰撞箱 (`VoxelShape`) 的合并、切割、旋转与镜像。

## 单线程操作

- `merge(VoxelShape...)` / `merge(AABB...)` – 合并多个形状（`OR` 操作）
- `cut(VoxelShape base, VoxelShape... cutters)` – 从 base 中切去 cutters
- `cut(AABB base, AABB... cutters)` – 同上，输入为 AABB
- `rotate(Direction.Axis, float angle, VoxelShape)` – 旋转形状（逆时针）
- `rotate(Direction.Axis, float angle, AABB...)` – 旋转碰撞箱（16 像素坐标系）
- `mirror(Direction.Axis, VoxelShape)` / `mirror(Direction.Axis, AABB...)` – 镜像

## 多线程合并

`threadedJoin(List<VoxelShape>, BooleanOp, ExecutorService)` – 将大量形状分批并行合并，返回 `Future<VoxelShape>`
，适合在初始化阶段使用。

## 辅助方法

- `box(AABB)` – 将 16×16 的 AABB 转为 `VoxelShape`（等同于 `Block.box(...)`）
