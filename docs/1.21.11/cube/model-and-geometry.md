# 模型解码与凸体几何构建 (`model` / `geometry`)

<BranchContextCard branch="1.21.11" />

本篇介绍 `module.cube` 底层的两大核心包：
1. **`dev.anvilcraft.lib.v2.cube.client.model`**：将 Minecraft `1.21.11` 的 `BlockElement`、`ResolvedModel` 与 `BlockStateModel`（含 `SimpleModelWrapper`、`SingleVariantAccessor`、`WeightedModelAccessor`、`MultipartModelAccessor`）解码为凸多面体几何；
2. **`dev.anvilcraft.lib.v2.cube.geometry`**：提供 3D 闭凸多面体 **`ConvexShape`**、BVH 加速结构 **`SelectionGeometry`**、共面消隐与棱线裁剪器 **`OutlineBuilder`** / **`OutlineVisibility`**、紧凑浮点线段数组 **`PackedOutline`** 以及后台异步轮廓缓存 **`OutlineCache`**。

即使你不依赖自动的 JSON 模型捕获，也可以直接使用 `ConvexShape` 和 `SelectionGeometry` 构建任意程序化多面体的射线检测与消隐棱线。

---

## 一、 完整代码示例：手动构建旋转凸多面体几何并执行射线求交

```java
package com.example.mymod.client.geometry;

import com.mojang.math.Axis;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.OutlineBuilder;
import dev.anvilcraft.lib.v2.cube.geometry.PackedOutline;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

import java.util.List;

public final class ProceduralGeometryExample {
    private ProceduralGeometryExample() {
    }

    public static SelectionGeometry buildOctagonalPillarGeometry() {
        // 1. 先创建一个中心在 (0.5, 0.5, 0.5) 的基础长方体凸形
        ConvexShape box0 = ConvexShape.box(new AABB(0.2, 0.0, 0.2, 0.8, 1.0, 0.8));

        // 2. 绕方块中心 Y 轴旋转 45 度生成第二个交错长方体凸形
        Matrix4f rot45 = new Matrix4f()
            .translate(0.5F, 0.5F, 0.5F)
            .rotate(Axis.YP.rotationDegrees(45.0F))
            .translate(-0.5F, -0.5F, -0.5F);
        ConvexShape box45 = box0.transformed(rot45);

        // 3. 组合成带 BVH 加速树的 SelectionGeometry（若传入放大坐标还可指定第二个参数 unitsPerBlock）
        return new SelectionGeometry(List.of(box0, box45));
    }

    public static void raycastAndBuildOutline(SelectionGeometry geometry) {
        // A. 在局部坐标系下对几何体执行精确射线求交
        SelectionGeometry.RayHit hit = geometry.clip(
            new Vec3(-0.5, 0.5, 0.5),
            new Vec3(1.5, 0.5, 0.5)
        );
        if (hit != null) {
            Vec3 normal = hit.normal();     // 命中平面的精确单位外法线（可为 45° 斜向法线）
            double t = hit.fraction();      // [0, 1] 射线命中比例
        }

        // B. 立即构建经过布尔裁剪（消除两个交错长方体内部穿插线段）的紧凑轮廓线
        PackedOutline cleanOutline = OutlineBuilder.build(geometry);
    }
}
```

---

## 二、 几何核心包 API 详解 (`dev.anvilcraft.lib.v2.cube.geometry`)

### 1. `ConvexShape`（三维闭合凸多面体）

由一组朝外的半空间平面（`Face`）、多边形顶点环以及棱边（`Edge`）构成的不可变凸体。

| 构造 / 工厂 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final int MAX_FACES = 32` | `int` | 单个凸多面体允许的最大面数（`[4, 32]`）。 |
| `public static ConvexShape box(AABB bounds)` | `ConvexShape` | 从非退化的三维 `AABB`（各轴长度 `> 1e-6`）创建 6 面长方体凸形。 |
| `public static ConvexShape fromPlanes(List<Plane> planes)` | `ConvexShape` | 从半空间平面集合 `{ n · x <= d }` 通过半空间交集算法构建凸多面体（要求平面数在 `[4, 32]` 之间、闭合有界且三维体积非退化，否则抛出 `IllegalArgumentException`）。 |
| `public ConvexShape transformed(Matrix4f matrix)`<br>`public ConvexShape transform(Matrix4d matrix)` | `ConvexShape` | 将当前凸多面体通过可逆 `float` 或 `double` 矩阵变换，返回新的 `ConvexShape`。 |
| `public boolean contains(Vec3 point, double tolerance)` | `boolean` | 判断点 `point` 是否落在凸多面体内部（所有面有符号距离 `<= tolerance`）。 |
| `public AABB bounds()` / `List<Vec3> vertices()` / `List<Face> faces()` / `List<Edge> edges()` / `long estimatedBytes()` | 对应类型 | 获取外包围盒、去重顶点列表、面列表、棱边列表及估算内存字节数。 |

- **内部记录类**：
  - `ConvexShape.Plane(Vec3 normal, double offset)`：平面方程 `normal · x = offset`；
  - `ConvexShape.Face(Vec3 normal, double planeOffset, List<Vec3> vertices)`：包含方法 `double signedDistance(Vec3 point)`（返回 `normal.dot(point) - planeOffset`）；
  - `ConvexShape.Edge(Vec3 start, Vec3 end, Vec3 firstNormal, Vec3 secondNormal)`：凸体的一条棱边及其相邻两个面的外法线。

---

### 2. `SelectionGeometry`（BVH 加速几何集合）

| 常量 / 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final int MAX_SHAPES = 1024`<br>`public static final int MAX_OUTLINE_SEGMENTS = 4096` | `int` | 单个几何体允许的最大凸体数（1024）与最大轮廓线段数（4096）。 |
| `public SelectionGeometry(List<ConvexShape> shapes)`<br>`public SelectionGeometry(List<ConvexShape> shapes, double unitsPerBlock)` | `SelectionGeometry` | 构建包含自动二分 BVH 树的不可变几何集合，并预生成未裁剪的 `fallbackOutline`。`unitsPerBlock`（默认 `1`）用于指定几何坐标中一格对应的单位数。 |
| `public @Nullable RayHit clip(Vec3 start, Vec3 end)` | `@Nullable RayHit` | 利用 BVH 树与 Cyrus-Beck 凸多面体裁剪算法求线段 `[start, end]` 的最近交点 `RayHit(double fraction, Vec3 normal, boolean inside)`。 |
| `public List<ConvexShape> intersecting(AABB bounds)` | `List<ConvexShape>` | 通过 BVH 快速查询与 `bounds` 相交的所有 `ConvexShape`。 |
| `public List<ConvexShape> shapes()` / `AABB bounds()` / `PackedOutline fallbackOutline()` / `long estimatedBytes()` | 对应类型 | 访问器方法。 |

---

### 3. `OutlineBuilder`、`PackedOutline` 与 `OutlineCache`

| 类名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| **`OutlineBuilder`** | • `public static final int MAX_OPERATIONS = 200_000`<br>• `public static PackedOutline build(SelectionGeometry geometry)`<br>• `public record Segment(Vec3 start, Vec3 end)` | 对 `SelectionGeometry` 中所有凸体的棱边执行深入裁剪、共面贴合消隐与共线合并，并预计算 `OutlineVisibility` 微小错位接缝表（超过 `200,000` 步预算安全回退 `fallbackOutline()`）。 |
| **`PackedOutline`** | • `public static final PackedOutline EMPTY`<br>• `public static PackedOutline of(List<OutlineBuilder.Segment> segments)`<br>• `public int segmentCount()`<br>• `public float coordinate(int segment, int offset)`<br>• `public PackedOutline forView(Vec3 camera)`<br>• `public long estimatedBytes()` | 将所有三维线段打包存储在单个扁平 `float[]` 数组中（每条线段占 9 个 `float`：`x0, y0, z0, x1, y1, z1, dx, dy, dz`）。调用 `forView(camera)` 实时剔除当前视角下的内部遮挡段。 |
| **`OutlineCache`** | • `public static final long MAX_BYTES = 16L * 1024 * 1024`<br>• `public PackedOutline get(SelectionGeometry geometry)`<br>• `public void clear()`<br>• `public Statistics statistics()` | 线程安全的 LRU + 后台守护线程（`"anvillib-cube-outline"`）轮廓缓存；总缓存上限为 16 MB。 |

---

## 三、 模型解码包 API 详解 (`dev.anvilcraft.lib.v2.cube.client.model`)

| 类 / 接口名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| **`CubeModelDecoder`** | `public static List<ConvexShape> decode(List<BlockElement> elements, ModelState modelState)` | 将 1.21.11 `BlockElement` 列表（支持基于 `rotation.transform()` 的任意旋转/欧拉角/缩放变换，以及 `ModelState` 整体双精度变换）解码为方块空间（`1/16` 缩放）下的 `ConvexShape` 列表（元素为空或超过 1024 时抛 `IllegalArgumentException`）。 |
| **`ModelCapture`** | • `public static synchronized void remember(ResolvedModel model, ModelState state, BlockModelPart baked)`<br>• `public static synchronized Map<BlockModelPart, Source> take()`<br>• `public record Source(List<BlockElement> elements, ModelState state)` | 由 `SimpleModelWrapperMixin` 在 `SimpleModelWrapper.bake(...)` 返回 `BlockModelPart` 后调用（从 `ResolvedModel#getTopGeometry()` 读取 `SimpleUnbakedGeometry` 元素，并结合 `NeoForgeModelProperties.TRANSFORM` 合并进 `ModelState`），使用弱键映射暂存 `BlockModelPart -> Source`，烘焙完成后由 `take()` 一次性取出并清空。 |
| **`ModelSelections`** | • `public static final long MAX_GEOMETRY_BYTES = 16L * 1024 * 1024`<br>• `public static final int MAX_STATES = 32768`<br>• `public static Snapshot bake(Map<BlockState, BlockStateModel> models)`<br>• `public static Snapshot bake(Map<BlockState, BlockStateModel> models, Predicate<Block> enabled)`<br>• `public record Snapshot(Map<BlockState, ModelSelection> states, long geometryBytes, int unsupportedStates)` | 遍历所有满足 `enabled` 谓词的方块状态，通过 `SingleVariantAccessor`、`WeightedModelAccessor` 与 `MultipartModelAccessor` 递归解析 `BlockStateModel` 树，并对相同形状的 `SelectionGeometry` 进行驻留去重（总内存上限 16 MB）。 |
| **`ModelSelection`** | 接口及其三个内部实现记录：<br>• `record Fixed(SelectionPart part)`<br>• `record Weighted(List<ModelSelection> variants, List<Integer> weights, int totalWeight, AABB bounds)`<br>• `record Multipart(List<ModelSelection> parts, AABB bounds)`<br>• `void collect(RandomSource random, List<SelectionPart> output)`<br>• `AABB bounds()` | 表示单个 `BlockState` 烘焙后的选择模型树，按 `RandomSource` 权重与多部件条件收集当前位置应激活的 `SelectionPart` 列表。 |
