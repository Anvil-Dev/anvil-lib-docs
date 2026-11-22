# World State Caches & Transaction Commit (`BlockCache` / `ItemCache` / `EntityCache` / `TagCache`)

<BranchContextCard branch="26.3" />

During multi-batch matching and assembly of in-world recipes, **never mutate real blocks, item drops, or entities in the world while testing**—otherwise, if a later predicate fails or multiple batches run consecutively (e.g., an anvil smashing 64 stacks at once), it causes massive intermediate block updates, item spawns, and rollback headaches.

`module.recipe` builds a complete in-memory simulation sandbox using four caches attached to `InWorldRecipeContext` (**`BlockCache`**, **`ItemCache`**, **`EntityCache`**, **`TagCache`**), committing all changes to the real world in strict phase order (`order`) only when all batches are planned and `context.accept()` is called.

---

## 1. Commit Order of the Four Caches

When `InWorldRecipeContext#accept()` is called, registered acceptors execute in ascending `(order, key)` order:

| Phase Order (`order`) | Cache Key (`Identifier`) | Action |
| :---: | :--- | :--- |
| **`-100`** | `anvillib:entity_validation` | `EntityCache#validate()`: before any world mutation occurs, verifies all consumed entities are still alive, non-player, and in the current dimension (throws and aborts the entire commit if invalid, preventing partial commits). |
| **`0`** | `anvillib:item_cache` | `ItemCache#endCache()`: syncs all modified `ItemEntity` and `ResourceHandler<ItemResource>` container slots, merges newly spawned identical outputs within `< 0.25` blocks, and spawns them as `ItemEntity`s. |
| **`100`** | `anvillib:block_cache` | `BlockCache#accept()`: writes all changed `BlockState`s and `BlockEntity` NBT to the world; suppresses intermediate neighbor updates on double blocks with `Block.UPDATE_CLIENTS` first, then fires `updateNeighborsAt` once all writes finish. |
| **`150`** | `anvillib:entity_cache` | `EntityCache#commit()`: removes consumed entities within an `EntityDropCapture` scope and collects death drops and XP. |
| **`afterCommit`** | Deferred side-effect queue | After all resource commits succeed, sequentially executes `EntityCache#releaseRewards` (spawning drops and XP orbs), `SpawnEntity` (spawning new entities), `ProduceExplosion` (triggering explosions), and firing `InWorldRecipeCommittedEvent`. |

---

## 2. How External Containers Integrate with `ItemCache`

In addition to ground `ItemEntity` drops, `ItemCache` can read ingredients from and write outputs into **block entities (`BlockEntity`)** or **entities (`Entity`)** within the trigger region via two approaches:

1. **Approach A: Implement `ItemResourceHandlerCache` (Recommended, supports separate input/output)**:
   Have your `BlockEntity` or `Entity` implement `dev.anvilcraft.lib.v2.recipe.cache.ItemResourceHandlerCache`, returning NeoForge `ResourceHandler<ItemResource>` for `getInput()` and `getOutput()`. If input and output views map to the same physical slot, the wrapper can also implement `ItemCacheSlotProvider` to normalize them to the same physical slot.
2. **Approach B: Vanilla `Container` + Tag Whitelist**:
   If a block entity or entity implements vanilla `net.minecraft.world.Container`, simply add its type to the corresponding tag:
   - Block entity type tag: `LibBlockEntityTags.ITEM_CACHE` (`#anvillib:item_cache`)
   - Entity type tag: `LibEntityTypeTags.ITEM_CACHE` (`#anvillib:item_cache`)
   `ItemCache` automatically wraps it as a `ResourceHandler<ItemResource>` via `VanillaContainerWrapper.of(container)`.

### Full Code Example: Machine BlockEntity Implementing `ItemResourceHandlerCache` & `ItemCacheSlotProvider`

```java
package com.example.mymod.block.entity;

import dev.anvilcraft.lib.v2.recipe.cache.ItemResourceHandlerCache;
import dev.anvilcraft.lib.v2.recipe.cache.item.ItemCacheSlotProvider;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.neoforge.transfer.ResourceHandler;
import net.neoforged.neoforge.transfer.item.ItemResource;

public class BasinBlockEntity extends BlockEntity implements ItemResourceHandlerCache {
    private final ResourceHandler<ItemResource> physicalInventory;

    public BasinBlockEntity(
        BlockEntityType<?> type,
        BlockPos pos,
        BlockState state,
        ResourceHandler<ItemResource> physicalInventory
    ) {
        super(type, pos, state);
        this.physicalInventory = physicalInventory;
    }

    @Override
    public ResourceHandler<ItemResource> getInput() {
        return this.physicalInventory;
    }

    @Override
    public ResourceHandler<ItemResource> getOutput() {
        return this.physicalInventory;
    }
}
```

---

## 3. Four Caches & Subcomponent API Reference

### 1. `BlockCache` (BlockState & BlockEntity Simulation Cache)

Located in `dev.anvilcraft.lib.v2.recipe.cache.BlockCache`. Obtained via `context.computeIfAbsent(BlockCache.BLOCK_CACHE)`.

| Constant / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `BlockCache.BLOCK_CACHE` | `InWorldRecipeData<BlockCache>` | Data key `anvillib:block_cache`. |
| `BlockCache.DEFAULT_ACCEPTOR` | `Consumer<InWorldRecipeContext>` | Default commit callback `ctx -> ctx.get(BLOCK_CACHE).accept()`. |
| `public void beginBatch()` | `void` | Clears `batchSources` for the current batch so the next batch uses the current simulated world state as its property-inheritance source. |
| `public BlockState getSourceState(BlockPos pos)` | `BlockState` | Gets the block state snapshot at `pos` at the start of the current batch (so even if `HasBlockIngredient` deletes the block to air in the same batch, a subsequent `SetBlock` can still read the original block state for property inheritance). |
| `public BlockState getBlockState(BlockPos pos)` | `BlockState` | Reads the simulated block state at `pos` (loaded from the real world into `cache` and `simulated` on first access). |
| `public @Nullable BlockEntity getBlockEntity(BlockPos pos)` | `@Nullable BlockEntity` | Reads the simulated block entity at `pos`. |
| `public void setBlock(BlockPos pos, @Nullable BlockState state)` / `setBlock(BlockPos pos, @Nullable Block block)` | `void` | Sets a block state in the simulation cache. If the original block was a complete double block (`DOUBLE_BLOCK_HALF`), automatically updates or clears the other half and queues both positions in `deferredNeighborUpdates`. |
| `public List<BlockPos> transformBlock(BlockPos pos, UnaryOperator<BlockState> transform)` | `List<BlockPos>` | Applies `transform` based on `getSourceState(pos)` (for double blocks, transforms both halves while preserving their `HALF` values) and returns the modified positions. |
| `public void setBlockEntity(BlockPos pos, @Nullable BlockEntity entity)` | `void` | Sets a block entity at `pos` in the simulation cache. |
| `public void removeBlock(BlockPos pos)` | `void` | Sets `pos` to `Blocks.AIR` and clears its block entity in the simulation cache. |
| `public void accept()` | `void` | Writes all `simulated` block states and `simulatedEntity` NBT differing from `cache` to the real world. |

### 2. `ItemCache` & `dev.anvilcraft.lib.v2.recipe.cache.item.*` (Item Cache System)

Obtained via `context.computeIfAbsent(ItemCache.ITEM_CACHE)`.

| Class / Interface | Key Method Signatures | Description |
| :--- | :--- | :--- |
| `ItemCache` | • `ITEM_CACHE` / `DEFAULT_ACCEPTOR`<br>• `void grow(Vec3 pos, Vec3 range)`<br>• `boolean inRange(Vec3 pos, Vec3 range)`<br>• `ICacheInput getInput(Predicate<ItemStack>, Vec3 pos, Vec3 range, Predicate<ICacheElement> sourceFilter)` (and `ItemLike` / `ItemStack` overloads)<br>• `ICacheOutput getOutput(ItemStack stack, Vec3 pos, Vec3 range, Predicate<ICacheElement> sourceFilter)`<br>• `boolean isAvailable(ICacheElement)` / `void reserveItem(ICacheElement)` / `void releaseItem(ICacheElement)`<br>• `void endCache()` | Manages all `ICacheElement`s in the scanned region.<br>**Mutual exclusion with `EntityCache`**: when items inside a container entity (e.g., chest minecart) are occupied by `ItemCache` (`itemUses > 0`), `EntityCache` forbids consuming that entity as a whole entity ingredient; conversely, if the entity is already reserved by `EntityCache`, `isAvailable(element)` returns `false` to prevent accessing its items. |
| `ICacheInput` | • `int shrink(int count)` / `int rollbackShrink()`<br>• `void clearStack()` / `void sync()`<br>• `int getCount()` / `void apply(Consumer<ItemStack>)`<br>• `boolean supportsConsumptionReceipts()`<br>• `List<ItemStack> getConsumedItems()` / `void clearConsumedItems()` / `void restoreConsumedItems()`<br>• `Optional<Map<ICacheElement, Integer>> availableElements()` | Item input view interface. Supports consumption receipts with exact component snapshots (`ItemConsumption`) and returning catalysts to their original slots (`restoreConsumedItems`). |
| `ICacheOutput` | • `ItemStack grow(ItemStack stack, boolean spawn)`<br>• `ItemStack rollbackGrow()`<br>• `void clearStack()` / `void sync()` | Item output view interface. When `grow(stack, true)` fills existing container slots, remaining items are recorded in `SpawnOperation` to spawn new drops. |
| `ICacheElement` / `AbstractCacheElement` | • `ItemEntityCacheElement` (wraps ground `ItemEntity` or pending new `ItemEntity`)<br>• `ItemResourceHandlerCacheElement` (wraps a single slot of NeoForge `ResourceHandler<ItemResource>`; `sync()` uses `Transaction.openRoot()` to sync deltas only, compatible with output-only slots that reject insertion) | Simulated cache implementation for a single physical item source (one `ItemEntity` or one container slot). |
| `ItemCacheSlotProvider` | `Slot getItemCacheSlot(int slot)` / `record Slot(ResourceHandler<ItemResource> handler, int slot)` | Implemented by different wrapper views exposing the same physical inventory so `ItemCache` normalizes them to the same `ItemResourceHandlerCacheElement` (throws `IllegalArgumentException("Cyclic item cache slot mapping")` if a cycle is detected). |
| `ItemConsumption` / `CacheOperation` / `InputOutputOperation` / `SpawnOperation` | — | Transaction stack nodes and exact component snapshots for single item shrink/grow/spawn operations. |

### 3. `EntityCache` & `EntityDropCapture` (Entity Reservation & Drop Interception)

Obtained via `context.computeIfAbsent(EntityCache.ENTITY_CACHE)`.

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| `EntityCache` | • `ENTITY_CACHE`<br>• `boolean isReserved(Entity entity)`<br>• `List<Entity> find(Vec3 offset, Vec3 range, EntityPredicate predicate, boolean ingredient)`<br>• `void reserve(List<Entity> entities)`<br>• `void release(List<Entity> entities)`<br>• `void consume(List<Entity> entities, float multiplier, boolean dropItems)` | • `find`: deterministically returns matching entities in range sorted by squared distance to center ascending, then `UUID` ascending (when `ingredient == true`, excludes `Player` and entities whose items are occupied by `ItemCache`).<br>• `reserve` / `release`: locks or rolls back entity reservations during matching.<br>• `consume`: registers entities to be consumed along with XP multiplier and drop-items flag. |
| `EntityDropCapture` | `public EntityDropCapture(ServerLevel level)`<br>`public static boolean capture(Entity entity)`<br>`public List<ItemEntity> drops()`<br>`public void close()` | Implements `AutoCloseable`, intercepting newly added `ItemEntity`s via `ServerLevelMixin` during `entity.discard()` or `dropAllDeathLoot`:<br>• If `dropItems = false`, intercepted container spills are discarded instead of leaking into the world;<br>• If `dropItems = true`, intercepted drops are staged in `EntityCache.drops` and spawned safely during `afterCommit` so they do not interfere with subsequent item matching in the current context. |

### 4. `TagCache` (Cross-Stage Component NBT Transfer Cache)

Obtained via `context.computeIfAbsent(TagCache.TAG_CACHE)`.

| Constant / Method Signature | Description |
| :--- | :--- |
| `TagCache.TAG_CACHE` | Data key `anvillib:tag_cache`. |
| `public @Nullable Tag getTag(Identifier id)` / `public void putTag(Identifier id, Tag tag)` / `public void computeIfAbsent(Identifier id, Function<Identifier, Tag> tag)` | Passes arbitrary NBT `Tag`s by `Identifier` between predicate functions (e.g., `SaveComponentToTag`) and outcome functions (e.g., `ApplyTagToComponent`) within the same batch (`beginBatch()` clears `tags`). |
