# 集合、数学、几何形状与物品栏工具

`module.util` 是 AnvilLib 的跨模块通用基础设施模块，封装了集合操作、几何矢量数学、`VoxelShape` 旋转镜像变换、3D 轮廓提边、玩家/兼容模组背包查询以及标准化的生命周期与滚动工具。

## 模块信息

- 模组 ID：`anvillib_util`（`AnvilLibUtil.MOD_ID`）
- 主命名空间：`anvillib`（`AnvilLibUtil.MAIN_ID`，资源路径构造：`AnvilLibUtil.of(String path)`）

## 通用杂项与转换：`Util`、`DistExecutor`、`ClientTickRecorder`、`Lazy`、`ISerializer`

### `Util` 核心静态工具

| 方法 / 常量 | 说明 |
| --- | --- |
| `Util.CORNER_DIRECTIONS` | `Direction[][]` 二维常量数组，描述 8 个方块边角对应的方向组合 |
| `Util.isLoaded(String modId)` | 检查指定 Mod 是否已在 `ModList` 中加载 |
| `Util.isClient()` / `Util.isServer()` | 依据环境/当前活动服务端或客户端线程判断逻辑侧 |
| `Util.intoOptional(C collection)` | 当集合非空时包装为 `Optional.of(collection)`，为空返回 `Optional.empty()` |
| `Util.acceptDirections(BlockPos pos, Consumer<BlockPos> consumer)` | 向四周 6 个正交邻居坐标依次执行消费回调 |
| `Util.cast(Object o)` / `castSafely(@Nullable Object, Class<T>)` | 泛型安全或强制向下转型 |
| `Util.instanceOfAny(@Nullable Object, Class<?>... classes)` | 判断对象是否为任意候选类之一实例 |
| `Util.ifCastable(@Nullable Object, Class<T>, Consumer<T>)` | 类型匹配时执行消费回调 |
| `Util.run(T value, Consumer<T> consumer)` | 流式配置作用域辅助（类似 Kotlin `.apply {}`），消费后原样返回 `value` |
| `Util.throwE(E throwable)` | 隐式将受检异常以泛型形式抛出 |

### `DistExecutor` & `ClientTickRecorder` & `Lazy` & `ISerializer`

- `DistExecutor.run(Dist expectedDist, Supplier<Runnable> supplier)`：当运行在期望物理端时执行回调，避免服务端触碰仅客户端类。
- `ClientTickRecorder`：记录客户端全局动画刻（`onTick(ClientTickEvent.Pre)`、`onClientExit(ClientPlayerNetworkEvent.LoggingOut)`）。
- `Lazy<T>`：轻量单线程惰性求值容器（提供 `isGotten()` 与 `get()`）。
- `ISerializer<T>`：通用序列化策略标记接口。

## 集合与列表：`CollectionUtil` & `ListUtil`

| 类名 | 方法签名 | 说明 |
| --- | --- | --- |
| `CollectionUtil` | `allMatch(Collection<T>, Predicate<T>)` / `anyMatch(...)` | 对任意集合执行快速条件匹配 |
| `CollectionUtil` | `newMultimap(M emptyMap, Collection<V> values, Function<V, K> keyFactory)` | 将扁平集合按提取键归组写入指定的 `Multimap` 实例 |
| `CollectionUtil` | `newLinkedList(int ignored)` / `@Nullable get(SequencedCollection<T>, int index)` | 构建链表与从有序集合按索引安全读取元素（越界返回 `null`） |
| `ListUtil` | `safelyGet(List<T> list, int index)` | 安全下标访问，越界时返回 `Optional.empty()` |
| `ListUtil` | `cycle(List<T> original, int times)` | 循环移位列表元素 |
| `ListUtil` | `createWithValues(int size, IntFunction<T> valueFac)` | 按下标生成器构造定长列表 |
| `ListUtil` | `cast(List<T> original, Class<R> clazz)` | 筛选并转为目标子类型列表 |
| `ListUtil` | `equals(List<T> first, List<U> second, BiPredicate<T, U> equals)` | 跨泛型双列表顺序比较 |

## 数学与随机 provider：`MathUtil` & `NumberProviderUtil`

### `MathUtil` (`dev.anvilcraft.lib.v2.util.MathUtil`)

- **二维矢量旋转与角度**：`rotationDegrees(Vector2f v, float deg)`、`rotate(Vector2f v, float rad)`、`copy(Vector2f v)`、`angle(Vector2f from, Vector2f to)`、`angleDegrees(Vector2f from, Vector2f to)`
- **区间与离散方向**：`isInRange(value, min, max)`、`isInRange(x, y, minX, minY, maxX, maxY)`、`dist(BlockPos a, BlockPos b)`、`getDirection(BlockPos from, BlockPos to)`（非纯轴向差时返回 `null`）
- **除法与折叠**：`safeDiv(float a, float b)` / `safeDiv(double a, double b)`（除零返回安全默认值）、`clampWithProportion(float value, float min, float max)`

### `NumberProviderUtil`

从原版战利品 `NumberProvider` 静态推导统计区间（常用于配方展示预计产出区间）：
- `NumberProviderUtil.expected(NumberProvider)`：计算期望值；
- `NumberProviderUtil.min(NumberProvider)` / `NumberProviderUtil.max(NumberProvider)`：计算理论最小/最大值。

## 几何碰撞与轮廓提边：`ShapeUtil`、`OutlineUtil` & `Line`

### `ShapeUtil`

- **布尔裁剪与并集**：`cut(VoxelShape base, VoxelShape... cutters)`、`cut(AABB base, AABB... cutters)`、`merge(VoxelShape... shapes)`、`merge(AABB... shapes)`、`box(AABB shape)`；
- **多线程拼装**：`threadedJoin(...)`（内部 `Callable<VoxelShape>`）合并大量复杂体素形状；
- **旋转与镜像**：`rotate(Direction.Axis axis, float angle, VoxelShape / AABB / AABB[])`、`mirror(Direction.Axis axis, VoxelShape / AABB / AABB[])`。

### `OutlineUtil` & `Line`

将一组相邻 `AABB` 合并提炼成只包含外露轮廓边缘线的线段列表，消除相邻盒面重复渲染框线造成的 z-fighting：
- `OutlineUtil.extractOutline(List<AABB> boxes[, @Nullable Executor executor])` 返回 `List<Line>`（传入线程池可并行处理大规模体积）。
- `Line(Vec3 start, Vec3 end, int thickness, float length)` 提供多个便捷构造重载，并通过 `line.render(PoseStack / PoseStack.Pose, VertexConsumer vertex, Vec3 camera, int color)` 直接向 `RenderType.lines()` 写入线段顶点。

## 物品栏与兼容配饰查询：`InventoryUtil` & 滚动控制：`Scrollable`

### `InventoryUtil`

| 方法签名 | 说明 |
| --- | --- |
| `getFirstItem(Inventory inv, ItemLike / Supplier<ItemLike> / Predicate<ItemStack>)` | 按过滤条件查找首个匹配物品，未找到返回 `ItemStack.EMPTY` |
| `getItems(Inventory inv[, Predicate<ItemStack> filter])` | 按副手（`SLOT_OFFHAND`）与常规/盔甲槽位顺序收集背包中所有符合条件的物品 |
| `hasItem(Inventory inv, Item / Supplier<ItemLike>)` | 快速判断玩家背包是否包含特定物品 |
| `insertItem(Inventory inv, ItemStack stack)` | 尝试向背包放入物品（合并堆叠与空槽填充），返回未能放下的剩余 `ItemStack` |
| `getCompatItems(LivingEntity living)` / `getItemInCompat(...)` / `hasItemInCompat(...)` | 通过扩展静态钩子 `InventoryUtil.compatConsumer` 查询第三方装饰栏/饰品槽（如 Curios/Accessories 集成桥接点）内的物品 |

### `Scrollable`

抽象 GUI 网格滚动条辅助基类，子类仅需实现 `row()`、`column()`、`size()` 与 `setHead(int head)`，即可获得开箱即用的 `calculateRowCount()`、`getRowIndex()`、`calculateScroll(int rowIndex)`、`subtractInputFromScroll(double)`、`scrollTo()`、`scrollOnDrag(...)`、`scrollOnScroll(double)`、`scrolling()`、`notScrolling()`、`reset()` 与 `canScroll()`。

```java
// 示例：从多个相邻 AABB 提取合并后的纯净线框并渲染
List<AABB> boxes = List.of(
    new AABB(0, 0, 0, 1, 1, 1),
    new AABB(1, 0, 0, 2, 1, 1)
);
List<Line> cleanOutline = OutlineUtil.extractOutline(boxes);
for (Line line : cleanOutline) {
    line.render(poseStack, lineBuffer, cameraPos, 0xFFFFFFFF);
}
```
