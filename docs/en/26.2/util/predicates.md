# Block, Item & NBT Predicates and Probability Models (`dev.anvilcraft.lib.v2.util.predicate`)

<BranchContextCard branch="26.2" />

When defining in-world recipes, multiblock check rules, or custom loot/machine outputs, you often need to:
1. Match block states with specific properties (or property ranges) and block entity NBT (`BlockStatePredicate`);
2. Match item stacks by item sets/tags, count conditions, and data components (`DataComponentMatchers`) (`IItemStackPredicate` / `ItemIngredientPredicate` / `ItemPredicate`);
3. Represent probabilistic/binomial-count item outputs (`ChanceItemStack`) or weighted/probabilistic block outputs (`ChanceBlockState` / `WeightedChanceBlockStates`).

`dev.anvilcraft.lib.v2.util.predicate` provides a complete suite of predicates and probability models with built-in `Codec` and `StreamCodec` support.

---

## 1. Full Code Example: Building BlockState Predicates, Item Ingredient Predicates & Weighted Block Outputs

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
    // 1. Build BlockStatePredicate: match water cauldron with LEVEL in [2, 3] (supports .or() for multiple branches)
    public static BlockStatePredicate cauldronAtLeastTwoThirds() {
        return BlockStatePredicate.builder()
            .of(Blocks.WATER_CAULDRON)
            .with(LayeredCauldronBlock.LEVEL, 2, 3)
            .build();
    }

    // 2. Build ItemIngredientPredicate: match any 4 log-tag items
    public static ItemIngredientPredicate fourLogsIngredient(HolderGetter<Item> itemLookup) {
        return ItemIngredientPredicate.of(itemLookup, ItemTags.LOGS)
            .withCount(4)
            .build();
    }

    // 3. Build binomial-probability item output (3 trials, 50% chance each for gold nuggets)
    public static ChanceItemStack bonusGoldNuggets() {
        return ChanceItemStack.of(new ItemStackTemplate(Items.GOLD_NUGGET), 3, 0.5f);
    }

    // 4. Build weighted random block output pool: 80% weight stone, 20% weight iron ore
    public static WeightedChanceBlockStates stoneOrIronOre() {
        return WeightedChanceBlockStates.builder()
            .add(0.8f, Blocks.STONE)
            .add(0.2f, Blocks.IRON_ORE)
            .build();
    }
}
```

---

## 2. Block & NBT Predicate APIs (`BlockStatePredicate` / `NbtPredicate`)

### 1. `BlockStatePredicate` & `BlockStatePredicate.Builder`

Supports checking: block set/tag (`blocks`), DNF property condition list (`List<List<PropertyMatcher>>`, outer `OR`, inner `AND`), and block entity NBT predicate list (`List<NbtPredicate>`, any match suffices).

| Category | Method Signatures | Description |
| :--- | :--- | :--- |
| **Serialization Constants** | `CODEC`, `STREAM_CODEC`, `PROPERTIES_CODEC` | JSON and network stream codecs. |
| **Main-Thread Tests** | • `boolean test(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)`<br>• `boolean testWithoutEntity(BlockState state)`<br>• `boolean testEntity(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)`<br>• `boolean cannotMatch(BlockState state)` (conservative fast-prune: checks `blocks` set only) | Tests world block states and block entities on the main thread. |
| **Worker-Thread-Safe Tests** | • `boolean testOffThread(BlockState state, @Nullable CompoundTag entityNbt)`<br>• `boolean testEntityOffThread(BlockState state, @Nullable CompoundTag entityNbt)`<br>• `boolean requiresBlockEntity()` | Safely runs matching on background threads using pre-snapshotted `CompoundTag`s (widely used by `module.multiblock`). |
| **Render Enumeration** | `List<BlockState> constructStatesForRender()` / `getStatesCache()` | Enumerates all matching `BlockState`s for JEI or structure projection cycling. |
| **Builder Methods** | • `BlockStatePredicate.builder()`<br>• `of(Block...)` / `of(Supplier<? extends Block>...)` / `of(Collection<Block>)` / `of(HolderGetter<Block>, TagKey<Block>)`<br>• `with(BlockState state)`: copies all property values of `state` as exact matchers<br>• `with(Property<T>, T / String / int / boolean)`: adds exact property matcher (`ExactMatcher`)<br>• `with(Property<T>, @Nullable T min, @Nullable T max)` / `withMin(Property<T>, T min)` / `withMax(Property<T>, T max)`: adds closed-interval range matcher (`RangedMatcher`)<br>• `or()`: ends current `AND` property group and starts next `OR` branch<br>• `nbt(CompoundTag tag)`: adds block entity NBT match condition<br>• `build()` | Fluently builds `BlockStatePredicate`. |

### 2. `NbtPredicate`

```java
public record NbtPredicate(CompoundTag tag) implements Predicate<Tag>
```

- `boolean test(@Nullable Tag tag)`: calls `NbtUtils.compareNbt(this.tag, tag, true)` for subset matching;
- `boolean test(ItemStackTemplate stack)`: matches `DataComponents.CUSTOM_DATA` on the stack;
- `boolean test(Entity entity)` / `static CompoundTag getEntityTagToCompare(Entity entity)`: serializes entity NBT (including mainhand `SelectedItem` for `Player`) and matches.

---

## 3. ItemStack Predicate APIs (`IItemStackPredicate` / `ItemIngredientPredicate` / `ItemPredicate`)

| Interface / Record | Count Check Difference & Specific Methods | Builder Methods |
| :--- | :--- | :--- |
| **`IItemStackPredicate`** | Common super-interface (extends `Predicate<ItemStack>`): defines `items()`, `components()`, `boolean testCount(int count)`, `boolean testIgnoreCount(ItemStack)`, and `Predicate<ItemStack> testIgnoreCount()`. | — |
| **`ItemIngredientPredicate`** | Used for **recipe ingredient consumption**: `count` is a single `int`, and `testCount(stackCount)` checks **`stackCount >= this.count`** (at least as many items as required).<br>• `withCount(int count)`: clones with modified required count;<br>• `ItemStackTemplate[] getItems()`: returns cached candidate templates (for JEI display). | • `ItemIngredientPredicate.of(ItemLike...)` / `of(HolderGetter<Item>, TagKey<Item>)` / `Builder.item()`<br>• `of(ItemStackTemplate stack)` (auto-extracts non-default components)<br>• `withCount(int)` / `hasComponents(DataComponentMatchers)` / `build()` |
| **`ItemPredicate`** | Used for **general item condition checks**: `count` is a `MinMaxBounds.Ints` range, and `testCount(stackCount)` checks `this.count.matches(stackCount)`. | • `ItemPredicate.Builder.item()`<br>• `of(ItemLike...)` / `of(HolderGetter<Item>, TagKey<Item>)`<br>• `withCount(MinMaxBounds.Ints)` / `hasComponents(DataComponentMatchers)` / `build()` |

---

## 4. Probabilistic Output Models (`ChanceItemStack` / `ChanceBlockState` / `WeightedChanceBlockStates`)

| Record | Key Static Factories / Method Signatures | Description |
| :--- | :--- | :--- |
| **`ChanceItemStack`** | • `public record ChanceItemStack(ItemStackTemplate stack, NumberProvider count)`<br>• `of(ItemLike item, int count)` / `of(ItemLike item, NumberProvider amount)`<br>• `of(ItemStackTemplate stack)` / `of(stack, int count)` / `of(stack, NumberProvider amount)`<br>• `of(ItemStackTemplate stack, float chance)` / `of(stack, int count, float chance)` (uses binomial `BinomialDistributionGenerator.binomial(count, chance)`)<br>• `ItemStackTemplate getResult(ServerLevel level)`: samples count (clamped `1..99`) per `LootContext`;<br>• `int getMaxCount()`: returns `Math.round(NumberProviderUtil.expected(this.count))`. | Item output model with a count distribution provider (constant, uniform, or binomial). |
| **`ChanceBlockState`** | • `public record ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)`<br>• `new ChanceBlockState(BlockState state, float chance)`<br>• `ChanceBlockState.of(Supplier<? extends Block> block, [CompoundTag nbt])`<br>• `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | Block output with trigger probability `chance` and optional block entity `nbt`. Returns `Map.entry(state, nbt)` if `level.getRandom().nextFloat() <= chance`, else `null`. |
| **`WeightedChanceBlockStates`** | • `public record WeightedChanceBlockStates(List<Entry> states)` (`Entry(ChanceBlockState state, NumberProvider weight)`)<br>• `WeightedChanceBlockStates.builder()`: 30+ `add(...)` overloads (taking `Block`, `BlockState`, `Supplier<? extends Block>`, `ChanceBlockState` with optional `weight`, `nbt`, `chance`)<br>• `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | Weighted random block state pool: selects an `Entry` by positive `weight` roulette wheel, then invokes its `ChanceBlockState#getResult(level)`. |
