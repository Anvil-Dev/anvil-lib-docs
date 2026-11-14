# 集合、数学、几何形状与物品栏工具

`module.util`（模组 ID：`anvillib_util`）是 AnvilLib 1.21.1 中最基础的工具模块，为服务端与客户端提供线程安全懒加载、集合/列表辅助、2D 向量/包络比例数学、并行轮廓提取（`OutlineUtil`）、多线程体素网格布尔运算/旋转/镜像（`ShapeUtil`）、跨模组兼容饰品栏查询（`InventoryUtil`）、自定义滚动容器抽象（`Scrollable`）以及客户端渲染用 Tick 计时器（`ClientTickRecorder`）。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### 模块入口与分包导航

- **`AnvilLibUtil`**：`MAIN_ID = "anvillib"`、`MOD_ID = "anvillib_util"`，提供 `AnvilLibUtil.of(String path)` 生成 `anvillib:<path>` 资源定位符（注意：返回的是主命名空间 `anvillib` 而非 `anvillib_util`）。
- 专项子文档：
  - [扁平化多维循环 (FlattenLoop)](./flatten-loop.md)
  - [多行组件信息与 Tooltip 工具](./components.md)
  - [方块、物品与 NBT 谓词及概率模型](./predicates.md)
  - [非空函数式接口与无限物品栈](./nullness-and-stack.md)

## 核心 API 分类详解

### 1. 基础环境判断、序列化与懒加载

包名：`dev.anvilcraft.lib.v2.util`

#### `AnvilLibUtil`

| 成员签名 | 说明 |
| --- | --- |
| `public static final String MAIN_ID = "anvillib"` | AnvilLib 主命名空间 |
| `public static final String MOD_ID = "anvillib_util"` | 工具模块 Mod ID |
| `static ResourceLocation of(String path)` | 创建 `anvillib:<path>` 的 `ResourceLocation` |

#### `Util`

| 方法 / 字段签名 | 设计意图与边界条件 |
| --- | --- |
| `public static final Direction[][] CORNER_DIRECTIONS` | `8 x 3` 的方向三元组常量表，对应方块 8 个顶角的三个正交方向 |
| `static boolean isLoaded(String modId)` | 通过 `ModList.get().isLoaded(modId)` 判断目标模组是否已加载 |
| `static Function<InteractionResult, ItemInteractionResult> interactionResultConverter()` | 将 1.21.1 方块交互结果 `InteractionResult` 映射为 `ItemInteractionResult`（如 `SUCCESS` -> `SUCCESS`、`FAIL` -> `FAIL`） |
| `static <E, C extends Collection<E>> Optional<C> intoOptional(C collection)` | 当集合为空时返回 `Optional.empty()`，非空时返回 `Optional.of(collection)` |
| `static void acceptDirections(BlockPos blockPos, Consumer<BlockPos> blockPosConsumer)` | 遍历以 `blockPos` 为中心、切比雪夫距离为 1 的全部 **26 个邻居坐标**（6 面 + 12 棱 + 8 角），**不包含中心点本身** |
| `static boolean isClient()` | 判断 `FMLEnvironment.dist.isClient()` |
| `static boolean isServer()` | 判断 `FMLEnvironment.dist.isDedicatedServer()` |
| `static <T> T cast(Object o)` | 无检查泛型强转 `(T) o`（需由调用方保证类型安全） |
| `static <T> Optional<T> castSafely(@Nullable Object o, Class<T> clazz)` | 基于 `clazz.isInstance(o)` 的安全强转 |
| `static boolean instanceOfAny(@Nullable Object o, Class<? extends Object>... classes)` | 判断对象是否为任意给定类型的实例；`o == null` 时直接返回 `false` |
| `static <T> void ifCastable(@Nullable Object o, Class<T> clazz, Consumer<T> action)` | 若 `o` 为 `clazz` 实例则执行 `action` |
| `static <T> T run(T value, Consumer<T> consumer)` | 对 `value` 执行配置回调后将其原样返回（Kotlin `apply` 风格） |
| `static <T, E extends Throwable> T throwE(E throwable) throws E` | 以泛型方式抛出受检/非受检异常（可用于表达式分支） |

#### `DistExecutor` 与 `Lazy<T>` 与 `ISerializer<T>`

| 类 / 接口与签名 | 设计意图与边界条件 |
| --- | --- |
| `DistExecutor.run(Dist expectedDist, Supplier<Runnable> supplier)` | 当 `FMLEnvironment.dist == expectedDist` 时才调用 `supplier.get().run()`，通过双重 `Supplier<Runnable>` 延迟类加载避免专用服务端触发客户端类崩溃 |
| `public final Supplier<T> supplier` (`Lazy<T>`) | 构造 `new Lazy<>(Supplier<T>)` 传入的底层提供者，同时作为内部 `synchronized (this.supplier)` 锁对象 |
| `boolean isGotten()` (`Lazy<T>`) | 返回当前值是否已初始化完成（在首次 `get()` 赋非空值前为 `false`） |
| `T get()` (`Lazy<T>`) | 双重检查锁定懒加载。**注意**：内部以 `value == null` 判断未初始化，因此 `supplier` 不应返回 `null` |
| `interface ISerializer<T>` | 配方/数据对象通用序列化契约：`MapCodec<T> codec()` 与 `StreamCodec<RegistryFriendlyByteBuf, T> streamCodec()` |

### 2. 集合与列表工具（`CollectionUtil` / `ListUtil`）

| 类与方法签名 | 说明与边界条件 |
| --- | --- |
| `CollectionUtil.allMatch(Collection<T> collection, Predicate<T> matcher)` | 检查集合所有元素是否都满足 `matcher` |
| `CollectionUtil.anyMatch(Collection<T> collection, Predicate<T> matcher)` | 检查集合是否存在任意满足 `matcher` 的元素 |
| `CollectionUtil.newMultimap(M emptyMap, Collection<V> values, Function<V, K> keyFactory)` | 将 `values` 按 `keyFactory` 分组填入传入的可变 `Multimap` 并返回 |
| `CollectionUtil.newLinkedList(int ignored)` | 忽略容量参数直接构造空 `LinkedList<T>`，常用于 `ByteBufCodecs.collection(CollectionUtil::newLinkedList)` |
| `CollectionUtil.get(SequencedCollection<T> collection, int index)` | 按索引读取有序集合第 `index` 项；越界时返回 `null` |
| `ListUtil.safelyGet(List<T> list, int index)` | 当 `index < 0 \|\| index >= list.size()` 时返回 `Optional.empty()`，否则返回 `Optional.of(list.get(index))` |
| `ListUtil.cycle(List<T> original, int times)` | 将 `original` 原序重复拼接 `times` 次；当 `times <= 0` 或列表为空时返回空不可变列表 |
| `ListUtil.createWithValues(int size, IntFunction<T> valueFac)` | 依次用索引 `0 .. size - 1` 调用 `valueFac` 构造包含 `size` 个元素的列表 |
| `ListUtil.cast(List<T> original, Class<R> clazz)` | 过滤并强转列表中属于 `clazz` 的元素为 `List<R>` |
| `ListUtil.equals(List<T> first, List<U> second, BiPredicate<T, U> equals)` | 长度相等且同索引元素全部满足 `equals` 时返回 `true` |

### 3. 数学与战利品数值期望（`MathUtil` / `NumberProviderUtil`）

#### `MathUtil`

| 方法签名 | 说明与边界条件 |
| --- | --- |
| `Vector2f rotationDegrees(Vector2f v, float deg)` | 围绕原点逆时针旋转角度 `deg`（内部转为弧度后调用 `rotate`，返回新 `Vector2f`） |
| `Vector2f rotate(Vector2f v, float d)` | 围绕原点逆时针旋转弧度 `d`，不修改原向量 `v` |
| `Vector2f copy(Vector2f v)` | 返回 `new Vector2f(v.x, v.y)` |
| `float angle(Vector2f from, Vector2f to)` | 计算两二维向量连线相对于 X 正半轴的弧度角（`atan2(to.y - from.y, to.x - from.x)`），返回值范围 `[-π, π]` |
| `float angleDegrees(Vector2f from, Vector2f to)` | 将 `angle(from, to)` 转为角度值 |
| `boolean isInRange(double value, double min, double max)` | **开区间**判定 `value > min && value < max`（注意：边界值本身返回 `false`） |
| `boolean isInRange(double valueX, double valueY, double minX, double minY, double maxX, double maxY)` | 二维**开区间**矩形范围判定 |
| `Vec3i dist(BlockPos a, BlockPos b)` | 计算分量差值向量 `b - a`（带符号 `dx, dy, dz`） |
| `@Nullable Direction getDirection(BlockPos from, BlockPos to)` | 将单位位移转为 `Direction`，非相邻或零偏移可能返回 `null` |
| `float safeDiv(float a, float b)` | 安全浮点除法，`b == 0` 时返回 `0F` |
| `double safeDiv(double a, double b)` | 安全双精度除法，`b == 0` 时返回 `0D` |
| `float clampWithProportion(float value, float min, float max)` | 按周期长度 `max - min` 将 `value` **循环折叠**进 `[min, max]`；若 `min == max` 则抛出 `IllegalArgumentException` |

#### `NumberProviderUtil`

用于静态解析战利品数值提供器 `NumberProvider` 的数学期望、最大值与最小值：

| 方法签名 | 支持类型 | 不支持类型返回值 |
| --- | --- | --- |
| `double expected(NumberProvider numberProvider)` | `ConstantValue` (`v`)、`UniformGenerator` (`(min+max)/2`)、`BinomialDistributionGenerator` (`n * p`) | `-1` |
| `double max(NumberProvider numberProvider)` | `ConstantValue` (`v`)、`UniformGenerator` (`max`)、`BinomialDistributionGenerator` (`n`) | `-1` |
| `double min(NumberProvider numberProvider)` | `ConstantValue` (`v`)、`UniformGenerator` (`min`)、`BinomialDistributionGenerator` (`0`) | `-1` |

> [!WARNING]
> 上述三个方法仅处理 `ConstantValue`、`UniformGenerator` 与 `BinomialDistributionGenerator`（其中后两者的边界值/概率需为常见数值子表达式，内部递归调用 `expected`/`max`/`min`）。遇到其他自定义 `NumberProvider` 时会返回 `-1`。

### 4. 体素形状与并行轮廓线段（`ShapeUtil` / `OutlineUtil` / `Line`）

#### `ShapeUtil`

方块坐标系约定：所有方法基于单方块中心 `(8, 8, 8)`（`Block.box` 单位 `0..16`），旋转方向为**逆时针**，角度应传入 `90°` 的倍数（支持负数与超过 `360°` 归一化到 `{0, 90, 180, 270}`；遇到非 90° 倍数仅记录告警日志并原样返回）。

| 方法签名 | 说明 |
| --- | --- |
| `Future<VoxelShape> threadedJoin(List<VoxelShape> shapes, BooleanOp op, ExecutorService executor)` | 提交多任务树状归约合并大型 `VoxelShape` 列表，返回 `Future<VoxelShape>`；空列表立即完成并返回 `Shapes.empty()` |
| `VoxelShape cut(VoxelShape base, VoxelShape... cutters)` | 从 `base` 中依次挖去 `cutters`（`BooleanOp.ONLY_FIRST`），最后调用 `.optimize()` |
| `VoxelShape cut(AABB base, AABB... cutters)` | 同上，`AABB` 坐标系重载（自动转 `VoxelShape` 后求差） |
| `VoxelShape merge(VoxelShape... shapes)` | 以 `BooleanOp.OR` 合并多个 `VoxelShape` 并 `.optimize()` |
| `VoxelShape merge(AABB... shapes)` | `AABB` 数组合并为单个优化后的 `VoxelShape` |
| `VoxelShape box(AABB shape)` | 将基于 `[0, 1]` 的 `AABB` 缩放 16 倍构造 `Block.box(...)` |
| `VoxelShape rotate(Direction.Axis axis, float angle, VoxelShape shape)` | 绕指定轴与 `(8, 8, 8)` 中心逆时针旋转 `angle`（需为 90° 倍数） |
| `AABB[] rotate(Direction.Axis axis, float angle, AABB... shapes)` | 批量旋转 `AABB` 数组（`0..16` 像素单位） |
| `AABB rotate(Direction.Axis axis, float angle, AABB shape)` | 旋转单个 `AABB`（`0..16` 像素单位） |
| `VoxelShape mirror(Direction.Axis axis, VoxelShape shape)` | 沿指定坐标轴对坐标 `x/y/z -> 16 - x/y/z` 进行镜像翻转 |
| `AABB[] mirror(Direction.Axis axis, AABB... shapes)` | 批量镜像 `AABB` 数组 |
| `AABB mirror(Direction.Axis axis, AABB shape)` | 镜像单个 `AABB` |

#### `OutlineUtil` 与客户端线段 `Line`

`OutlineUtil` 通过**三轴扫描平面（sweep-plane）**从任意数量的重叠或相邻 `AABB` 集合中消除内部共面边，提取合并后的外部轮廓线段列表 `List<Line>`：

| 方法签名 | 说明 |
| --- | --- |
| `static List<Line> extractOutline(List<AABB> boxes)` | 使用全局公共线程池自动提取轮廓（当 `boxes.size() >= Integer.getInteger("anvillib.outline.parallelThreshold", 1024)` 且存在可用并行度时切换为并行扫描） |
| `static List<Line> extractOutline(List<AABB> boxes, @Nullable Executor executor)` | 允许指定自定义 `Executor` 执行并行计算；传 `null` 则强制在当前线程串行计算 |

`dev.anvilcraft.lib.v2.util.client.Line` 为不可变记录类型：

```java
public record Line(Vec3 start, Vec3 end, int thickness, float length)
```

| 成员 / 构造 / 方法签名 | 说明 |
| --- | --- |
| `Line(Vec3 start, Vec3 end, float length)` | 构造默认粗细 `1` 的线段 |
| `Line(Vec3 start, Vec3 end, int thickness)` | 构造默认长度 `1F` 的线段 |
| `Line(Vec3 start, Vec3 end)` | 默认粗细 `1`、长度 `1F` |
| `@Deprecated(forRemoval = true) void render(PoseStack pose, VertexConsumer vertex, Vec3 camera, int color)` | 已废弃，请改用 `PoseStack.Pose` 重载 |
| `void render(PoseStack.Pose pose, VertexConsumer vertex, Vec3 camera, int color)` | 相对 `camera` 平移并沿线段方向计算法线向 `LINES` 顶点缓冲写入两个端点。**注意**：MC 1.21.1 原版 `VertexConsumer` 无 `setLineWidth` 方法，当前渲染实现忽略 `thickness` |

### 5. 物品栏兼容、滚动与客户端计时（`InventoryUtil` / `Scrollable` / `ClientTickRecorder`）

#### `InventoryUtil`

除检查玩家 `Inventory` 的副手（`offhand`）、主背包（`items`）、盔甲槽（`armor`）外，还预留 `compatConsumer` 钩子以对接 Curios 等第三方饰品模组：

| 成员签名 | 说明与边界条件 |
| --- | --- |
| `public static BiConsumer<ArrayList<ItemStack>, LivingEntity> compatConsumer` | 第三方饰品栏扩展钩子（默认 `NonNullBiConsumer.noop()`），模组联动时向列表追加实体的饰品 `ItemStack` |
| `static ItemStack getFirstItem(Inventory inventory, ItemLike item)` | 按 `offhand -> items -> armor` 顺序查找首个匹配物品，未找到返回 `ItemStack.EMPTY` |
| `static ItemStack getFirstItem(Inventory inventory, Supplier<ItemLike> item)` | 懒加载物品重载 |
| `static ItemStack getFirstItem(Inventory inventory, Predicate<ItemStack> filter)` | 按自定义谓词查找首个匹配物品 |
| `static List<ItemStack> getItems(Inventory inventory, Predicate<ItemStack> filter)` | 收集三区中满足 `filter` 的全部非空 `ItemStack` |
| `static List<ItemStack> getItems(Inventory inventory)` | 收集三区中所有非空 `ItemStack` |
| `static boolean hasItem(Inventory inventory, Item item)` | 判断背包是否包含指定 `Item` |
| `static boolean hasItem(Inventory inventory, Supplier<ItemLike> item)` | 懒加载物品重载 |
| `static ItemStack getItemInCompat(LivingEntity entity, Predicate<ItemStack> filter)` | 从 `compatConsumer` 收集的扩展槽位中查找首个满足 `filter` 的物品，未找到返回 `ItemStack.EMPTY` |
| `static ArrayList<ItemStack> getCompatItems(LivingEntity living)` | 触发 `compatConsumer` 获取实体的全部扩展兼容槽位物品 |
| `static boolean hasItemInCompat(LivingEntity entity, Predicate<ItemStack> filter)` | 判断扩展兼容槽位中是否存在匹配物品 |
| `static ItemStack insertItem(Inventory inventory, ItemStack stack)` | 尝试将 `stack` 合并入或插入玩家背包；若持有者为 `ServerPlayer` 会自动发送 `ClientboundContainerSetSlotPacket` 同步槽位，返回剩余未能插入的 `ItemStack` |

#### `Scrollable`

配合原版风格滚动条 GUI 的抽象基类（Lombok `@Getter` 提供 `isScrolling()`、`getScrollOffs()`）：

| 成员签名 | 说明 |
| --- | --- |
| `int calculateRowCount()` | 计算可超出可视区的总行数 `max(ceil(size / column) - row, 0)` |
| `int getRowIndex()` | 根据当前 `scrollOffs` 与可滚动行数计算首行索引，并 clamp 到 `>= 0` |
| `void calculateScroll(int rowIndex)` | 将当前行索引反向换算为 `0.0F..1.0F` 的 `scrollOffs` |
| `void subtractInputFromScroll(double input)` | 按单步位移 `input / calculateRowCount()` 调整并夹紧 `scrollOffs` |
| `void scrollTo()` | 调用 `setHead(getRowIndex() * column())` 同步可见起始偏移 |
| `void scrollOnDrag(float barHeight, double mouseY, int top, int bottom)` | 处理鼠标拖拽滚动条计算（将滑块中心映射回 `[top, bottom]`）并刷新 `scrollTo()` |
| `void scrollOnScroll(double scrollY)` | 处理滚轮事件 `subtractInputFromScroll(scrollY)` 并刷新 `scrollTo()` |
| `void scrolling()` / `void notScrolling()` | 设置 `scrolling = true` / `false` |
| `void reset()` | 重置 `scrolling = false`、`scrollOffs = 0.0F` 并调用 `scrollTo()` |
| `boolean canScroll()` | 当 `size() > row() * column()` 时返回 `true` |
| `abstract int row()` / `column()` / `size()` | 子类提供可视行数、列数、总条目数（均为 `@Range(from = 0, to = Integer.MAX_VALUE)`） |
| `abstract void setHead(int head)` | 子类接收刷新后的首元素索引 |

#### `ClientTickRecorder`

使用 `@EventBusSubscriber(value = Dist.CLIENT)` 自动订阅客户端 Tick 与断线事件：

| 成员签名 | 说明 |
| --- | --- |
| `public static int getTicks()` (`@Getter private static int ticks`) | 获取客户端非暂停状态下累计的 Tick 数，每 **24 小时（`1_728_000` ticks）取模归零** |
| `@ApiStatus.Internal static void onTick(ClientTickEvent.Pre e)` | 游戏未暂停时递增 `ticks`（内部事件处理） |
| `@ApiStatus.Internal static void onClientExit(ClientPlayerNetworkEvent.LoggingOut e)` | 玩家退出世界时重置 `ticks = 0`（内部事件处理） |

## 完整示例：组合使用方块朝向旋转、合并碰撞箱与 26 邻域查询

```java
package com.example.mymod.block;

import dev.anvilcraft.lib.v2.util.MathUtil;
import dev.anvilcraft.lib.v2.util.ShapeUtil;
import dev.anvilcraft.lib.v2.util.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.ArrayList;
import java.util.List;

public final class MachineShapeAndNeighborDemo {
    private static final VoxelShape BASE_NORTH = ShapeUtil.merge(
        Block.box(2, 0, 2, 14, 4, 14),
        Block.box(5, 4, 3, 11, 12, 9)
    );

    public static VoxelShape shapeForFacing(Direction facing) {
        return switch (facing) {
            case NORTH -> BASE_NORTH;
            case WEST -> ShapeUtil.rotate(Direction.Axis.Y, 90F, BASE_NORTH);
            case SOUTH -> ShapeUtil.rotate(Direction.Axis.Y, 180F, BASE_NORTH);
            case EAST -> ShapeUtil.rotate(Direction.Axis.Y, 270F, BASE_NORTH);
            default -> BASE_NORTH;
        };
    }

    public static List<BlockPos> collectRedstoneNeighbors(Level level, BlockPos center) {
        List<BlockPos> powered = new ArrayList<>();
        Util.acceptDirections(center, pos -> {
            if (level.hasNeighborSignal(pos)) {
                powered.add(pos.immutable());
            }
        });
        return powered;
    }

    public static void rewardPlayerSafely(Player player, int amount) {
        ItemStack stack = new ItemStack(Items.IRON_INGOT, Math.max(1, amount));
        float clampedAngle = MathUtil.clampWithProportion(player.getYRot(), 0F, 360F);
        if (player instanceof ServerPlayer && clampedAngle >= 0F) {
            ItemStack leftover = dev.anvilcraft.lib.v2.util.InventoryUtil.insertItem(
                player.getInventory(),
                stack
            );
            if (!leftover.isEmpty()) {
                player.drop(leftover, false);
            }
        }
    }

    public static VoxelShape carvedChannel() {
        return ShapeUtil.cut(
            new AABB(0, 0, 0, 16, 16, 16),
            new AABB(4, 8, 0, 12, 16, 16)
        );
    }
}
```
