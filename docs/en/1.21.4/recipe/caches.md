# World State Caches & Transaction Commit (`BlockCache` / `ItemCache` / `EntityCache` / `TagCache`)

<BranchContextCard branch="1.21.4" />

During multi-batch matching and assembly of in-world recipes, **never mutate real blocks, item drops, or entities in the world while testing**—otherwise, if a later predicate fails or multiple batches run consecutively (e.g., crafting 64 stacks in one trigger), it causes massive intermediate block updates, item spawns, and rollback headaches.

`module.recipe` builds a complete in-memory simulation sandbox using four caches attached to `InWorldRecipeContext` (**`BlockCache`**, **`ItemCache`**, **`EntityCache`**, **`TagCache`**), committing all changes to the real world in strict phase order (`order`) only when all batches are planned and `context.accept()` is called.

---

## 1. Commit Order of the Four Caches

When `InWorldRecipeContext#accept()` is called, registered acceptors execute in ascending `(order, key)` order:

| Phase Order (`order`) | Cache Key (`ResourceLocation`) | Action |
| :---: | :--- | :--- |
| **`-100`** | `anvillib:entity_validation` | `EntityCache#validate()`: before any world mutation occurs, verifies all consumed entities are still alive, non-player, and in the current dimension (throws and aborts the entire commit if invalid, preventing partial commits). |
| **`0`** | `anvillib:item_cache` | `ItemCache#endCache()`: syncs all modified `ItemEntity` and `IItemHandler` container slots, merges newly spawned identical outputs within `< 0.25` blocks, and spawns them as `ItemEntity`s. |
| **`100`** | `anvillib:block_cache` | `BlockCache#accept()`: writes all changed `BlockState`s and `BlockEntity` NBT to the world; suppresses intermediate neighbor updates on double blocks with `Block.UPDATE_CLIENTS` first, then fires `updateNeighborsAt` once all writes finish. |
| **`150`** | `anvillib:entity_cache` | `EntityCache#commit()`: removes consumed entities within an `EntityDropCapture` scope and collects death drops and XP. |
| **`afterCommit`** | Deferred side-effect queue | After all resource commits succeed, sequentially executes `EntityCache#releaseRewards` (spawning drops and XP orbs), `SpawnEntity` (spawning new entities), `ProduceExplosion` (triggering explosions), and firing `InWorldRecipeCommittedEvent`. |

---

## 2. How External Containers Integrate with `ItemCache`

In addition to ground `ItemEntity` drops, `ItemCache` can read ingredients from and write outputs into **block entities (`BlockEntity`)** or **entities (`Entity`)** within the trigger region via two approaches:

1. **Approach A: Implement `IItemHandlerCache` (Recommended, supports separate input/output)**:
   Have your `BlockEntity` or `Entity` implement `dev.anvilcraft.lib.v2.recipe.cache.IItemHandlerCache`, returning NeoForge `IItemHandler` for `getInput()` and `getOutput()`. If input and output views point to the same physical slot, implement `ItemCacheSlotProvider` on the wrapper to map back to the same physical slot (cycle detection throws `IllegalArgumentException`).
2. **Approach B: Implement `IItemHandler` Directly + Tag Whitelist**:
   If your block entity or entity implements `net.neoforged.neoforge.items.IItemHandler`, add its type to the corresponding tag (resolved via `BuiltInRegistries.BLOCK_ENTITY_TYPE.get(LibBlockEntityTags.ITEM_CACHE)` etc.):
   - Block entity type tag: `LibBlockEntityTags.ITEM_CACHE` (`#anvillib:item_cache`)
   - Entity type tag: `LibEntityTypeTags.ITEM_CACHE` (`#anvillib:item_cache`)
   `ItemCache` automatically includes it as both an input and output source.

### Full Code Example: Container BlockEntity Implementing `IItemHandlerCache` & `ItemCacheSlotProvider`

```java
package com.example.mymod.block.entity;

import dev.anvilcraft.lib.v2.recipe.cache.IItemHandlerCache;
import dev.anvilcraft.lib.v2.recipe.cache.item.ItemCacheSlotProvider;
import net.minecraft.core.BlockPos;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.neoforge.items.IItemHandler;
import net.neoforged.neoforge.items.ItemStackHandler;

public class BasinBlockEntity extends BlockEntity implements IItemHandlerCache {
    private final ItemStackHandler physicalInventory = new ItemStackHandler(4);

    public BasinBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
    }

    @Override
    public IItemHandler getInput() {
        // Input view exposes only slots 0–1 while mapping back to the same physical handler via ItemCacheSlotProvider
        return new MappedSlotView(this.physicalInventory, 0, 2);
    }

    @Override
    public IItemHandler getOutput() {
        // Output view exposes only slots 2–3
        return new MappedSlotView(this.physicalInventory, 2, 2);
    }

    private record MappedSlotView(IItemHandler delegate, int offset, int count)
        implements IItemHandler, ItemCacheSlotProvider {
        @Override
        public Slot getItemCacheSlot(int slot) {
            return new Slot(this.delegate, this.offset + slot);
        }

        @Override
        public int getSlots() {
            return this.count;
        }

        @Override
        public ItemStack getStackInSlot(int slot) {
            return this.delegate.getStackInSlot(this.offset + slot);
        }

        @Override
        public ItemStack insertItem(int slot, ItemStack stack, boolean simulate) {
            return this.delegate.insertItem(this.offset + slot, stack, simulate);
        }

        @Override
        public ItemStack extractItem(int slot, int amount, boolean simulate) {
            return this.delegate.extractItem(this.offset + slot, amount, simulate);
        }

        @Override
        public int getSlotLimit(int slot) {
            return this.delegate.getSlotLimit(this.offset + slot);
        }

        @Override
        public boolean isItemValid(int slot, ItemStack stack) {
            return this.delegate.isItemValid(this.offset + slot, stack);
        }
    }
}
```

---

## 3. Four Caches & Low-Level Element Public API Reference

### 1. `ItemCache` (`dev.anvilcraft.lib.v2.recipe.cache.ItemCache`)

| Member / Method Signature | Description |
| :--- | :--- |
| `ItemCache.ITEM_CACHE` | `InWorldRecipeData<ItemCache>` key (`anvillib:item_cache`). |
| `ItemCache.DEFAULT_ACCEPTOR` | Default commit action calling `endCache()`. |
| `Level getLevel()` | Returns the associated level. |
| `void grow(Vec3 pos, Vec3 range)` | Expands the cache scan region, converting `Entity` and `BlockEntity` sources in range into `ICacheElement`s. |
| `boolean inRange(Vec3 pos, Vec3 range)` | Checks whether the target region is already covered by previous scans. |
| `ICacheInput getInput(ItemLike / ItemStack / Predicate<ItemStack>, Vec3 pos[, Vec3 range[, Predicate<ICacheElement> sourceFilter]])` | Gets and caches an input handle for the given range and source filter (default range `(0.25, 0.25, 0.25)`). |
| `ICacheOutput getOutput(ItemStack stack, Vec3 pos[, Vec3 range[, Predicate<ICacheElement> sourceFilter]])` | Gets and caches an output handle for the given range (default range `(0.05, 0.05, 0.05)`); fires `ItemCacheEvent.SelectOutput` before matching targets, creating a new `ItemEntityCacheElement` if no existing target is available. |
| `void pushSpawnList(Collection<SpawnOperation> spawnOperations)` | Adds spilled pending items to the merged spawn list. |
| `void reserveItem(ICacheElement)` / `void releaseItem(ICacheElement)` / `boolean isAvailable(ICacheElement)` | Maintains mutual-exclusion state between item elements and host entities. |
| `void ensureOpen()` / `void endCache()` | Asserts the cache is uncommitted; `endCache()` syncs all elements and merges newly spawned `ItemEntity`s within `< 0.25` blocks. |

### 2. Cache Elements & Operation Classes (`dev.anvilcraft.lib.v2.recipe.cache.item`)

| Class / Interface | Core Methods / Description |
| :--- | :--- |
| **`ICacheInput`** | `shrink(int)`, `rollbackShrink()`, `clearStack()`, `sync()`, `getCount()`, `apply(Consumer<ItemStack>)`, plus receipt & catalyst return protocol (`supportsConsumptionReceipts()`, `getConsumedItems()`, `clearConsumedItems()`, `restoreConsumedItems()`, `availableElements()`). |
| **`ICacheOutput`** | `grow(ItemStack, boolean spawn)`, `rollbackGrow()`, `clearStack()`, `sync()`. |
| **`ICacheElement`** | Extends both `ICacheInput` and `ICacheOutput`, adding `getCapacity(ItemStack)`, `is(ItemStack)`, `is(Predicate<ItemStack>)`, `getPos()`, `getRange()`, `getSource()`, `getSourceSlot()`, `isGeneratedOutput()`, `getStack()`, `consume(int)`. |
| **`AbstractCacheElement`** | Abstract base class for cache elements, maintaining the `simulate` stack, `dirty` flag, and `shrink`/`grow` rollback stack. |
| **`ItemEntityCacheElement`** | Wraps a world `ItemEntity`; `sync()` calls `discard()` if emptied, else resets `age` to `0` and syncs count, firing `ItemCacheEvent.SpawnItemEntity` before adding newly spawned entities. |
| **`ItemHandlerCacheElement`** | Wraps an `IItemHandler` slot; syncs via `IItemHandlerModifiable#setStackInSlot` if supported, else simulates delta or clear-and-insert two-phase check. |
| **`ICacheInputOutputImpl`** | Read/write proxy aggregating multiple `ICacheElement`s for cross-slot receipt replay, rollback, and merging. |
| **`ItemConsumption`** | Records a single physical slot deduction `(ICacheElement element, ItemStack stack)` and one-shot `restore()` callback. |
| **`ItemCacheSlotProvider`** | `Slot getItemCacheSlot(int slot)`, mapping a wrapper view slot back to physical `(IItemHandler, slot)`. |
| **`CacheOperation` / `InputOutputOperation` / `SpawnOperation`** | Internal operation records: `CacheOperation` is the marker interface; `InputOutputOperation` tracks count deltas and `OperationType`; `SpawnOperation(ItemStack, Vec3, int)` records pending drop spawns. |

### 3. `BlockCache` (`dev.anvilcraft.lib.v2.recipe.cache.BlockCache`)

| Member / Method Signature | Description |
| :--- | :--- |
| `BlockCache.BLOCK_CACHE` / `BlockCache.DEFAULT_ACCEPTOR` | Data key `anvillib:block_cache` and default commit action (`accept()`). |
| `void beginBatch()` | Clears `batchSources` for the current batch so the next batch uses the current simulated world as input. |
| `BlockState getSourceState(BlockPos pos)` | Gets the source block state snapshot at `pos` at the start of the current batch. |
| `List<BlockPos> transformBlock(BlockPos pos, UnaryOperator<BlockState> transform)` | Transforms the block state based on this batch's source snapshot; automatically handles both halves of `DOUBLE_BLOCK_HALF` double blocks and defers neighbor updates. |
| `BlockState getBlockState(BlockPos)` / `@Nullable BlockEntity getBlockEntity(BlockPos)` | Reads (and lazily caches) simulated block state and block entity. |
| `void setBlock(BlockPos, @Nullable BlockState / Block)` / `void removeBlock(BlockPos)` | Modifies a block in the simulated world (`null` is treated as `Blocks.AIR`); automatically updates the other half for double blocks. |
| `void setBlockEntity(BlockPos, @Nullable BlockEntity)` | Sets a simulated block entity. |
| `void accept()` | Writes changed blocks and block entity NBT (via `loadWithComponents`) to the real world and flushes deferred neighbor updates. |

### 4. `EntityCache`, `EntityDropCapture` & `TagCache`

| Class | Members / Method Signatures | Description |
| :--- | :--- | :--- |
| **`EntityCache`** | `ENTITY_CACHE`, `isReserved(Entity)`, `find(offset, range, predicate, ingredient)`, `reserve(List<Entity>)`, `release(List<Entity>)`, `consume(entities, multiplier, dropItems)` | Context-scoped entity reservation and consumption queue; deterministically sorted by distance + UUID, destroying entities and releasing drops/XP orbs after validation. |
| **`EntityDropCapture`** | `new EntityDropCapture(ServerLevel)`, `static boolean capture(Entity)`, `List<ItemEntity> drops()`, `close()` | `AutoCloseable` thread-local interceptor (with `ServerLevelMixin`) that captures drops spawned into the world during `dropAllDeathLoot` when entities are consumed, releasing them only after all transactions commit. |
| **`TagCache`** | `TAG_CACHE`, `public final Map<ResourceLocation, Tag> tags`, `@Nullable Tag getTag(ResourceLocation)`, `putTag(ResourceLocation, Tag)`, `computeIfAbsent(ResourceLocation, Function)` | Shares temporary NBT tags across predicates and outcomes; cleared automatically on each `InWorldRecipeContext#beginBatch()` to isolate batches. |
