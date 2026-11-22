# Recipe Context, Pruning Manager, Events & Extensions (`util` / `event` / `injection`)

<BranchContextCard branch="26.2" />

This page covers `module.recipe`'s runtime execution core: **`InWorldRecipeContext`** (holding single-trigger state), **`InWorldRecipeManager`** (with a built-in bipartite block-constraint pruner), **`ShapelessMatcher`** (capacity-prechecked unordered matcher), the lifecycle event system, and injected extensions on vanilla `RecipeManager` / `RecipeMap`.

---

## 1. `InWorldRecipeManager` & Bipartite Block Pruning (`PrunePlan`)

When hundreds of in-world recipes are registered under a trigger (such as `item_into_block`), calling `matches(ctx, level)` on every recipe each time an item moves would waste significant CPU.

During `register(RecipeHolder<InWorldRecipe>)`, `InWorldRecipeManager` automatically extracts all `HasBlock` / `HasBlockIngredient` predicates with constrained block sets from each recipe, building a **bipartite pruning plan (`PrunePlan`) grouped by relative `offset`**:
1. Conditions sharing the same normalized `offset` and allowed block set (`TagKey<Block>` or sorted `Identifier` list) are merged into a single shared `JudgeNode`;
2. When `trigger(trigger, ctx)` is called, all nodes at the same `offset` **read `BlockCache#getBlockState` only once**;
3. If a `JudgeNode` evaluates `cannotMatch(state)` as `true`, it vetoes all recipe slots depending on it (`slot.fails++`); if all indexed candidate recipes are vetoed (`alive == 0`), it returns early immediately!
4. Surviving candidate recipes are tried in descending `priority` order (tie-breaking by recipe `Identifier` lexicographical order) for up to `min(CONFIG.inWorldRecipeMaxEfficiency, recipe.maxEfficiency())` batches; once a recipe succeeds (`accept == true`), lower-priority recipes are skipped.

---

## 2. Full Code Example: Listening to In-World Recipe Events & Filtering Output Containers

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import com.example.mymod.block.entity.ProtectedVaultBlockEntity;
import dev.anvilcraft.lib.v2.recipe.event.InWorldRecipeCommittedEvent;
import dev.anvilcraft.lib.v2.recipe.event.InWorldRecipeEvent;
import dev.anvilcraft.lib.v2.recipe.event.ItemCacheEvent;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class RecipeEventExample {
    private RecipeEventExample() {
    }

    /**
     * 1. Fired right after a single recipe batch finishes assembling in cache (before writing to the real world)
     */
    @SubscribeEvent
    public static void onRecipeAssembled(InWorldRecipeEvent event) {
        MyMod.LOGGER.debug("Recipe {} assembled batch {}", event.getId(), event.getContext().getBatchId());
    }

    /**
     * 2. Fired after context.accept() successfully commits all block, item, and entity changes to the real world
     *    Ideal for playing crafting sounds, spawning particles, or granting advancements
     */
    @SubscribeEvent
    public static void onRecipeCommitted(InWorldRecipeCommittedEvent event) {
        Vec3 pos = event.getContext().getPos();
        // Play sounds or spawn particles...
    }

    /**
     * 3. Intercept ItemCache output selection: forbid recipe outputs from entering protected vault containers
     */
    @SubscribeEvent
    public static void onSelectOutput(ItemCacheEvent.SelectOutput event) {
        if (event.getElement().getSource() instanceof ProtectedVaultBlockEntity) {
            // Once canceled, this container is skipped; if no other container is available, outputs spawn normally as ItemEntity drops
            event.setCanceled(true);
        }
    }

    /**
     * 4. Fired before a recipe output spawns into the world as a new ItemEntity (e.g., to grant no-gravity or blast resistance)
     */
    @SubscribeEvent
    public static void onSpawnOutputEntity(ItemCacheEvent.SpawnItemEntity event) {
        event.getEntity().setUnlimitedLifetime();
    }
}
```

---

## 3. Public Utility API Reference (`dev.anvilcraft.lib.v2.recipe.util`)

### 1. `InWorldRecipeContext` (In-World Recipe Context)

Implements vanilla `net.minecraft.world.item.crafting.RecipeInput`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public InWorldRecipeContext(ServerLevel level, Vec3 pos, Entity entity)` | — | Constructs a context: `level` is the server level, `pos` is the trigger origin, and `entity` is the associated trigger entity (nullable). |
| `getLevel()` / `getPos()` / `getEntity()` / `getBatchId()` / `getStack()` | Corresponding type | Returns the level, origin position, trigger entity, current batch ID (incremented by 1 on each `beginBatch()`), and current predicate match stack. |
| `public void push(IRecipePredicate<?> predicate)` / `public void pop(IRecipePredicate<?> predicate)` | `void` | Pushes `predicate` onto the match stack and calls `predicate.snapshot(this)`, or pops from the top and calls `predicate.rollback(this)` (throws `IllegalStateException` if the popped element is not the stack top). |
| `public <T> void put(InWorldRecipeData<T> key, T value)`<br>`public <T> T get(InWorldRecipeData<T> key)`<br>`public <T> T computeIfAbsent(InWorldRecipeData<T> key)` | — / `T` | Gets/sets context-level cached objects by `InWorldRecipeData<T>` key (such as `BLOCK_CACHE`, `ITEM_CACHE`, `ENTITY_CACHE`, `TAG_CACHE`). |
| `public <T> T computeByIdentity(Object key, Supplier<T> supplier)` | `T` | Caches per-predicate-instance private matching state by object identity (`==`) using `IdentityHashMap`, preventing two equal-field predicate instances from sharing state. |
| `public void putAcceptor(Identifier key, Consumer<InWorldRecipeContext> acceptor)`<br>`public void putAcceptor(Identifier key, int order, Consumer<InWorldRecipeContext> acceptor)` | `void` | Registers a resource commit callback (the no-`order` overload assigns `0` to `item_cache`, `100` to `block_cache`, and `200` to others). |
| `public void beginBatch()` | `void` | Starts a new `assemble` batch: clears `TagCache`, calls `BlockCache#beginBatch()`, and increments `batchId` by 1. |
| `public void afterCommit(Runnable action)` | `void` | Registers a deferred side effect to run only after all `acceptors` commit successfully. |
| `public void accept()` | `void` | Runs all `acceptors` in ascending `order`, marks `completed = true`, and runs all `afterCommit` callbacks. Calls `invalidate()` automatically if an exception is thrown. |
| `public void invalidate()` / `public void assertPlanning()` | `void` | Invalidates the context, or asserts that the context is still in the uncommitted, non-invalidated planning phase. |
| `getFloat(NumberProvider, ...)` / `getInt(NumberProvider, ...)` | `float` / `int` | Evaluates `NumberProvider` using `emptyLootContext()`, optionally clamping to `[min, max]` or `<= max`. |
| `public RegistryOps<Tag> getNbtRegistryOps()` | `RegistryOps<Tag>` | Returns the `NbtOps.INSTANCE` serialization context bound to the current level's `registryAccess()`. |

### 2. `InWorldRecipeManager`, `InWorldRecipeData<T>`, `ShapelessMatcher`, `Range`, `IPrioritized` & `IRecipeResultOffsetBlock`

| Class / Interface | Public Method Signatures | Description |
| :--- | :--- | :--- |
| `InWorldRecipeManager` | • `public final Multimap<IRecipeTrigger, RecipeHolder<InWorldRecipe>> recipeHolders`<br>• `public void register(RecipeHolder<InWorldRecipe> recipe)`<br>• `public void trigger(IRecipeTrigger trigger, InWorldRecipeContext ctx)`<br>• `public void trigger(Supplier<IRecipeTrigger> trigger, InWorldRecipeContext ctx)` | Manages all in-world recipes and runs `PrunePlan` pruning followed by priority-ordered matching and assembly on `trigger`. |
| `InWorldRecipeData<T>` | `public record InWorldRecipeData<T>(Identifier location, BiFunction<InWorldRecipeContext, InWorldRecipeData<T>, T> supplier)`<br>• `of(Identifier, T defaultValue)`<br>• `of(Identifier, BiFunction<...>)`<br>• `of(Identifier)` | Type-safe data key for `InWorldRecipeContext`. |
| `ShapelessMatcher` | • `public static boolean compatible(List<IRecipePredicate<?>> predicates, InWorldRecipeContext ctx)`<br>• `public static boolean incompatible(List<IRecipePredicate<?>> predicates, InWorldRecipeContext ctx)` | • `compatible`: sequentially calls `test` + `ctx.push` in list order;<br>• `incompatible`: prechecks total slot capacity across `HasItemIngredient` candidates via `checkItemCapacity` (returns `IMPOSSIBLE` `false` if total demand exceeds supply; degrades to `LINEAR` sequential matching if candidate sources are disjoint), otherwise runs `backtrack` permutation search. |
| `Range` | • `Range.EMPTY`<br>• `public Range(Vec3 start, Vec3 end)`<br>• `public static Range of(Vec3 pos, Vec3 range)`<br>• `contains(Range)` / `contains(Vec3, Vec3)`<br>• `cross(Range)` / `cross(Vec3, Vec3)`<br>• `grow(Range)` / `isEmpty()`<br>• `toAABB()` / `toAABB(Vec3 offset)`<br>• `iterator()` (`Iterable<BlockPos>`) | Represents a 3D axis-aligned region; implements `Iterable<BlockPos>` so `for (BlockPos pos : range)` iterates all intersecting block positions. |
| `IPrioritized` | `default int priority()` (default `1`)<br>`default int compareTo(IPrioritized o)` | Priority comparison interface. Higher values sort earlier. |
| `IRecipeResultOffsetBlock` | `Vec3 getOffset(Level level, BlockPos pos, BlockState state)` | Blocks implementing this interface add the returned offset vector when a `SpawnItem` outcome lands at that block (e.g., hoppers or chutes directing outputs to a spout). |

---

## 4. Event List (`dev.anvilcraft.lib.v2.recipe.event`)

All events are posted on **`NeoForge.EVENT_BUS`**:

| Event Class | Cancellable | Fields (Getters) & Timing |
| :--- | :---: | :--- |
| `InWorldRecipeEvent` | No | `recipeType`, `id`, `recipe`, `context`. Fired immediately after a single batch `recipe.assemble(ctx)` completes (changes are still in cache, prior to `accept()`). |
| `InWorldRecipeCommittedEvent` | No | `recipeType`, `id`, `recipe`, `context`, `batchId`. Registered via `ctx.afterCommit` and fired per batch after all cached changes commit to the real world. |
| `InWorldRecipeManagerEvent` / `InWorldRecipeManagerEvent.Init` | No | `manager`, `recipeManager`. Fired after datapack recipes load and `RecipeManager` initializes `InWorldRecipeManager`, allowing external mods to inject code-generated `InWorldRecipe`s. |
| `ItemCacheEvent.SelectOutput` | **Yes (`ICancellableEvent`)** | `cache`, `stack`, `pos`, `range`, `element`. Fired when `ItemCache#getOutput` filters candidate output containers/item entities; `setCanceled(true)` skips outputting to `element`. |
| `ItemCacheEvent.SpawnItemEntity` | No | `cache`, `entity`. Fired right before `ItemCache` adds a newly spawned output `ItemEntity` to the world (`level.addFreshEntity`) during commit. |
| `ItemEntityEvent` / `ItemEntityEvent.InToBlock` | No | `level`, `entity`, `blockPos`, `pos`, `motion`. Fired when an `ItemEntity` moves or enters a new block position in `ItemEntityMixin` (internal listener triggers `LibRecipeTriggers.ITEM_INTO_BLOCK`). |

---

## 5. Vanilla `RecipeManager` & `RecipeMap` Interface Injection (`injection`)

With `interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.2:...")` configured, you can call these extension methods on vanilla `RecipeManager` and `RecipeMap` (marked `@ApiStatus.Internal`):

| Target Class | Injected Interface | Method Signature | Description |
| :--- | :--- | :--- | :--- |
| `RecipeManager` | `IRecipeManagerExtension` | `InWorldRecipeManager anvillib$getInWorldRecipeManager()` | Returns the `InWorldRecipeManager` instance held by this `RecipeManager`. |
| `RecipeManager` | `IRecipeManagerExtension` | `void anvillib$setInWorldRecipeManager(InWorldRecipeManager manager)` | Sets the `InWorldRecipeManager` instance. |
| `RecipeManager` | `IRecipeManagerExtension` | `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>> recipes)` | Dynamically appends a batch of `InWorldRecipe`s to this `RecipeManager`. |
| `RecipeMap` | `IRecipeMapExtension` | `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>> recipes)` | Dynamically appends a batch of `InWorldRecipe`s to the underlying `RecipeMap`. |
