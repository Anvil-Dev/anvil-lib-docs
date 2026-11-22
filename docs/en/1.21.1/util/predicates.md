# Block, Item & NBT Predicates and Probability Models

`dev.anvilcraft.lib.v2.util.predicate` provides a complete declarative predicate system (`BlockStatePredicate`, `IItemStackPredicate`, `ItemPredicate`, `ItemIngredientPredicate`, `NbtPredicate`) and probabilistic/weighted outcome containers (`ChanceBlockState`, `WeightedChanceBlockStates`, `ChanceItemStack`) for recipes, world block scanning, and condition matching.

All models fully implement `Codec` (JSON Datagen / datapack loading) and `StreamCodec` (server-client network sync).

## 1. NBT Predicate: `NbtPredicate`

```java
public record NbtPredicate(CompoundTag tag) implements Predicate<Tag>
```

| Member Signature | Description & Semantics |
| --- | --- |
| `public static final Codec<NbtPredicate> CODEC` | Based on `TagParser.LENIENT_CODEC`, supporting lenient SNBT parsing |
| `public static final StreamCodec<ByteBuf, NbtPredicate> STREAM_CODEC` | Transports `CompoundTag` |
| `boolean test(@Nullable Tag tag)` | Calls `NbtUtils.compareNbt(this.tag, tag, true)` for partial subset recursive matching (`true` allows list subsets and order-insensitive comparison) |
| `boolean test(ItemStack stack)` | Extracts `stack.get(DataComponents.CUSTOM_DATA)` (fallback `CustomData.EMPTY` Tag) and matches |
| `boolean test(Entity entity)` | Uses `getEntityTagToCompare(entity)` to compare full entity NBT and held item |
| `static CompoundTag getEntityTagToCompare(Entity entity)` | Serializes entity `saveWithoutId`, adding `"SelectedItem"` if the entity is a player |

> [!TIP]
> When constructing `NbtPredicate` with an empty `CompoundTag`, it returns `true` for almost any non-empty target NBT (subset matching rule).

## 2. BlockState Predicate: `BlockStatePredicate`

`BlockStatePredicate` tests world blocks by block list/tag + `AND` property groups inside `OR` branches + `BlockEntity` NBT conditions, providing zero-main-thread `OffThread` overloads and fast pruning `cannotMatch` for multi-threaded scanning (such as multiblock lookups).

### Main Class & Matcher Hierarchy

| Class / Interface | Role | Core `Codec` / `StreamCodec` |
| --- | --- | --- |
| `BlockStatePredicate` | Top-level predicate containing `HolderSet<Block> blocks`, `List<List<PropertyMatcher>> properties` (outer `OR`, inner `AND`), and `List<NbtPredicate> nbts` (any `OR` match) | `CODEC` / `STREAM_CODEC` |
| `BlockStatePredicate.PropertyMatcher` | Record `(String name, ValueMatcher valueMatcher)` | Static map `PROPERTIES_CODEC` (keyed by property name), `STREAM_CODEC` |
| `BlockStatePredicate.ValueMatcher` | Value matcher interface dispatching `ExactMatcher` / `RangedMatcher` | Provides `match(...)` and `applyToState(...)` |
| `BlockStatePredicate.ExactMatcher` | Record `(String value)` for exact string-parsed comparison | `CODEC` / `STREAM_CODEC` |
| `BlockStatePredicate.RangedMatcher` | Record `(Optional<String> minValue, Optional<String> maxValue)` | `CODEC` / `STREAM_CODEC` |

### `BlockStatePredicate` Members Deep Dive

| Method / Field Signature | Usage & Notes |
| --- | --- |
| `public static final ResourceLocation EMPTY` | `anvillib:empty` fallback key |
| `public static final Codec<List<PropertyMatcher>> PROPERTIES_CODEC` | Property dictionary codec |
| `public static final Codec<BlockStatePredicate> CODEC` | Primary Codec |
| `public static final StreamCodec<RegistryFriendlyByteBuf, BlockStatePredicate> STREAM_CODEC` | Primary network stream Codec |
| `boolean test(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | Main-thread full match: checks `testWithoutEntity` then `testEntity` |
| `boolean testWithoutEntity(BlockState state)` | Checks block type and properties (`OR -> AND`) only, ignoring block entity NBT |
| `boolean cannotMatch(BlockState state)` | Conservative fast-prune check: returns `true` (definitely no match) if `blocks` is non-empty and `!state.is(blocks)`; `false` only means type passed |
| `boolean testEntity(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | Main-thread block entity NBT check; returns `false` if `nbts` is non-empty and block has no entity or `entity == null` |
| `boolean testEntityOffThread(BlockState state, @Nullable CompoundTag entityNbt)` | **Worker-thread safe**: checks entity NBT using pre-snapshotted `entityNbt` |
| `boolean testOffThread(BlockState state, @Nullable CompoundTag entityNbt)` | **Worker-thread safe**: equivalent to `testWithoutEntity(state) && testEntityOffThread(state, entityNbt)` |
| `boolean requiresBlockEntity()` | Returns `!this.nbts.isEmpty()` to decide if NBT snapshotting is needed before off-thread checks |
| `List<BlockState> getStatesCache()` | Returns cached sample render states; initializes via `constructStatesForRender()` on first access |
| `List<BlockState> constructStatesForRender()` | **For rendering only (e.g., JEI/REI display)**! Builds representative `BlockState`s matching this predicate |
| `ResourceLocation getKey()` | Returns Tag ID or first block registry name, or `EMPTY` on failure |
| `static Builder builder()` | Creates a fluent builder |

> [!WARNING]
> **1.21.1 `RangedMatcher.applyToState` Behavior Note**: In `BlockStatePredicate.RangedMatcher`, `match` correctly checks the closed interval `min <= val <= max`, but `applyToState` (used for display states) has inverted comparisons (`compareTo(min) < 0` and `compareTo(max) > 0`), so do not rely on `constructStatesForRender()` to enumerate all states in a ranged interval.

### `BlockStatePredicate.Builder` Method List

| Method Signature | Description |
| --- | --- |
| `Builder of(Supplier<? extends Block>... blocks)` | Sets allowed block supplier set (`@SafeVarargs`) |
| `Builder of(Block... blocks)` | Sets allowed block array |
| `Builder of(Collection<Block> blocks)` | Sets allowed block collection |
| `Builder of(TagKey<Block> tag)` | Sets allowed block tag |
| `Builder with(BlockState state)` | Adds all properties on `state` as exact match conditions to the current `AND` group |
| `Builder with(Property<?> property, String value)` | Adds exact string property condition |
| `Builder with(Property<Integer> property, int value)` | Adds exact integer property condition |
| `Builder with(Property<Boolean> property, boolean value)` | Adds exact boolean property condition |
| `<T extends Comparable<T>> Builder with(Property<T> property, T value)` | Generic exact property condition (uses serialized name if `StringRepresentable`) |
| `<T extends Comparable<T>> Builder with(Property<T> property, @Nullable T minValue, @Nullable T maxValue)` | Adds ranged property condition (both bounds optional) |
| `<T extends Comparable<T>> Builder withMin(Property<T> property, T minValue)` | Lower-bound-only property condition |
| `<T extends Comparable<T>> Builder withMax(Property<T> property, T maxValue)` | Upper-bound-only property condition |
| `Builder or()` | Commits current `AND` property group (if non-empty) and starts next `OR` branch |
| `Builder nbt(CompoundTag tag)` | Adds a block entity NBT condition (multiple `nbt`s are `OR`ed) |
| `BlockStatePredicate build()` | Commits final non-empty `AND` group and builds immutable `BlockStatePredicate` |

`PropertyMatcher` and value matchers also expose:
- `PropertyMatcher`: `<S extends StateHolder<?, S>> boolean match(StateDefinition<?, S> properties, S propertyToMatch)`, `<S extends StateHolder<?, S>> List<S> applyToState(StateDefinition<?, S> properties, S state)`, `STREAM_CODEC`.
- `ExactMatcher`: `CODEC`, `STREAM_CODEC`, `match(...)`, `applyToState(...)`.
- `RangedMatcher`: `CODEC`, `STREAM_CODEC`, `match(...)`, `applyToState(...)`.

## 3. ItemStack Predicate Family

| Type | Role & Differences | Count Condition Type |
| --- | --- | --- |
| `IItemStackPredicate` | Unified interface extending `java.util.function.Predicate<ItemStack>` | `testCount(int count)` |
| `ItemPredicate` | Record `(Optional<HolderSet<Item>> items, MinMaxBounds.Ints count, DataComponentPredicate components, Map<ItemSubPredicate.Type<?>, ItemSubPredicate> subPredicates)` | `MinMaxBounds.Ints` range (open/closed/unbounded) |
| `ItemIngredientPredicate` | Record `(Optional<HolderSet<Item>> items, Optional<Integer> count, DataComponentPredicate components, Map<ItemSubPredicate.Type<?>, ItemSubPredicate> subPredicates)` | `Optional<Integer>` exact minimum count |

### `IItemStackPredicate` Contract Methods

| Method Signature | Description |
| --- | --- |
| `boolean testCount(int count)` | Checks item count only |
| `DataComponentPredicate components()` | Returns component matching rules |
| `default boolean testIgnoreCount(ItemStack itemStack)` | Copies input with count `1` and checks only item type, components, and sub-predicates |
| `default Predicate<ItemStack> testIgnoreCount()` | Returns `this::testIgnoreCount` as a `Predicate` |
| `boolean test(ItemStack stack)` / `equals` / `hashCode` | Inherited and required interface methods |

### `ItemPredicate` & `ItemPredicate.Builder`

| Member Signature | Description |
| --- | --- |
| `static final Codec<ItemPredicate> CODEC` | JSON Codec (`items`, `count`, `components`, and inline `subPredicates` map) |
| `static final StreamCodec<RegistryFriendlyByteBuf, ItemPredicate> STREAM_CODEC` | Based on `StreamCodecUtil.codec2Stream(ItemPredicate.CODEC)` |
| `boolean test(ItemStack itemStack)` | Checks `items` -> `testCount(itemStack.getCount())` -> `components` -> `subPredicates` |
| `boolean testCount(int count)` | Calls `this.count.matches(count)` |
| `static Builder item()` (`Builder`) | Creates a new builder |
| `Builder of(ItemLike... items)` / `Builder of(TagKey<Item> tag)` | Sets items or item tag |
| `Builder withCount(MinMaxBounds.Ints count)` | Sets count range constraint |
| `<T extends ItemSubPredicate> Builder withSubPredicate(ItemSubPredicate.Type<T> type, T predicate)` | Appends a vanilla `ItemSubPredicate` |
| `Builder hasComponents(DataComponentPredicate components)` | Sets exact data component matching constraint |
| `ItemPredicate build()` | Builds immutable `ItemPredicate` |

### `ItemIngredientPredicate` & `ItemIngredientPredicate.Builder`

Designed for recipe "ingredient slots", supporting `getItems()` for JEI/recipe-book display arrays:

| Member Signature | Description & Boundary Conditions |
| --- | --- |
| `static final Codec<ItemIngredientPredicate> CODEC` | JSON Codec (`count` min `0`, optional; `items`, `components`, `subPredicates`) |
| `static final StreamCodec<RegistryFriendlyByteBuf, ItemIngredientPredicate> STREAM_CODEC` | Network stream Codec |
| `static Builder of(ItemLike... items)` / `static Builder of(TagKey<Item> tag)` | Convenience factories calling `Builder.item()` then setting targets |
| `boolean test(ItemStack itemStack)` / `boolean testCount(int count)` | Requires `count >= this.count.get()` if present, else `count >= 0` |
| `ItemStack[] getItems()` | Expands all matching samples with components and count (default `1` if absent), cached by `hashCode()`. **Fallback**: returns `{new ItemStack(Items.BARRIER)}` if tag/set is empty |
| `static Builder item()` (`Builder`) | Creates a `Builder` instance |
| `Builder of(ItemLike... items)` / `Builder of(TagKey<Item> tag)` (`Builder`) | Sets candidate items |
| `<D> Builder of(ItemStack stack)` (`Builder`) | Sets `Item` and `count` from `stack`, and copies default item components to `DataComponentPredicate` (note: 1.21.1 source loops `stack.getItem().components()`, not runtime `stack.getComponents()`) |
| `Builder withCount(int count)` (`Builder`) | Sets minimum required count |
| `<T extends ItemSubPredicate> Builder withSubPredicate(...)` / `hasComponents(...)` / `build()` | Appends sub-predicates/components and builds instance |

## 4. Probabilistic BlockStates & ItemStacks

### `ChanceBlockState`

```java
public record ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)
```

| Member Signature | Description & Boundary Conditions |
| --- | --- |
| `ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)` | Primary constructor; normalizes `null` or empty `nbt` to `new CompoundTag()` |
| `ChanceBlockState(BlockState state, NumberProvider chance)` | Uses empty NBT |
| `ChanceBlockState(BlockState state, float chance)` | Wraps as `ConstantValue.exactly(chance)` with empty NBT |
| `static ChanceBlockState of(Supplier<? extends Block> block, CompoundTag nbt)` | 100% chance (`ConstantValue.exactly(1)`) |
| `static ChanceBlockState of(Supplier<? extends Block> block)` | 100% chance with empty NBT |
| `public static final MapCodec<ChanceBlockState> CODEC` | JSON map codec (`state`, optional `nbt`, `chance` default `1.0`) |
| `public static final StreamCodec<RegistryFriendlyByteBuf, ChanceBlockState> STREAM_CODEC` | Network stream codec |
| `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | Rolls `chance` in vanilla loot context: returns `Map.entry(state, nbt)` if `level.random.nextFloat() < chance`, else `null` |

### `WeightedChanceBlockStates`

Randomly picks one weighted and probabilistic `ChanceBlockState` for recipes or events:

```java
public record WeightedChanceBlockStates(List<Entry> states)
public record Entry(ChanceBlockState state, NumberProvider weight)
```

| Member Signature | Description & Execution Logic |
| --- | --- |
| `static final MapCodec<WeightedChanceBlockStates> CODEC` / `STREAM_CODEC` | Container codecs (`Entry` also exposes `Entry.CODEC` and `Entry.STREAM_CODEC`) |
| `static Builder builder()` | Returns `WeightedChanceBlockStates.Builder` |
| `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` | Computes prefix sums of weights to pick 1 `Entry` (`null` if empty or total weight `0`), then rolls its `state.getResult(level)` |
| `Builder.add(...)` | 39 overloads combining `(ChanceBlockState)`, `(BlockState, ...)`, `(Block, ...)`, and `(Supplier<? extends Block>, ...)` with `weight` (`NumberProvider`/`float`/omitted `1`), `nbt`, and `chance` |
| `boolean Builder.isEmpty()` / `WeightedChanceBlockStates Builder.build()` | Checks if empty and builds the immutable list result |

### `ChanceItemStack`

```java
public record ChanceItemStack(ItemStack stack, NumberProvider count)
```

| Member Signature | Description & Boundary Conditions |
| --- | --- |
| `ChanceItemStack(ItemStack stack, NumberProvider count)` | Primary constructor; copies `stack` as a 1-count prototype so `count` controls quantity |
| `static ChanceItemStack of(ItemLike item, NumberProvider amount)` / `of(ItemLike item, int count)` | Creates from an item |
| `static ChanceItemStack of(ItemStack stack, NumberProvider amount)` / `of(ItemStack stack)` / `of(ItemStack stack, int count)` | Preserves components from `stack` with fixed/random count |
| `static ChanceItemStack of(ItemStack stack, int count, float chance)` / `of(ItemStack stack, float chance)` | Uses `BinomialDistributionGenerator.binomial(count, chance)` for binomial drops (`count` independent rolls) |
| `static final Codec<ChanceItemStack> CODEC` / `STREAM_CODEC` | Serialization and network transport |
| `Item getItem()` / `Holder<Item> getItemHolder()` / `DataComponentPatch getComponentsPatch()` | Queries prototype item and component patch |
| `int getMaxCount()` | Evaluates `NumberProviderUtil.max(this.count)` clamped to `[0, 99]` (`0` for unsupported types) |
| `ItemStack getResult(ServerLevel level)` | Evaluates actual output count in full `LootContext` and clamps to **`[1, 99]`**: returns `ItemStack.EMPTY` if `count == 0`, else `[1, 99]` |

## Full Example: Combining Thread-Safe Block Predicates & Weighted Outputs

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
