# 方块、物品与 NBT 谓词及概率模型

`dev.anvilcraft.lib.v2.util.predicate` 为配方系统、世界方块扫描与条件匹配提供了完整的声明式谓词体系（`BlockStatePredicate`、`IItemStackPredicate`、`ItemPredicate`、`ItemIngredientPredicate`、`NbtPredicate`）以及带概率/权重的结果容器（`ChanceBlockState`、`WeightedChanceBlockStates`、`ChanceItemStack`）。

所有模型均完整实现了 `Codec`（JSON Datagen / 数据包加载）与 `StreamCodec`（服务端与客户端网络同步）。

## 1. NBT 谓词：`NbtPredicate`

```java
public record NbtPredicate(CompoundTag tag) implements Predicate<Tag>
```

| 成员签名 | 说明与语义 |
| --- | --- |
| `public static final Codec<NbtPredicate> CODEC` | 基于 `TagParser.LENIENT_CODEC`，支持宽松 SNBT 解析 |
| `public static final StreamCodec<ByteBuf, NbtPredicate> STREAM_CODEC` | 传输 `CompoundTag` |
| `boolean test(@Nullable Tag tag)` | 调用 `NbtUtils.compareNbt(this.tag, tag, true)` 做部分子集递归匹配（`true` 允许列表子集与顺序无关对比） |
| `boolean test(ItemStack stack)` | 提取 `stack.get(DataComponents.CUSTOM_DATA)`（即 `CustomData.EMPTY` 兜底后的 Tag）执行匹配 |
| `boolean test(Entity entity)` | 使用 `getEntityTagToCompare(entity)` 对比实体完整 NBT 与当前选中物品 |
| `static CompoundTag getEntityTagToCompare(Entity entity)` | 序列化实体 `saveWithoutId`，若为玩家则在其中额外写入 `"SelectedItem"` 标签 |

> [!TIP]
> 当传入空 `CompoundTag` 构造 `NbtPredicate` 时，对几乎所有非空目标 NBT 均返回 `true`（部分匹配规则）。

## 2. 方块状态谓词：`BlockStatePredicate`

`BlockStatePredicate` 支持按方块列表/标签 + 多组 `OR` 分组内的 `AND` 属性匹配 + 方块实体 `NBT` 条件测试世界中的方块，并专门为多线程扫描（如多方块结构检索）提供了零主线程依赖的 `OffThread` 重载与快速剪枝方法 `cannotMatch`。

### 主类与匹配器体系

| 类 / 接口 | 角色 | 核心 `Codec` / `StreamCodec` |
| --- | --- | --- |
| `BlockStatePredicate` | 顶层谓词，包含 `HolderSet<Block> blocks`、`List<List<PropertyMatcher>> properties`（外层 `OR`，内层 `AND`）与 `List<NbtPredicate> nbts`（`OR` 任意匹配） | `CODEC` / `STREAM_CODEC` |
| `BlockStatePredicate.PropertyMatcher` | Record `(String name, ValueMatcher valueMatcher)` | 静态映射 `PROPERTIES_CODEC`（Map 键为属性名）、`STREAM_CODEC` |
| `BlockStatePredicate.ValueMatcher` | 值匹配接口，分发 `ExactMatcher` / `RangedMatcher` | 拥有 `match(...)` 与 `applyToState(...)` |
| `BlockStatePredicate.ExactMatcher` | Record `(String value)`，精确字符串解析对比 | `CODEC` / `STREAM_CODEC` |
| `BlockStatePredicate.RangedMatcher` | Record `(Optional<String> minValue, Optional<String> maxValue)` | `CODEC` / `STREAM_CODEC` |

### `BlockStatePredicate` 成员详解

| 方法 / 字段签名 | 使用时机与注意事项 |
| --- | --- |
| `public static final ResourceLocation EMPTY` | `anvillib:empty` 兜底键 |
| `public static final Codec<List<PropertyMatcher>> PROPERTIES_CODEC` | 属性字典编解码器 |
| `public static final Codec<BlockStatePredicate> CODEC` | 主编解码器 |
| `public static final StreamCodec<RegistryFriendlyByteBuf, BlockStatePredicate> STREAM_CODEC` | 主网络流编解码器 |
| `boolean test(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | 主线程完整匹配：依次检查 `testWithoutEntity` 与 `testEntity` |
| `boolean testWithoutEntity(BlockState state)` | 仅校验方块类型与属性（`OR -> AND`），忽略方块实体 NBT |
| `boolean cannotMatch(BlockState state)` | 保守剪枝快检：当 `blocks` 非空且 `!state.is(blocks)` 时返回 `true`（一定不匹配）；返回 `false` 仅代表类型通过，仍需进一步校验属性与 NBT |
| `boolean testEntity(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | 主线程校验方块实体 NBT；若 `nbts` 非空但方块无实体或 `entity == null` 返回 `false` |
| `boolean testEntityOffThread(BlockState state, @Nullable CompoundTag entityNbt)` | **工作线程安全**：使用主线程预快照序列化的 `entityNbt` 校验实体 NBT |
| `boolean testOffThread(BlockState state, @Nullable CompoundTag entityNbt)` | **工作线程安全**：等价于 `testWithoutEntity(state) && testEntityOffThread(state, entityNbt)` |
| `boolean requiresBlockEntity()` | 返回 `!this.nbts.isEmpty()`，用于多线程快照前判断是否需要序列化的筛选条件 |
| `List<BlockState> getStatesCache()` | 返回缓存的渲染样本状态列表；首次访问触发 `constructStatesForRender()` |
| `List<BlockState> constructStatesForRender()` | **仅供渲染（如 JEI/REI 展示）使用**！构建匹配此谓词的代表性 `BlockState` 列表 |
| `ResourceLocation getKey()` | 返回 Tag ID 或首个方块注册名，失败返回 `EMPTY` |
| `static Builder builder()` | 创建流式构建器 |

> [!WARNING]
> **1.21.1 `RangedMatcher.applyToState` 行为提醒**：在 `BlockStatePredicate.RangedMatcher` 中，`match` 方法正确判定闭区间 `min <= val <= max`；但用于构造展示状态的 `applyToState` 过滤条件写成了反向比较（`compareTo(min) < 0` 与 `compareTo(max) > 0`），因此若属性包含范围条件，请勿依赖 `constructStatesForRender()` 生成闭区间内全部枚举状态。

### `BlockStatePredicate.Builder` 方法列表

| 方法签名 | 说明 |
| --- | --- |
| `Builder of(Supplier<? extends Block>... blocks)` | 设置允许匹配的方块提供者集合（`@SafeVarargs`） |
| `Builder of(Block... blocks)` | 设置允许匹配的方块数组 |
| `Builder of(Collection<Block> blocks)` | 设置允许匹配的方块集合 |
| `Builder of(TagKey<Block> tag)` | 设置允许匹配的方块标签 |
| `Builder with(BlockState state)` | 将 `state` 上的全部属性作为精确匹配条件加入当前 `AND` 组 |
| `Builder with(Property<?> property, String value)` | 添加字符串值精确属性条件 |
| `Builder with(Property<Integer> property, int value)` | 添加整数属性精确条件 |
| `Builder with(Property<Boolean> property, boolean value)` | 添加布尔属性精确条件 |
| `<T extends Comparable<T>> Builder with(Property<T> property, T value)` | 泛型属性精确条件（若实现 `StringRepresentable` 则取序列化名） |
| `<T extends Comparable<T>> Builder with(Property<T> property, @Nullable T minValue, @Nullable T maxValue)` | 添加属性范围条件（上/下界均可选） |
| `<T extends Comparable<T>> Builder withMin(Property<T> property, T minValue)` | 仅限下界属性条件 |
| `<T extends Comparable<T>> Builder withMax(Property<T> property, T maxValue)` | 仅限上界属性条件 |
| `Builder or()` | 提交当前积累的属性 `AND` 条件组（非空时），开启下一条 `OR` 分支 |
| `Builder nbt(CompoundTag tag)` | 添加一个方块实体 NBT 条件（多个 `nbt` 之间为 `OR` 关系） |
| `BlockStatePredicate build()` | 提交最后一个非空属性 `AND` 组并构建不可变 `BlockStatePredicate` |

`PropertyMatcher` 与值匹配器自身还公开以下成员：
- `PropertyMatcher`: `<S extends StateHolder<?, S>> boolean match(StateDefinition<?, S> properties, S propertyToMatch)`、`<S extends StateHolder<?, S>> List<S> applyToState(StateDefinition<?, S> properties, S state)`、`STREAM_CODEC`。
- `ExactMatcher`: `CODEC`、`STREAM_CODEC`、`match(...)`、`applyToState(...)`。
- `RangedMatcher`: `CODEC`、`STREAM_CODEC`、`match(...)`、`applyToState(...)`。

## 3. 物品栈谓词家族

| 类型 | 定位与区别 | 数量条件类型 |
| --- | --- | --- |
| `IItemStackPredicate` | 继承 `java.util.function.Predicate<ItemStack>` 的统一接口 | `testCount(int count)` |
| `ItemPredicate` | Record `(Optional<HolderSet<Item>> items, MinMaxBounds.Ints count, DataComponentPredicate components, Map<ItemSubPredicate.Type<?>, ItemSubPredicate> subPredicates)` | `MinMaxBounds.Ints` 区间（支持开/闭区间或无限制） |
| `ItemIngredientPredicate` | Record `(Optional<HolderSet<Item>> items, Optional<Integer> count, DataComponentPredicate components, Map<ItemSubPredicate.Type<?>, ItemSubPredicate> subPredicates)` | `Optional<Integer>` 精确最低数量要求 |

### `IItemStackPredicate` 契约方法

| 方法签名 | 说明 |
| --- | --- |
| `boolean testCount(int count)` | 单独检查物品数量是否符合要求 |
| `DataComponentPredicate components()` | 返回组件匹配规则 |
| `default boolean testIgnoreCount(ItemStack itemStack)` | 将输入复制并强制设为数量 `1` 后仅检查物品种类、组件与子谓词（注意：实现内部构造了 `copyWithCount(1)` 参与校验） |
| `default Predicate<ItemStack> testIgnoreCount()` | 返回方法引用形式的 `this::testIgnoreCount` |
| `boolean test(ItemStack stack)` / `equals` / `hashCode` | 继承并强制要求实现的接口方法 |

### `ItemPredicate` 与 `ItemPredicate.Builder`

| 成员签名 | 说明 |
| --- | --- |
| `static final Codec<ItemPredicate> CODEC` | JSON 序列化 Codec（含 `items`、`count`、`components` 及内联子谓词 Map） |
| `static final StreamCodec<RegistryFriendlyByteBuf, ItemPredicate> STREAM_CODEC` | 基于 `StreamCodecUtil.codec2Stream(ItemPredicate.CODEC)` |
| `boolean test(ItemStack itemStack)` | 校验 `items` -> `testCount(itemStack.getCount())` -> `components` -> `subPredicates` |
| `boolean testCount(int count)` | 调用 `this.count.matches(count)` |
| `static Builder item()` (`Builder`) | 新建构造器 |
| `Builder of(ItemLike... items)` / `Builder of(TagKey<Item> tag)` | 指定物品或物品标签 |
| `Builder withCount(MinMaxBounds.Ints count)` | 设置数量范围约束 |
| `<T extends ItemSubPredicate> Builder withSubPredicate(ItemSubPredicate.Type<T> type, T predicate)` | 追加原版 `ItemSubPredicate` |
| `Builder hasComponents(DataComponentPredicate components)` | 设置数据组件精确匹配约束 |
| `ItemPredicate build()` | 构建不可变 `ItemPredicate` |

### `ItemIngredientPredicate` 与 `ItemIngredientPredicate.Builder`

专用于配方的“材料槽位”场景，支持生成 JEI/配方书展示物品阵列的 `getItems()`：

| 成员签名 | 说明与边界条件 |
| --- | --- |
| `static final Codec<ItemIngredientPredicate> CODEC` | JSON 编解码器（`count` 默认最小 `0`、可选字段；`items`、`components`、`subPredicates`） |
| `static final StreamCodec<RegistryFriendlyByteBuf, ItemIngredientPredicate> STREAM_CODEC` | 网络流编解码器 |
| `static Builder of(ItemLike... items)` / `static Builder of(TagKey<Item> tag)` | 快捷入口工厂，内部先调 `Builder.item()` 再设目标 |
| `boolean test(ItemStack itemStack)` / `boolean testCount(int count)` | 若存在 `count` 则要求 `count >= this.count.get()`，否则仅要求 `count >= 0` |
| `ItemStack[] getItems()` | 结合组件与数量（缺失时默认 `1`）展开全部匹配样品并按 `hashCode()` 缓存。**兜底规则**：若目标标签/集合为空导致无任何样品，返回单元素数组 `{new ItemStack(Items.BARRIER)}` |
| `static Builder item()` (`Builder`) | 创建 `Builder` 实例 |
| `Builder of(ItemLike... items)` / `Builder of(TagKey<Item> tag)` (`Builder`) | 设置候选物品 |
| `<D> Builder of(ItemStack stack)` (`Builder`) | 根据传入 `ItemStack` 设置对应 `Item`、保留其 `count`，并拷贝其默认物品组件到 `DataComponentPredicate` 期望中（注意：1.21.1 源码循环遍历的是 `stack.getItem().components()` 而非运行期叠加的 `stack.getComponents()`） |
| `Builder withCount(int count)` (`Builder`) | 设置最低需要数量 |
| `<T extends ItemSubPredicate> Builder withSubPredicate(...)` / `hasComponents(...)` / `build()` | 追加子谓词、组件条件并构建实例 |

## 4. 概率方块状态与概率物品栈

### `ChanceBlockState`

```java
public record ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)
```

| 成员签名 | 说明与边界条件 |
| --- | --- |
| `ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)` | 主构造；当 `nbt == null` 或为空时规范化为 `new CompoundTag()` |
| `ChanceBlockState(BlockState state, NumberProvider chance)` | 使用空 NBT |
| `ChanceBlockState(BlockState state, float chance)` | 包装为 `ConstantValue.exactly(chance)` 且空 NBT |
| `static ChanceBlockState of(Supplier<? extends Block> block, CompoundTag nbt)` | 100% 概率 (`ConstantValue.exactly(1)`) |
| `static ChanceBlockState of(Supplier<? extends Block> block)` | 100% 概率且空 NBT |
| `public static final MapCodec<ChanceBlockState> CODEC` | JSON 映射编解码器（`state`、`nbt` 可选、`chance` 默认 `1.0`） |
| `public static final StreamCodec<RegistryFriendlyByteBuf, ChanceBlockState> STREAM_CODEC` | 网络流编解码器 |
| `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | 按 `chance` 在原版战利品上下文掷骰：若 `level.random.nextFloat() < chance` 则返回 `Map.entry(state, nbt)`，否则返回 `null` |

### `WeightedChanceBlockStates`

为配方或事件随机挑选单个带权重与概率的 `ChanceBlockState`：

```java
public record WeightedChanceBlockStates(List<Entry> states)
public record Entry(ChanceBlockState state, NumberProvider weight)
```

| 成员签名 | 说明与执行逻辑 |
| --- | --- |
| `static final MapCodec<WeightedChanceBlockStates> CODEC` / `STREAM_CODEC` | 主容器编解码器（`Entry` 同样公开 `Entry.CODEC` 与 `Entry.STREAM_CODEC`） |
| `static Builder builder()` | 返回 `WeightedChanceBlockStates.Builder` |
| `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | 先对全部条目计算权重前缀和并按总权重随机选中 1 个 `Entry`（空或总权重为 `0` 返回 `null`），然后调用该条目的 `state.getResult(level)` 再判定其自身概率 |
| `Builder.add(...)` | 针对 `(ChanceBlockState)`、`(BlockState, ...)`、`(Block, ...)` 与 `(Supplier<? extends Block>, ...)` 4 大源类型组合 `weight`（`NumberProvider`/`float`/省略默认 `1`）、`nbt` 与 `chance` 共提供 39 个重载方便直接构造 |
| `boolean Builder.isEmpty()` / `WeightedChanceBlockStates Builder.build()` | 检查是否无条目及构建不可变列表结果 |

### `ChanceItemStack`

```java
public record ChanceItemStack(ItemStack stack, NumberProvider count)
```

| 成员签名 | 说明与边界条件 |
| --- | --- |
| `ChanceItemStack(ItemStack stack, NumberProvider count)` | 主构造；注意内部将 `stack` 自动复制并固定为单件原型，数量完全交由 `count` 控制 |
| `static ChanceItemStack of(ItemLike item, NumberProvider amount)` / `of(ItemLike item, int count)` | 从物品创建 |
| `static ChanceItemStack of(ItemStack stack, NumberProvider amount)` / `of(ItemStack stack)` / `of(ItemStack stack, int count)` | 从物品栈保留组件并指定固定/随机数量规则 |
| `static ChanceItemStack of(ItemStack stack, int count, float chance)` / `of(ItemStack stack, float chance)` | 自动使用 `BinomialDistributionGenerator.binomial(count, chance)` 生成二项分布概率掉落（支持 `count` 次独立掷骰） |
| `static final Codec<ChanceItemStack> CODEC` / `STREAM_CODEC` | 序列化与网络传输 |
| `Item getItem()` / `Holder<Item> getItemHolder()` / `DataComponentPatch getComponentsPatch()` | 查询原型物品与组件补丁 |
| `int getMaxCount()` | 调用 `NumberProviderUtil.max(this.count)`，再以 `Math.clamp(..., 0, 99)` 返回上限提示值（不支持类型将得 `0`） |
| `ItemStack getResult(ServerLevel level)` | 在完整 `LootContext` 下求值实际产出数量并 clamp 到 **`[1, 99]`**：若原 `count` 求值得到 `0`，**返回 `ItemStack.EMPTY`；若 `>= 1` 则最小为 `1`、最大封顶 `99`** |

## 完整示例：组合方块谓词（多线程安全检查）与加权产出

```java
package com.example.mymod.world;

import dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate;
import dev.anvilcraft.lib.v2.util.predicate.ChanceItemStack;
import dev.anvilcraft.lib.v2.util.predicate.ItemIngredientPredicate;
import dev.anvilcraft.lib.v2.util.predicate.WeightedChanceBlockStates;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.providers.number.UniformGenerator;

import java.util.Map;

public final class PredicateAndChanceDemo {
    public static BlockStatePredicate createLitFurnacePredicate() {
        CompoundTag mustHaveBurnTime = new CompoundTag();
        mustHaveBurnTime.putShort("BurnTime", (short) 200);

        return BlockStatePredicate.builder()
            .of(Blocks.FURNACE, Blocks.BLAST_FURNACE)
            .with(FurnaceBlock.LIT, true)
            .nbt(mustHaveBurnTime)
            .build();
    }

    public static WeightedChanceBlockStates createOreOutcome() {
        return WeightedChanceBlockStates.builder()
            .add(3.0F, Blocks.IRON_ORE, 0.8F)
            .add(1.0F, Blocks.DIAMOND_ORE.defaultBlockState(), 0.5F)
            .add(6.0F, Blocks.COBBLESTONE)
            .build();
    }

    public static boolean checkMainThreadAndDrop(ServerLevel level, BlockPos pos, ItemStack heldItem) {
        BlockState state = level.getBlockState(pos);
        BlockStatePredicate predicate = createLitFurnacePredicate();
        if (predicate.cannotMatch(state)) {
            return false;
        }

        BlockEntity be = predicate.requiresBlockEntity() ? level.getBlockEntity(pos) : null;
        if (!predicate.test(level, state, be)) {
            return false;
        }

        ItemIngredientPredicate catalyst = ItemIngredientPredicate.of(ItemTags.COALS)
            .withCount(2)
            .build();
        if (!catalyst.test(heldItem)) {
            return false;
        }

        Map.Entry<BlockState, CompoundTag> nextBlock = createOreOutcome().getResult(level);
        if (nextBlock != null) {
            level.setBlockAndUpdate(pos, nextBlock.getKey());
        }

        ChanceItemStack bonusDrop = ChanceItemStack.of(
            new ItemStack(Items.GOLD_NUGGET),
            UniformGenerator.between(1F, 4F)
        );
        ItemStack result = bonusDrop.getResult(level);
        if (!result.isEmpty()) {
            net.minecraft.world.level.block.Block.popResource(level, pos.above(), result);
        }
        return true;
    }
}
```
