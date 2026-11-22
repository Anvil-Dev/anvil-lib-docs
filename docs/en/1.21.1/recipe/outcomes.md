# Outcomes, Property Mapping & Constrained Batch Planning (`IRecipeOutcome` / `ItemBatchPlan`)

<BranchContextCard branch="1.21.1" />

**Recipe Outcomes (`IRecipeOutcome`)** define the world effects or products generated after an in-world recipe matches and consumes its ingredients. This page covers `IRecipeOutcome` and `IPlannedItemOutcome`, the 5 built-in outcome types (`SpawnItem`, `SetBlock`, `SpawnEntity`, `ProduceExplosion`, `ChooseOneOutcome`), block state property inheritance and mapping (`BlockPropertyMapping`), outcome functions (`IOutcomeFunction` / `ApplyTagToComponent`), and the container-constrained batch planner `ItemBatchPlan`.

---

## 1. Overview of the 5 Built-in Recipe Outcomes (`LibRecipeOutcomeTypes`)

| Outcome Class | Registry ID (`anvillib_recipe:<id>`) | Interface | Core Role & Execution Phase |
| :--- | :--- | :--- | :--- |
| **`SpawnItem`** | `anvillib_recipe:spawn_item` | `IPlannedItemOutcome<SpawnItem>` | Computes random count (clamped `[0, 99]`), applies block offset (`IRecipeResultOffsetBlock`) and outcome functions (`IOutcomeFunction`), and writes output items to `ItemCache`. |
| **`SetBlock`** | `anvillib_recipe:set_block` | `IRecipeOutcome<SetBlock>` | Sets target block state in `BlockCache` (supports `copyProperties`, cross-property `propertyMappings`, synced double-block conversion, and `CompoundTag` loading). |
| **`SpawnEntity`** | `anvillib_recipe:spawn_entity` | `IRecipeOutcome<SpawnEntity>` | Pre-creates `[0, 99]` non-player entities during planning (strips `UUID`/`Pos`, supports passenger NBT), spawning them in `context.afterCommit`. |
| **`ProduceExplosion`** | `anvillib_recipe:produce_explosion` | `IRecipeOutcome<ProduceExplosion>` | Triggers a vanilla explosion of strength `power` at `context.pos + offset` in `context.afterCommit`. |
| **`ChooseOneOutcome`** | `anvillib_recipe:choose_one` | `IRecipeOutcome<ChooseOneOutcome>` | Randomly selects one child `IRecipeOutcome` by prefix-sum weight (`Choice.weight`) and invokes `acceptWithChance(context)`. |

### `IRecipeOutcome<O>` & `IPlannedItemOutcome<O>`

| Method Signature | Interface | Description |
| :--- | :--- | :--- |
| `Type<O> getType()` | `IRecipeOutcome<O>` | Returns the outcome type registered in `LibRegistries.OUTCOME_TYPE_REGISTRY`. |
| `default NumberProvider chance()` | `IRecipeOutcome<O>` | Returns trigger probability (defaults to `ConstantValue.exactly(1.0f)`). |
| `default void acceptWithChance(InWorldRecipeContext context)` | `IRecipeOutcome<O>` | Rolls `level.getRandom().nextDouble() <= context.getFloat(chance())` and executes `accept(context)` on hit. |
| `List<PlannedItem> plan(InWorldRecipeContext context)` | `IPlannedItemOutcome<O>` | Computes output items and target positions without mutating real world state; reused across capacity planning. |
| `default List<PlannedItem> planWithChance(InWorldRecipeContext context)` | `IPlannedItemOutcome<O>` | Called once per candidate batch to fix chance and random count results; `accept` / `acceptWithChance` iterate returned `PlannedItem`s and call `PlannedItem#accept`. |

---

## 2. `SpawnItem` & `ApplyTagToComponent`

When `SpawnItem(ItemStack item, Vec3 offset, NumberProvider count, List<IOutcomeFunction<?>> functions)` (or overload `SpawnItem(Holder<Item>, DataComponentPatch, Vec3, NumberProvider, List<IOutcomeFunction<?>>)`) runs `plan(context)`:
1. Evaluates `context.getInt(this.count, 0, 99)` for the output count (returns empty list if `0`);
2. Computes `offset = context.getPos().add(this.offset)`; if the block in `BlockCache` implements `IRecipeResultOffsetBlock`, adds `block.getOffset(level, blockPos, state)` (commonly used for cauldron interior offsets);
3. Applies each `IOutcomeFunction<ItemStack>` in `functions` in order;
4. Returns a non-empty `List<PlannedItem>` (`PlannedItem(stack, offset)`), written to adjacent containers or spawned as drops on commit via `ItemCache#getOutput(stack, pos).grow(stack, true)`.

### Outcome Function: `ApplyTagToComponent<T>` (`anvillib_recipe:apply_tag_2_component`)

`ApplyTagToComponent(DataComponentType<T> component, ResourceLocation path)` reads the NBT tag saved by `SaveComponentToTag` from `TagCache`, deserializes it using `context.getNbtRegistryOps()`, and writes it to `DataComponentType<T>` on the output `ItemStack`.

### `SpawnItem` & `SpawnItem.Builder` Methods

| Method Signature | Description |
| :--- | :--- |
| `static Builder builder()` | Creates a builder. |
| `static SpawnItem fromChance(ChanceItemStack stack, Vec3 offset)` | Quickly converts from `module.util`'s `ChanceItemStack`. |
| `offset(Vec3)` / `offset(x, y, z)` / `below([d])` / `above([d])` | Sets output spawn offset (default `Vec3.ZERO`). |
| `count(NumberProvider)` / `count(float count)` | Sets output count or random count provider (default `ConstantValue.exactly(1.0f)`). |
| `item(ItemStack)` / `item(Item)` / `item(ItemLike)` | Sets the base output item stack. |
| `function(IOutcomeFunction<?>... function)` | Attaches custom outcome functions. |
| `applyComponent(DataComponentType<?> component, ResourceLocation path)` | Attaches `ApplyTagToComponent` to restore a data component from `TagCache`. |
| `build()` | Builds the `SpawnItem` instance. |

---

## 3. Setting Blocks & Property Mapping (`SetBlock` & `BlockPropertyMapping`)

### 1. Problem & Usage

In block conversion recipes (e.g., waxing cut copper stairs, converting a north-facing block into an axis-aligned log), you often want to preserve facing, half, waterlogged state, or map a source property name to a target property name.

`SetBlock#transform(BlockState source)` computes the final block state in strict order:
1. **Base state**: starts from `SetBlock`'s configured `state`;
2. **Same-name property inheritance (`copyProperties = true`)**: iterates all properties of `source`; if the target block has a property with the same name and can parse the same literal value name, copies it over;
3. **Explicit property mapping (`propertyMappings`)**: iterates `Map<String, BlockPropertyMapping>` (keyed by target property name), reads `mapping.source()` from the **same initial `source` snapshot**, copies by literal name if `mapping.values()` is empty, or translates via `values` before applying to the target property;
4. **Automatic double-block preservation**: when `copyProperties` or `propertyMappings` is enabled, `BlockCache#transformBlock` automatically detects double blocks (doors, tall flowers with `BlockStateProperties.DOUBLE_BLOCK_HALF`) and converts both halves while preserving their `UPPER` / `LOWER` values.

> **Construction validation**: `SetBlock`'s primary constructor immediately validates that every target property name and mapped value in `propertyMappings` exists on `state.getBlock().getStateDefinition()`, throwing `IllegalArgumentException` on invalid property names or enum values.

### 2. Code Example: Same-Name Inheritance & Type-Safe Property Mapping

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.outcome.SetBlock;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;

import java.util.Map;

public final class SetBlockMappingExamples {
    // Example 1: Waxing cut copper stairs, automatically inheriting facing, half, shape, and waterlogged
    public static SetBlock waxCopperStairs() {
        return SetBlock.builder()
            .block(Blocks.WAXED_CUT_COPPER_STAIRS)
            .copyProperties()
            .build();
    }

    // Example 2: Mapping horizontal FACING to log AXIS
    public static SetBlock horizontalToPillarAxis() {
        return SetBlock.builder()
            .block(Blocks.OAK_LOG)
            .mapProperty(
                HorizontalDirectionalBlock.FACING,
                RotatedPillarBlock.AXIS,
                Map.of(
                    Direction.NORTH, Direction.Axis.Z,
                    Direction.SOUTH, Direction.Axis.Z,
                    Direction.EAST, Direction.Axis.X,
                    Direction.WEST, Direction.Axis.X
                )
            )
            .build();
    }
}
```

### 3. `SetBlock`, `SetBlock.Builder` & `BlockPropertyMapping` API Table

| Method Signature | Class | Description |
| :--- | :--- | :--- |
| `SetBlock(state, nbt, offset, chance)` | `SetBlock` | Compatibility constructor (defaults `copyProperties = false`, `propertyMappings = Map.of()`). |
| `static SetBlock fromState(ChanceBlockState state, Vec3 offset)` | `SetBlock` | Quickly constructs from `ChanceBlockState`. |
| `BlockState transform(BlockState source)` | `SetBlock` | Applies property inheritance and mapping to the given source block state. |
| `copyProperties()` / `copyProperties(boolean copy)` | `SetBlock.Builder` | Enables or disables automatic inheritance of same-named properties. |
| `propertyMappings(Map<String, BlockPropertyMapping> mappings)` | `SetBlock.Builder` | Merges a map of target property mapping rules. |
| `mapProperty(String source, String target[, Map<String, String> values])` | `SetBlock.Builder` | Maps by property name (copies literal value names if `values` is empty). |
| `<S, T> mapProperty(Property<S> source, Property<T> target[, Map<S, T> values])` | `SetBlock.Builder` | Type-safe property mapping. |
| `block(BlockState)` / `block(Block)` / `nbt(CompoundTag)` | `SetBlock.Builder` | Sets target block state (default `Blocks.AIR`) and `EntityBlock` NBT (loaded via `entity.loadWithComponents`). |
| `offset(Vec3)` / `offset(x,y,z)` / `below([d])` / `above([d])` | `SetBlock.Builder` | Sets target coordinate offset. |
| `chance(NumberProvider)` / `chance(float)` | `SetBlock.Builder` | Sets trigger probability. |
| `BlockPropertyMapping(String source[, Map<String, String> values])` | `BlockPropertyMapping` | `source` must not be blank; `apply(input, output, target)` reads from `input` and writes to `output`. |

---

## 4. `SpawnEntity`, `ProduceExplosion` & `ChooseOneOutcome`

### 1. `SpawnEntity` (`anvillib_recipe:spawn_entity`)

- **Safety validation**: forbids spawning `EntityType.PLAYER` and player passengers (throws `IllegalArgumentException`); recursively strips `"UUID"`, `"uuid"`, `"Pos"`, `"pos"` from `nbt` and `Passengers`/`passengers`, forcing the current `entity` registry ID and random `UUID`s.
- **Spawn timing**: during `accept(ctx)` planning, validates `amount = context.getInt(count, 0, 99)` and pre-constructs all entities via `EntityType.loadEntityRecursive`; during `context.afterCommit`, if `nbt.isEmpty()` and the entity is a `Mob`, fires `EventHooks.finalizeMobSpawn(..., MobSpawnType.TRIGGERED, null)` and adds to the world via `level.tryAddFreshEntityWithPassengers(result)`.
- **`SpawnEntity.Builder` methods**: `entity(EntityType<?>)`, `nbt(CompoundTag)`, `offset(Vec3 / x,y,z)`, `count(NumberProvider / int)`, `chance(NumberProvider / float)`, `build()`.

### 2. `ProduceExplosion` (`anvillib_recipe:produce_explosion`)

- Record definition: `ProduceExplosion(Vec3 offset, float power, boolean fire, Level.ExplosionInteraction explodeInteraction, NumberProvider chance)` (note: the JSON field key for interaction type is `"interact"` of type `Level.ExplosionInteraction`).
- Execution: deferred via `ctx.afterCommit` until all item/block/entity commits succeed, then calls `level.explode(null, x, y, z, power, fire, explodeInteraction)` at `ctx.getPos().add(offset)`.

### 3. `ChooseOneOutcome` (`anvillib_recipe:choose_one`)

- Record definition: `ChooseOneOutcome(NumberProvider chance, List<Choice> choices)`, where `Choice(IRecipeOutcome<?> outcome, NumberProvider weight)` can be constructed via `ChooseOneOutcome.quickChoice(outcome, weight)`.
- Algorithm: builds a prefix-sum array `checkpoints` of `context.getFloat(choice.weight())`, picks the first entry with `random.nextFloat() * weightSum <= checkpoints[i]`, and calls its `acceptWithChance(context)`.
- **`ChooseOneOutcome.Builder` methods**: `choice(Choice)`, `choice(IRecipeOutcome<?>, NumberProvider / float weight)`, `chance(NumberProvider / float)`, `build()`.

---

## 5. Container-Constrained Batch Planner (`ItemBatchPlan`)

### 1. Problem & Usage

When a machine block (auto-crafter, fluid mixer, or in-container processor) wants to compute the maximum number of consecutive in-world recipe batches executable **on a capacity-constrained container snapshot** (allowing later batches to consume leftover ingredients or use slots freed by earlier batches), use `dev.anvilcraft.lib.v2.recipe.util.ItemBatchPlan` directly:

- **Separate I/O containers**: call `ItemBatchPlan.separate(inputs, outputs, limit, capacity, recipe)`;
- **Shared I/O slot containers**: call `ItemBatchPlan.shared(inventory, limit, capacity, recipe)` (each batch deducts ingredients and restores catalysts first, then runs backtracking slot-packing `fit` / `fillEmpty` to verify all accumulated outputs fit);
- **Planning callback `Predicate<Batch>`**: call `batch.take(predicate, count)` to consume ingredients, `batch.catalyst(predicate, count)` to reserve catalysts (exclusive to this batch, returned at batch end), `batch.produce(stack)` to register outputs, and `batch.afterCommit(effect)` to register side effects run only after commit succeeds;
- **Single atomic `commit(Consumer<ItemBatchPlan>)`**: the caller verifies the real inventory still matches the initial snapshot and writes the final slots inside the callback, after which all `effects` of selected batches execute sequentially (`commit` may only be called once per `ItemBatchPlan`).

### 2. `ItemBatchPlan` & `Batch` Public API Table

| Class / Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| **`ItemBatchPlan`** | `static ItemBatchPlan separate(inputs, outputs, limit, capacity, recipe)` | Plans the longest valid batch prefix with separate input and output slots (`limit >= 0`). |
| **`ItemBatchPlan`** | `static ItemBatchPlan shared(inventory, limit, capacity, recipe)` | Plans the longest valid batch prefix with shared input/output slots. |
| **`ItemBatchPlan`** | `List<ItemStack> inputs()` / `List<ItemStack> outputs()` / `int batches()` | Returns deep-copied final input/output slot snapshots and selected batch count. |
| **`ItemBatchPlan`** | `void commit(Consumer<ItemBatchPlan> inventoryCommit)` | Runs the inventory commit callback and then executes `effects` on normal return; throws `IllegalStateException` if called twice. |
| **`SlotCapacity`** | `int capacity(int slot, ItemStack stack)` | Functional interface returning max capacity for `stack` in `slot` (`0` = reject, negative throws `IllegalArgumentException`). |
| **`Batch`** | `List<ItemStack> take(Predicate<ItemStack> ingredient, int count)` | Reserves ingredients in slot order and returns receipt copies with actual components; returns empty list without mutating state if insufficient. |
| **`Batch`** | `List<ItemStack> catalyst(Predicate<ItemStack> ingredient, int count)` | Exclusively reserves catalysts for the current batch (reusable next batch) and returns matching item receipts. |
| **`Batch`** | `void produce(ItemStack stack)` | Records an output stack with deterministic count and components. |
| **`Batch`** | `void afterCommit(Runnable effect)` | Registers a deferred side effect; only valid while the planning callback is open (throws `IllegalStateException` afterward). |

---

## 6. Custom `IRecipeOutcome` & `IOutcomeFunction` Registries

- Custom outcome type registry key: `LibRegistries.OUTCOME_KEY` (`anvillib:outcome` / `LibRegistries.OUTCOME_TYPE_REGISTRY`), implementing `IRecipeOutcome<O>` and `IRecipeOutcome.Type<O>`.
- Custom outcome function registry key: `LibRegistries.OUTCOME_FUNCTION_KEY` (`anvillib:outcome_function` / `LibRegistries.OUTCOM_FUNCTIONE_TYPE_REGISTRY`), implementing `IOutcomeFunction<T>` and `IOutcomeFunction.Type<O>`.
