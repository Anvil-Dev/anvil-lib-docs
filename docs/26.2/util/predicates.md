# 方块、物品与 NBT 谓词及概率模型 (`dev.anvilcraft.lib.v2.util.predicate`)

<BranchContextCard branch="26.2" />

在定义世界内配方、多方块检测规则或自定义战利品/机器产出时，经常需要：
1. 匹配具有特定属性（或属性范围）及特定方块实体 NBT 的方块状态（`BlockStatePredicate`）；
2. 匹配满足特定物品集合/标签、数量条件与数据组件（`DataComponentMatchers`）的物品栈（`IItemStackPredicate` / `ItemIngredientPredicate` / `ItemPredicate`）；
3. 描述带概率/二项分布数量的物品产出（`ChanceItemStack`）或带权重与独立触发概率的方块产出（`ChanceBlockState` / `WeightedChanceBlockStates`）。

`dev.anvilcraft.lib.v2.util.predicate` 提供了全套内置 `Codec` 与 `StreamCodec` 的谓词与概率结果模型。

---

## 一、 完整代码示例：构建方块状态谓词、物品原料谓词与加权概率方块结果

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate;
import dev.anvilcraft.lib.v2.util.predicate.ChanceItemStack;
import dev.anvilcraft.lib.v2.util.predicate.ItemIngredientPredicate;
import dev.anvilcraft.lib.v2.util.predicate.WeightedChanceBlockStates;
import net.minecraft.core.HolderGetter;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;

public final class PredicateModelsExample {
    // 1. 构建方块状态谓词：匹配装水炼药锅，且水位 LEVEL 在 [2, 3] 范围内（支持 .or() 组合多组属性条件）
    public static BlockStatePredicate cauldronAtLeastTwoThirds() {
        return BlockStatePredicate.builder()
            .of(Blocks.WATER_CAULDRON)
            .with(LayeredCauldronBlock.LEVEL, 2, 3)
            .build();
    }

    // 2. 构建物品原料谓词：匹配任意 4 个原木标签物品
    public static ItemIngredientPredicate fourLogsIngredient(HolderGetter<Item> itemLookup) {
        return ItemIngredientPredicate.of(itemLookup, ItemTags.LOGS)
            .withCount(4)
            .build();
    }

    // 3. 构建带二项分布概率的物品产出（尝试 3 次，每次 50% 概率产出金粒）
    public static ChanceItemStack bonusGoldNuggets() {
        return ChanceItemStack.of(new ItemStackTemplate(Items.GOLD_NUGGET), 3, 0.5f);
    }

    // 4. 构建加权随机方块产出池：80% 权重变为石头，20% 权重变为铁矿石
    public static WeightedChanceBlockStates stoneOrIronOre() {
        return WeightedChanceBlockStates.builder()
            .add(0.8f, Blocks.STONE)
            .add(0.2f, Blocks.IRON_ORE)
            .build();
    }
}
```

---

## 二、 方块与 NBT 谓词 API (`BlockStatePredicate` / `NbtPredicate`)

### 1. `BlockStatePredicate` 与 `BlockStatePredicate.Builder`

支持同时检查：方块集合/标签（`blocks`）、DNF 析取范式属性条件列表（`List<List<PropertyMatcher>>`，外层 `OR`，内层 `AND`）以及方块实体 NBT 谓词列表（`List<NbtPredicate>`，任一满足即可）。

| 方法分类 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **序列化常量** | `CODEC`、`STREAM_CODEC`、`PROPERTIES_CODEC` | JSON 与网络流编解码器。 |
| **主线程测试** | • `boolean test(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)`<br>• `boolean testWithoutEntity(BlockState state)`<br>• `boolean testEntity(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)`<br>• `boolean cannotMatch(BlockState state)`（保守快速剪枝：仅检查 `blocks` 集合） | 在主线程检测世界中的方块状态与方块实体是否匹配。 |
| **工作线程安全测试** | • `boolean testOffThread(BlockState state, @Nullable CompoundTag entityNbt)`<br>• `boolean testEntityOffThread(BlockState state, @Nullable CompoundTag entityNbt)`<br>• `boolean requiresBlockEntity()` | 使用预先在主线程快照好的 `CompoundTag` 在后台线程安全执行匹配（被 `module.multiblock` 广泛使用）。 |
| **渲染枚举** | `List<BlockState> constructStatesForRender()` / `getStatesCache()` | 枚举所有匹配的 `BlockState` 供 JEI 或结构投影循环展示。 |
| **Builder 方法** | • `BlockStatePredicate.builder()`<br>• `of(Block...)` / `of(Supplier<? extends Block>...)` / `of(Collection<Block>)` / `of(HolderGetter<Block>, TagKey<Block>)`<br>• `with(BlockState state)`：复制该状态的所有属性值作为精确匹配条件<br>• `with(Property<T>, T / String / int / boolean)`：添加属性精确匹配（`ExactMatcher`）<br>• `with(Property<T>, @Nullable T min, @Nullable T max)` / `withMin(Property<T>, T min)` / `withMax(Property<T>, T max)`：添加属性闭区间范围匹配（`RangedMatcher`）<br>• `or()`：结束当前一组 `AND` 属性条件，开启下一组 `OR` 分支<br>• `nbt(CompoundTag tag)`：添加方块实体 NBT 匹配条件<br>• `build()` | 链式构建 `BlockStatePredicate`。 |

### 2. `NbtPredicate`

```java
public record NbtPredicate(CompoundTag tag) implements Predicate<Tag>
```

- `boolean test(@Nullable Tag tag)`：调用 `NbtUtils.compareNbt(this.tag, tag, true)` 进行子集包含匹配；
- `boolean test(ItemStackTemplate stack)`：匹配物品栈上的 `DataComponents.CUSTOM_DATA` 组件；
- `boolean test(Entity entity)` / `static CompoundTag getEntityTagToCompare(Entity entity)`：序列化实体 NBT（若为 `Player` 则额外附带主手 `SelectedItem`）并进行匹配。

---

## 三、 物品栈谓词 API (`IItemStackPredicate` / `ItemIngredientPredicate` / `ItemPredicate`)

| 接口 / 记录名 | 数量判断区别与特有方法 | 构建器 (`Builder`) 方法 |
| :--- | :--- | :--- |
| **`IItemStackPredicate`** | 通用父接口（继承 `Predicate<ItemStack>`）：定义 `items()`、`components()`、`boolean testCount(int count)`、`boolean testIgnoreCount(ItemStack)` 与 `Predicate<ItemStack> testIgnoreCount()`。 | — |
| **`ItemIngredientPredicate`** | 用于**配方消耗原料**：`count` 为单个 `int`，`testCount(stackCount)` 判断 **`stackCount >= this.count`**（物品数量不少于配方所需数量）。<br>• `withCount(int count)`：克隆并修改所需数量；<br>• `ItemStackTemplate[] getItems()`：获取带缓存的候选物品模板数组（供 JEI 展示）。 | • `ItemIngredientPredicate.of(ItemLike...)` / `of(HolderGetter<Item>, TagKey<Item>)` / `Builder.item()`<br>• `of(ItemStackTemplate stack)`（自动提取非默认组件）<br>• `withCount(int)` / `hasComponents(DataComponentMatchers)` / `build()` |
| **`ItemPredicate`** | 用于**通用物品条件检测**：`count` 为 `MinMaxBounds.Ints` 区间，`testCount(stackCount)` 判断 `this.count.matches(stackCount)`。 | • `ItemPredicate.Builder.item()`<br>• `of(ItemLike...)` / `of(HolderGetter<Item>, TagKey<Item>)`<br>• `withCount(MinMaxBounds.Ints)` / `hasComponents(DataComponentMatchers)` / `build()` |

---

## 四、 概率产出模型 API (`ChanceItemStack` / `ChanceBlockState` / `WeightedChanceBlockStates`)

| 记录名 | 关键静态工厂 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`ChanceItemStack`** | • `public record ChanceItemStack(ItemStackTemplate stack, NumberProvider count)`<br>• `of(ItemLike item, int count)` / `of(ItemLike item, NumberProvider amount)`<br>• `of(ItemStackTemplate stack)` / `of(stack, int count)` / `of(stack, NumberProvider amount)`<br>• `of(ItemStackTemplate stack, float chance)` / `of(stack, int count, float chance)`（使用二项分布 `BinomialDistributionGenerator.binomial(count, chance)`）<br>• `ItemStackTemplate getResult(ServerLevel level)`：按 `LootContext` 随机采样数量（限制在 `1..99`）生成结果模板；<br>• `int getMaxCount()`：返回 `Math.round(NumberProviderUtil.expected(this.count))`。 | 带数量分布提供器（固定值、均匀分布或二项分布）的物品产出模型。 |
| **`ChanceBlockState`** | • `public record ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)`<br>• `new ChanceBlockState(BlockState state, float chance)`<br>• `ChanceBlockState.of(Supplier<? extends Block> block, [CompoundTag nbt])`<br>• `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | 带触发概率 `chance` 与可选方块实体 `nbt` 的方块结果。若 `level.getRandom().nextFloat() <= chance` 则返回 `Map.entry(state, nbt)`，否则返回 `null`。 |
| **`WeightedChanceBlockStates`** | • `public record WeightedChanceBlockStates(List<Entry> states)`（其中 `Entry(ChanceBlockState state, NumberProvider weight)`）<br>• `WeightedChanceBlockStates.builder()`：提供 30+ 个 `add(...)` 重载（支持直接传 `Block`、`BlockState`、`Supplier<? extends Block>`、`ChanceBlockState` 搭配可选 `weight`、`nbt`、`chance`）<br>• `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | 加权随机方块状态池：先按各条目的正数 `weight` 权重轮盘赌抽出一个 `Entry`，再调用该条目内部 `ChanceBlockState#getResult(level)`。 |
