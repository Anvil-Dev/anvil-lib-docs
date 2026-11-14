# 世界状态缓存与事务提交 (`BlockCache` / `ItemCache` / `EntityCache` / `TagCache`)

<BranchContextCard branch="1.21.8" />

在世界内配方的多批次匹配与组装过程中，**绝对不能边测试边直接修改真实世界中的方块、掉落物或实体**——否则一旦后续谓词匹配失败，或者连续执行多批次（如一次触发连续合成 64 组物品）时，会产生大量中间方块更新、掉落物生成与回滚难题。

`module.recipe` 通过挂载在 `InWorldRecipeContext` 上的四大缓存（**`BlockCache`**、**`ItemCache`**、**`EntityCache`**、**`TagCache`**）构建了一个完整的内存模拟沙箱，直到整次触发的全部批次规划完成、调用 `context.accept()` 时，才按严格的阶段顺序（`order`）一次性提交回真实世界。

---

## 一、 四大缓存的提交顺序（Commit Order）

当调用 `InWorldRecipeContext#accept()` 时，已注册的 Acceptor 会按 `(order, key)` 升序依次执行：

| 阶段顺序 (`order`) | 缓存键 (`ResourceLocation`) | 执行动作 |
| :---: | :--- | :--- |
| **`-100`** | `anvillib:entity_validation` | `EntityCache#validate()`：在任何世界修改发生前，校验所有待消耗实体仍然存活、非玩家且仍在当前维度（若失效则直接抛错中止整个提交，防止半途失败）。 |
| **`0`** | `anvillib:item_cache` | `ItemCache#endCache()`：同步所有被修改的 `ItemEntity` 与 `IItemHandler` 容器槽位，合并距离 `< 0.25` 格的同种新增产物并以 `ItemEntity` 投入世界。 |
| **`100`** | `anvillib:block_cache` | `BlockCache#accept()`：将所有变更的 `BlockState` 与 `BlockEntity` NBT 写入世界（通过 `TagValueInput` + `oldEntity.loadWithComponents(input)`），对双格方块先以 `Block.UPDATE_CLIENTS` 抑制中间邻居更新，全部写完后再统一触发 `level.updateNeighborsAt(...)`。 |
| **`150`** | `anvillib:entity_cache` | `EntityCache#commit()`：在 `EntityDropCapture` 拦截作用域内移除被消耗的实体并收集死亡掉落物与经验值。 |
| **`afterCommit`** | 延迟副作用队列 | 在上述所有资源提交全部成功后，依次执行 `EntityCache#releaseRewards`（生成掉落物与经验球）、`SpawnEntity`（生成新实体）、`ProduceExplosion`（产生爆炸）以及 `InWorldRecipeCommittedEvent` 事件发布。 |

---

## 二、 外部容器如何接入 `ItemCache`？

除了世界中的地面掉落物（`ItemEntity`）外，`ItemCache` 还能直接从触发区域内的**方块实体（`BlockEntity`）**或**实体（`Entity`）**内部槽位读取原料并写入产物。接入方式有如下两种：

1. **方式 A：实现 `IItemHandlerCache` 接口（推荐，支持输入/输出分离）**：
   让你的 `BlockEntity` 或 `Entity` 实现 `dev.anvilcraft.lib.v2.recipe.cache.IItemHandlerCache` 接口，分别返回 `getInput()` 和 `getOutput()` 的 NeoForge `IItemHandler`。若输入与输出视图底层指向同一个物理槽位，还可让包装器实现 `ItemCacheSlotProvider` 以映射回同一物理槽位（防止循环引用，发现环会抛 `IllegalArgumentException`）。
2. **方式 B：直接实现 `IItemHandler` + 标签白名单**：
   若方块实体或实体本身实现了 `net.neoforged.neoforge.items.IItemHandler`，只需将其类型加入对应标签（内部通过 `BuiltInRegistries.BLOCK_ENTITY_TYPE.getTagOrEmpty(LibBlockEntityTags.ITEM_CACHE)` 等解析）：
   - 方块实体类型标签：`LibBlockEntityTags.ITEM_CACHE`（`#anvillib:item_cache`）
   - 实体类型标签：`LibEntityTypeTags.ITEM_CACHE`（`#anvillib:item_cache`）
   `ItemCache` 会自动将其同时作为输入源与输出源纳入缓存。

### 完整代码示例：实现 `IItemHandlerCache` 与 `ItemCacheSlotProvider` 的容器方块实体

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
        // 输入视图仅暴露 0~1 号原料槽，同时通过 ItemCacheSlotProvider 映射回同一物理 handler
        return new MappedSlotView(this.physicalInventory, 0, 2);
    }

    @Override
    public IItemHandler getOutput() {
        // 输出视图仅暴露 2~3 号产物槽
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

## 三、 四大缓存与底层元素公开 API 详解

### 1. `ItemCache` (`dev.anvilcraft.lib.v2.recipe.cache.ItemCache`)

| 成员 / 方法签名 | 说明 |
| :--- | :--- |
| `ItemCache.ITEM_CACHE` | `InWorldRecipeData<ItemCache>` 键（`anvillib:item_cache`）。 |
| `ItemCache.DEFAULT_ACCEPTOR` | 默认提交动作，调用 `endCache()`。 |
| `Level getLevel()` | 获取关联的世界实例。 |
| `void grow(Vec3 pos, Vec3 range)` | 扩展缓存扫描范围，将范围内 `Entity` 与 `BlockEntity` 转为 `ICacheElement`。 |
| `boolean inRange(Vec3 pos, Vec3 range)` | 判断目标范围是否已被历史扫描覆盖。 |
| `ICacheInput getInput(ItemLike / ItemStack / Predicate<ItemStack>, Vec3 pos[, Vec3 range[, Predicate<ICacheElement> sourceFilter]])` | 获取并缓存指定范围与源过滤条件下的输入句柄（默认范围 `(0.25, 0.25, 0.25)`）。 |
| `ICacheOutput getOutput(ItemStack stack, Vec3 pos[, Vec3 range[, Predicate<ICacheElement> sourceFilter]])` | 获取并缓存指定范围的输出句柄（默认范围 `(0.05, 0.05, 0.05)`）；逐一匹配前先触发 `ItemCacheEvent.SelectOutput`，无可用已有目标时创建新的 `ItemEntityCacheElement`。 |
| `void pushSpawnList(Collection<SpawnOperation> spawnOperations)` | 将溢出的待生成物品加入合并生成列表。 |
| `void reserveItem(ICacheElement)` / `void releaseItem(ICacheElement)` / `boolean isAvailable(ICacheElement)` | 维护物品元素与宿主实体的互斥占用状态。 |
| `void ensureOpen()` / `void endCache()` | 校验缓存未提交；`endCache()` 同步所有元素并合并间隔 `< 0.25` 格的新增 `ItemEntity`。 |

### 2. 缓存元素与操作类 (`dev.anvilcraft.lib.v2.recipe.cache.item`)

| 类 / 接口 | 核心方法 / 说明 |
| :--- | :--- |
| **`ICacheInput`** | `shrink(int)`、`rollbackShrink()`、`clearStack()`、`sync()`、`getCount()`、`apply(Consumer<ItemStack>)`、收据与催化剂归还协议（`supportsConsumptionReceipts()`、`getConsumedItems()`、`clearConsumedItems()`、`restoreConsumedItems()`、`availableElements()`）。 |
| **`ICacheOutput`** | `grow(ItemStack, boolean spawn)`、`rollbackGrow()`、`clearStack()`、`sync()`。 |
| **`ICacheElement`** | 同时继承 `ICacheInput` 与 `ICacheOutput`，新增 `getCapacity(ItemStack)`、`is(ItemStack)`、`is(Predicate<ItemStack>)`、`getPos()`、`getRange()`、`getSource()`、`getSourceSlot()`、`isGeneratedOutput()`、`getStack()`、`consume(int)`。 |
| **`AbstractCacheElement`** | 缓存元素抽象基类，维护 `simulate` 模拟堆、`dirty` 标记与 `shrink`/`grow` 回滚栈。 |
| **`ItemEntityCacheElement`** | 封装世界中的 `ItemEntity`；`sync()` 时若清空则 `discard()`，否则重置 `age` 为 `0` 并同步数量，新生成实体同步前发布 `ItemCacheEvent.SpawnItemEntity`。 |
| **`ItemHandlerCacheElement`** | 封装 `IItemHandler` 槽位；优先通过 `IItemHandlerModifiable#setStackInSlot` 同步，否则按模拟增减量或清空再插入两阶段检查同步。 |
| **`ICacheInputOutputImpl`** | 聚合多个 `ICacheElement` 的读写代理，实现跨槽位收据回放、回滚及合并。 |
| **`ItemConsumption`** | 记录单次物理槽位预扣的 `(ICacheElement element, ItemStack stack)` 与一次性 `restore()` 归还回调。 |
| **`ItemCacheSlotProvider`** | `Slot getItemCacheSlot(int slot)`，将包装视图槽位映射到物理 `(IItemHandler, slot)`。 |
| **`CacheOperation` / `InputOutputOperation` / `SpawnOperation`** | 内部操作记录：`CacheOperation` 为操作标记接口；`InputOutputOperation` 记录数量变化与 `OperationType`；`SpawnOperation(ItemStack, Vec3, int)` 记录待掉落生成请求。 |

### 3. `BlockCache` (`dev.anvilcraft.lib.v2.recipe.cache.BlockCache`)

| 成员 / 方法签名 | 说明 |
| :--- | :--- |
| `BlockCache.BLOCK_CACHE` / `BlockCache.DEFAULT_ACCEPTOR` | 数据键 `anvillib:block_cache` 与默认提交动作（`accept()`）。 |
| `void beginBatch()` | 清空本批次源状态快照 `batchSources`，使新批次以当前模拟世界作为输入。 |
| `BlockState getSourceState(BlockPos pos)` | 获取当前批次开始时该坐标的源方块状态快照。 |
| `List<BlockPos> transformBlock(BlockPos pos, UnaryOperator<BlockState> transform)` | 基于本批次源快照转换方块状态；遇到 `DOUBLE_BLOCK_HALF` 双格方块时自动同步转换上下两半并延迟邻居更新。 |
| `BlockState getBlockState(BlockPos)` / `@Nullable BlockEntity getBlockEntity(BlockPos)` | 读取（并惰性缓存）模拟世界中的方块状态与方块实体。 |
| `void setBlock(BlockPos, @Nullable BlockState / Block)` / `void removeBlock(BlockPos)` | 修改模拟世界方块（传入 `null` 视为 `Blocks.AIR`）；若原方块是双格方块则同步处理另一半。 |
| `void setBlockEntity(BlockPos, @Nullable BlockEntity)` | 设置模拟方块实体。 |
| `void accept()` | 将发生变化的方块与方块实体 NBT（通过 `TagValueInput` 与 `loadWithComponents`）写入真实世界，并统一补发延迟的邻居更新。 |

### 4. `EntityCache`、`EntityDropCapture` 与 `TagCache`

| 类名 | 成员 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`EntityCache`** | `ENTITY_CACHE`、`isReserved(Entity)`、`find(offset, range, predicate, ingredient)`、`reserve(List<Entity>)`、`release(List<Entity>)`、`consume(entities, multiplier, dropItems)` | 仅生命周期绑定当前上下文的实体占用与消耗队列；按距离 + UUID 稳定排序，校验通过后统一销毁并释放掉落物与经验球。 |
| **`EntityDropCapture`** | `new EntityDropCapture(ServerLevel)`、`static boolean capture(Entity)`、`List<ItemEntity> drops()`、`close()` | `AutoCloseable` 线程局部拦截器（配合 `ServerLevelMixin`），在实体消耗调用 `dropAllDeathLoot` 时拦截直接入世界的掉落物，待全部事务成功提交后再由 `releaseRewards()` 释放。 |
| **`TagCache`** | `TAG_CACHE`、`public final Map<ResourceLocation, Tag> tags`、`@Nullable Tag getTag(ResourceLocation)`、`putTag(ResourceLocation, Tag)`、`computeIfAbsent(ResourceLocation, Function)` | 跨谓词与结果共享临时 NBT 标签；每次调用 `InWorldRecipeContext#beginBatch()` 时自动清空以隔离批次。 |
