# 世界状态缓存与事务提交 (`BlockCache` / `ItemCache` / `EntityCache` / `TagCache`)

<BranchContextCard branch="26.1" />

在世界内配方的多批次匹配与组装过程中，**绝对不能边测试边直接修改真实世界中的方块、掉落物或实体**——否则一旦后续谓词匹配失败，或者连续执行多批次（如一次铁砧砸落合成 64 组物品）时，会产生大量中间方块更新、掉落物生成与回滚难题。

`module.recipe` 通过挂载在 `InWorldRecipeContext` 上的四大缓存（**`BlockCache`**、**`ItemCache`**、**`EntityCache`**、**`TagCache`**）构建了一个完整的内存模拟沙箱，直到整次触发的全部批次规划完成、调用 `context.accept()` 时，才按严格的阶段顺序（`order`）一次性提交回真实世界。

---

## 一、 四大缓存的提交顺序（Commit Order）

当调用 `InWorldRecipeContext#accept()` 时，已注册的 Acceptor 会按 `(order, key)` 升序依次执行：

| 阶段顺序 (`order`) | 缓存键 (`Identifier`) | 执行动作 |
| :---: | :--- | :--- |
| **`-100`** | `anvillib:entity_validation` | `EntityCache#validate()`：在任何世界修改发生前，校验所有待消耗实体仍然存活、非玩家且仍在当前维度（若失效则直接抛错中止整个提交，防止半途失败）。 |
| **`0`** | `anvillib:item_cache` | `ItemCache#endCache()`：同步所有被修改的 `ItemEntity` 与 `ResourceHandler<ItemResource>` 容器槽位，合并距离 `< 0.25` 格的同种新增产物并以 `ItemEntity` 投入世界。 |
| **`100`** | `anvillib:block_cache` | `BlockCache#accept()`：将所有变更的 `BlockState` 与 `BlockEntity` NBT 写入世界，对双格方块先以 `Block.UPDATE_CLIENTS` 抑制中间邻居更新，全部写完后再统一触发 `updateNeighborsAt`。 |
| **`150`** | `anvillib:entity_cache` | `EntityCache#commit()`：在 `EntityDropCapture` 拦截作用域内移除被消耗的实体并收集死亡掉落物与经验值。 |
| **`afterCommit`** | 延迟副作用队列 | 在上述所有资源提交全部成功后，依次执行 `EntityCache#releaseRewards`（生成掉落物与经验球）、`SpawnEntity`（生成新实体）、`ProduceExplosion`（产生爆炸）以及 `InWorldRecipeCommittedEvent` 事件发布。 |

---

## 二、 外部容器如何接入 `ItemCache`？

除了世界中的地面掉落物（`ItemEntity`）外，`ItemCache` 还能直接从触发区域内的**方块实体（`BlockEntity`）**或**实体（`Entity`）**内部槽位读取原料并写入产物。接入方式有如下两种：

1. **方式 A：实现 `ItemResourceHandlerCache` 接口（推荐，支持输入/输出分离）**：
   让你的 `BlockEntity` 或 `Entity` 实现 `dev.anvilcraft.lib.v2.recipe.cache.ItemResourceHandlerCache` 接口，分别返回 `getInput()` 和 `getOutput()` 的 NeoForge `ResourceHandler<ItemResource>`。若输入与输出视图底层指向同一个物理槽位，还可让包装器实现 `ItemCacheSlotProvider` 以映射回同一物理槽位。
2. **方式 B：原版 `Container` + 标签白名单**：
   若方块实体或实体实现了原版 `net.minecraft.world.Container`，只需将其类型加入对应标签：
   - 方块实体类型标签：`LibBlockEntityTags.ITEM_CACHE`（`#anvillib:item_cache`）
   - 实体类型标签：`LibEntityTypeTags.ITEM_CACHE`（`#anvillib:item_cache`）
   `ItemCache` 会自动通过 `VanillaContainerWrapper.of(container)` 将其包装为 `ResourceHandler<ItemResource>`。

### 完整代码示例：实现 `ItemResourceHandlerCache` 与 `ItemCacheSlotProvider` 的机器方块实体

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

## 三、 四大缓存与子组件 API 详解

### 1. `BlockCache`（方块状态与方块实体模拟缓存）

位于 `dev.anvilcraft.lib.v2.recipe.cache.BlockCache`。通过 `context.computeIfAbsent(BlockCache.BLOCK_CACHE)` 获取。

| 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `BlockCache.BLOCK_CACHE` | `InWorldRecipeData<BlockCache>` | 数据键 `anvillib:block_cache`。 |
| `BlockCache.DEFAULT_ACCEPTOR` | `Consumer<InWorldRecipeContext>` | 默认提交回调 `ctx -> ctx.get(BLOCK_CACHE).accept()`。 |
| `public void beginBatch()` | `void` | 清空当前批次的输入源快照 `batchSources`，使下一批次以当前模拟世界状态作为属性继承源。 |
| `public BlockState getSourceState(BlockPos pos)` | `BlockState` | 获取当前批次开始时 `pos` 处的方块状态快照（即使同一批次中 `HasBlockIngredient` 先把方块删成了空气，后续 `SetBlock` 依然能读到本批次原本的方块状态以继承属性）。 |
| `public BlockState getBlockState(BlockPos pos)` | `BlockState` | 读取 `pos` 处的模拟方块状态（首次访问时从真实世界读取并存入 `cache` 与 `simulated`）。 |
| `public @Nullable BlockEntity getBlockEntity(BlockPos pos)` | `@Nullable BlockEntity` | 读取 `pos` 处的模拟方块实体。 |
| `public void setBlock(BlockPos pos, @Nullable BlockState state)` / `setBlock(BlockPos pos, @Nullable Block block)` | `void` | 在模拟缓存中设置方块状态。若原方块是完整的双格方块（`DOUBLE_BLOCK_HALF`），会自动同步替换或清除另一半，并将两个坐标加入 `deferredNeighborUpdates`。 |
| `public List<BlockPos> transformBlock(BlockPos pos, UnaryOperator<BlockState> transform)` | `List<BlockPos>` | 基于 `getSourceState(pos)` 应用状态转换函数 `transform`（双格方块会自动分别转换上下两半并保持各自的 `HALF` 值），返回被修改的坐标列表。 |
| `public void setBlockEntity(BlockPos pos, @Nullable BlockEntity entity)` | `void` | 在模拟缓存中设置 `pos` 处的方块实体。 |
| `public void removeBlock(BlockPos pos)` | `void` | 将模拟缓存中 `pos` 处的方块设为 `Blocks.AIR` 并清除方块实体。 |
| `public void accept()` | `void` | 将所有与初始 `cache` 不同的 `simulated` 方块状态及 `simulatedEntity` NBT 写入真实世界。 |

### 2. `ItemCache` 与 `dev.anvilcraft.lib.v2.recipe.cache.item.*`（物品缓存体系）

通过 `context.computeIfAbsent(ItemCache.ITEM_CACHE)` 获取。

| 类 / 接口名 | 关键方法签名 | 说明 |
| :--- | :--- | :--- |
| `ItemCache` | • `ITEM_CACHE` / `DEFAULT_ACCEPTOR`<br>• `void grow(Vec3 pos, Vec3 range)`<br>• `boolean inRange(Vec3 pos, Vec3 range)`<br>• `ICacheInput getInput(Predicate<ItemStack>, Vec3 pos, Vec3 range, Predicate<ICacheElement> sourceFilter)`（及 `ItemLike` / `ItemStack` 重载）<br>• `ICacheOutput getOutput(ItemStack stack, Vec3 pos, Vec3 range, Predicate<ICacheElement> sourceFilter)`<br>• `boolean isAvailable(ICacheElement)` / `void reserveItem(ICacheElement)` / `void releaseItem(ICacheElement)`<br>• `void endCache()` | 管理扫描区域内的所有 `ICacheElement`。<br>**与 `EntityCache` 的互斥协调**：当某个容器实体（如胸膛矿车）内部的物品被 `ItemCache` 占用（`itemUses > 0`）时，`EntityCache` 禁止将该实体作为整只实体原料消耗；反之，若该实体已被 `EntityCache` 预留，`isAvailable(element)` 返回 `false`，禁止再从其内部存取物品。 |
| `ICacheInput` | • `int shrink(int count)` / `int rollbackShrink()`<br>• `void clearStack()` / `void sync()`<br>• `int getCount()` / `void apply(Consumer<ItemStack>)`<br>• `boolean supportsConsumptionReceipts()`<br>• `List<ItemStack> getConsumedItems()` / `void clearConsumedItems()` / `void restoreConsumedItems()`<br>• `Optional<Map<ICacheElement, Integer>> availableElements()` | 物品输入视图接口。支持带精确组件快照的消费回执（`ItemConsumption`）与催化剂原槽位归还（`restoreConsumedItems`）。 |
| `ICacheOutput` | • `ItemStack grow(ItemStack stack, boolean spawn)`<br>• `ItemStack rollbackGrow()`<br>• `void clearStack()` / `void sync()` | 物品输出视图接口。`grow(stack, true)` 在现有容器槽位装满后会将剩余数量记入 `SpawnOperation` 生成新掉落物。 |
| `ICacheElement` / `AbstractCacheElement` | • `ItemEntityCacheElement`（包装地面 `ItemEntity` 或待生成的新 `ItemEntity`）<br>• `ItemResourceHandlerCacheElement`（包装 NeoForge `ResourceHandler<ItemResource>` 的单个槽位，`sync()` 时使用 `Transaction.openRoot()` 仅同步差量，兼容拒绝插入的纯输出槽） | 单个物理物品源（一个 `ItemEntity` 或一个容器槽位）的模拟缓存实现。 |
| `ItemCacheSlotProvider` | `Slot getItemCacheSlot(int slot)` / `record Slot(ResourceHandler<ItemResource> handler, int slot)` | 供暴露同一物理库存的不同包装视图实现，使 `ItemCache` 将其归一化到同一个 `ItemResourceHandlerCacheElement`（检测到循环映射时抛出 `IllegalArgumentException("Cyclic item cache slot mapping")`）。 |
| `ItemConsumption` / `CacheOperation` / `InputOutputOperation` / `SpawnOperation` | — | 记录单次物品扣减/增长/生成操作的事务栈节点与精确组件快照。 |

### 3. `EntityCache` 与 `EntityDropCapture`（实体占用与掉落拦截）

通过 `context.computeIfAbsent(EntityCache.ENTITY_CACHE)` 获取。

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `EntityCache` | • `ENTITY_CACHE`<br>• `boolean isReserved(Entity entity)`<br>• `List<Entity> find(Vec3 offset, Vec3 range, EntityPredicate predicate, boolean ingredient)`<br>• `void reserve(List<Entity> entities)`<br>• `void release(List<Entity> entities)`<br>• `void consume(List<Entity> entities, float multiplier, boolean dropItems)` | • `find`：按距离中心点平方升序、次按 `UUID` 升序稳定返回范围内匹配实体（当 `ingredient == true` 时排除 `Player` 及已被 `ItemCache` 占用物品的实体）。<br>• `reserve` / `release`：在匹配阶段锁定或回滚释放实体。<br>• `consume`：登记待消耗实体及其经验倍率与掉落物开关。 |
| `EntityDropCapture` | `public EntityDropCapture(ServerLevel level)`<br>`public static boolean capture(Entity entity)`<br>`public List<ItemEntity> drops()`<br>`public void close()` | 实现 `AutoCloseable`，通过 `ServerLevelMixin` 在 `entity.discard()` 或 `dropAllDeathLoot` 期间拦截新加入世界的 `ItemEntity`：<br>• 若配方设置了 `dropItems = false`，拦截到的容器散落物会被直接丢弃，不会漏进世界；<br>• 若设置了 `dropItems = true`，拦截到的掉落物会暂存在 `EntityCache.drops` 中，等到 `afterCommit` 阶段再安全加入世界，避免干扰当前上下文的后续物品匹配。 |

### 4. `TagCache`（跨阶段组件 NBT 传递缓存）

通过 `context.computeIfAbsent(TagCache.TAG_CACHE)` 获取。

| 常量 / 方法签名 | 说明 |
| :--- | :--- |
| `TagCache.TAG_CACHE` | 数据键 `anvillib:tag_cache`。 |
| `public @Nullable Tag getTag(Identifier id)` / `public void putTag(Identifier id, Tag tag)` / `public void computeIfAbsent(Identifier id, Function<Identifier, Tag> tag)` | 在同一批次（`beginBatch()` 会清空 `tags`）的谓词函数（如 `SaveComponentToTag`）与结果函数（如 `ApplyTagToComponent`）之间按 `Identifier` 传递任意 NBT `Tag`。 |
