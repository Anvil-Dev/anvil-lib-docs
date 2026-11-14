# Collision 碰撞检测工具 (`module.collision`)

<BranchContextCard branch="1.21.4" />

`module.collision`（构件名 `anvillib-collision-neoforge-1.21.4`，包名 `dev.anvilcraft.lib.v2.collision`）提供了一套纯数学、零游戏世界耦合的 **3D 轴对齐包围盒（AABB）与任意三维三角形网格（Triangle Mesh）的分离轴定理（SAT）精确碰撞检测工具类 `AnvilLibCollision`**。

原版 Minecraft 的 `VoxelShape` 仅能表达轴对齐的长方体组合，一旦模组引入了斜坡方块、旋转机械部件、三角网格地形或非轴对齐实体碰撞体，原版碰撞系统只能用阶梯状小盒子近似。`AnvilLibCollision` 基于 JOML 向量（`Vector3dc` / `Vector3fc`）实现了完整的 13 轴 SAT（3 条坐标轴 + 1 条三角形面法线轴 + 9 条边叉积轴）静态重叠判定、原版风格的三轴独立扫掠碰撞以及沿合成运动方向的真扫掠碰撞。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.4`，则已自动包含本模块；若仅需单独引入 `collision` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-collision-neoforge-1.21.4:2.0.0")
}
```

---

## 二、 三种碰撞检测模式与适用场景

`AnvilLibCollision` 提供了三种核心检测方式，其中三角形网格统一以 `Vector3fc[] triangles` 传入（每连续 3 个元素 `triangles[i * 3]`、`triangles[i * 3 + 1]`、`triangles[i * 3 + 2]` 构成一个世界坐标系下的三角形）：

1. **静态重叠检测（`intersectsAABBTriangle(min, max, triangles, epsilon)`）**：
   判断当前静止位置的 AABB 是否与任意一个三角形重叠（间距 $\le \text{epsilon}$）。内部先做 AABB-AABB 包围盒快速粗筛，再做 13 轴 SAT 精确检测。
2. **三轴独立扫掠碰撞（`intersectsAABBTriangle(min, max, motion, triangles, epsilon)`）**：
   沿 X、Y、Z 三个轴**独立**计算最大安全位移。沿 X 轴扫掠时保持 Y、Z 不变，与 Minecraft 原版 `Entity#collide` 行为一致，适合常规实体推开与防穿模修正。
3. **合成方向真扫掠碰撞（`sweptCollisionAABBTriangle(min, max, motion, triangles, epsilon)`）**：
   沿 `motion` 的真实三维合成方向平移 AABB，求解首次接触任意三角形时的安全位移向量 $\text{motion} \times t\ (t \in [0, 1])$。适合高速弹射物、斜向滑轨、活塞斜推等需要精确斜角碰撞点判定的场景。

---

## 三、 完整代码示例：实体与斜坡三角网格的运动碰撞修正

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
     * 构造方块位置处一个 45 度斜面方块的单三角形网格（由两个三角形组成斜面）
     */
    public static Vector3fc[] buildSlopeTriangles(BlockPos pos) {
        float x0 = pos.getX();
        float y0 = pos.getY();
        float z0 = pos.getZ();
        float x1 = x0 + 1.0f;
        float y1 = y0 + 1.0f;
        float z1 = z0 + 1.0f;

        return new Vector3fc[]{
            // 三角形 1: (x0, y0, z0) -> (x1, y0, z0) -> (x1, y1, z1)
            new Vector3f(x0, y0, z0),
            new Vector3f(x1, y0, z0),
            new Vector3f(x1, y1, z1),
            // 三角形 2: (x0, y0, z0) -> (x1, y1, z1) -> (x0, y1, z1)
            new Vector3f(x0, y0, z0),
            new Vector3f(x1, y1, z1),
            new Vector3f(x0, y1, z1)
        };
    }

    /**
     * 对实体的期望位移 deltaMovement 执行针对斜面网格的三轴独立扫掠裁剪
     */
    public static Vec3 clipEntityMovement(Entity entity, Vec3 desiredMotion, BlockPos slopePos) {
        AABB box = entity.getBoundingBox();
        Vector3d min = new Vector3d(box.minX, box.minY, box.minZ);
        Vector3d max = new Vector3d(box.maxX, box.maxY, box.maxZ);
        Vector3d motion = new Vector3d(desiredMotion.x, desiredMotion.y, desiredMotion.z);

        Vector3fc[] mesh = buildSlopeTriangles(slopePos);

        // 1. 先检查当前是否已经嵌入斜面中
        if (AnvilLibCollision.intersectsAABBTriangle(min, max, mesh, COLLISION_EPSILON)) {
            return Vec3.ZERO;
        }

        // 2. 计算三轴独立扫掠后的安全位移
        Vector3dc safeMotion = AnvilLibCollision.intersectsAABBTriangle(
            min, max, motion, mesh, COLLISION_EPSILON
        );
        return new Vec3(safeMotion.x(), safeMotion.y(), safeMotion.z());
    }

    /**
     * 对高速弹射物执行沿合成方向的真扫掠碰撞检测
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

## 四、 `AnvilLibCollision` 公开 API 详解

位于 `dev.anvilcraft.lib.v2.collision.AnvilLibCollision`。

| 方法签名 | 参数说明 | 返回值与边界条件 |
| :--- | :--- | :--- |
| `public static boolean intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3fc[] triangles, double epsilon)` | • `min` / `max`：AABB 世界坐标最小/最大角点<br>• `triangles`：顶点数组（长度须为 3 的倍数，不足 3 个的尾部元素忽略）<br>• `epsilon`：碰撞容差（间距 $\le \text{epsilon}$ 即视为重叠） | `boolean`：存在至少一个三角形与 AABB 重叠时返回 `true`。退化三角形（面积接近 0 的线段或点）会自动跳过面法线轴，仅用坐标轴与有效边叉积轴判定。 |
| `public static Vector3dc intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | • `min` / `max`：AABB 世界坐标最小/最大角点<br>• `motion`：三轴期望最大位移（分量可正可负）<br>• `triangles`：三角形顶点数组<br>• `epsilon`：碰撞容差 | `Vector3dc`：三轴独立扫掠后的实际安全位移。若某轴初始已重叠则该轴分量为 `0.0`；若某轴全程无碰撞则保留原始 `motion` 分量；若绝对位移 `< 1e-15` 直接置 `0.0`。 |
| `public static Vector3dc sweptCollisionAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | 同上 | `Vector3dc`：沿 `motion` 合成方向的最大安全位移向量 $\text{dir} \times \min(t_{\text{hit}})$。初始已重叠时返回 `(0, 0, 0)`；全程无碰撞时等于 `motion`。 |
| `public static boolean overlapOnAxis(Vector3dc axis, Vector3dc v0, Vector3dc v1, Vector3dc v2, Vector3dc boxHalfExtents, double epsilon)` | • `axis`：投影分离轴（无需预先单位化）<br>• `v0, v1, v2`：**以 AABB 中心为原点的局部坐标系**下的三角形三个顶点<br>• `boxHalfExtents`：AABB 半边长 `(hx, hy, hz)`<br>• `epsilon`：容差 | `boolean`：判断三角形在 `axis` 上的投影区间 $[t_{\min}, t_{\max}]$ 与中心在原点的 AABB 投影区间 $[-r - \epsilon, r + \epsilon]$ 是否有交集。注意调用此底层方法前必须先将三角形顶点减去 AABB 中心点。 |
