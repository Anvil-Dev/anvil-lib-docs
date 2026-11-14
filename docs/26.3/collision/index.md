# Collision 碰撞检测工具 (`module.collision`)

<BranchContextCard branch="26.3" />

`module.collision`（构件名 `anvillib-collision-neoforge-26.3`，包名 `dev.anvilcraft.lib.v2.collision`）提供基于 **13 轴分离轴定理（SAT, Separating Axis Theorem）** 的轴对齐包围盒（AABB）与任意三维三角形网格（Triangle Mesh）之间的高精度静态碰撞检测与连续扫掠碰撞（Swept Collision）计算。

当模组中包含斜面方块、旋转机械结构、不规则多面体实体或自定义物理碰撞体时，Minecraft 原版仅支持轴对齐 `VoxelShape`（AABB 集合）的碰撞系统会产生“台阶感”或无法贴合斜面。`AnvilLibCollision` 直接在双精度浮点数（`double`）下对三角形顶点数组执行 SAT 判定，无需将斜面离散化为大量微小 AABB。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.3`，则已自动包含本模块；若仅需单独引入 `collision` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-collision-neoforge-26.3:2.0.0")
}
```

---

## 二、 核心算法与三种碰撞模式对比

`AnvilLibCollision` 将三角形顶点从世界坐标平移到以 AABB 中心为原点的局部坐标系，在 `double` 精度下依次检测 **13 条潜在分离轴**：

1. **3 条 AABB 面法线轴**：X 轴 `(1,0,0)`、Y 轴 `(0,1,0)`、Z 轴 `(0,0,1)`。
2. **1 条三角形面法线轴**：`f0 × f1`（若三角形退化为线段或点则自动跳过该轴）。
3. **9 条边叉积轴**：三角形的 3 条边向量 `f0, f1, f2` 分别与 3 条坐标轴叉乘得到的 9 条轴。

围绕这套 SAT 核心，`AnvilLibCollision` 提供三种公开碰撞计算方式：

| 模式 | 对应方法 | 运动处理方式 | 典型使用场景 |
| :--- | :--- | :--- | :--- |
| **静态重叠检测** | `intersectsAABBTriangle(min, max, triangles, epsilon)` | 不含位移向量，先做 AABB 包围盒粗筛，再做 13 轴 SAT 静态重叠判定 | 检测实体/区域当前是否与斜面或三角网格模型相交、触发器区域判定 |
| **三轴独立扫掠** | `intersectsAABBTriangle(min, max, motion, triangles, epsilon)` | 将 `motion` 拆分为 X、Y、Z 三个独立分量，沿每个坐标轴分别求最大安全位移（沿 X 扫掠时 Y、Z 保持初始位置不变） | 与 Minecraft 原版 `Entity.collide` 三轴独立推开语义保持一致，防止物体在斜面上发生非预期的侧滑 |
| **合成向量真扫掠** | `sweptCollisionAABBTriangle(min, max, motion, triangles, epsilon)` | 沿 `motion` 的合成方向向量直接平移扫掠，求解首次碰撞时间比例 `t ∈ [0, 1]` 并返回 `motion * t` | 弹射物、高速运动实体、对角线穿过狭窄障碍物缝隙的精确连续碰撞检测（CCD） |

> **为什么区分“三轴独立扫掠”与“合成向量真扫掠”？**
> 假设 AABB 从 `(0,0,0)->(2,2,2)` 以 `motion = (5, 5, 0)` 沿对角线移动，而在 `x = 5, y ∈ [0, 2]` 处有一堵矮墙：
> - **三轴独立扫掠**在单独测试 X 轴时会撞上这堵墙，返回 `(3, 5, 0)`（偏保守，但符合原版逐轴移动习惯）；
> - **合成向量真扫掠**沿 45° 对角线整体平移，当 AABB 到达 `x = 5` 时其 Y 坐标早已越过 `y = 2`，因此不会撞墙，返回完整的 `(5, 5, 0)`。

---

## 三、 完整代码示例

下面演示如何构建斜坡三角形网格，并在实体移动逻辑中调用静态检测、三轴独立扫掠与合成方向真扫掠：

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
    // 定义一个由两个三角形拼成的 45 度斜坡面（每 3 个 Vector3fc 构成 1 个三角形）
    private static final Vector3fc[] RAMP_TRIANGLES = new Vector3fc[] {
        // 三角形 0
        new Vector3f(0.0f, 0.0f, 0.0f),
        new Vector3f(1.0f, 1.0f, 0.0f),
        new Vector3f(1.0f, 1.0f, 1.0f),
        // 三角形 1
        new Vector3f(0.0f, 0.0f, 0.0f),
        new Vector3f(1.0f, 1.0f, 1.0f),
        new Vector3f(0.0f, 0.0f, 1.0f)
    };

    private static final double EPSILON = 1e-4;

    private RampCollisionHelper() {
    }

    /**
     * 判断实体当前包围盒是否已经接触斜坡网格
     */
    public static boolean isTouchingRamp(AABB entityBox) {
        Vector3dc min = new Vector3d(entityBox.minX, entityBox.minY, entityBox.minZ);
        Vector3dc max = new Vector3d(entityBox.maxX, entityBox.maxY, entityBox.maxZ);
        return AnvilLibCollision.intersectsAABBTriangle(min, max, RAMP_TRIANGLES, EPSILON);
    }

    /**
     * 按原版风格逐轴裁剪实体移动向量
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
     * 按合成运动方向执行连续扫掠碰撞（适合高速弹射物）
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

## 四、 `AnvilLibCollision` 公开 API 详解

### 1. 方法签名与参数说明表

| 方法签名 | 返回值 | 参数与行为说明 |
| :--- | :--- | :--- |
| `public static boolean intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3fc[] triangles, double epsilon)` | `boolean` | **静态 SAT 碰撞检测**。<br>• `min` / `max`：AABB 的世界坐标最小角与最大角（需满足 `min <= max`；若传入反向区间如 `min > max`，半边长为负将返回 `false`）。<br>• `triangles`：扁平化的三角形顶点数组，每连续 3 个元素 `(triangles[3*i], triangles[3*i+1], triangles[3*i+2])` 构成一个三角形；数组长度尾部不足 3 的余数元素会被 `triangles.length / 3` 忽略。<br>• `epsilon`：碰撞容差，间距 `<= epsilon` 即视为重叠。 |
| `public static Vector3dc intersectsAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | `Vector3dc` | **三轴独立扫掠碰撞**。<br>• 对 X、Y、Z 三个轴分别独立计算最大安全位移。<br>• 若某轴位移分量 `|d| < 1e-15`，该分量直接置为 `0.0`。<br>• 若初始状态（`t = 0`）AABB 已与某个三角形重叠（或间距 `<= epsilon`），则所有非零运动轴返回的安全位移均为 `0.0`。<br>• 若运动方向背离障碍物或全程未碰撞，返回原始分量 `d`。 |
| `public static Vector3dc sweptCollisionAABBTriangle(Vector3dc min, Vector3dc max, Vector3dc motion, Vector3fc[] triangles, double epsilon)` | `Vector3dc` | **合成向量真扫掠碰撞**。<br>• 沿 `motion` 的合成单位方向向量 `dir = motion / |motion|` 平移扫掠。<br>• 若 `motion.length() < 1e-15`，直接返回零向量 `(0, 0, 0)`。<br>• 若初始位置已重叠，返回零向量 `(0, 0, 0)`；若全程无碰撞，返回与 `motion` 相等的向量；若中途在比例 `t` 处碰撞，返回 `motion * t`。 |
| `public static boolean overlapOnAxis(Vector3dc axis, Vector3dc v0, Vector3dc v1, Vector3dc v2, Vector3dc boxHalfExtents, double epsilon)` | `boolean` | **单轴投影重叠测试（底层原语）**。<br>• 测试以原点 `(0,0,0)` 为中心、半边长为 `boxHalfExtents` 的 AABB 与局部坐标三角形 `(v0, v1, v2)` 在给定轴 `axis` 上的投影区间是否重叠。<br>• `v0, v1, v2` **必须是已减去 AABB 中心的局部坐标**！若直接传入世界坐标顶点会导致投影偏移错误。<br>• `axis` 无需预先单位化，但 `epsilon` 直接加在投影值上，因此在传入非单位轴时 `epsilon` 的实际物理距离会按 `1 / |axis|` 缩放。 |

### 2. 边界条件与常见坑点

1. **三角形顶点数组长度必须是 3 的倍数**：`triangles` 采用平面数组组织而非嵌套对象，旨在减少大规模网格检测时的对象分配与缓存未命中。请确保 `triangles.length % 3 == 0`。
2. **退化三角形（点/线段）的兼容性**：当传入的三角形三个顶点共线（退化为线段）或重合（退化为点）时，`f0.cross(f1)` 面法线长度平方 `<= 1e-15`，`AnvilLibCollision` 会安全跳过面法线轴，继续通过 3 条坐标轴与 9 条边叉积轴完成精确判定，不会产生 `NaN` 污染。
3. **初始重叠（Initial Overlap）的返回行为**：当 `epsilon` 设置过大或实体已经嵌入三角形内部时，两次扫掠方法（`intersectsAABBTriangle` 与 `sweptCollisionAABBTriangle`）都会判定初始重叠并返回 `0` 位移。在游戏物理循环中，建议搭配适度的 `epsilon`（如 `1e-4` ~ `1e-3`），并在每次应用安全位移后额外预留极小的皮肤厚度（Skin Width），避免下一帧刚好处于 `gap <= epsilon` 的初始重叠状态。

---

## 五、 内部自检与基准测试工具 (`CollisionTest`)

| 类名 | 签名 | 说明 |
| :--- | :--- | :--- |
| `CollisionTest` | `@ApiStatus.Internal public class CollisionTest` | 模块内置的独立验证与微基准测试类（包含 `static void main()`），覆盖 32 组边界用例（内部/外部、穿透、贴面、容差 `epsilon`、退化点/线、负半边长、三轴扫掠 vs 对角真扫掠对比）以及 1 ~ 10,000 个三角形吞吐量的纳秒级 Benchmark。仅供库开发者回归验证使用，业务模组请勿调用。 |
