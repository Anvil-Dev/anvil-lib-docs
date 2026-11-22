# Block, Item & Entity Predicates (`IRecipePredicate` & Built-ins)

<BranchContextCard branch="26.2" />

**Recipe Predicates (`IRecipePredicate`)** define environmental conditions or ingredients (blocks, items, entities) that must be satisfied before an in-world recipe executes. This page covers the `IRecipePredicate` lifecycle, 6 built-in predicates (`HasBlock`, `HasBlockIngredient`, `HasItem`, `HasItemIngredient`, `HasEntity`, `HasEntityIngredient`), predicate functions (`IPredicateFunction` / `SaveComponentToTag`), and logical data component predicates (`AndPredicate` / `OrPredicate` / `NotPredicate`).

---

## 1. `IRecipePredicate` Lifecycle & Snapshot/Rollback Mechanics

During `InWorldRecipe#matches` and `assemble`, an `IRecipePredicate` goes through 5 lifecycle stages:

1. **`boolean test(InWorldRecipeContext context)` (Condition Test)**:
   Checks whether the current cached state satisfies this predicate (e.g., matching block, sufficient unreserved items or entities). **Never mutate any cache state in this stage**.
2. **`void snapshot(InWorldRecipeContext context)` (Reservation)**:
   Called when `test` returns `true` and `context.push(predicate)` pushes it onto the match stack. Used to **temporarily deduct/reserve** resources during backtracking (`ShapelessMatcher.incompatible`) or sequential matching (e.g., `HasItemIngredient` calls `input.shrink(count)`, `HasEntityIngredient` calls `cache.reserve(selected)`) so subsequent predicates do not double-match the same item or entity.
3. **`void rollback(InWorldRecipeContext context)` (Backtrack Release)**:
   Called when a later predicate fails and `context.pop(predicate)` unwinds. Restores the items or entities reserved in `snapshot`.
4. **`void accept(InWorldRecipeContext context)` (Confirm Consumption & Run Functions)**:
   Called sequentially during `InWorldRecipe#assemble` once all predicates match:
   - `HasBlockIngredient` sets the block at that position to air in `BlockCache` and registers `BlockCache.DEFAULT_ACCEPTOR`;
   - `HasItem` / `HasItemIngredient` runs `IPredicateFunction` on matched items (e.g., saving data components to `TagCache`), and if `HasItemIngredient` has `consume = false` (catalyst), calls `input.restoreConsumedItems()` to return them;
   - `HasEntityIngredient` calls `EntityCache#consume` to mark reserved entities for removal and record XP and drop settings.
5. **`void clearStack(InWorldRecipeContext context)` (Per-Batch Cleanup)**:
   Called at the end of a single `assemble` batch to clear temporary transaction stacks for the next efficiency batch.

---

## 2. Comparison of the 6 Built-in Recipe Predicates

| Predicate Class | Registry ID (`anvillib_recipe:*`) | Conflicting (`conflict()`) | Default Priority (`priority()`) | Core Role |
| :--- | :--- | :---: | :---: | :--- |
| **`HasBlock`** | `has_block` | `false` | `1` | **Read-only block check**: checks block state and block entity NBT at `context.pos + offset` without consuming the block. |
| **`HasBlockIngredient`** | `has_block_ingredient` | `false` | `100` | **Block ingredient consumption**: checks the block at `context.pos + offset` and removes it to air in `accept`. |
| **`HasItem`** | `has_item` | `false` | `1` | **Read-only item check**: checks whether total matching items within `range` around `context.pos + offset` satisfy `MinMaxBounds.Ints`, without consuming items. |
| **`HasItemIngredient`** | `has_item_ingredient` | **`true`** | `10 * count` (`100 * count` if components specified) | **Item ingredient / catalyst**: reserves `count` items in `snapshot`; if `consume = false`, acts as a catalyst locked exclusively for the batch and returned in `accept`. |
| **`HasEntity`** | `has_entity` | `false` | `1` | **Read-only entity check**: checks whether matching entities (per vanilla `EntityPredicate`) in range satisfy `MinMaxBounds.Ints` (can match players), without reserving or consuming. |
| **`HasEntityIngredient`** | `has_entity_ingredient` | **`true`** | `1` | **Entity ingredient consumption**: reserves `count` non-player entities in `snapshot`, removes them on commit, and optionally spawns XP (`experienceMultiplier`) and drops (`dropItems`). |

---

## 3. Full Code Example

### 1. Combining Block, Item (with Catalyst & Component Extraction), and Entity Predicates

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder;
import dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers;
import dev.anvilcraft.lib.v2.recipe.InWorldRecipe;
import net.minecraft.advancements.predicates.MinMaxBounds;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;

public final class PredicateRecipeExample {
    private static final Identifier SAVED_ENCHANTMENTS =
        Identifier.fromNamespaceAndPath("my_mod", "book_enchants");

    private PredicateRecipeExample() {
    }

    public static InWorldRecipe createRitualRecipe() {
        return InWorldRecipeBuilder.incompatible(LibRecipeTriggers.ITEM_INTO_BLOCK)
            // 1. HasBlock: 1 block below must be a lit soul campfire (read-only, not consumed)
            .hasBlock(block -> block
                .below(1)
                .of(Blocks.SOUL_CAMPFIRE)
                .with(CampfireBlock.LIT, true)
            )
            // 2. HasBlockIngredient: 1 block above must be an iron or gold block (or() branch), consumed on craft
            .hasBlockIngredient(block -> block
                .above(1)
                .of(Blocks.IRON_BLOCK)
                .or()
                .of(Blocks.GOLD_BLOCK)
            )
            // 3. HasItem: at least 4 glowstone dust present within 2x2x2 (read-only)
            .hasItem(item -> item
                .range(2.0)
                .of(Items.GLOWSTONE_DUST)
                .moreThan(4)
            )
            // 4. HasItemIngredient: consume 1 enchanted book and save STORED_ENCHANTMENTS to TagCache
            .hasItemIngredient(ing -> ing
                .range(1.5)
                .of(Items.ENCHANTED_BOOK)
                .count(1)
                .saveComponent(DataComponents.STORED_ENCHANTMENTS, SAVED_ENCHANTMENTS)
            )
            // 5. HasEntity: read-only check for 1–3 villagers within 4 blocks
            .hasEntity(entity -> entity
                .range(4.0)
                .of(EntityType.VILLAGER)
                .count(MinMaxBounds.Ints.between(1, 3))
            )
            // 6. HasEntityIngredient: consume 1 zombie within 4 blocks, yielding 2.0x XP and loot drops
            .hasEntityIngredient(mob -> mob
                .range(4.0)
                .of(EntityType.ZOMBIE)
                .count(1)
                .experienceMultiplier(2.0f)
                .dropItems(true)
            )
            .build();
    }
}
```

### 2. Building Complex Item Component Matchers with `AndPredicate` / `OrPredicate` / `NotPredicate`

`module.recipe` registers `anvillib:and`, `anvillib:or`, and `anvillib:not` logical `DataComponentPredicate`s in `LibDataComponentPredicates` for nesting inside `DataComponentMatchers`:

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.data.advancement.predicate.item.AndPredicate;
import dev.anvilcraft.lib.v2.recipe.data.advancement.predicate.item.NotPredicate;
import dev.anvilcraft.lib.v2.recipe.init.LibDataComponentPredicates;
import net.minecraft.advancements.predicates.DataComponentMatchers;
import net.minecraft.advancements.predicates.MinMaxBounds;
import net.minecraft.core.component.predicates.DamagePredicate;
import net.minecraft.core.component.predicates.DataComponentPredicates;

public final class ComponentMatchExample {
    public static DataComponentMatchers undamagedItemMatcher() {
        // Negate vanilla DAMAGE predicate with NotPredicate: require item damage not >= 1
        NotPredicate notDamaged = NotPredicate.of(
            DataComponentPredicates.DAMAGE,
            DamagePredicate.durability(MinMaxBounds.Ints.atLeast(1))
        );
        return DataComponentMatchers.Builder.components()
            .partial(LibDataComponentPredicates.NOT.get(), notDamaged)
            .build();
    }
}
```

---

## 4. Predicate Classes & Builder API Reference

### 1. `HasBlock` & `HasBlockIngredient` (Extending `HasBlockBase<T>`)

Both share identical `Builder` method signatures; the only difference is `HasBlockIngredient` calls `BlockCache#removeBlock(blockPos)` in `accept(context)`:

| `HasBlock.Builder` / `HasBlockIngredient.Builder` Method | Description |
| :--- | :--- |
| `offset(Vec3)` / `offset(double x, double y, double z)`<br>`below(double)` / `below()` / `above(double)` / `above()` | Sets check offset relative to `context.getPos()` (default `Vec3.ZERO`). |
| `of(Block... blocks)` / `of(Collection<Block> blocks)` / `of(HolderGetter<Block>, TagKey<Block>)` | Restricts allowed blocks or block tag. |
| `with(Property<?>, String)` / `with(Property<Integer>, int)` / `with(Property<Boolean>, boolean)` / `<T extends Comparable<T>> with(Property<T>, T)` | Requires a block state property to equal a specific value. |
| `<T extends Comparable<T>> with(Property<T>, @Nullable T minValue, @Nullable T maxValue)` / `withMin(Property<T>, T)` / `withMax(Property<T>, T)` | Requires a comparable block property (such as `AGE`, `LEVEL`, power level) to lie within `[minValue, maxValue]`. |
| `or()` | Starts a new OR branch in the underlying `BlockStatePredicate.Builder`. |
| `predicate(Consumer<BlockStatePredicate.Builder>)` | Directly configures the underlying `BlockStatePredicate.Builder` (e.g., `.nbt(CompoundTag)` for block entity NBT). |
| `build()` | Builds the `HasBlock` or `HasBlockIngredient` instance. |

### 2. `HasItem` & `HasItemIngredient` (Extending `HasItemBase<T, P>`)

| Method Signature | Builder | Description |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(double, double, double)` / `below(...)` / `above(...)` | Both | Sets search center offset relative to `context.getPos()` (default `Vec3.ZERO`). |
| `range(Vec3)` / `range(double x, double y, double z)` / `range(double r)` | Both | Sets search half-extents around the offset center (default `(1.0, 1.0, 1.0)`). |
| `of(ItemLike... items)` / `of(HolderGetter<Item>, TagKey<Item>)` | Both | Restricts matching items or item tag. |
| `has(DataComponentMatchers components)` | Both | Requires matching data component conditions. |
| `function(IPredicateFunction<?>... function)` | Both | Adds predicate functions executed on matched items during `accept`. |
| `saveComponent(DataComponentType<?> component, Identifier path)` | Both | Shortcut adding `new SaveComponentToTag<>(component, path)` to encode `component` as NBT `Tag` under `path` in `TagCache` (or remove the key if absent), for later `SpawnItem.Builder#applyComponent` restoration. |
| `count(MinMaxBounds.Ints)` / `moreThan(int min)` / `between(int min, int max)` / `lessThan(int max)` | `HasItem.Builder` only | Sets the count range for read-only item checks. |
| `count(int count)` | `HasItemIngredient.Builder` only | Sets the positive integer item count to consume/reserve (must be `> 0`, else throws `IllegalArgumentException`). |
| `consume(boolean consume)` | `HasItemIngredient.Builder` only | Defaults to `true`. If `false`, acts as a **catalyst**: exclusively locked via `shrink` during the current batch, then restored via `restoreConsumedItems()` in `accept` for the next batch or original container. |

### 3. `HasEntity`, `HasEntityIngredient` & `EntityConditionBuilder<B>`

Both `HasEntity.Builder` and `HasEntityIngredient.Builder` extend `EntityConditionBuilder<B>`:

| Method Signature | Class | Description & Boundary Conditions |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(double x, double y, double z)` | `EntityConditionBuilder` | Sets check center offset (default `Vec3.ZERO`). |
| `range(Vec3)` / `range(double x, double y, double z)` / `range(double size)` | `EntityConditionBuilder` | Sets **total bounding box dimensions** `AABB.ofSize(center, range.x * 2, range.y * 2, range.z * 2)` centered at `context.pos + offset` (default `(1, 1, 1)`). |
| `predicate(EntityPredicate)` / `predicate(Consumer<EntityPredicate.Builder>)` | `EntityConditionBuilder` | Sets vanilla `EntityPredicate` conditions (**Note**: replaces any conditions previously set via `of(...)`). |
| `of(EntityType<?> type)` / `of(HolderGetter<EntityType<?>>, TagKey<EntityType<?>>)` | `EntityConditionBuilder` | Shortcut to match a specific entity type or entity type tag in `EntityPredicate`. |
| `count(MinMaxBounds.Ints)` / `count(int atLeast)` | `HasEntity.Builder` | Sets read-only entity count range (`count(int)` means `MinMaxBounds.Ints.atLeast(count)`, default `>= 1`). Can match players. |
| `count(int count)` | `HasEntityIngredient.Builder` | Sets positive integer entity count to consume (default `1`; `<= 0` throws `IllegalArgumentException`). **Cannot match players or `ItemEntity`/container entities occupied by `ItemCache`**. |
| `experienceMultiplier(float multiplier)` | `HasEntityIngredient.Builder` | Sets XP multiplier when mobs are consumed (default `0.0f`; must be finite and non-negative, else throws `IllegalArgumentException`). Actual XP spawned is `floor(baseXp * multiplier)`. |
| `dropItems(boolean dropItems)` | `HasEntityIngredient.Builder` | Whether consumed entities drop items (default `false`). If `true`, mobs drop killer-less death loot and equipment (firing `LivingDropsEvent`), and non-mobs (minecarts/boats) keep removal drops; if `false`, also suppresses container entity spill drops. |

### 4. `IPredicateFunction`, `SaveComponentToTag` & Logical Component Predicates

| Class / Interface | Key Signatures | Description |
| :--- | :--- | :--- |
| `IPredicateFunction<T>` | `public interface IPredicateFunction<T> extends BiFunction<InWorldRecipeContext, T, T>` | Predicate function interface dispatched via `LibRegistries.PREDICATE_FUNCTION_TYPE_REGISTRY`. |
| `SaveComponentToTag<T>` | `public record SaveComponentToTag<T>(DataComponentType<T> component, Identifier path)` | Registered as `anvillib_recipe:save_component_2_component` (`LibPredicateFunctionTypes.SAVE_COMPONENT_TO_TAG`). Serializes `component` on the input `ItemStackTemplate` into NBT `Tag` under `path` in `TagCache`. |
| `AndPredicate` | `public static AndPredicate of(Type<?> type, DataComponentPredicate sub)`<br>`public AndPredicate with(Type<?> type, DataComponentPredicate sub)` | Registered as `anvillib:and` (`LibDataComponentPredicates.AND`). Returns `true` when all child component predicates match. |
| `OrPredicate` | `public static OrPredicate of(Type<?> type, DataComponentPredicate sub)`<br>`public OrPredicate with(Type<?> type, DataComponentPredicate sub)` | Registered as `anvillib:or` (`LibDataComponentPredicates.OR`). Returns `true` when any child component predicate matches. |
| `NotPredicate` | `public static NotPredicate of(Type<?> type, DataComponentPredicate sub)` | Registered as `anvillib:not` (`LibDataComponentPredicates.NOT`). Returns `true` when the child component predicate does not match. |
