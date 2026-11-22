# Block, Item & NBT Predicates and Probability Models

`dev.anvilcraft.lib.v2.util.predicate` provides a suite of **data structures and state matchers** with complete `Codec`, `StreamCodec`, and fluent builders, used directly by `module.recipe` and external recipe/rule systems as underlying condition and probabilistic output carriers.

## BlockState & BlockEntity Matching: `BlockStatePredicate`

`BlockStatePredicate` can match block IDs/tags and `BlockState` properties (supporting exact values and numeric ranges `withMin` / `withMax` / `with(min, max)`), as well as bound `BlockEntity` NBT, including pure off-thread NBT checking.

### Matching Execution API

| Method | Description |
| --- | --- |
| `test(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | Full online check: matches block set and properties first, then compares entity NBT if `requiresBlockEntity()` is true |
| `testWithoutEntity(BlockState state)` | Checks only block and block properties |
| `cannotMatch(BlockState state)` | Fast negative pruning check |
| `testEntity(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | Checks only the block entity's live NBT |
| `testOffThread(BlockState state, @Nullable CompoundTag entityNbt)` / `testEntityOffThread(...)` | Thread-safe off-thread version for multi-threaded recipe indexing or cache pre-filtering |
| `requiresBlockEntity()` | Whether this predicate has attached `CompoundTag` entity conditions |
| `getStatesCache()` / `constructStatesForRender()` | Returns all discrete `BlockState`s matching this predicate (the latter is used to cycle compatible blocks in recipe viewers) |
| `getKey()` | Extracts the canonical resource key for indexing (returns `BlockStatePredicate.EMPTY` if none) |

### `BlockStatePredicate.Builder` Construction Methods

- Entry: `BlockStatePredicate.builder()`
- Specify block candidates: `of(Block... blocks)`, `of(Supplier<? extends Block>... blocks)`, `of(Collection<Block>)`, `of(HolderGetter<Block> blocks, TagKey<Block> tag)`
- Constrain block properties: `with(BlockState)`, `with(Property<?> prop, String val)`, `with(Property<Integer>, int)`, `with(Property<Boolean>, boolean)`, `with(Property<T>, T)`, ranges `with(Property<T>, Comparable, Comparable)` / `withMin(...)` / `withMax(...)`
- Multiple condition branches: `or()` (appends a new alternative matching branch)
- Entity NBT: `nbt(CompoundTag tag)`
- `build()` produces the immutable `BlockStatePredicate` (with built-in `CODEC` and `STREAM_CODEC`).

## Item & Component Matching: `IItemStackPredicate`, `ItemPredicate` & `ItemIngredientPredicate`

Item predicates bind tag lookups via `HolderGetter<Item>` and use vanilla `DataComponentMatchers` to express exact component and sub-predicate (`DataComponentPredicate`) matching:

| Class / Interface | Core Fields & Builder API |
| --- | --- |
| `IItemStackPredicate` | Common item matching interface: `items()`, `components()` (`DataComponentMatchers`), `testCount(int)`, and `testIgnoreCount(ItemStack)` |
| `ItemPredicate` | Constrains stack count with `MinMaxBounds.Ints`; provides `ItemPredicate.Builder.item().of(HolderGetter<Item>, TagKey<Item>) / of(...) .withCount(...) .withSubPredicate(DataComponentPredicate.Type<T>, T) .hasComponents(DataComponentMatchers) .build()` |
| `ItemIngredientPredicate` | Matcher designed for crafting-slot fixed counts (`ItemIngredientPredicate.of(HolderGetter<Item>, TagKey<Item>)`, `withCount(int)`, `withSubPredicate(DataComponentPredicate.Type<T>, T)`, `hasComponents(DataComponentMatchers)`); also exposes `getItems()` (`ItemStack[]`) for recipe viewers |

Both expose `CODEC` and `STREAM_CODEC` constants (based on `StreamCodecUtil.codec2Stream`).

## Lightweight NBT Matching: `NbtPredicate`

`public record NbtPredicate(CompoundTag tag) implements Predicate<Tag>` (uses `TagParser.LENIENT_CODEC` for lenient SNBT):
- `test(@Nullable Tag tag)`: recursive superset comparison (target NBT must contain all keys and matching values in expected `tag`, allowing extra undeclared fields);
- `test(ItemStack stack)` / `test(Entity entity)`: checks an item's custom NBT/component context or an entity's full saved data;
- `NbtPredicate.getEntityTagToCompare(Entity entity)`: exports entity NBT within a `ProblemReporter.ScopedCollector` + `TagValueOutput` context and writes held item `SelectedItem`.

## Probabilistic Output Models: `ChanceBlockState`, `WeightedChanceBlockStates` & `ChanceItemStack`

Used to represent "weighted random pick" or "probabilistic / dynamic `NumberProvider` count" outcomes in recipes or world transformations (internally constructs a `LootContext` via `new LootParams(level, new ContextMap.Builder().create(new ContextKeySet.Builder().build()), Map.of(), 0)` to evaluate `NumberProvider`):

### 1. `ChanceItemStack(ItemStack stack, NumberProvider count)`

- Factory methods:
  - `ChanceItemStack.of(ItemLike item, int count / NumberProvider amount)`
  - `ChanceItemStack.of(ItemStack stack[, int count[, float chance]][, NumberProvider amount / float chance])`
- Runtime result & metadata: `getResult(ServerLevel level)` (clamps `count` to `1..99` and returns a new `ItemStack` copy), `getItem()`, `getItemHolder()`, `getMaxCount()`, `getComponentsPatch()`.

### 2. `ChanceBlockState(BlockState state, CompoundTag nbt, NumberProvider chance)`

- Constructor overloads: `ChanceBlockState(state, chance)`, `ChanceBlockState(state, float)`, `ChanceBlockState.of(Supplier<? extends Block>[, CompoundTag nbt])`.
- Runtime result: `@Nullable Map.Entry<BlockState, CompoundTag> getResult(ServerLevel level)` (returns hit state & NBT when random roll <= `chance`, else `null`).

### 3. `WeightedChanceBlockStates(List<Entry> states)`

Selects a probabilistic block outcome from a weighted list, built via `WeightedChanceBlockStates.builder()`:
- `add(...)` provides rich overloads taking weight `NumberProvider` / `float`, target `BlockState` / `Block` / `Supplier<? extends Block>`, optional `CompoundTag`, and output chance `NumberProvider` / `float`;
- `isEmpty()` checks if any entries exist, `build()` constructs it, and `getResult(ServerLevel)` performs weighted selection and chance rolling.
