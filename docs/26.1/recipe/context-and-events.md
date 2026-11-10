# 配方上下文、剪枝管理器、事件与扩展接口 (`util` / `event` / `injection`)

<BranchContextCard branch="26.1" />

本篇介绍 `module.recipe` 的运行时执行中枢：承载单次触发状态的 **`InWorldRecipeContext`**、内置二部图方块约束剪枝器的 **`InWorldRecipeManager`**、带容量预检的无序匹配器 **`ShapelessMatcher`**、全生命周期事件体系以及注入到原版 `RecipeManager` / `RecipeMap` 的扩展接口。

---

## 一、 `InWorldRecipeManager` 与二部图方块剪枝（`PrunePlan`）机制

当一个触发器（如 `item_into_block`）下注册了上百条世界内配方时，若每次物品移动都逐一调用上百条配方的 `matches(ctx, level)`，会产生大量无效计算。

`InWorldRecipeManager` 在 `register(RecipeHolder<InWorldRecipe>)` 时会自动提取每条配方中所有限定了方块集合的 `HasBlock` / `HasBlockIngredient` 谓词，构建一张**按相对偏移 `offset` 分组的二部图剪枝计划（`PrunePlan`）**：
1. 具有相同归一化 `offset` 和相同允许方块集合（`TagKey<Block>` 或排序后的 `Identifier` 列表）的条件被合并为同一个共享判定节点 `JudgeNode`；
2. 当 `trigger(trigger, ctx)` 被调用时，同一 `offset` 下的所有节点**只读取一次 `BlockCache#getBlockState`**；
3. 若某个 `JudgeNode` 判定 `cannotMatch(state)` 为真，则沿边一票否决所有依赖该节点的配方槽位（`slot.fails++`）；若所有已索引候选配方全部被否决（`alive == 0`），立即提前终止返回！
4. 对幸存下来的候选配方，按 `priority` 降序（同优先级按配方 `Identifier` 字典序决胜）依次尝试执行最多 `min(CONFIG.inWorldRecipeMaxEfficiency, recipe.maxEfficiency())` 批次，一旦某条配方成功执行（`accept == true`），即停止尝试后续低优先级配方。

---

## 二、 完整代码示例：监听世界内配方事件与过滤输出容器

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
     * 1. 在单批配方刚刚完成缓存组装（尚未写入真实世界）时触发
     */
    @SubscribeEvent
    public static void onRecipeAssembled(InWorldRecipeEvent event) {
        MyMod.LOGGER.debug("配方 {} 组装完成第 {} 批", event.getId(), event.getContext().getBatchId());
    }

    /**
     * 2. 在 context.accept() 将所有方块、物品、实体修改成功提交到真实世界后触发
     *    适合在此处播放合成音效、生成粒子或触发玩家成就
     */
    @SubscribeEvent
    public static void onRecipeCommitted(InWorldRecipeCommittedEvent event) {
        Vec3 pos = event.getContext().getPos();
        // 播放音效或粒子...
    }

    /**
     * 3. 拦截 ItemCache 的输出目标选择：禁止配方产物自动塞入受保护的保险库容器
     */
    @SubscribeEvent
    public static void onSelectOutput(ItemCacheEvent.SelectOutput event) {
        if (event.getElement().getSource() instanceof ProtectedVaultBlockEntity) {
            // 取消后，该容器将被跳过；若无其他可用容器，产物会正常以 ItemEntity 掉落物形式生成
            event.setCanceled(true);
        }
    }

    /**
     * 4. 当配方产物作为新的 ItemEntity 生成到世界前触发（例如为其赋予无重力或防爆属性）
     */
    @SubscribeEvent
    public static void onSpawnOutputEntity(ItemCacheEvent.SpawnItemEntity event) {
        event.getEntity().setUnlimitedLifetime();
    }
}
```

---

## 三、 公开工具类 API 详解 (`dev.anvilcraft.lib.v2.recipe.util`)

### 1. `InWorldRecipeContext`（世界内配方上下文）

实现原版 `net.minecraft.world.item.crafting.RecipeInput`。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public InWorldRecipeContext(ServerLevel level, Vec3 pos, Entity entity)` | — | 构造上下文：`level` 为服务端世界，`pos` 为触发基准坐标，`entity` 为触发关联实体（可为 `null`）。 |
| `getLevel()` / `getPos()` / `getEntity()` / `getBatchId()` / `getStack()` | 对应类型 | 获取世界、基准坐标、触发实体、当前批次序号（每调一次 `beginBatch()` 自增 1）及当前谓词匹配栈。 |
| `public void push(IRecipePredicate<?> predicate)` / `public void pop(IRecipePredicate<?> predicate)` | `void` | 将谓词压入匹配栈并调用 `predicate.snapshot(this)`；或从栈顶弹出并调用 `predicate.rollback(this)`（若弹出的不是栈顶元素则抛出 `IllegalStateException`）。 |
| `public <T> void put(InWorldRecipeData<T> key, T value)`<br>`public <T> T get(InWorldRecipeData<T> key)`<br>`public <T> T computeIfAbsent(InWorldRecipeData<T> key)` | — / `T` | 按 `InWorldRecipeData<T>` 键存取上下文级缓存对象（如 `BLOCK_CACHE`、`ITEM_CACHE`、`ENTITY_CACHE`、`TAG_CACHE`）。 |
| `public <T> T computeByIdentity(Object key, Supplier<T> supplier)` | `T` | 使用 `IdentityHashMap` 按对象引用身份（`==`）缓存谓词实例私有的匹配状态，避免两个字段值相等的谓词实例共享同一份状态。 |
| `public void putAcceptor(Identifier key, Consumer<InWorldRecipeContext> acceptor)`<br>`public void putAcceptor(Identifier key, int order, Consumer<InWorldRecipeContext> acceptor)` | `void` | 注册资源提交回调（无 `order` 重载对 `item_cache` 赋 `0`、`block_cache` 赋 `100`、其余赋 `200`）。 |
| `public void beginBatch()` | `void` | 开启新一批次的 `assemble`：清空 `TagCache`，调用 `BlockCache#beginBatch()`，并将 `batchId` 加 1。 |
| `public void afterCommit(Runnable action)` | `void` | 注册在所有 `acceptors` 提交成功后才执行的延迟副作用。 |
| `public void accept()` | `void` | 按 `order` 升序执行全部 `acceptors`，标记 `completed = true`，再依次执行全部 `afterCommit` 回调。若途中抛出异常，自动调用 `invalidate()` 作废上下文。 |
| `public void invalidate()` / `public void assertPlanning()` | `void` | 作废上下文，或断言当前上下文仍处于未提交、未作废的规划阶段。 |
| `getFloat(NumberProvider, ...)` / `getInt(NumberProvider, ...)` | `float` / `int` | 使用 `emptyLootContext()` 计算 `NumberProvider` 数值并可选钳制在 `[min, max]` 或 `<= max` 范围内。 |
| `public RegistryOps<Tag> getNbtRegistryOps()` | `RegistryOps<Tag>` | 获取绑定当前世界 `registryAccess()` 的 `NbtOps.INSTANCE` 序列化上下文。 |

### 2. `InWorldRecipeManager`、`InWorldRecipeData<T>`、`ShapelessMatcher`、`Range`、`IPrioritized` 与 `IRecipeResultOffsetBlock`

| 类 / 接口名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| `InWorldRecipeManager` | • `public final Multimap<IRecipeTrigger, RecipeHolder<InWorldRecipe>> recipeHolders`<br>• `public void register(RecipeHolder<InWorldRecipe> recipe)`<br>• `public void trigger(IRecipeTrigger trigger, InWorldRecipeContext ctx)`<br>• `public void trigger(Supplier<IRecipeTrigger> trigger, InWorldRecipeContext ctx)` | 管理所有世界内配方并在 `trigger` 时通过 `PrunePlan` 剪枝后按优先级执行匹配与组装。 |
| `InWorldRecipeData<T>` | `public record InWorldRecipeData<T>(Identifier location, BiFunction<InWorldRecipeContext, InWorldRecipeData<T>, T> supplier)`<br>• `of(Identifier, T defaultValue)`<br>• `of(Identifier, BiFunction<...>)`<br>• `of(Identifier)` | `InWorldRecipeContext` 的类型安全数据键。 |
| `ShapelessMatcher` | • `public static boolean compatible(List<IRecipePredicate<?>> predicates, InWorldRecipeContext ctx)`<br>• `public static boolean incompatible(List<IRecipePredicate<?>> predicates, InWorldRecipeContext ctx)` | • `compatible`：按列表顺序逐个调用 `test` + `ctx.push`；<br>• `incompatible`：先通过 `checkItemCapacity` 快速预检各 `HasItemIngredient` 候选槽位总容量（若总需求超出可用量直接判 `IMPOSSIBLE` 返回 `false`；若各谓词候选源完全互不重叠则优化降级为 `LINEAR` 顺序匹配），存在重叠时执行 `backtrack` 全排列回溯搜索。 |
| `Range` | • `Range.EMPTY`<br>• `public Range(Vec3 start, Vec3 end)`<br>• `public static Range of(Vec3 pos, Vec3 range)`<br>• `contains(Range)` / `contains(Vec3, Vec3)`<br>• `cross(Range)` / `cross(Vec3, Vec3)`<br>• `grow(Range)` / `isEmpty()`<br>• `toAABB()` / `toAABB(Vec3 offset)`<br>• `iterator()` (`Iterable<BlockPos>`) | 表示三维轴对齐区域，实现了 `Iterable<BlockPos>`，可直接在 `for (BlockPos pos : range)` 中遍历与该区域相交的所有方块坐标。 |
| `IPrioritized` | `default int priority()`（默认 `1`）<br>`default int compareTo(IPrioritized o)` | 优先级比较接口。数值越大排序越靠前。 |
| `IRecipeResultOffsetBlock` | `Vec3 getOffset(Level level, BlockPos pos, BlockState state)` | 方块可实现此接口，当 `SpawnItem` 的产出落点位于该方块所在坐标时，自动叠加此方法返回的额外偏移向量（例如漏斗或溜槽将产物导出到指定出口位置）。 |

---

## 四、 事件列表 (`dev.anvilcraft.lib.v2.recipe.event`)

所有事件均发布在 **`NeoForge.EVENT_BUS`** 上：

| 事件类名 | 是否可取消 | 包含字段（Getter）与触发时机 |
| :--- | :---: | :--- |
| `InWorldRecipeEvent` | 否 | `recipeType`、`id`、`recipe`、`context`。在单批 `recipe.assemble(ctx)` 执行完毕后立即触发（此时变更仍在缓存中，尚未 `accept()` 提交到世界）。 |
| `InWorldRecipeCommittedEvent` | 否 | `recipeType`、`id`、`recipe`、`context`、`batchId`。通过 `ctx.afterCommit` 注册，在所有缓存修改成功提交到真实世界后按批次触发。 |
| `InWorldRecipeManagerEvent` / `InWorldRecipeManagerEvent.Init` | 否 | `manager`、`recipeManager`。在数据包配方加载完毕、`RecipeManager` 初始化 `InWorldRecipeManager` 时触发，可供外部模组动态注入代码生成的 `InWorldRecipe`。 |
| `ItemCacheEvent.SelectOutput` | **是 (`ICancellableEvent`)** | `cache`、`stack`、`pos`、`range`、`element`。当 `ItemCache#getOutput` 筛选候选输出容器/物品实体时触发；调用 `setCanceled(true)` 可拒绝向该 `element` 输出。 |
| `ItemCacheEvent.SpawnItemEntity` | 否 | `cache`、`entity`。当 `ItemCache` 在提交阶段即将把新生成的产物 `ItemEntity` 加入世界（`level.addFreshEntity`）前触发。 |
| `ItemEntityEvent` / `ItemEntityEvent.InToBlock` | 否 | `level`、`entity`、`blockPos`、`pos`、`motion`。当世界中的 `ItemEntity` 在 `ItemEntityMixin` 中移动或进入新方块坐标时触发（内部监听器据此触发 `LibRecipeTriggers.ITEM_INTO_BLOCK`）。 |

---

## 五、 原版 `RecipeManager` 与 `RecipeMap` 接口注入扩展 (`injection`)

通过配置 `interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.1:...")`，可在原版 `RecipeManager` 与 `RecipeMap` 上调用以下扩展方法（标记为 `@ApiStatus.Internal`）：

| 注入目标类 | 注入接口 | 方法签名 | 说明 |
| :--- | :--- | :--- | :--- |
| `RecipeManager` | `IRecipeManagerExtension` | `InWorldRecipeManager anvillib$getInWorldRecipeManager()` | 获取当前 `RecipeManager` 持有的 `InWorldRecipeManager` 实例。 |
| `RecipeManager` | `IRecipeManagerExtension` | `void anvillib$setInWorldRecipeManager(InWorldRecipeManager manager)` | 设置 `InWorldRecipeManager` 实例。 |
| `RecipeManager` | `IRecipeManagerExtension` | `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>> recipes)` | 向当前 `RecipeManager` 动态追加一批 `InWorldRecipe`。 |
| `RecipeMap` | `IRecipeMapExtension` | `void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>> recipes)` | 向底层 `RecipeMap` 动态追加一批 `InWorldRecipe`。 |
