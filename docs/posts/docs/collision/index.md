---
title: Collision 碰撞检测
prev: false
next: false
---

# 碰撞检测模块 <Badge type="tip" text=">=26.1" />

包 `dev.anvilcraft.lib.v2.collision` 提供基于 **SAT（分离轴定理）** 的 AABB 与三角形网格之间的碰撞检测算法。支持静态重叠检测、逐轴扫掠碰撞、以及真方向扫掠碰撞三种模式。

> **性能优异**: 1000 三角形 / 静态 2μs / 真扫掠 67μs

## 核心 API

`AnvilLibCollision` 包含 4 个公开方法：

### intersectsAABBTriangle — 静态碰撞检测

判断 AABB 与一组三角形是否发生重叠。

```java
public static boolean intersectsAABBTriangle(
    Vector3dc min,       // AABB 最小角
    Vector3dc max,       // AABB 最大角
    Vector3fc[] triangles, // 三角形数组，每 3 个顶点为一个三角形
    double epsilon       // 碰撞容差（间隙 ≤ epsilon 视为重叠）
)
```

**返回**: `true` 表示存在至少一个三角形与 AABB 重叠。  
**算法**: 对每个三角形先执行包围盒粗筛（AABB-AABB 快速剔除），再以完整 SAT 进行精确判定（13 条分离轴：3 坐标轴 + 1 面法线 + 9
边叉积轴）。

### intersectsAABBTriangle — 逐轴扫掠碰撞（三轴独立）

AABB 分别沿 X、Y、Z 轴运动，逐轴计算最大安全位移。

```java
public static Vector3dc intersectsAABBTriangle(
    Vector3dc min,       // AABB 最小角
    Vector3dc max,       // AABB 最大角
    Vector3dc motion,    // 各轴最大位移（分量可正可负）
    Vector3fc[] triangles, // 三角形数组
    double epsilon       // 碰撞容差
)
```

**返回**: 实际可移动位移向量。各分量符号与 `motion` 一致，绝对值 ≤ `|motion|`。

| 返回值                   | 含义        |
|-----------------------|-----------|
| `motion` 本身           | 全程无碰撞     |
| 零向量                   | 起始位置已重叠   |
| `0 < result < motion` | 碰撞发生在运动途中 |

**三轴独立的好处**: 与 Minecraft 原版碰撞行为一致——各分量被各自的障碍物"推开"，避免沿斜面滑动的问题。

### sweptCollisionAABBTriangle — 真方向扫掠碰撞

AABB 沿 `motion` 的合成方向平移，求首次碰到任意三角形时的位移。

```java
public static Vector3dc sweptCollisionAABBTriangle(
    Vector3dc min,       // AABB 最小角
    Vector3dc max,       // AABB 最大角
    Vector3dc motion,    // 位移向量（方向 + 大小）
    Vector3fc[] triangles, // 三角形数组
    double epsilon       // 碰撞容差
)
```

**返回**: `motion * t`，其中 t ∈ [0,1] 为安全比例。

| t 值       | 含义                   |
|-----------|----------------------|
| t = 1     | 全程无碰撞（返回原始 `motion`） |
| t = 0     | 起始位置已重叠（返回零向量）       |
| 0 < t < 1 | 碰撞发生在运动途中            |

与三轴独立的区别：此方法沿 `motion` 的合成方向扫掠，适用于需要精确斜角碰撞判定的场景。

### overlapOnAxis — 单轴投影重叠检测

测试三角形与 AABB 在给定轴上的投影是否重叠。

```java
public static boolean overlapOnAxis(
    Vector3dc axis,         // 投影轴
    Vector3dc v0, v1, v2,   // 局部坐标系下的三角形顶点（已减去 AABB 中心）
    Vector3dc boxHalfExtents, // AABB 半边长
    double epsilon          // 碰撞容差
)
```

## 使用示例

```java
// 准备数据
Vector3dc boxMin = new Vector3d(0, 0, 0);
Vector3dc boxMax = new Vector3d(1, 1, 1);
Vector3dc motion = new Vector3d(0.5, 0.3, 0.2);
Vector3fc[] triangles = {
    new Vector3f(1.5f, 0, 0), new Vector3f(2.5f, 1, 0), new Vector3f(1.5f, 1, 1),
    // ... more triangles
};
double eps = 0.001;

// 1. 静态检测：当前位置是否碰撞？
boolean hit = AnvilLibCollision.intersectsAABBTriangle(boxMin, boxMax, triangles, eps);

// 2. 逐轴扫掠：安全移动多少？
Vector3dc safePerAxis = AnvilLibCollision.intersectsAABBTriangle(boxMin, boxMax, motion, triangles, eps);

// 3. 真方向扫掠：沿合成方向安全移动多少？
Vector3dc safeSwept = AnvilLibCollision.sweptCollisionAABBTriangle(boxMin, boxMax, motion, triangles, eps);
```

## 算法细节

### SAT（分离轴定理）— 13 条分离轴

对每对 AABB/三角形，测试 13 条候选分离轴：

| 数量 | 类型       | 轴                         |
|----|----------|---------------------------|
| 3  | AABB 面法线 | (1,0,0), (0,1,0), (0,0,1) |
| 1  | 三角形面法线   | `f0 × f1`                 |
| 9  | 边叉积轴     | AABB 边 × 三角形边             |

若任意一条轴将两者投影区间分离，则无碰撞。

### 包围盒粗筛

精确 SAT 检测前，先用三角形 AABB 与目标 AABB 做快速粗筛，大幅减少不必要的叉积运算。

### 逐轴 vs 真扫掠

| 模式   | 方法                                                         | 原理                | 适用场景                |
|------|------------------------------------------------------------|-------------------|---------------------|
| 逐轴独立 | `intersectsAABBTriangle(min,max,motion,triangles,eps)`     | 分别沿 X/Y/Z 轴扫掠     | Minecraft 原版物理、方块碰撞 |
| 真方向  | `sweptCollisionAABBTriangle(min,max,motion,triangles,eps)` | 沿 `motion` 合成方向扫掠 | 精确斜角碰撞、弹道检测         |

## Benchmark

测试条件：AABB `(0,0,0)→(2,2,2)`，运动 `(0.5,0.3,0.2)`，epsilon=0，三角形随机分布在 `[-10,12]` 立方体，约 50% 相交。

| 三角形数量 | 静态 SAT  | 逐轴扫掠    | 真扫掠     |
|-------|---------|---------|---------|
| 1     | 85 ns   | 361 ns  | 197 ns  |
| 10    | 145 ns  | 2.1 μs  | 654 ns  |
| 100   | 2.0 μs  | 21.9 μs | 10.3 μs |
| 1000  | 12.3 μs | 260 μs  | 67.0 μs |
| 10000 | 161 μs  | 2.17 ms | 841 μs  |

## 测试覆盖

`CollisionTest` 包含 40 个测试用例（全部通过）：

| 分类            | 测试项                                                                      |
|---------------|--------------------------------------------------------------------------|
| **A 组: 静态检测** | 内部、外部 ±X/±Y/±Z、穿透、接触面、间隙容差、点、线段、三角包含 AABB、批量相交、批量无交、跨轴相交、负范围 AABB (17 项) |
| **B 组: 单轴投影** | 重叠、分离、间隙 eps=0、间隙 eps=0.01 (4 项)                                         |
| **C 组: 逐轴扫掠** | 无障碍 ±X/±Y/±Z、被阻挡、初始重叠→0、单向阻挡+另一向自由、间隙容差、远离运动、对角同时阻挡 (10 项)               |
| **D 组: 真扫掠**  | 轴对齐阻挡、对角滑过窄墙、初始重叠、对角无障碍、大墙对角阻挡、零运动、间隙容差 (7 项)                            |

## 依赖引入

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-collision-neoforge-26.1:2.0.0"
}
```

## 注意事项

- 所有方法使用 `Vector3dc` / `Vector3fc`（JOML），确保传入双精度/单精度向量
- `epsilon` 控制碰撞严格程度：0 = 仅接触即碰撞，较大的值可提前"感知"碰撞
- 三角形数组长度必须为 3 的倍数
- 逐轴扫掠与 Minecraft 原版碰撞行为最为接近
- 真扫掠适用于需要精确斜角碰撞判定的场景，性能略低于逐轴
