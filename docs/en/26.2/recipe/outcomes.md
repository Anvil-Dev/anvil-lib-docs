# Outcomes, Property Mapping & Constrained Batch Planning (`IRecipeOutcome` / `ItemBatchPlan`)

<BranchContextCard branch="26.2" />

**Recipe Outcomes (`IRecipeOutcome`)** define the world effects or products generated after an in-world recipe matches and consumes its ingredients. This page covers `IRecipeOutcome` and `IPlannedItemOutcome`, the 5 built-in outcome types (`SpawnItem`, `SetBlock`, `SpawnEntity`, `ProduceExplosion`, `ChooseOneOutcome`), block state property inheritance and mapping (`BlockPropertyMapping`), outcome functions (`IOutcomeFunction` / `ApplyTagToComponent`), and the container-constrained batch planner `ItemBatchPlan`.

---

## 1. Overview of the 5 Built-in Recipe Outcomes (`LibRecipeOutcomeTypes`)

| Outcome Class | Registry ID (`anvillib_recipe:*`) | Interface | Core Role & Execution Phase |
| :--- | :--- | :--- | :--- |
| **`SpawnItem`** | `spawn_item` | `IPlannedItemOutcome<SpawnItem>` | Computes random count (`0–99`), applies block offset (`IRecipeResultOffsetBlock`) and outcome functions (`IOutcomeFunction`), and writes output items to `ItemCache`. |
| **`SetBlock`** | `set_block` | `IRecipeOutcome<SetBlock>` | Sets target block state in `BlockCache` (supports `copyProperties`, cross-property `propertyMappings`, synced double-block conversion, and `CompoundTag` loading for block entities). |
| **`SpawnEntity`** | `spawn_entity` | `IRecipeOutcome<SpawnEntity>` | Pre-creates `0–99` non-player entities during planning (sanitizing UUID/Pos, supporting passenger NBT) and spawns them into the world in `context.afterCommit`. |
| **`ProduceExplosion`** | `produce_explosion` | `IRecipeOutcome<ProduceExplosion>` | Triggers a vanilla explosion of strength `power` at `context.pos + offset` in `context.afterCommit`. |
| **`ChooseOneOutcome`** | `choose_one` | `IRecipeOutcome<ChooseOneOutcome>` | Randomly selects one child `IRecipeOutcome` by prefix-sum weight (`Choice.weight`) and invokes its `acceptWithChance(context)`. |

---

## 2. BlockState Inheritance & Mapping (`SetBlock` & `BlockPropertyMapping`)

### 1. Problem & Usage

In block conversion recipes (e.g., waxing cut copper stairs, or converting a north-facing piston into a Z-axis log), you usually want to preserve `facing`, `half`, `waterlogged`, or map a source property to a target property.

`SetBlock` computes the final block state in strict order (`SetBlock#transform(BlockState source)`):
1. **Base state**: starts from `SetBlock`'s configured `state`;
2. **Same-name property inheritance (`copyProperties = true`)**: iterates all properties of the pre-conversion `source` block; if the target block has a property with the same name and can parse the same literal value name, copies it over;
3. **Explicit property mapping (`propertyMappings`)**: iterates `Map<String, BlockPropertyMapping>` (keyed by target property name), reads `mapping.source()` from the **same initial `source` snapshot**, copies by literal name if `mapping.values()` is empty, or translates via `values` before applying to the target property.
4. **Automatic double-block preservation**: when `copyProperties` or `propertyMappings` is enabled, `BlockCache#transformBlock` automatically detects double blocks (doors, tall grass, large flowers with `BlockStateProperties.DOUBLE_BLOCK_HALF`), converting both halves while preserving their respective `UPPER` / `LOWER` values.

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

---

## 3. Container-Capacity-Constrained Batch Planning (`ItemBatchPlan` & `IPlannedItemOutcome`)

### 1. Problem & Usage

When an in-world recipe runs multiple consecutive batches inside a capacity-limited container (machine slots, fishbowls, hoppers), two tricky issues arise:
1. **Full-slot deadlock**: Suppose a 1-slot container holds 9 iron ingots to craft 1 iron block. Checking for an empty output slot first would think the container is full; in reality, consuming those 9 ingots frees the slot for the 1 iron block.
2. **Random count & side-effect reentrancy**: If an outcome has a random count (`UniformGenerator`) or `chance`, computing it during planning and calling `acceptWithChance` again on commit would draw different random numbers—potentially fitting during planning and overflowing on commit.

**How `ItemBatchPlan` & `IPlannedItemOutcome` solve this**:
- **`IPlannedItemOutcome#planWithChance(context)`**: draws random numbers and evaluates outcome functions **once** per candidate batch, returning `List<PlannedItem>` with deterministic `ItemStack`s and positions;
- **`ItemBatchPlan.shared` (shared I/O slots) & `ItemBatchPlan.separate` (separate I/O slots)**:
  Simulates up to `limit` batches on an in-memory snapshot. After each batch, checks whether all accumulated deterministic outputs fit into the slots left after deducting consumed ingredients (merging identical components and running memoized backtracking `fillEmpty` for empty slots with distinct item filters).
  Thus, even if batch 1 doesn't fit yet because ingredients haven't been cleared, if batch 2 empties the input slot so the combined outputs fit, the planner selects the longest valid batch prefix!
- **`commit(Consumer<ItemBatchPlan>)`**: first writes the final slot layout `plan.inputs()` / `plan.outputs()` back to the real container in the callback, then executes all `batch.afterCommit(Runnable)` side effects (fuel deduction, block changes, events) on success.

### 2. Full Code Example: Planning & Committing Multi-Batch Container Crafting with `ItemBatchPlan`

```java
package com.example.mymod.machine;

import dev.anvilcraft.lib.v2.recipe.outcome.PlannedItem;
import dev.anvilcraft.lib.v2.recipe.outcome.SpawnItem;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeContext;
import dev.anvilcraft.lib.v2.recipe.util.ItemBatchPlan;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.List;

public final class CompactorBatchProcessor {
    private CompactorBatchProcessor() {
    }

    public static int processCompactor(
        List<ItemStack> sharedInventorySnapshot,
        int maxBatches,
        InWorldRecipeContext context,
        SpawnItem ironBlockOutcome,
        Runnable onEachBatchCommitted
    ) {
        // 1. Plan the longest valid batch prefix on a shared slot snapshot
        ItemBatchPlan plan = ItemBatchPlan.shared(
            sharedInventorySnapshot,
            maxBatches,
            // SlotCapacity: side-effect-free max capacity for a given item in each slot (0 = reject)
            (slot, stack) -> Math.min(64, stack.getMaxStackSize()),
            batch -> {
                // Require 1 anvil as a catalyst in this batch (exclusive to this batch, reusable next batch)
                if (batch.catalyst(stack -> stack.is(Items.ANVIL), 1).isEmpty()) {
                    return false;
                }
                // Reserve and consume 9 iron ingots
                List<ItemStack> consumed = batch.take(stack -> stack.is(Items.IRON_INGOT), 9);
                if (consumed.isEmpty()) {
                    return false;
                }
                // Draw deterministic outputs once for this batch's plan (never re-roll on commit)
                List<PlannedItem> plannedOutputs = ironBlockOutcome.planWithChance(context);
                for (PlannedItem planned : plannedOutputs) {
                    batch.produce(planned.stack());
                }
                // Register side effects to run only if this batch is accepted and committed
                batch.afterCommit(onEachBatchCommitted);
                return true;
            }
        );

        // 2. Commit the plan (if batches() == 0, commit returns safely as a no-op)
        plan.commit(committedPlan -> {
            List<ItemStack> finalLayout = committedPlan.outputs();
            // Write finalLayout back to real container slots...
        });

        return plan.batches();
    }
}
```

---

## 4. Public Classes & Interfaces API Reference

### 1. `IRecipeOutcome<O>`, `IPlannedItemOutcome<O>` & `PlannedItem`

| Interface / Record | Method Signatures | Description |
| :--- | :--- | :--- |
| `IRecipeOutcome<O>` | `Type<O> getType()`<br>`default NumberProvider chance()` (default `1.0f`)<br>`default void acceptWithChance(InWorldRecipeContext context)` | Root recipe outcome interface (extends `Consumer<InWorldRecipeContext>` and `IPrioritized`). `acceptWithChance` rolls `level.getRandom().nextDouble() <= context.getFloat(chance())` and calls `accept(context)` on hit. |
| `IPlannedItemOutcome<O>` | `List<PlannedItem> plan(InWorldRecipeContext context)`<br>`default List<PlannedItem> planWithChance(InWorldRecipeContext context)` | Extends `IRecipeOutcome<O>`. Decouples item output count/component calculation (`plan` / `planWithChance`) from world commit (`PlannedItem#accept`). |
| `PlannedItem` | `public record PlannedItem(ItemStack stack, Vec3 pos)`<br>`public void accept(InWorldRecipeContext context)` | Immutably holds a copy of a deterministic output stack (defensively `copy()`ed on construction and `stack()`) and its target world position `pos`. `accept(context)` writes the item to `ItemCache`. |

### 2. `SpawnItem` (Spawn Item Outcome)

```java
public record SpawnItem(ItemStackTemplate item, Vec3 offset, NumberProvider count, List<IOutcomeFunction<?>> functions)
    implements IPlannedItemOutcome<SpawnItem>
```

- **Block offset integration**: in `plan(context)`, if the block at `context.pos + offset` implements `IRecipeResultOffsetBlock`, `block.getOffset(level, blockPos, state)` is automatically added.
- **Count range**: `context.getInt(this.count, 0, 99)`, clamping single-batch output count to `[0, 99]`.
- **`SpawnItem.Builder` methods**:
  - `offset(Vec3)` / `offset(double, double, double)` / `below(double)` / `below()` / `above(double)` / `above()`
  - `count(NumberProvider)` / `count(float)`
  - `item(ItemStackTemplate)` / `item(Item)` / `item(ItemLike)`
  - `function(IOutcomeFunction<?>...)`
  - `applyComponent(DataComponentType<?> component, Identifier path)`: adds `new ApplyTagToComponent<>(component, path)` to read NBT under `path` from `TagCache` and decode it into the output `ItemStack`'s data component.
  - `SpawnItem.fromChance(ChanceItemStack stack, Vec3 offset)`: static conversion factory.

### 3. `SetBlock` & `BlockPropertyMapping` (Set & Transform Block Outcome)

```java
public record SetBlock(
    BlockState state, CompoundTag nbt, Vec3 offset, NumberProvider chance,
    boolean copyProperties, Map<String, BlockPropertyMapping> propertyMappings
) implements IRecipeOutcome<SetBlock>
```

- **Construction-time validation**: `SetBlock`'s compact constructor iterates `propertyMappings` and throws `IllegalArgumentException("Unknown target property: ...")` if a target property name does not exist on the target block, or `IllegalArgumentException("Invalid target property value: ...")` if a mapped target value cannot be parsed by the target property.
- **`SetBlock.Builder` methods**:
  - `block(BlockState)` / `block(Block)`
  - `nbt(CompoundTag)`: when the target block is an `EntityBlock`, creates a new `BlockEntity` and loads this NBT via `TagValueInput` + `loadWithComponents`.
  - `offset(Vec3)` / `offset(double, double, double)` / `below(...)` / `above(...)`
  - `chance(NumberProvider)` / `chance(float)`
  - `copyProperties()` / `copyProperties(boolean)`: enables or disables automatic inheritance of same-named properties.
  - `mapProperty(String source, String target, Map<String, String> values)` / `mapProperty(String source, String target)`
  - `<S extends Comparable<S>, T extends Comparable<T>> mapProperty(Property<S> source, Property<T> target, Map<S, T> values)` / `mapProperty(Property<?> source, Property<?> target)`: type-safe property mapping.
  - `propertyMappings(Map<String, BlockPropertyMapping>)`

### 4. `SpawnEntity`, `ProduceExplosion` & `ChooseOneOutcome`

| Class | Record Signature & Builder / Core Behavior |
| :--- | :--- |
| `SpawnEntity` | `public record SpawnEntity(EntityType<?> entity, CompoundTag nbt, Vec3 offset, NumberProvider count, NumberProvider chance)`<br>• **Safety restrictions**: forbids spawning players (`entity == EntityTypes.PLAYER` or `Player` in passengers throws `IllegalArgumentException`); recursively strips `UUID`/`uuid` and `Pos`/`pos` from `nbt` and all `Passengers`, assigns fresh random UUIDs, and forces position to `context.pos + offset`.<br>• **Vanilla initialization**: if `nbt.isEmpty()` and the spawned entity is a `Mob`, automatically calls `EventHooks.finalizeMobSpawn(...)` in `afterCommit` (e.g., random gear, attribute bonuses).<br>• `Builder` methods: `entity(EntityType<?>)`, `nbt(CompoundTag)`, `offset(Vec3 / double,double,double)`, `count(NumberProvider / int)`, `chance(NumberProvider / float)`, `build()`. |
| `ProduceExplosion` | `public record ProduceExplosion(Vec3 offset, float power, boolean fire, Level.ExplosionInteraction explodeInteraction, NumberProvider chance)`<br>• Calls `level.explode(null, ctr.x, ctr.y, ctr.z, power, fire, explodeInteraction)` in `context.afterCommit`. |
| `ChooseOneOutcome` | `public record ChooseOneOutcome(NumberProvider chance, List<Choice> choices)`<br>• Child record `Choice(IRecipeOutcome<?> outcome, NumberProvider weight)`.<br>• `Builder` methods: `chance(NumberProvider / float)`, `choice(Choice)`, `choice(IRecipeOutcome<?>, NumberProvider)`, `choice(IRecipeOutcome<?>, float)`, `build()`. |

### 5. `ItemBatchPlan` (Container Batch Planner)

Located in `dev.anvilcraft.lib.v2.recipe.util.ItemBatchPlan`.

| Method / Inner Class Signature | Return Type | Description & Constraints |
| :--- | :--- | :--- |
| `public static ItemBatchPlan separate(List<ItemStack> inputs, List<ItemStack> outputs, int limit, SlotCapacity capacity, Predicate<Batch> recipe)` | `ItemBatchPlan` | Batch planning with separate input and output slots. `limit < 0` throws `IllegalArgumentException`. |
| `public static ItemBatchPlan shared(List<ItemStack> inventory, int limit, SlotCapacity capacity, Predicate<Batch> recipe)` | `ItemBatchPlan` | Batch planning sharing the same slots for input and output (deducts ingredients of selected batches first, then packs accumulated outputs into remaining space). |
| `public List<ItemStack> inputs()` / `public List<ItemStack> outputs()` | `List<ItemStack>` | Returns the final planned input and output slot snapshots (identical in shared mode; only needs to be written once). |
| `public int batches()` | `int` | Returns the number of consecutive batches selected (`0 <= batches <= limit`). |
| `public void commit(Consumer<ItemBatchPlan> inventoryCommit)` | `void` | Commits the plan (**`commit` may only be called once per `ItemBatchPlan` instance**; calling twice throws `IllegalStateException`). If `batches > 0`, invokes `inventoryCommit.accept(this)` first, then runs all `afterCommit` side effects of selected batches on success. |
| `ItemBatchPlan.SlotCapacity` | `int capacity(int slot, ItemStack stack)` | Functional interface returning max capacity of `stack` in `slot` (`0` = reject, `< 0` throws `IllegalArgumentException`). |
| `ItemBatchPlan.Batch` | • `List<ItemStack> take(Predicate<ItemStack> ingredient, int count)`<br>• `List<ItemStack> catalyst(Predicate<ItemStack> ingredient, int count)`<br>• `void produce(ItemStack stack)`<br>• `void afterCommit(Runnable effect)` | Single-batch planning handle (valid only during `recipe.test(batch)`; calling mutators afterward throws `IllegalStateException`). `take` and `catalyst` return an empty list without altering reservations if insufficient items exist. |
