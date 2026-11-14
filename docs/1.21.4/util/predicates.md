# 方块、物品与 NBT 谓词及概率模型

`dev.anvilcraft.lib.v2.util.predicate` 提供了一组带有完整 `Codec`、`StreamCodec` 与流式构建器的**数据结构与状态匹配器**，被 `module.recipe` 及外部配方/规则系统直接作为底层条件和概率输出载体使用。

## 方块状态与方块实体匹配：`BlockStatePredicate`

`BlockStatePredicate` 既能仅校验方块 ID/标签与 `BlockState` 属性（支持精确匹配和数值比较区间 `withMin` / `withMax` / `with(min, max)`），也能校验绑定的 `BlockEntity` NBT，同时支持离开主线程做纯离线 NBT 检查。

### 匹配执行 API

| 方法 | 说明 |
| --- | --- |
| `test(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | 完整在线校验：先比对方块集合与属性，若 `requiresBlockEntity()` 为真再对比实体 NBT |
| `testWithoutEntity(BlockState state)` | 仅验证方块与方块属性是否满足 |
| `cannotMatch(BlockState state)` | 反向快速排除判定 |
| `testEntity(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | 单独检查方块实体实时存储的 NBT |
| `testOffThread(BlockState state, @Nullable CompoundTag entityNbt)` / `testEntityOffThread(...)` | 线程安全离线程版，适用于多线程配方索引或缓存预筛选 |
| `requiresBlockEntity()` | 当前谓词是否附加了 `CompoundTag` 实体校验条件 |
| `getStatesCache()` / `constructStatesForRender()` | 返回所有满足该谓词的离散 `BlockState` 列表（后者常用于在配方界面轮播渲染兼容方块） |
| `getKey()` | 提取用于索引分类的规范资源键（如无则返 `BlockStatePredicate.EMPTY`） |

### `BlockStatePredicate.Builder` 构造方法

- 入口：`BlockStatePredicate.builder()`
- 指定方块候选：`of(Block... blocks)`、`of(Supplier<? extends Block>... blocks)`、`of(Collection<Block>)`、`of(TagKey<Block> tag)`
- 约束方块属性：`with(BlockState)`、`with(Property<?> prop, String val)`、`with(Property<Integer>, int)`、`with(Property<Boolean>, boolean)`、`with(Property<T>, T)`、区间 `with(Property<T>, Comparable, Comparable)` / `withMin(...)` / `withMax(...)`
- 多组条件分支：`or()`（追加新的备选匹配分支）
- 实体 NBT：`nbt(CompoundTag tag)`
- `build()` 生成最终不可变 `BlockStatePredicate`（内置 `CODEC` 与 `STREAM_CODEC`）。

## 物品与成分匹配：`IItemStackPredicate`、`ItemPredicate` & `ItemIngredientPredicate`

两者均支持在 `1.21.4` 注册表标签 `BuiltInRegistries.ITEM.getOrThrow(tag)`、物品列表、数量判定、`ItemSubPredicate` 子谓词以及 `DataComponentPredicate` 数据组件匹配。

| 类 / 接口 | 核心差异与用法 |
| --- | --- |
| `IItemStackPredicate` | 通用物品匹配接口（声明 `test(ItemStack)` 与数量检查接口） |
| `ItemPredicate` | 使用 `MinMaxBounds.Ints`（支持范围如 `>= 3`）约束堆叠数量；提供 `ItemPredicate.Builder.item().of(...).withCount(...).withSubPredicate(...).hasComponents(...).build()` |
| `ItemIngredientPredicate` | 针对合成槽位式单定数量设计的匹配器（支持 `ItemIngredientPredicate.of(...)` 与 `.withCount(int)`）；额外暴露 `getItems()`（`ItemStack[]`）方便渲染器展示可用示例材料 |

二者均公开了 `CODEC` 与 `STREAM_CODEC` 常量（基于 `StreamCodecUtil.codec2Stream`）。

## 轻量 NBT 匹配：`NbtPredicate`

`public record NbtPredicate(CompoundTag tag) implements Predicate<Tag>`（使用 `TagParser.LENIENT_CODEC` 支持宽松 SNBT 写法）：
- `test(@Nullable Tag tag)`：递归比对超集（待检测 NBT 必须包含期望 `tag` 里的全部键与匹配值，允许包含额外未声明字段）；
- `test(ItemStack stack)` / `test(Entity entity)`：分别检查物品自定义 NBT/组件上下文与实体的完整保存数据；
- `NbtPredicate.getEntityTagToCompare(Entity entity)`：提取与原版战利品谓词口径一致的实体 NBT 快照。

## 概率输出模型：`ChanceBlockState`、`WeightedChanceBlockStates` & `ChanceItemStack`

用于描述配方输出或世界转变过程中“带权随机选一”或“附带产出概率/动态 `NumberProvider` 数量”的结果集（注意：在 `1.21.4` 底层通过 `new LootParams(level, ContextMap.EMPTY, Map.of(), 0)` 求值 `NumberProvider`）。

### 1. `ChanceItemStack(ItemStack stack, NumberProvider count)`

- 构造工厂：
  - `ChanceItemStack.of(ItemLike item, int count / NumberProvider amount)`
  - `ChanceItemStack.of(ItemStack stack[, int count[, float chance]][, NumberProvider amount / float chance])`
- 运行结果与元数据：`getResult(ServerLevel level)`（对 `count` 结果限幅 `1..99` 并返回新副本 `ItemStack`）、`getItem()`、`getItemHolder()`、`getMaxCount()`、`getComponentsPatch()`。

### 2. `ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)`

- 构造重载：`ChanceBlockState(state, chance)`、`ChanceBlockState(state, float)`、`ChanceBlockState.of(Supplier<? extends Block>[, CompoundTag nbt])`。
- 运行结果：`@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)`（随机抽取小于等于 `chance` 时返回命中状态与 NBT，否则返回 `null`）。

### 3. `WeightedChanceBlockStates(List<Entry> states)`

按权重列表选出一个概率方块结果，通过 `WeightedChanceBlockStates.builder()` 构建：
- `add(...)` 提供极其丰富的参数组合重载，按需传入权重 `NumberProvider` / `float`、目标 `BlockState` / `Block` / `Supplier<? extends Block>`、可选实体 `CompoundTag` 以及产出几率 `NumberProvider` / `float`；
- `isEmpty()` 检查是否含任何条目，`build()` 完成构造，`getResult(ServerLevel)` 计算加权抽取并校验几率。
