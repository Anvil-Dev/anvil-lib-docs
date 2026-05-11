# Predicate System

## NbtPredicate

`dev.anvilcraft.lib.v2.util.predicate.NbtPredicate` – implements `Predicate<Tag>`, used for matching NBT data.

- Test `Tag`: `test(Tag)`
- Test `ItemStackTemplate`: based on the CustomData component
- Test `Entity`: extracts the entity's full NBT via `getEntityTagToCompare(Entity)` (includes the player's
  `SelectedItem`)

## IItemStackPredicate and Implementations

`IItemStackPredicate` is a `Predicate<ItemStack>` interface that additionally provides:

- `items()` – optional item HolderSet
- `components()` – DataComponentMatchers
- `testCount(int count)` – whether the count matches
- `testIgnoreCount(ItemStack)` – validates item and components while ignoring count

### ItemPredicate

`ItemPredicate` – a general-purpose item predicate:

- `items` – `HolderSet<Item>` (optional)
- `count` – MinMaxBounds.Ints
- `components` – DataComponentMatchers
- `Builder` supports: `of(ItemLike...)`, `of(TagKey<Item>)`, `withCount(..)`, `hasComponents(..)`

### ItemIngredientPredicate

`ItemIngredientPredicate` – an ingredient predicate suitable for recipes (count indicates an "at least" requirement):

- `count` means `stack.count >= count`
- Provides `getItems()` returning `ItemStackTemplate[]` (with caching)
- Builder additionally supports `of(ItemStackTemplate)` to automatically extract component predicates from templates

## ChanceItemStack

`dev.anvilcraft.lib.v2.util.predicate.ChanceItemStack` – a weighted item generation result.

- `stack` – ItemStackTemplate, `count` – NumberProvider (supports constant, uniform distribution, binomial distribution)
- `of(...)` factory methods supporting various probability representations
- `getResult(ServerLevel)` – computes count from LootContext, returns ItemStackTemplate (count 1~99)

## ChanceBlockState

`dev.anvilcraft.lib.v2.util.predicate.ChanceBlockState` – a weighted block result.

- `state`, `nbt`, `chance` (NumberProvider)
- `of(Supplier<Block>, CompoundTag)` and other factory methods
- `getResult(ServerLevel)` returns `Map.Entry<BlockState, CompoundTag>` based on probability, or null

## BlockStatePredicate

`dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate` – a block state predicate, supporting AND/OR logic and NBT.

- **Property matching**: `PropertyMatcher`, includes `ExactMatcher` (exact value) and `RangedMatcher` (range)
- **Logic**: the internal `properties` is a `List<List<PropertyMatcher>>`, where the outer list represents OR and the
  inner lists represent AND
- **NBT**: an optional list of `NbtPredicate` can be attached (all must be satisfied)
- **Test methods**:
    - `test(LevelAccessor, BlockState, @Nullable BlockEntity)` – full test (requires Level access)
    - `testWithoutEntity(BlockState)` – ignores NBT testing
    - `testEntityOffThread(BlockState, CompoundTag entityNbt)` – offline / multi-threaded safe
    - `testOffThread(BlockState, CompoundTag entityNbt)` – combined offline test
- **Render caching**: `getStatesCache()` / `constructStatesForRender()` used to quickly obtain a list of possible
  states (not guaranteed to match at runtime, for preview purposes only)
- **Builder** provides a fluent API: `.of(Block...)`, `.of(TagKey<Block>)`, `.with(Property, value)`, `.or()`,
  `.nbt(CompoundTag)`

**Code example**:

```java
BlockStatePredicate pred = BlockStatePredicate.builder()
    .of(Blocks.OAK_LOG, Blocks.BIRCH_LOG)
    .with(BlockStateProperties.AXIS, Direction.Axis.Y)
    .or()
    .with(BlockStateProperties.AXIS, Direction.Axis.X)
    .nbt(new CompoundTag() {{ putBoolean("stripped", true); }})
    .build();
```

**Serialization**: All predicates provide both `CODEC` and `STREAM_CODEC`.
