# 模型捕获、解码与几何轮廓缓存 (`dev.anvilcraft.lib.v2.cube.client.model` / `geometry`)

<BranchContextCard branch="26.2" />

本篇介绍 `module.cube` 的底层核心：如何从 Minecraft 26.2 的烘焙模型中捕获原始长方体元素，如何将其解码为独立于渲染器的闭凸多面体（`ConvexShape`）与 BVH 空间索引（`SelectionGeometry`），以及如何在后台线程中计算消除共面接缝与微小错位内接缝后的外轮廓（`OutlineBuilder` / `OutlineCache` / `PackedOutline`）。

如果模组需要为**自定义实体、多方块整体预览或非标准几何体**直接构造精确射线拾取与并集外轮廓描边，可以直接使用 `dev.anvilcraft.lib.v2.cube.geometry` 包中的公开类。

---

## 一、 核心几何与轮廓管线设计

1. **模型捕获与去重烘焙 (`ModelCapture` → `CubeModelDecoder` → `ModelSelections`)**：
   - 在模型烘焙期，`ModelCapture` 使用 `IdentityHashMap<>()` 按对象身份将 `BlockStateModelPart` 与其未烘焙的 `List<CuboidModelElement>` 及合成根变换后的 `ModelState` 关联起来；
   - `CubeModelDecoder.decode(...)` 将每个 `CuboidModelElement`（含 `from` / `to` 与支持单轴及 26.2 三轴欧拉角的 `CuboidRotation`）转换为 `ConvexShape`；
   - `ModelSelections.bake(...)` 递归解析 `SingleVariant`、`Weighted`（随机变体模型）和 `Multipart`（多部分组合模型）。若一个 `Multipart` 模型的所有子部件都是静态 `Fixed` 部件，还会直接将它们的凸多面体合并进同一个 `SelectionGeometry`，从而在后续轮廓计算中**自动消除不同 multipart 部件贴合面之间的内部接缝线**。
2. **并集外轮廓提取与预算保护 (`OutlineBuilder` & `OutlineCache`)**：
   - 多个旋转或正交的 `ConvexShape` 拼合在一起时，直接绘制每个长方体的 12 条边会产生大量穿插在模型内部或共面贴合处的冗余线条。
   - `OutlineBuilder.build(...)` 首先通过 BVH 将相交的凸多面体划分为连通分量（Island），收集原始边与两两面相交线，按交点切分线段后，在每段中点沿法向与切向采样判断该边是否属于并集表面的真实折角棱线，最后将共线相邻线段合并。
   - 由于布尔并集轮廓计算复杂度较高，`OutlineCache` 使用单线程后台守护线程池异步构建（单次构建预算：`100 ms`、最多 `1,000,000` 步操作、最多 `4096` 条输出线段）。在后台任务尚未完成或超出预算时，渲染线程直接返回无阻塞的 `geometry.fallbackOutline()`。
3. **微小错位接缝的视角相关裁剪 (`OutlineVisibility`)**：
   - 许多精细模型为了避免 Z-fighting（贴图闪烁），故意将两个相邻长方体的贴合面错开小于 `0.1` 像素（即 `distance < 0.1 / 16.0` 方块单位）。
   - `OutlineVisibility` 会在构建轮廓时预先识别出间距在 `(2e-7, 0.1/16)` 之间的平行错位接缝区间；在每帧渲染时，`PackedOutline.forView(localCamera)` 根据当前相机视角投射凸多面体视锥，**隐藏位于模型视觉内部的微小错位接缝，同时分段保留刚好处于模型外剪影边缘（Silhouette）上的部分**。

---

## 二、 完整代码示例：独立构建自定义多面体拾取与轮廓

下面展示不依赖方块 JSON 模型，直接使用 `ConvexShape`、`SelectionGeometry`、`OutlineCache` 与 `OutlineRenderer` 为自定义组合几何体执行射线检测与轮廓渲染：

```java
package com.example.mymod.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.OutlineRenderer;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.PackedOutline;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4d;

import java.util.List;

public final class CustomPillarGeometry {
    // 构建由底座 + 旋转 45 度的中柱组成的不可变 SelectionGeometry
    public static final SelectionGeometry PILLAR_GEOMETRY = createGeometry();

    private static SelectionGeometry createGeometry() {
        ConvexShape base = ConvexShape.box(new AABB(0.125, 0.0, 0.125, 0.875, 0.25, 0.875));
        Matrix4d rotate45Y = new Matrix4d()
            .translate(0.5, 0.5, 0.5)
            .rotateY(Math.toRadians(45.0))
            .translate(-0.5, -0.5, -0.5);
        ConvexShape shaft = ConvexShape.box(new AABB(0.25, 0.2, 0.25, 0.75, 1.0, 0.75))
            .transform(rotate45Y);
        return new SelectionGeometry(List.of(base, shaft));
    }

    /**
     * 在局部空间执行精确射线求交
     */
    public static SelectionGeometry.RayHit clipLocalRay(Vec3 localStart, Vec3 localEnd) {
        return PILLAR_GEOMETRY.clip(localStart, localEnd);
    }

    /**
     * 渲染消除内部穿插线后的外轮廓
     */
    public static void renderPillarOutline(
        PoseStack poses,
        VertexConsumer lineConsumer,
        Vec3 localCameraPos
    ) {
        // 从全局后台缓存获取并集轮廓（未就绪时自动返回 fallbackOutline）
        PackedOutline outline = CubeSelection.outlines()
            .get(PILLAR_GEOMETRY)
            .forView(localCameraPos);

        OutlineRenderer.render(poses, lineConsumer, outline, 0.0F, 0.0F, 0.0F, 0.4F);
    }
}
```

---

## 三、 `dev.anvilcraft.lib.v2.cube.client.model` 包 API 详解

### 1. `ModelCapture`（模型烘焙期临时捕获器）

| 方法 / 记录签名 | 说明 |
| :--- | :--- |
| `public static synchronized void remember(ResolvedModel model, ModelState state, BlockStateModelPart baked)` | 当 `baked` 为 `SimpleModelWrapper` 且顶层几何为非空 `UnbakedCuboidGeometry` 时，合并 `NeoForgeModelProperties.TRANSFORM` 根变换并按对象身份存入 `SOURCES`。 |
| `public static synchronized Map<BlockStateModelPart, Source> take()` | 导出当前捕获的所有 `Source` 快照并立即清空 `SOURCES`，防止长期占用纹理与未烘焙模型内存。 |
| `public record Source(List<CuboidModelElement> elements, ModelState state)` | 保存未烘焙的长方体元素列表与合成后的 `ModelState`。 |

### 2. `CubeModelDecoder`（长方体模型元素解码器）

| 方法签名 | 参数、返回值与异常条件 |
| :--- | :--- |
| `public static List<ConvexShape> decode(List<CuboidModelElement> elements, ModelState modelState)` | 将 JSON 模型的 `CuboidModelElement` 列表（坐标除以 `16.0` 转为方块单位）应用 `modelState` 变换与每个元素的 `CuboidRotation` 后，解码为 `List<ConvexShape>`。<br>• **支持反向描边壳**：`from` 大于 `to` 的反向外描边元素与普通长方体一样被视为实体体积。<br>• **异常条件**：若 `elements` 为空、数量超过 `SelectionGeometry.MAX_SHAPES (1024)`，或者包含零厚度平面（如十字交叉草/火把平面）导致 `ConvexShape` 抛出 `IllegalArgumentException("Zero-volume shape")` 时，向上抛出 `IllegalArgumentException`（由 `ModelSelections` 捕获并自动使该方块回退到原版选择框）。 |

### 3. `ModelSelection` 与 `ModelSelections`（烘焙后模型选择器）

| 类 / 接口 / 方法签名 | 说明 |
| :--- | :--- |
| `public interface ModelSelection` | 定义 `void collect(RandomSource random, List<SelectionPart> output)` 与 `AABB bounds()`。<br>包含三个不可变实现记录：<br>• `ModelSelection.Fixed(SelectionPart part)`：单一定制几何部件；<br>• `ModelSelection.Weighted(List<ModelSelection> variants, List<Integer> weights, int totalWeight, AABB bounds)`：按位置随机种子权重抽取变体；<br>• `ModelSelection.Multipart(List<ModelSelection> parts, AABB bounds)`：派生随机种子收集多个子部件。 |
| `ModelSelections.MAX_GEOMETRY_BYTES` | `16L * 1024 * 1024`（16 MB），全局静态模型共享 `SelectionGeometry` 的内存预算上限。 |
| `ModelSelections.MAX_STATES` | `32768`，最多支持的启用 `BlockState` 数量上限。 |
| `public static Snapshot bake(Map<BlockState, BlockStateModel> models)` | 遍历 `BuiltInRegistries.BLOCK` 中所有 `CubeSelection.isEnabled(block)` 为真的方块状态，解析并共享 `SelectionGeometry`，返回 `ModelSelections.Snapshot(Map<BlockState, ModelSelection> states, long geometryBytes, int unsupportedStates)`。递归深度上限为 16 层。 |

---

## 四、 `dev.anvilcraft.lib.v2.cube.geometry` 包 API 详解

### 1. `ConvexShape`（闭凸多面体）

表示方块坐标单位下的有界闭凸多面体（顶点、面法线/偏移、无向边与 AABB 包围盒）。

| 构造器 / 方法签名 | 返回值 | 说明与边界校验 |
| :--- | :--- | :--- |
| `public ConvexShape(List<Vec3> vertices, int[][] faces)` | — | 构造凸多面体并自动使所有面法线朝外。<br>**严格校验条件**（不满足均抛出 `IllegalArgumentException`）：<br>1. `vertices.size()` 与 `faces.length` 必须在 `[4, 256]` 之间，且所有顶点坐标有限；<br>2. 每个面的顶点索引数在 `[3, 256]` 之间，且不能共线退化（法线长度平方 `>= 1e-20`）；<br>3. 几何中心到每个面的有向距离必须 `< -1.0E-10`（拒绝零体积薄片/平面）；<br>4. 所有顶点到任意面的有向距离必须 `<= 1.0E-6`（拒绝非凸凹多面体）。 |
| `public static ConvexShape box(AABB bounds)` | `ConvexShape` | 从非退化的 `AABB` 构造标准 8 顶点、6 面、12 边的凸六面体。 |
| `public ConvexShape transform(Matrix4dc transform)` | `ConvexShape` | 使用双精度矩阵 `transform` 变换所有顶点并返回一个新的 `ConvexShape`。 |
| `public List<Vec3> vertices()` | `List<Vec3>` | 获取不可变顶点列表。 |
| `public List<Face> faces()` | `List<ConvexShape.Face>` | 获取外法向平面列表。`Face(Vec3 normal, double planeOffset)` 提供 `double signedDistance(Vec3 point)` 方法（内部点 `<= 0`，外部点 `> 0`）。 |
| `public List<Edge> edges()` | `List<ConvexShape.Edge>` | 获取去重后的无向棱边列表 `Edge(Vec3 start, Vec3 end)`。 |
| `public AABB bounds()` | `AABB` | 获取该凸多面体的轴对齐包围盒。 |
| `public boolean contains(Vec3 point, double epsilon)` | `boolean` | 判断点 `point` 是否位于所有面半空间内部（即对所有面满足 `face.signedDistance(point) <= epsilon`）。 |
| `public long estimatedBytes()` | `long` | 保守估算当前对象、顶点、面、边和索引数组的内存占用字节数。 |

### 2. `SelectionGeometry`（BVH 加速几何集合）

| 常量 / 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final int MAX_SHAPES = 1024` | `int` | 单个 `SelectionGeometry` 允许包含的最大 `ConvexShape` 数量。 |
| `public static final int MAX_OUTLINE_SEGMENTS = 4096` | `int` | 单个几何轮廓允许包含的最大线段数。 |
| `public SelectionGeometry(List<ConvexShape> shapes)` | — | 构建按最长轴中位数递归二分（BVH）的不可变几何集合，并预生成轻量级 `fallbackOutline`（若总原始边数 `<= 4096` 则保留全部原始边，否则退化为总包围盒的 12 条边）。若 `shapes` 为空或 `> 1024` 抛出 `IllegalArgumentException`。 |
| `public List<ConvexShape> shapes()` | `List<ConvexShape>` | 获取不可变凸多面体列表。 |
| `public AABB bounds()` | `AABB` | 获取根节点总包围盒。 |
| `public PackedOutline fallbackOutline()` | `PackedOutline` | 获取无需后台计算即可立即使用的回退轮廓。 |
| `public long estimatedBytes()` | `long` | 获取包含 BVH 节点、凸多面体与回退轮廓的估算内存字节数。 |
| `public List<ConvexShape> intersecting(AABB bounds)` | `List<ConvexShape>` | 通过 BVH 树快速查询所有包围盒与 `bounds` 相交的 `ConvexShape`。 |
| `public @Nullable RayHit clip(Vec3 start, Vec3 end)` | `SelectionGeometry.RayHit` | 在局部空间对线段 `start -> end` 执行 BVH 加速的 Cyrus-Beck 凸多面体射线求交。<br>命中时返回 `RayHit(double fraction, Vec3 normal, boolean inside)`，其中 `fraction ∈ [0, 1]`；若起点已在多面体内部（`inside == true` 且 `enter == 0`），法线取射线反方向。未命中返回 `null`。 |

### 3. `OutlineBuilder`、`OutlineCache` 与 `PackedOutline`（并集轮廓构建与缓存）

| 类名 | 关键常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `OutlineBuilder` | `public static PackedOutline build(SelectionGeometry geometry, long maxNanos, long maxOperations)` | 计算 `geometry` 中所有凸多面体并集的真实外轮廓线段并构建 `OutlineVisibility` 接缝可见性表。超出时间预算 `maxNanos`、步数预算 `maxOperations` 或线段上限 `4096` 时抛出 `OutlineBuilder.BudgetExceededException`。公开内部记录 `OutlineBuilder.Segment(Vec3 start, Vec3 end)` 表示单条轮廓线段。 |
| `OutlineCache` | `MAX_CACHED_BYTES = 4 MB`<br>`MAX_PENDING_BYTES = 16 MB`<br>`MAX_ENTRIES = 128`<br>`MAX_PENDING = 8` | 线程安全的 LRU 后台轮廓缓存（实现 `AutoCloseable`）。<br>• `public synchronized PackedOutline get(SelectionGeometry geometry)`：若已就绪则立即返回缓存结果；若未就绪则提交后台任务（100ms / 100万步预算）并立即返回 `geometry.fallbackOutline()`，绝不阻塞渲染线程。<br>• `public synchronized void clear()`：取消所有排队任务并清空缓存。<br>• `public synchronized Statistics statistics()`：返回 `OutlineCache.Statistics(entries, retainedBytes, pending, pendingBytes, completed, limited, failed)`。 |
| `PackedOutline` | `public static final PackedOutline EMPTY`<br>`public static final int STRIDE = 9`<br>`public static PackedOutline of(List<OutlineBuilder.Segment> segments)`<br>`public PackedOutline forView(Vec3 camera)`<br>`public int segmentCount()`<br>`public float coordinate(int segment, int component)`<br>`public long estimatedBytes()` | 紧凑的 `float[]` 轮廓数组封装，每条线段占 9 个 `float`：`[startX, startY, startZ, endX, endY, endZ, dirX, dirY, dirZ]`。<br>• 调用 `forView(Vec3 camera)`（需传入与轮廓处于同一局部坐标系的相机坐标）会剔除视角下被遮挡的 `< 0.1/16` 微小错位接缝，并分段保留剪影轮廓；超出 `200,000` 步视图预算时安全回退返回原 `PackedOutline`。 |
