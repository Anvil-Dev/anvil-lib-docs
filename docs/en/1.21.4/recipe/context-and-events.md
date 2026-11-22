# Execution Context, Pruning Manager & Events (`Context` / `Manager` / `Events`)

<BranchContextCard branch="1.21.4" />

This page dives into `module.recipe`'s runtime core: **`InWorldRecipeContext`**'s two-phase commit state machine, **`InWorldRecipeManager`**'s bipartite block-constraint pruning (`PrunePlan`), **`ShapelessMatcher`**, `RecipeManager` / `RecipeMap` interface injection extensions, and the **5 recipe events** and helper utilities.

---

## 1. `InWorldRecipeContext` Two-Phase Commit State Machine & Context API

`InWorldRecipeContext` implements vanilla `RecipeInput` (empty: `size() == 0`, `isEmpty() == true`) to hold position, level, trigger entity, custom data, rollback stack, and deferred commit actions during a single trigger lifecycle:

1. **Planning Phase**:
   - In `matches(...)`, `push(IRecipePredicate<?>)` pushes onto the stack and calls `predicate.snapshot(this)`; on failure/backtrack, `pop(IRecipePredicate<?>)` calls `predicate.rollback(this)`;
   - In `assemble(...)`, `beginBatch()` increments `batchId`, clears `TagCache`, and calls `BlockCache#beginBatch()`, then runs predicates' `accept`, outcomes' `acceptWithChance`, and predicates' `clearStack`.
2. **Commit Phase**:
   - Calling `context.accept()` runs `acceptors` in ascending `(order, key)` order (if any step throws, immediately calls `invalidate()` to abort and rethrows);
   - Once all resources commit, marks `completed = true` and runs the `afterCommit` queue (idempotent: calling `accept()` again when completed is a no-op; calling when `invalid` throws `IllegalStateException`).

### Full Method Table for `InWorldRecipeContext` & `InWorldRecipeData`

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| **`InWorldRecipeContext`** | `InWorldRecipeContext(ServerLevel level, Vec3 pos, Entity entity)` | Constructs an in-world recipe context. |
| **`InWorldRecipeContext`** | `ServerLevel getLevel()` / `Vec3 getPos()` / `Entity getEntity()` / `long getBatchId()` | Gets the server level, reference position, trigger entity, and current batch ID. |
| **`InWorldRecipeContext`** | `void push(IRecipePredicate<?>)` / `void pop(IRecipePredicate<?>)` / `List<IRecipePredicate<?>> getStack()` | Pushes/pops the predicate rollback stack (`pop` requires the argument to be at the stack top). |
| **`InWorldRecipeContext`** | `<T> void put(InWorldRecipeData<T>, T)` / `<T> T get(InWorldRecipeData<T>)` / `<T> T computeIfAbsent(InWorldRecipeData<T>)` | Reads/writes context-scoped data by `InWorldRecipeData` key (`get` returns the supplier default without storing if absent; `computeIfAbsent` stores it). |
| **`InWorldRecipeContext`** | `<T> T computeByIdentity(Object key, Supplier<T> supplier)` | Caches per-predicate-instance private state by object identity (`IdentityHashMap`). |
| **`InWorldRecipeContext`** | `void putAcceptor(ResourceLocation key, Consumer<InWorldRecipeContext>)`<br>`void putAcceptor(ResourceLocation key, int order, Consumer<InWorldRecipeContext>)` | Registers a resource commit callback; the 2-arg overload maps `item_cache -> 0`, `block_cache -> 100`, others `-> 200`. |
| **`InWorldRecipeContext`** | `void beginBatch()` / `afterCommit(Runnable)` / `invalidate()` / `assertPlanning()` / `accept()` | Lifecycle control and two-phase commit entry points. |
| **`InWorldRecipeContext`** | `LootContext emptyLootContext()`<br>`float getFloat(NumberProvider[, float min, float max] / max)`<br>`int getInt(NumberProvider[, int min, int max] / max)` | Evaluates `NumberProvider` in an empty `LootContext` (based on `ContextMap.EMPTY`), optionally clamping to a range. |
| **`InWorldRecipeContext`** | `RegistryOps<Tag> getNbtRegistryOps()` | Returns an `NbtOps` serialization context bound to the current level's `registryAccess()`. |
| **`InWorldRecipeData<T>`** | `static <T> InWorldRecipeData<T> of(ResourceLocation, T defaultValue)`<br>`static <T> InWorldRecipeData<T> of(ResourceLocation, BiFunction<InWorldRecipeContext, InWorldRecipeData<T>, T>)`<br>`static <T> InWorldRecipeData<T> of(ResourceLocation)` | Creates a strongly typed context data key. |

---

## 2. `InWorldRecipeManager` & `RecipeManager` / `RecipeMap` Interface Injection

`ResourceEventListener` creates a fresh `InWorldRecipeManager` on `ServerStartedEvent` and `OnDatapackSyncEvent`, posts `InWorldRecipeManagerEvent.Init`, and registers all `InWorldRecipe`s sorted by `IPrioritized` descending (`priority()` reversed) then recipe ID `holder.id().location()` ascending.

| Extension Interface | Target Class | Method Signatures | Description |
| :--- | :--- | :--- | :--- |
| **`IRecipeManagerExtension`** | `RecipeManager` | • `void anvillib$setInWorldRecipeManager(InWorldRecipeManager)`<br>• `InWorldRecipeManager anvillib$getInWorldRecipeManager()`<br>• `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>>)`<br>• `@Deprecated HolderLookup.Provider anvillib$getRegistries()` | Reads/writes `InWorldRecipeManager` on the server; `anvillib$addRecipes` delegates to `IRecipeMapExtension` on `this.recipes`. |
| **`IRecipeMapExtension`** | `RecipeMap` | `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>>)` | Incrementally merges programmatically generated `InWorldRecipe`s into the immutable `RecipeMap`'s `byKey` and `byType`. |

### Pruning Workflow (`PrunePlan`)
1. **Graph construction on `register(RecipeHolder<InWorldRecipe>)`**: Extracts all `HasBlockBase` predicates with non-empty block sets, merges conditions sharing the same normalized `offset` and block-set key into shared `JudgeNode`s, and wires them to recipe slots;
2. **Pruning on `trigger(IRecipeTrigger / Supplier<IRecipeTrigger>, InWorldRecipeContext)`**:
   - Runs on server only (`if (ctx.getLevel().isClientSide()) return;`);
   - Reads `BlockCache#getBlockState` once per `OffsetGroup` and runs `BlockStatePredicate#cannotMatch(state)` broadphase: on failure, vetoes all connected recipe slots, returning early if no active slots remain under the trigger;
   - Evaluates surviving candidates from highest to lowest priority; once a recipe succeeds for at least 1 batch (up to `Math.min(recipe.maxEfficiency(), AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency)` batches), stops trying lower-priority recipes so **one set of ingredients is never consumed twice**;
   - Posts `InWorldRecipeEvent` (`holder.id().location()`) after each assembled batch and schedules `InWorldRecipeCommittedEvent(..., batchId)` via `ctx.afterCommit`.

---

## 3. `ShapelessMatcher`, `IPrioritized`, `IRecipeResultOffsetBlock` & `Range`

| Class / Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| **`ShapelessMatcher`** | `static boolean compatible(List<IRecipePredicate<?>>, InWorldRecipeContext)` | Sequentially calls `test` and `push` in list order, returning `false` on the first failure. |
| **`ShapelessMatcher`** | `static boolean incompatible(List<IRecipePredicate<?>>, InWorldRecipeContext)` | If all predicates are `HasItemIngredient` with `availableElements()`, runs fast capacity feasibility and disjointness checks first (returning `false` if impossible, or linear `compatible` if disjoint), else runs full permutation `backtrack`. |
| **`IPrioritized`** | `default int priority()` / `default int compareTo(IPrioritized o)` | Priority interface: defaults to `priority() == 1`; `compareTo` sorts in **descending** priority order (returns `1` for distinct objects of equal priority). |
| **`IRecipeResultOffsetBlock`** | `Vec3 getOffset(Level level, BlockPos pos, BlockState state)` | Blocks implementing this interface add the returned offset when `SpawnItem` outputs inside them. |
| **`Range`** | `static Range of(Vec3 pos, Vec3 range)`, `contains(...)`, `cross(...)`, `grow(Range)`, `isEmpty()`, `toAABB([Vec3 offset])`, `iterator()` | 3D AABB region utility implementing `Iterable<BlockPos>`, used by `ItemCache` and `EntityCache` for spatial scanning. |

---

## 4. The 5 Events & Listener Example

All events are posted on **`NeoForge.EVENT_BUS`**:

| Event Class | Superclass / Traits | Timing & Fields |
| :--- | :--- | :--- |
| **`InWorldRecipeManagerEvent.Init`** | `InWorldRecipeManagerEvent` | Fired whenever `InWorldRecipeManager` is rebuilt before iterating vanilla `RecipeManager`; carries `manager` and `recipeManager` for registering programmatic `InWorldRecipe`s in code. |
| **`InWorldRecipeEvent`** | `Event` | Fired after a single batch `recipe.assemble(...)` finishes and **before committing to the world**; carries `recipeType`, `id` (`ResourceLocation`), `recipe`, `context`. |
| **`InWorldRecipeCommittedEvent`** | `Event` | Fired after `context.accept()` writes all resources and runs deferred side effects; carries `recipeType`, `id`, `recipe`, `context`, `batchId`. Note: all batches in a trigger share one `context`, so do not read `TagCache` here after subsequent batches cleared it. |
| **`ItemCacheEvent.SelectOutput`** | `ItemCacheEvent` / **`ICancellableEvent`** | Fired when `ItemCache#getOutput` filters an existing container slot or ground item stack as an output target; carries `cache`, `stack` (copy), `pos`, `range`, `element`. **Canceling prevents merging outputs into that slot/stack** (other slots or a new `ItemEntity` can still be used). |
| **`ItemCacheEvent.SpawnItemEntity`** | `ItemCacheEvent` | Fired right before `ItemCache#endCache` or `ItemEntityCacheElement#sync` calls `addFreshEntity(entity)` for a new `ItemEntity`; carries `cache` and `entity` for tweaking velocity, pickup delay, etc. |
| **`ItemEntityEvent.InToBlock`** | `ItemEntityEvent` (`EntityEvent`) | Fired when an `ItemEntity` enters a new `BlockPos` during `tick`; carries `level`, `entity`, `blockPos`, `pos`, `motion`. |

### Code Example: Listening to Commit Events & Blocking Output Insertion into a Specific Container

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.event.InWorldRecipeCommittedEvent;
import dev.anvilcraft.lib.v2.recipe.event.ItemCacheEvent;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class ModRecipeEvents {
    private ModRecipeEvents() {
    }

    @SubscribeEvent
    public static void onSelectOutput(ItemCacheEvent.SelectOutput event) {
        // Example: prevent recipe outputs from auto-merging into a held or specific cache element
        if (event.getElement().getSourceSlot() == 0) {
            event.setCanceled(true);
        }
    }

    @SubscribeEvent
    public static void onRecipeCommitted(InWorldRecipeCommittedEvent event) {
        Vec3 pos = event.getContext().getPos();
        // Play sounds or spawn particles after world changes are fully committed
        event.getContext().getLevel().levelEvent(1031, net.minecraft.core.BlockPos.containing(pos), 0);
    }
}
```
