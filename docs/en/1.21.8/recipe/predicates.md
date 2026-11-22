# Recipe Condition Predicates & Predicate Functions (`dev.anvilcraft.lib.v2.recipe.predicate`)

<BranchContextCard branch="1.21.8" />

**Recipe Predicates (`IRecipePredicate`)** describe the conditions and ingredient consumptions required for an in-world recipe to run. Depending on `predicate.getType().conflict()`, predicates fall into two categories:
- **Non-conflicting predicates (`conflict() == false`)**: check world state without consuming resources (`HasItem`, `HasBlock`, `HasEntity`);
- **Conflicting ingredient predicates (`conflict() == true`)**: reserve/pre-deduct resources in cache during matching (`snapshot`)—rolling back cleanly via `rollback` if later conditions fail—and confirm consumption during `accept` (`HasItemIngredient`, `HasBlockIngredient`, `HasEntityIngredient`).

---

## 1. Overview of the 6 Built-in Recipe Predicates (`LibRecipePredicateTypes`)

| Predicate Class | Registry ID (`anvillib_recipe:<id>`) | Conflicting (`conflict`) | Default Priority (`priority`) | Core Semantics |
| :--- | :--- | :---: | :---: | :--- |
| **`HasItem`** | `anvillib_recipe:has_item` | `false` | `1` | Checks whether items matching `ItemPredicate` (count range, component matchers, component sub-predicates) exist in range, **without consuming**. |
| **`HasItemIngredient`** | `anvillib_recipe:has_item_ingredient` | **`true`** | `1` | Checks and reserves items matching `ItemIngredientPredicate`; supports **`.consume(false)` as a catalyst (exclusively reserved for the batch, restored at batch end, not consumed)**. |
| **`HasBlock`** | `anvillib_recipe:has_block` | `false` | `1` | Checks whether block state and block entity NBT at `offset` satisfy `BlockStatePredicate`, **without changing the block**. |
| **`HasBlockIngredient`** | `anvillib_recipe:has_block_ingredient` | **`true`** | `1` | Checks block state at `offset` and **consumes it into `Blocks.AIR` on recipe commit**. |
| **`HasEntity`** | `anvillib_recipe:has_entity` | `false` | `1` | Checks whether living entities matching vanilla `EntityPredicate` and `MinMaxBounds.Ints` exist in range, **without consuming or reserving**. |
| **`HasEntityIngredient`** | `anvillib_recipe:has_entity_ingredient` | **`true`** | `1` | Exclusively reserves non-player entities in range during matching (preventing double-matching by multiple conditions or recipes), then **removes them on commit and spawns configured death drops and XP**. |

---

## 2. Item Condition & Item Ingredient Predicates (`HasItem` & `HasItemIngredient`)

Both extend `HasItemBase<T, P>` and search both ground drops (`ItemEntity`) and nearby container slots (`IItemHandler`) within `range` around `ctx.getPos().add(offset)` via `ItemCache`. `applyFunctions` calls `.copy()` on `ItemStack` before invoking predicate functions to avoid mutating the original stack.

### 1. Catalyst Reservation Mechanics (`HasItemIngredient.Builder#consume(false)`)

When you call **`.consume(false)`** on `HasItemIngredient.Builder`:
- Within the same batch, the predicate still calls `input.shrink(count)` to reserve the item, **preventing the same catalyst from being matched twice by another ingredient predicate in the same batch**;
- During `accept(ctx)`, if `input.supportsConsumptionReceipts()` is `true` (implemented by built-in `ICacheInputOutputImpl`), the framework runs `functions` on the reserved `getConsumedItems()` snapshots (e.g., extracting enchantments or custom names via `saveComponent`), then immediately calls `input.restoreConsumedItems()` to return the catalyst untouched to its original slot or item entity.

### 2. Predicate Function: `SaveComponentToTag` (`anvillib_recipe:save_component_2_tag`)

Both `HasItem` and `HasItemIngredient` support attaching `List<IPredicateFunction<?>>`. Built-in **`SaveComponentToTag<T>(DataComponentType<T> component, ResourceLocation path)`** serializes `component` from the matched input item to NBT (or removes the key from `TagCache` if absent) and stores it in the context's **`TagCache`** under `ResourceLocation path` for `SpawnItem`'s `ApplyTagToComponent` to inherit.

### 3. Logical Data Component Predicates (`AndPredicate` / `OrPredicate` / `NotPredicate`)

`LibDataComponentPredicates` registers 3 logical `DataComponentPredicate`s to vanilla `BuiltInRegistries.DATA_COMPONENT_PREDICATE_TYPE`:
- `LibDataComponentPredicates.AND` (`anvillib:and`): `AndPredicate(List<Map.Entry<Type<?>, DataComponentPredicate>> subPredicates)`, with `AndPredicate.of(type, subPredicate)` and `.with(type, subPredicate)`;
- `LibDataComponentPredicates.OR` (`anvillib:or`): `OrPredicate(List<Map.Entry<Type<?>, DataComponentPredicate>> subPredicates)`, with `OrPredicate.of(type, subPredicate)` and `.with(type, subPredicate)`;
- `LibDataComponentPredicates.NOT` (`anvillib:not`): `NotPredicate(Type<?> type, DataComponentPredicate subPredicate)`, with `NotPredicate.of(type, subPredicate)`;
- Utility: `LibDataComponentPredicates.register(String name, Codec<T> codec)` registers custom `DataComponentPredicate.Type<T>`s (note: namespace is `"anvillib"`).

### 4. `HasItem` / `HasItemIngredient` & `Builder` Method Reference

| Method Signature | Applicable To | Description |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(x, y, z)` / `below([d])` / `above([d])` | Both | Sets search center offset relative to recipe center (default `Vec3.ZERO`). |
| `range(Vec3)` / `range(x, y, z)` / `range(double r)` | Both | Sets 3-axis search box dimensions (default `(1.0, 1.0, 1.0)`; `Range.of(pos, range)` uses half-extents `range / 2`). |
| `of(ItemLike... items)`<br>`of(HolderGetter<Item> items, TagKey<Item> tag)` | Both | Restricts allowed items or item tag. |
| `has(DataComponentMatchers components)` | Both | Sets required data component matchers (exact components and `DataComponentPredicate` rules). |
| `saveComponent(DataComponentType<?> component, ResourceLocation path)`<br>`function(IPredicateFunction<?>... function)` | Both | Extracts a data component from matched items into `TagCache` under `path`. |
| `<T extends DataComponentPredicate> with(DataComponentPredicate.Type<T> type, T predicate)` | `HasItem.Builder` only | Adds a vanilla or custom `DataComponentPredicate` (damage, enchantments, or `AndPredicate`/`OrPredicate`/`NotPredicate`). |
| `count(MinMaxBounds.Ints)` / `moreThan(int min)` / `between(int min, int max)` / `lessThan(int max)` | `HasItem.Builder` only | Sets the checked item count range (closed interval). |
| `count(int count)` | `HasItemIngredient.Builder` only | Sets the positive integer item count to consume/reserve (must be `> 0`, default `1`). |
| `consume(boolean consume)` | `HasItemIngredient.Builder` only | Set to `false` to reserve as a non-consumed catalyst (default `true`). |
| `static HasItemIngredient fromPredicate(ItemIngredientPredicate, Vec3 offset, Vec3 range)` | `HasItemIngredient` | Constructs a `HasItemIngredient` directly from an existing `ItemIngredientPredicate`. |

---

## 3. Block Condition & Block Ingredient Predicates (`HasBlock` & `HasBlockIngredient`)

Both extend `HasBlockBase<T>`, holding a `Vec3 offset` and a `BlockStatePredicate predicate` (from `module.util`). In `test(ctx)`, they read the block state and block entity at `BlockPos.containing(ctx.getPos().add(offset))` via `BlockCache` and validate.

| Builder Method Signature (Identical for `HasBlock.Builder` & `HasBlockIngredient.Builder`) | Description |
| :--- | :--- |
| `offset(Vec3)` / `offset(x, y, z)` / `below([d])` / `above([d])` | Sets the target block offset relative to the recipe trigger point (default `Vec3.ZERO`). |
| `predicate(Consumer<BlockStatePredicate.Builder> consumer)` | Directly configures the underlying `BlockStatePredicate.Builder` (e.g., calling `withNbt(...)`). |
| `of(Block... blocks)` / `of(Collection<Block> blocks)`<br>`of(HolderGetter<Block> blocks, TagKey<Block> tag)` | Sets the allowed block list or block tag. |
| `with(Property<?> property, String value)`<br>`with(Property<Integer>, int)` / `with(Property<Boolean>, boolean)`<br>`<T extends Comparable<T>> with(Property<T>, T value)` | Adds an exact match condition for a single block property. |
| `<T extends Comparable<T>> with(Property<T> property, @Nullable T minValue, @Nullable T maxValue)`<br>`withMin(Property<T>, T minValue)` / `withMax(Property<T>, T maxValue)` | Adds a closed-interval range match condition for a block property. |
| `or()` | Ends the current `AND` property group and starts the next `OR` branch. |
| `build()` | Builds the `HasBlock` or `HasBlockIngredient` instance. |

> **Pruning Acceleration Tip**:
> All recipes that constrain a non-empty block set (`blocks.size() > 0`) via `HasBlock` or `HasBlockIngredient` are automatically extracted into `PrunePlan`'s bipartite pruner when registered in `InWorldRecipeManager`. Each relative `offset` reads the world block only once, and non-matching recipes are batch-vetoed before `recipe.matches(...)` is even called.

---

## 4. Entity Condition & Entity Ingredient Predicates (`HasEntity` & `HasEntityIngredient`)

Both builders extend `EntityConditionBuilder<B>` and search living entities via `EntityCache` within a bounding box of size `range` centered at `ctx.getPos().add(offset)` (sorted by distance ascending, then UUID).

### 1. Safety Boundaries & Item-Host Mutual Exclusion

During search (`EntityCache#find`):
- Both `HasEntity` and `HasEntityIngredient` automatically ignore dead entities (`!entity.isAlive()`);
- `HasEntityIngredient` (`ingredient = true`) also **strictly skips all player entities (`entity instanceof Player`)**, and via `ItemCache#canConsumeEntity` ensures that if an entity carries item slots (e.g., implements `IItemHandlerCache` or has `#anvillib:item_cache` tag) whose items are already used by another condition in this recipe, that entity cannot be consumed whole; conversely, once an entity is reserved by `HasEntityIngredient`, its slots cannot be used by `ItemCache`.

### 2. Code Example: `HasEntity` & `HasEntityIngredient` (with Drops & XP Rewards)

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.predicate.entity.HasEntity;
import dev.anvilcraft.lib.v2.recipe.predicate.entity.HasEntityIngredient;
import net.minecraft.advancements.critereon.MinMaxBounds;
import net.minecraft.world.entity.EntityType;

public final class EntityPredicateExamples {
    // Example 1: Require at least 2 sheep within 5x5x5 (check only, not consumed)
    public static HasEntity checkTwoSheepNearby() {
        return HasEntity.builder()
            .of(EntityType.SHEEP)
            .range(5.0)
            .count(MinMaxBounds.Ints.atLeast(2))
            .build();
    }

    // Example 2: Consume 1 iron golem 1 block above center, keeping death loot and yielding 1.5x XP
    public static HasEntityIngredient sacrificeIronGolem() {
        return HasEntityIngredient.builder()
            .offset(0.0, 1.0, 0.0)
            .range(2.0, 2.0, 2.0)
            .of(EntityType.IRON_GOLEM)
            .count(1)
            .dropItems(true)
            .experienceMultiplier(1.5F)
            .build();
    }
}
```

### 3. `EntityConditionBuilder`, `HasEntity.Builder` & `HasEntityIngredient.Builder` Method Reference

| Method Signature | Applicable To | Description |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(double x, double y, double z)` | Both | Sets the entity search center offset relative to the trigger point (default `Vec3.ZERO`). |
| `range(Vec3)` / `range(double x, double y, double z)` / `range(double size)` | Both | Sets the search bounding box size (default `(1, 1, 1)`). |
| `predicate(EntityPredicate)` / `predicate(Consumer<EntityPredicate.Builder>)` | Both | Uses vanilla `EntityPredicate` for deep filtering (equipment, health, movement, NBT, etc.). |
| `of(EntityType<?> type)`<br>`of(HolderGetter<EntityType<?>> lookup, TagKey<EntityType<?>> tag)` | Both | Filters by a single entity type (`BuiltInRegistries.ENTITY_TYPE`) or entity type tag. |
| `count(MinMaxBounds.Ints count)`<br>`count(int count)` | `HasEntity.Builder` only | Sets the required entity count range (default `MinMaxBounds.Ints.atLeast(1)`; `count(int)` equals `atLeast(count)`). |
| `count(int count)` | `HasEntityIngredient.Builder` only | Sets the entity count to reserve and consume in this batch (must be `> 0`, default `1`). |
| `experienceMultiplier(float multiplier)` | `HasEntityIngredient.Builder` only | XP drop multiplier (must be finite and `>= 0`, default `0f`; governed by `RULE_DOMOBLOOT`). |
| `dropItems(boolean dropItems)` | `HasEntityIngredient.Builder` only | Whether to capture death loot via `EntityDropCapture` on consumption and spawn it after commit (default `false`; governed by `RULE_DOMOBLOOT` / `RULE_DOENTITYDROPS`). |

---

## 5. Custom `IRecipePredicate` & `IPredicateFunction` Extension Guide

To write custom recipe conditions or predicate functions, register them respectively to:
- `LibRegistries.PREDICATE_KEY` (`anvillib:predicate` / `LibRegistries.PREDICATE_TYPE_REGISTRY`)
- `LibRegistries.PREDICATE_FUNCTION_KEY` (`anvillib:predicate_function` / `LibRegistries.PREDICATE_FUNCTION_TYPE_REGISTRY`)

| `IRecipePredicate<P>` Lifecycle Method | Phase & Responsibility |
| :--- | :--- |
| `boolean test(InWorldRecipeContext context)` | Checks whether the current world/cache state satisfies the condition (must not make irreversible mutations). |
| `default void snapshot(InWorldRecipeContext context)` | Called when `test(ctx)` passes and it is pushed via `ctx.push(predicate)`: reserves/pre-deducts resources in cache. |
| `default void rollback(InWorldRecipeContext context)` | Called on backtrack pop `ctx.pop(predicate)` when a later predicate fails: undoes reservations made in `snapshot`. |
| `default void accept(InWorldRecipeContext context)` | Called during `recipe.assemble` once all predicates match: registers final commit actions (`ctx.putAcceptor` or `ctx.afterCommit`). |
| `default void clearStack(InWorldRecipeContext context)` | Called at the end of a single batch assembly to clean up temporary rollback stack frames. |
| `IRecipePredicate.Type<P>#conflict()` | Returning `true` marks a conflicting ingredient predicate (routed to `conflicting` for backtracking/sequential matching); defaults to `false`. |
