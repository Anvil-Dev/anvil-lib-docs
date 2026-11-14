# 执行上下文、剪枝管理器与事件 (`Context` / `Manager` / `Events`)

<BranchContextCard branch="1.21.4" />

本篇深入解析 `module.recipe` 的运行时核心：**`InWorldRecipeContext`** 的两阶段提交状态机、**`InWorldRecipeManager`** 的二部图方块剪枝算法（`PrunePlan`）、无序匹配器 **`ShapelessMatcher`**、`RecipeManager` / `RecipeMap` 接口注入扩展，以及供其他模组扩展的 **5 大配方事件** 与辅助工具类。

---

## 一、 `InWorldRecipeContext` 两阶段提交状态机与上下文 API

`InWorldRecipeContext` 实现了原版 `RecipeInput`（空实现 `size() == 0`、`isEmpty() == true`），用于在一次触发生命周期内承载位置、世界、关联实体、自定义数据、回滚栈与延迟提交动作：

1. **规划阶段（Planning）**：
   - `matches(...)` 中通过 `push(IRecipePredicate<?>)` 压栈并调用 `predicate.snapshot(this)`；失败回溯时通过 `pop(IRecipePredicate<?>)` 调用 `predicate.rollback(this)`；
   - `assemble(...)` 中调用 `beginBatch()`（递增 `batchId`、清空 `TagCache`、调用 `BlockCache#beginBatch()`），随后依次执行谓词 `accept`、结果 `acceptWithChance` 与谓词 `clearStack`。
2. **提交阶段（Commit）**：
   - 调用 `context.accept()` 后，上下文先按 `(order, key)` 升序执行 `acceptors`（若某步抛错，立即调用 `invalidate()` 阻止继续提交并向上抛出异常）；
   - 所有资源提交成功后标记 `completed = true`，最后依次运行 `afterCommit` 队列（幂等：重复调用 `accept()` 在已完成状态下直接返回；已失效 `invalid` 状态再调用则抛 `IllegalStateException`）。

### `InWorldRecipeContext` 与 `InWorldRecipeData` 全量方法表

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`InWorldRecipeContext`** | `InWorldRecipeContext(ServerLevel level, Vec3 pos, Entity entity)` | 构造世界内配方上下文。 |
| **`InWorldRecipeContext`** | `ServerLevel getLevel()` / `Vec3 getPos()` / `Entity getEntity()` / `long getBatchId()` | 获取服务端世界、基准位置、触发实体与当前批次编号。 |
| **`InWorldRecipeContext`** | `void push(IRecipePredicate<?>)` / `void pop(IRecipePredicate<?>)` / `List<IRecipePredicate<?>> getStack()` | 压入/弹出谓词回滚栈（`pop` 要求必须是栈顶元素）。 |
| **`InWorldRecipeContext`** | `<T> void put(InWorldRecipeData<T>, T)` / `<T> T get(InWorldRecipeData<T>)` / `<T> T computeIfAbsent(InWorldRecipeData<T>)` | 基于 `InWorldRecipeData` 键读写上下文扩展数据（`get` 未命中时返回 supplier 默认值但不写入，`computeIfAbsent` 会写入）。 |
| **`InWorldRecipeContext`** | `<T> T computeByIdentity(Object key, Supplier<T> supplier)` | 按对象引用身份（`IdentityHashMap`）缓存谓词实例私有状态。 |
| **`InWorldRecipeContext`** | `void putAcceptor(ResourceLocation key, Consumer<InWorldRecipeContext>)`<br>`void putAcceptor(ResourceLocation key, int order, Consumer<InWorldRecipeContext>)` | 注册资源提交回调；两参版自动映射 `item_cache -> 0`、`block_cache -> 100`、其余 `-> 200`。 |
| **`InWorldRecipeContext`** | `void beginBatch()` / `void afterCommit(Runnable)` / `void invalidate()` / `void assertPlanning()` / `void accept()` | 生命周期控制与两阶段提交入口。 |
| **`InWorldRecipeContext`** | `LootContext emptyLootContext()`<br>`float getFloat(NumberProvider[, float min, float max] / max)`<br>`int getInt(NumberProvider[, int min, int max] / max)` | 在空战利品上下文（基于 `ContextMap.EMPTY`）中求值 `NumberProvider` 并可选钳制区间。 |
| **`InWorldRecipeContext`** | `RegistryOps<Tag> getNbtRegistryOps()` | 获取基于当前世界注册表访问器的 `NbtOps` 序列化上下文。 |
| **`InWorldRecipeData<T>`** | `static <T> InWorldRecipeData<T> of(ResourceLocation, T defaultValue)`<br>`static <T> InWorldRecipeData<T> of(ResourceLocation, BiFunction<InWorldRecipeContext, InWorldRecipeData<T>, T>)`<br>`static <T> InWorldRecipeData<T> of(ResourceLocation)` | 创建上下文强类型数据键。 |

---

## 二、 `InWorldRecipeManager` 与 `RecipeManager` / `RecipeMap` 注入扩展

`ResourceEventListener` 会在服务端启动（`ServerStartedEvent`）及数据包同步（`OnDatapackSyncEvent`）时，创建新的 `InWorldRecipeManager`，发布 `InWorldRecipeManagerEvent.Init`，并将所有 `InWorldRecipe` 按 `IPrioritized` 降序（`priority()` 反转）+ 配方位置 `holder.id().location()` 升序注册入库。

| 扩展接口 | 注入目标类 | 方法签名 | 说明 |
| :--- | :--- | :--- | :--- |
| **`IRecipeManagerExtension`** | `RecipeManager` | • `void anvillib$setInWorldRecipeManager(InWorldRecipeManager)`<br>• `InWorldRecipeManager anvillib$getInWorldRecipeManager()`<br>• `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>>)`<br>• `@Deprecated HolderLookup.Provider anvillib$getRegistries()` | 在服务端读写 `InWorldRecipeManager`；`anvillib$addRecipes` 内部自动委托给 `this.recipes` 上的 `IRecipeMapExtension`。 |
| **`IRecipeMapExtension`** | `RecipeMap` | `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>>)` | 向不可变 `RecipeMap` 的 `byKey` 与 `byType` 增量合入程序化生成的 `InWorldRecipe` 条目。 |

### 剪枝工作流程 (`PrunePlan`)
1. **注册建图 (`register(RecipeHolder<InWorldRecipe>)`)**：提取配方中所有限定了非空方块集合的 `HasBlockBase` 谓词，按归一化相对坐标 `offset` 与规范化方块集合键合并为共享判定节点（`JudgeNode`），连线到对应配方槽位；
2. **触发剪枝 (`trigger(IRecipeTrigger / Supplier<IRecipeTrigger>, InWorldRecipeContext)`)**：
   - 仅在服务端执行（`if (ctx.getLevel().isClientSide()) return;`）；
   - 按 `OffsetGroup` 逐偏移读取一次 `BlockCache#getBlockState`，调用 `BlockStatePredicate#cannotMatch(state)` 进行粗筛：失败时沿连线一票否决全部相连配方，当当前触发器下的活动槽位均失效时直接提前返回；
   - 对幸存的候选配方（按优先级从高到低），一旦某个配方连续匹配成功至少 1 个批次（最多执行 `Math.min(recipe.maxEfficiency(), AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency)` 批），便终止后续低优先级配方的匹配，**保证同一组材料不会被多个配方重复匹配**；
   - 每成功组装一个批次，立即发布 `InWorldRecipeEvent`（传入 `holder.id().location()`），并向 `ctx.afterCommit` 注册发布 `InWorldRecipeCommittedEvent(..., batchId)`。

---

## 三、 `ShapelessMatcher`、`IPrioritized`、`IRecipeResultOffsetBlock` 与 `Range`

| 类 / 接口 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`ShapelessMatcher`** | `static boolean compatible(List<IRecipePredicate<?>>, InWorldRecipeContext)` | 按列表顺序依次 `test` 并 `push`，任意一项失败立即返回 `false`。 |
| **`ShapelessMatcher`** | `static boolean incompatible(List<IRecipePredicate<?>>, InWorldRecipeContext)` | 若全部谓词为 `HasItemIngredient` 且候选源可暴露 `availableElements()`，先做快速容量可行性与独立性判断（不可行直接 `false`，完全无重叠直接走线性 `compatible`），否则进入全排列回溯 `backtrack`。 |
| **`IPrioritized`** | `default int priority()` / `default int compareTo(IPrioritized o)` | 优先级接口：默认 `priority() == 1`；`compareTo` 按优先级**降序**排列（同优先级不同对象返回 `1`）。 |
| **`IRecipeResultOffsetBlock`** | `Vec3 getOffset(Level level, BlockPos pos, BlockState state)` | 方块实现该接口后，`SpawnItem` 在该方块内产出物品时会自动叠加此坐标偏移。 |
| **`Range`** | `static Range of(Vec3 pos, Vec3 range)`、`contains(...)`、`cross(...)`、`grow(Range)`、`isEmpty()`、`toAABB([Vec3 offset])`、`iterator()` | 实现 `Iterable<BlockPos>` 的三维 AABB 区域工具，用于 `ItemCache` 与 `EntityCache` 的空间扫描。 |

---

## 四、 5 大事件体系与监听示例

所有事件均发布在 **`NeoForge.EVENT_BUS`** 上：

| 事件类名 | 父类 / 特性 | 触发时机与携带字段 |
| :--- | :--- | :--- |
| **`InWorldRecipeManagerEvent.Init`** | `InWorldRecipeManagerEvent` | 每次重建 `InWorldRecipeManager` 且尚未遍历原版 `RecipeManager` 前触发；携带 `manager` 与 `recipeManager`，可用于代码动态注册内置/程序化 `InWorldRecipe`。 |
| **`InWorldRecipeEvent`** | `Event` | 单个批次 `recipe.assemble(...)` 完成后、**实际提交到世界前**触发；携带 `recipeType`、`id`（`ResourceLocation`）、`recipe`、`context`。 |
| **`InWorldRecipeCommittedEvent`** | `Event` | `context.accept()` 将全部资源写入世界并执行延迟副作用后触发；携带 `recipeType`、`id`、`recipe`、`context`、`batchId`。注意整个触发共用同一个 `context`，不要在此时回读已被后续批次清空的 `TagCache`。 |
| **`ItemCacheEvent.SelectOutput`** | `ItemCacheEvent` / **`ICancellableEvent`** | `ItemCache#getOutput` 筛选已有容器槽位或地面掉落物堆作为输出目标时触发；携带 `cache`、`stack`（副本）、`pos`、`range`、`element`。**取消该事件可阻止产物合入该已有槽位/物品堆**（仍可选择其他槽位或生成新 `ItemEntity`）。 |
| **`ItemCacheEvent.SpawnItemEntity`** | `ItemCacheEvent` | `ItemCache#endCache` 或 `ItemEntityCacheElement#sync` 即将向世界 `addFreshEntity(entity)` 添加新 `ItemEntity` 前触发；携带 `cache` 与 `entity`，可用于修改初速度、拾取延迟或自定义拦截。 |
| **`ItemEntityEvent.InToBlock`** | `ItemEntityEvent` (`EntityEvent`) | `ItemEntity` 在 `tick` 中跨入新 `BlockPos` 时触发；携带 `level`、`entity`、`blockPos`、`pos`、`motion`。 |

### 代码示例：监听配方提交事件并阻止产物自动塞入特定容器

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
        // 示例：阻止配方产物自动合并进玩家手持或特定位置的缓存元素中
        if (event.getElement().getSourceSlot() == 0) {
            event.setCanceled(true);
        }
    }

    @SubscribeEvent
    public static void onRecipeCommitted(InWorldRecipeCommittedEvent event) {
        Vec3 pos = event.getContext().getPos();
        // 在世界修改彻底提交后播放音效或粒子
        event.getContext().getLevel().levelEvent(1031, net.minecraft.core.BlockPos.containing(pos), 0);
    }
}
```
