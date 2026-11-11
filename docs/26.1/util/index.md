# Util 通用工具库：集合、数学、几何与物品栏 (`module.util`)

<BranchContextCard branch="26.1" />

`module.util`（构件名 `anvillib-util-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.util`）是 AnvilLib 各模块及下游模组共享的基础工具库，涵盖集合与列表操作、2D/3D 向量与区间数学、多线程 VoxelShape 布尔合并与旋转镜像、海量 AABB 外轮廓线提取（`OutlineUtil`）、物品栏检索与兼容层插入、多行可本地化组件构建、方块/物品/NBT 数据谓词以及突破 `int` 上限的无限物品栈 `UnlimitedItemStack`。

本模块按功能域拆分为 5 篇子文档：
- **本篇（基础、集合、数学、形状与物品栏工具）**：详解 `AnvilLibUtil`、`Util`、`CollectionUtil`、`ListUtil`、`MathUtil`、`ShapeUtil`、`OutlineUtil`、`Line`、`InventoryUtil`、`NumberProviderUtil`、`DistExecutor`、`Lazy`、`ISerializer`、`Scrollable` 与 `ClientTickRecorder`。
- **[扁平化多维循环 (FlattenLoop)](./flatten-loop)**：详解 `FlattenLoop` 的 2~8 维笛卡尔积扁平化迭代与提前终止游标 API。
- **[多行组件信息与 Tooltip 工具](./components)**：详解 `ComponentUtil`、`TooltipUtil`、`IComponentInfo`、`DirectInfo`、`LiteralInfo`、`TranslatableInfo` 与 `MultilineComponentHelper`。
- **[方块、物品与 NBT 谓词及概率模型](./predicates)**：详解 `BlockStatePredicate`、`ChanceBlockState`、`WeightedChanceBlockStates`、`ChanceItemStack`、`IItemStackPredicate`、`ItemPredicate`、`ItemIngredientPredicate` 与 `NbtPredicate`。
- **[非空函数式接口与无限物品栈](./nullness-and-stack)**：详解 `dev.anvilcraft.lib.v2.util.nullness.*` 与 `UnlimitedItemStack`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `util` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-util-neoforge-26.1:2.0.0")
}
```

---

## 二、 核心几何与轮廓工具亮点 (`ShapeUtil` & `OutlineUtil`)

### 1. `ShapeUtil`：16× 像素坐标系碰撞箱旋转、镜像与多线程二分合并

在编写带方向（如四向水平旋转或六向朝向）的异形方块时，手工换算旋转后的 `Block.box(minX, minY, minZ, maxX, maxY, maxZ)` 坐标非常繁琐。`ShapeUtil` 提供了围绕方块中心 `(8, 8, 8)` 的逆时针旋转 `rotate(axis, angle, shape)`、轴向镜像 `mirror(axis, shape)`、布尔切除 `cut(base, cutters...)`、布尔并集 `merge(shapes...)` 以及基于线程池的分治并行合并 `threadedJoin(shapes, BooleanOp, executor)`。

### 2. `OutlineUtil`：任意重叠 AABB 集合的精确外轮廓线提取

当你有几十或上千个相邻/重叠的 `AABB`（例如多方块结构高亮或连锁挖掘预览）时，若直接绘制每个 `AABB` 的 12 条棱线，内部相邻面会产生大量多余的网格线。`OutlineUtil.extractOutline(boxes)` 通过三轴平面扫描线（Plane Sweep）与二维离散网格 `BitSet` 异或运算，**剔除所有内部贴合面与内部棱线，并将共线相连的外部边自动合并为最长连续线段 `List<Line>`**（当 `boxes.size() >= 1024` 时自动启用三轴并行提取）！

### 3. 代码示例：旋转方块碰撞箱与提取合并多方块外轮廓线

```java
package com.example.mymod.util;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.anvilcraft.lib.v2.util.OutlineUtil;
import dev.anvilcraft.lib.v2.util.ShapeUtil;
import dev.anvilcraft.lib.v2.util.client.Line;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.List;

public final class GeometryUtilExample {
    // 1. 定义朝北的 L 型底座碰撞箱，并一键生成朝东（绕 Y 轴旋转 90 度）的 VoxelShape
    public static final VoxelShape SHAPE_NORTH = ShapeUtil.merge(
        Block.box(0, 0, 0, 16, 4, 16),
        Block.box(2, 4, 10, 14, 16, 16)
    );
    public static final VoxelShape SHAPE_EAST = ShapeUtil.rotate(Direction.Axis.Y, 90.0f, SHAPE_NORTH);

    // 2. 提取一组相邻方块的合并外轮廓线段（内部共面棱线自动消除）
    public static List<Line> buildMergedOutline(List<BlockPos> positions) {
        List<AABB> boxes = positions.stream()
            .map(AABB::new)
            .toList();
        return OutlineUtil.extractOutline(boxes);
    }

    // 3. 在客户端渲染提取出的 Line 列表
    public static void renderLines(PoseStack poseStack, VertexConsumer lineBuffer, Vec3 cameraPos, List<Line> lines) {
        PoseStack.Pose lastPose = poseStack.last();
        for (Line line : lines) {
            line.render(lastPose, lineBuffer, cameraPos, 0xFF00E5FF);
        }
    }
}
```

---

## 三、 公开工具类 API 详表

### 1. `Util`、`DistExecutor`、`Lazy<T>`、`ISerializer<T>` 与 `ClientTickRecorder`

| 类 / 接口名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`Util`** | • `public static final Direction[][] CORNER_DIRECTIONS`<br>• `public static boolean isLoaded(String modId)`<br>• `public static boolean isClient()`（检查 `FMLEnvironment.getDist() == Dist.CLIENT`）<br>• `public static boolean isServer()`（检查当前线程组是否为 `SidedThreadGroups.SERVER`）<br>• `public static void acceptDirections(BlockPos pos, Consumer<BlockPos> consumer)`（遍历 `pos` 周围 6 个正交邻居 + 8 个平面对角邻居 + 12 个三维角点邻居，共 26 个相邻坐标）<br>• `public static <E, C extends Collection<E>> Optional<C> intoOptional(C collection)`<br>• `public static <T> T cast(Object o)`<br>• `public static <T> Optional<T> castSafely(@Nullable Object o, Class<T> clazz)`<br>• `public static boolean instanceOfAny(@Nullable Object o, Class<?>... classes)`<br>• `public static <T> void ifCastable(@Nullable Object o, Class<T> clazz, Consumer<T> action)`<br>• `public static <T> T run(T value, Consumer<T> consumer)`<br>• `public static <T, E extends Throwable> T throwE(E throwable)` | 通用基础工具类。 |
| **`DistExecutor`** | `public static void run(Dist expectedDist, Supplier<Runnable> supplier)` | 当物理端等于 `expectedDist` 时执行 `supplier.get().run()`。 |
| **`Lazy<T>`** | `public Lazy(Supplier<T> supplier)` / `public boolean isGotten()` / `public T get()` | 线程安全的双重检查/同步懒加载包装器。 |
| **`ISerializer<T>`** | `MapCodec<T> codec()` / `StreamCodec<RegistryFriendlyByteBuf, T> streamCodec()` | 统一提供 `MapCodec` 与 `StreamCodec` 的序列化接口。 |
| **`ClientTickRecorder`** | `public static int getTicks()` | 客户端非暂停状态下每 Tick 自增 1 的全局计时器（每 `1,728,000` Tick = 24 小时重置一次以保持浮点精度，退出世界时归零）。 |

### 2. `CollectionUtil` 与 `ListUtil`（集合与列表工具）

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`CollectionUtil`** | • `<T> boolean allMatch(Collection<T> collection, Predicate<T> matcher)`<br>• `<T> boolean anyMatch(Collection<T> collection, Predicate<T> matcher)`<br>• `<K, V, M extends Multimap<K, V>> M newMultimap(M emptyMap, Collection<V> values, Function<V, K> keyFactory)`<br>• `<T> LinkedList<T> newLinkedList(int ignored)`<br>• `<T> @Nullable T get(SequencedCollection<T> collection, int index)` | 无 Stream 分配开销的集合断言与按索引读取工具。 |
| **`ListUtil`** | • `<T> Optional<T> safelyGet(List<T> list, int index)`：越界或元素为 `null` 时安全返回 `Optional.empty()`<br>• `<T> List<T> cycle(List<T> original, int times)`：将列表循环移位 `times` 位返回新列表<br>• `<T> List<T> createWithValues(int size, IntFunction<T> valueFac)`<br>• `<T, R extends T> List<R> cast(List<T> original, Class<R> clazz)`：过滤并强转为子类列表<br>• `<T, U> boolean equals(List<T> first, List<U> second, BiPredicate<T, U> equals)` | 列表安全访问、循环轮转与自定义相等性比较工具。 |

### 3. `MathUtil` 与 `NumberProviderUtil`（数学与战利品数值期望工具）

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`MathUtil`** | • `Vector2f rotate(Vector2f v, float radians)` / `Vector2f rotationDegrees(Vector2f v, float deg)` / `Vector2f copy(Vector2f v)`<br>• `float angle(Vector2f from, Vector2f to)`（弧度） / `float angleDegrees(Vector2f from, Vector2f to)`<br>• `boolean isInRange(double value, double min, double max)`（开区间 `(min, max)`，自动纠正 `min > max`）<br>• `boolean isInRange(double vx, double vy, double minX, double minY, double maxX, double maxY)`<br>• `Vec3i dist(BlockPos a, BlockPos b)` / `@Nullable Direction getDirection(BlockPos from, BlockPos to)`<br>• `float safeDiv(float a, float b)` / `double safeDiv(double a, double b)`（除数为 `0` 时返回 `0`）<br>• `float clampWithProportion(float value, float min, float max)`（按周期长度将越界值折叠回 `[min, max]` 区间内） | 2D 向量旋转/夹角、区间判断与安全除法工具。 |
| **`NumberProviderUtil`** | • `double expected(NumberProvider provider)`<br>• `double max(NumberProvider provider)`<br>• `double min(NumberProvider provider)` | 计算原版 `ConstantValue`、`UniformGenerator`（期望 `(min+max)/2`）与 `BinomialDistributionGenerator`（期望 `n*p`）的数学期望值、最大值与最小值（未知类型返回 `-1`）。广泛用于 JEI 配方概率与平均产量展示。 |

### 4. `ShapeUtil`、`OutlineUtil` 与 `Line`（几何形状与轮廓工具）

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`ShapeUtil`** | • `VoxelShape box(AABB shape)`（将 `[0, 16]` 像素坐标的 `AABB` 转为 `Block.box`）<br>• `VoxelShape merge(VoxelShape... shapes)` / `VoxelShape merge(AABB... shapes)`<br>• `VoxelShape cut(VoxelShape base, VoxelShape... cutters)` / `VoxelShape cut(AABB base, AABB... cutters)`<br>• `VoxelShape rotate(Direction.Axis axis, float angle, VoxelShape shape)` / `AABB rotate(axis, angle, AABB)` / `AABB[] rotate(axis, angle, AABB...)`<br>• `VoxelShape mirror(Direction.Axis axis, VoxelShape shape)` / `AABB mirror(axis, AABB)` / `AABB[] mirror(axis, AABB...)`<br>• `Future<VoxelShape> threadedJoin(List<VoxelShape> shapes, BooleanOp function, ExecutorService executor)` | 方块碰撞箱布尔运算、旋转、镜像与并行合并工具（注意：`AABB` 参数版本的坐标单位均为 `0..16` 像素制）。 |
| **`OutlineUtil`** | • `public static List<Line> extractOutline(List<AABB> boxes)`<br>• `public static List<Line> extractOutline(List<AABB> boxes, @Nullable Executor executor)` | 提取 `AABB` 列表的无内部重叠合并外轮廓线（可通过系统属性 `-Danvillib.outline.parallelThreshold=1024` 调整并行阈值）。 |
| **`Line`** | `public record Line(Vec3 start, Vec3 end, int thickness, float length)`<br>`public void render(PoseStack.Pose pose, VertexConsumer vertex, Vec3 camera, int color)` | 三维线段记录（默认线宽 `thickness = 4`），提供直接向 `RenderTypes.lines()` 缓冲区写入相机相对空间顶点与法线的 `render` 方法。 |

### 5. `InventoryUtil` 与 `Scrollable`

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`InventoryUtil`** | • `public static BiConsumer<ArrayList<ItemStack>, LivingEntity> compatConsumer`<br>• `ItemStack getFirstItem(Inventory, ItemLike / Supplier<ItemLike> / Predicate<ItemStack>)`<br>• `List<ItemStack> getItems(Inventory)` / `List<ItemStack> getItems(Inventory, Predicate<ItemStack>)`<br>• `boolean hasItem(Inventory, Item / Supplier<ItemLike>)`<br>• `ArrayList<ItemStack> getCompatItems(LivingEntity)` / `ItemStack getItemInCompat(LivingEntity, Predicate<ItemStack>)` / `boolean hasItemInCompat(LivingEntity, Predicate<ItemStack>)`<br>• `ItemStack insertItem(Inventory inventory, ItemStack stack)` | 玩家物品栏检索、第三方饰品栏兼容检索（通过 `compatConsumer` 钩子扩展，如接入 Curios/Accessories）以及自动同步 `ClientboundContainerSetSlotPacket` 的物品插入方法。 |
| **`Scrollable`** | 抽象方法：`int row()`、`int column()`、`int size()`、`void setHead(int head)`；<br>工具方法：`canScroll()`、`calculateRowCount()`、`getRowIndex()`、`scrollOnDrag(float barHeight, double mouseY, int top, int bottom)`、`scrollOnScroll(double scrollY)`、`scrolling()`、`notScrolling()`、`reset()` | 网格/列表滚动条数学计算基类。子类只需实现可见行数 `row()`、列数 `column()`、总元素数 `size()` 及更新首元素索引的 `setHead(int)`。 |
