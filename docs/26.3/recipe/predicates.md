# 方块、物品与实体谓词 (`IRecipePredicate` 及内置实现)

<BranchContextCard branch="26.3" />

**配方谓词（`IRecipePredicate`）** 定义了世界内配方执行前必须满足的环境检测条件或需要消耗的原料（方块、物品、实体）。本篇详解 `IRecipePredicate` 接口生命周期、6 种内置配方谓词（`HasBlock`、`HasBlockIngredient`、`HasItem`、`HasItemIngredient`、`HasEntity`、`HasEntityIngredient`）、谓词函数（`IPredicateFunction` / `SaveComponentToTag`）以及扩展的数据组件逻辑组合谓词（`AndPredicate` / `OrPredicate` / `NotPredicate`）。

---

## 一、 `IRecipePredicate` 生命周期与快照回滚机制

在 `InWorldRecipe#matches` 和 `assemble` 执行过程中，一个 `IRecipePredicate` 会经历以下 5 个生命周期阶段：

1. **`boolean test(InWorldRecipeContext context)`（条件测试阶段）**：
   检查当前缓存状态是否满足该谓词（例如方块是否匹配、剩余未被占用的物品数量或实体数量是否充足）。**此阶段严禁修改任何缓存状态**。
2. **`void snapshot(InWorldRecipeContext context)`（预留/占用阶段）**：
   当 `test` 返回 `true` 且 `context.push(predicate)` 将该谓词压入匹配栈时调用。用于在不兼容回溯匹配（`ShapelessMatcher.incompatible`）或顺序匹配期间**临时扣除/占用**资源（如 `HasItemIngredient` 调用 `input.shrink(count)` 预扣物品，`HasEntityIngredient` 调用 `cache.reserve(selected)` 锁定实体），防止后续同类型谓词重复匹配同一份物品或实体。
3. **`void rollback(InWorldRecipeContext context)`（回溯释放阶段）**：
   当后续某个谓词匹配失败、触发 `context.pop(predicate)` 回退时调用。归还刚刚在 `snapshot` 中预留的物品或实体。
4. **`void accept(InWorldRecipeContext context)`（确认消耗与函数执行阶段）**：
   当整条配方的全部谓词都匹配成功、进入 `InWorldRecipe#assemble` 时依次调用：
   - `HasBlockIngredient` 在此时将 `BlockCache` 中对应位置的方块设为空气并注册 `BlockCache.DEFAULT_ACCEPTOR`；
   - `HasItem` / `HasItemIngredient` 在此时对匹配到的物品执行 `IPredicateFunction`（如提取数据组件存入 `TagCache`），若 `HasItemIngredient` 设置了 `consume = false`（催化剂），还会调用 `input.restoreConsumedItems()` 归还物品；
   - `HasEntityIngredient` 在此时调用 `EntityCache#consume` 将预留实体标记为待移除并记录经验与掉落物设置。
5. **`void clearStack(InWorldRecipeContext context)`（单批次清理阶段）**：
   单批 `assemble` 末尾调用，清空当前谓词的临时事务栈，为下一批次（多倍效率循环）做准备。

---

## 二、 6 种内置配方谓词详解与对比

| 谓词类名 | 注册表 ID (`anvillib_recipe:*`) | 是否冲突 (`conflict()`) | 默认优先级 (`priority()`) | 核心作用 |
| :--- | :--- | :---: | :---: | :--- |
| **`HasBlock`** | `has_block` | `false` | `1` | **只读方块检测**：检查 `context.pos + offset` 处的方块状态与方块实体 NBT，不消耗方块。 |
| **`HasBlockIngredient`** | `has_block_ingredient` | `false` | `100` | **方块原料消耗**：检查 `context.pos + offset` 处的方块，并在 `accept` 时将其移除为空气。 |
| **`HasItem`** | `has_item` | `false` | `1` | **只读物品检测**：检查以 `context.pos + offset` 为中心、`range` 为半径区域内的物品总数是否满足 `MinMaxBounds.Ints` 区间，不消耗物品。 |
| **`HasItemIngredient`** | `has_item_ingredient` | **`true`** | `10 * count`（若带组件则为 `100 * count`） | **物品原料消耗 / 催化剂**：在 `snapshot` 时预扣指定数量的物品；若 `consume = false` 则作为催化剂在同一批次独占后于 `accept` 时归还。 |
| **`HasEntity`** | `has_entity` | `false` | `1` | **只读实体检测**：检查范围内满足原版 `EntityPredicate` 的实体数量是否落在 `MinMaxBounds.Ints` 区间内（可检测玩家），不预留或消耗实体。 |
| **`HasEntityIngredient`** | `has_entity_ingredient` | **`true`** | `1` | **实体原料消耗**：在 `snapshot` 时预留 `count` 只非玩家实体，在提交时直接移除实体，并可按 `experienceMultiplier` 产生经验球、按 `dropItems` 触发战利品/容器掉落。 |

---

## 三、 完整代码示例

### 1. 组合使用方块、物品（含催化剂与组件提取）与实体谓词

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder;
import dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers;
import dev.anvilcraft.lib.v2.recipe.InWorldRecipe;
import net.minecraft.advancements.predicates.MinMaxBounds;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;

public final class PredicateRecipeExample {
    private static final Identifier SAVED_ENCHANTMENTS =
        Identifier.fromNamespaceAndPath("my_mod", "book_enchants");

    private PredicateRecipeExample() {
    }

    public static InWorldRecipe createRitualRecipe() {
        return InWorldRecipeBuilder.incompatible(LibRecipeTriggers.ITEM_INTO_BLOCK)
            // 1. HasBlock：下方 1 格必须是点燃的灵魂营火（只读不消耗）
            .hasBlock(block -> block
                .below(1)
                .of(Blocks.SOUL_CAMPFIRE)
                .with(CampfireBlock.LIT, true)
            )
            // 2. HasBlockIngredient：上方 1 格必须有铁块或金块（使用 or() 连接多分支），合成后消耗该方块
            .hasBlockIngredient(block -> block
                .above(1)
                .of(Blocks.IRON_BLOCK)
                .or()
                .of(Blocks.GOLD_BLOCK)
            )
            // 3. HasItem：周围 2x2x2 范围内至少有 4 个萤石粉在场（只读检测）
            .hasItem(item -> item
                .range(2.0)
                .of(Items.GLOWSTONE_DUST)
                .moreThan(4)
            )
            // 4. HasItemIngredient：消耗 1 本附魔书，并将 STORED_ENCHANTMENTS 组件保存到 TagCache
            .hasItemIngredient(ing -> ing
                .range(1.5)
                .of(Items.ENCHANTED_BOOK)
                .count(1)
                .saveComponent(DataComponents.STORED_ENCHANTMENTS, SAVED_ENCHANTMENTS)
            )
            // 5. HasEntity：只读检测 4 格范围内存在 1~3 只村民
            .hasEntity(entity -> entity
                .range(4.0)
                .of(EntityType.VILLAGER)
                .count(MinMaxBounds.Ints.between(1, 3))
            )
            // 6. HasEntityIngredient：消耗 4 格范围内的 1 只僵尸，产出 2.0 倍经验并开启战利品掉落
            .hasEntityIngredient(mob -> mob
                .range(4.0)
                .of(EntityType.ZOMBIE)
                .count(1)
                .experienceMultiplier(2.0f)
                .dropItems(true)
            )
            .build();
    }
}
```

### 2. 使用 `AndPredicate` / `OrPredicate` / `NotPredicate` 构建复杂物品组件匹配

`module.recipe` 在 `LibDataComponentPredicates` 中注册了 `anvillib:and`、`anvillib:or`、`anvillib:not` 三种逻辑组合 `DataComponentPredicate`，可嵌套在 `DataComponentMatchers` 中使用：

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.data.advancement.predicate.item.AndPredicate;
import dev.anvilcraft.lib.v2.recipe.data.advancement.predicate.item.NotPredicate;
import dev.anvilcraft.lib.v2.recipe.init.LibDataComponentPredicates;
import net.minecraft.advancements.predicates.DataComponentMatchers;
import net.minecraft.advancements.predicates.MinMaxBounds;
import net.minecraft.core.component.predicates.DamagePredicate;
import net.minecraft.core.component.predicates.DataComponentPredicates;

public final class ComponentMatchExample {
    public static DataComponentMatchers undamagedItemMatcher() {
        // 使用 NotPredicate 对原版 DAMAGE 谓词取反：要求物品受损值不能 >= 1
        NotPredicate notDamaged = NotPredicate.of(
            DataComponentPredicates.DAMAGE,
            DamagePredicate.durability(MinMaxBounds.Ints.atLeast(1))
        );
        return DataComponentMatchers.Builder.components()
            .partial(LibDataComponentPredicates.NOT.get(), notDamaged)
            .build();
    }
}
```

---

## 四、 各谓词类与 Builder API 签名详表

### 1. `HasBlock` 与 `HasBlockIngredient`（继承自 `HasBlockBase<T>`）

两者拥有完全相同的 `Builder` 方法签名，区别仅在于 `HasBlockIngredient` 会在 `accept(context)` 时调用 `BlockCache#removeBlock(blockPos)` 移除该方块：

| `HasBlock.Builder` / `HasBlockIngredient.Builder` 方法 | 说明 |
| :--- | :--- |
| `offset(Vec3)` / `offset(double x, double y, double z)`<br>`below(double)` / `below()` / `above(double)` / `above()` | 设置检测位置相对于 `context.getPos()` 的偏移量（默认 `Vec3.ZERO`）。 |
| `of(Block... blocks)` / `of(Collection<Block> blocks)` / `of(HolderGetter<Block>, TagKey<Block>)` | 限定允许匹配的方块或方块标签。 |
| `with(Property<?>, String)` / `with(Property<Integer>, int)` / `with(Property<Boolean>, boolean)` / `<T extends Comparable<T>> with(Property<T>, T)` | 限定方块状态属性必须等于指定值。 |
| `<T extends Comparable<T>> with(Property<T>, @Nullable T minValue, @Nullable T maxValue)` / `withMin(Property<T>, T)` / `withMax(Property<T>, T)` | 限定可比较方块属性（如年龄 `AGE`、水分 `LEVEL`、能量等级）落在指定闭区间 `[minValue, maxValue]` 内。 |
| `or()` | 在底层 `BlockStatePredicate.Builder` 中开启一个新的“或（OR）”条件分支。 |
| `predicate(Consumer<BlockStatePredicate.Builder>)` | 直接配置底层的 `BlockStatePredicate.Builder`（如添加 `.nbt(CompoundTag)` 校验方块实体 NBT）。 |
| `build()` | 构建 `HasBlock` 或 `HasBlockIngredient` 实例。 |

### 2. `HasItem` 与 `HasItemIngredient`（继承自 `HasItemBase<T, P>`）

| 方法签名 | 所属 Builder | 说明 |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(double, double, double)` / `below(...)` / `above(...)` | 两者共用 | 设置检测中心相对于 `context.getPos()` 的偏移（默认 `Vec3.ZERO`）。 |
| `range(Vec3)` / `range(double x, double y, double z)` / `range(double r)` | 两者共用 | 设置以偏移点为中心的搜索半径（半边长，默认 `(1.0, 1.0, 1.0)`）。 |
| `of(ItemLike... items)` / `of(HolderGetter<Item>, TagKey<Item>)` | 两者共用 | 限定匹配的物品或物品标签。 |
| `has(DataComponentMatchers components)` | 两者共用 | 限定物品必须满足的数据组件匹配条件。 |
| `function(IPredicateFunction<?>... function)` | 两者共用 | 添加在 `accept` 阶段对匹配物品执行的谓词函数。 |
| `saveComponent(DataComponentType<?> component, Identifier path)` | 两者共用 | 快捷添加 `new SaveComponentToTag<>(component, path)`，将原料物品上的指定组件编码为 NBT `Tag` 存入 `TagCache` 的 `path` 键下（若物品无此组件则从 `TagCache` 移除该键），供后续 `SpawnItem.Builder#applyComponent` 写回产物。 |
| `count(MinMaxBounds.Ints)` / `moreThan(int min)` / `between(int min, int max)` / `lessThan(int max)` | 仅 `HasItem.Builder` | 设置只读物品检测的数量区间。 |
| `count(int count)` | 仅 `HasItemIngredient.Builder` | 设置需要消耗（或预留）的正整数物品数量（必须 `> 0`，否则构造时抛出 `IllegalArgumentException`）。 |
| `consume(boolean consume)` | 仅 `HasItemIngredient.Builder` | 默认为 `true`。若设为 `false`，该物品作为**催化剂**：在当前批次匹配期间被 `shrink` 独占锁定（不能被同一批次的其他谓词重复使用），但在当前批次 `accept` 阶段通过 `restoreConsumedItems()` 原样归还给下一批次或原容器。 |

### 3. `HasEntity`、`HasEntityIngredient` 与 `EntityConditionBuilder<B>`

`HasEntity.Builder` 与 `HasEntityIngredient.Builder` 均继承自 `EntityConditionBuilder<B>`：

| 方法签名 | 所属类 | 说明与边界条件 |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(double x, double y, double z)` | `EntityConditionBuilder` | 设置检测中心偏移（默认 `Vec3.ZERO`）。 |
| `range(Vec3)` / `range(double x, double y, double z)` / `range(double size)` | `EntityConditionBuilder` | 设置以 `context.pos + offset` 为中心的**包围盒总尺寸** `AABB.ofSize(center, range.x * 2, range.y * 2, range.z * 2)`（默认 `(1, 1, 1)`）。 |
| `predicate(EntityPredicate)` / `predicate(Consumer<EntityPredicate.Builder>)` | `EntityConditionBuilder` | 设置原版 `EntityPredicate` 条件（**注意**：调用该方法会替换此前通过 `of(...)` 设置的条件）。 |
| `of(EntityType<?> type)` / `of(HolderGetter<EntityType<?>>, TagKey<EntityType<?>>)` | `EntityConditionBuilder` | 快捷设置匹配指定实体类型或实体类型标签的 `EntityPredicate`。 |
| `count(MinMaxBounds.Ints)` / `count(int atLeast)` | `HasEntity.Builder` | 设置只读实体数量区间（`count(int)` 表示 `MinMaxBounds.Ints.atLeast(count)`，默认 `>= 1`）。可匹配玩家。 |
| `count(int count)` | `HasEntityIngredient.Builder` | 设置要消耗的实体正整数数量（默认 `1`，`<= 0` 抛出 `IllegalArgumentException`）。**不可匹配玩家或已被 `ItemCache` 占用的 `ItemEntity`/容器实体**。 |
| `experienceMultiplier(float multiplier)` | `HasEntityIngredient.Builder` | 设置生物被消耗时产生的经验倍率（默认 `0.0f`，必须为有限非负数，否则抛出 `IllegalArgumentException`）。实际产出经验为 `floor(baseXp * multiplier)`。 |
| `dropItems(boolean dropItems)` | `HasEntityIngredient.Builder` | 设置被消耗的实体是否产生掉落物（默认 `false`）。若为 `true`，生物走无击杀者的原版死亡战利品与装备掉落（触发 `LivingDropsEvent`），非生物（如矿车/船）保留其移除掉落；若为 `false`，还会抑制容器实体移除时的内容物自动散落。 |

### 4. `IPredicateFunction`、`SaveComponentToTag` 与逻辑组件谓词

| 类 / 接口名 | 关键签名 | 说明 |
| :--- | :--- | :--- |
| `IPredicateFunction<T>` | `public interface IPredicateFunction<T> extends BiFunction<InWorldRecipeContext, T, T>` | 谓词函数接口，通过 `LibRegistries.PREDICATE_FUNCTION_TYPE_REGISTRY` 分发编解码。 |
| `SaveComponentToTag<T>` | `public record SaveComponentToTag<T>(DataComponentType<T> component, Identifier path)` | 注册名 `anvillib_recipe:save_component_2_component`（`LibPredicateFunctionTypes.SAVE_COMPONENT_TO_TAG`）。将输入 `ItemStackTemplate` 上的 `component` 序列化为 NBT `Tag` 存入 `TagCache` 的 `path` 下。 |
| `AndPredicate` | `public static AndPredicate of(Type<?> type, DataComponentPredicate sub)`<br>`public AndPredicate with(Type<?> type, DataComponentPredicate sub)` | 注册名 `anvillib:and`（`LibDataComponentPredicates.AND`）。当所有子组件谓词均匹配时返回 `true`。 |
| `OrPredicate` | `public static OrPredicate of(Type<?> type, DataComponentPredicate sub)`<br>`public OrPredicate with(Type<?> type, DataComponentPredicate sub)` | 注册名 `anvillib:or`（`LibDataComponentPredicates.OR`）。当任意一个子组件谓词匹配时返回 `true`。 |
| `NotPredicate` | `public static NotPredicate of(Type<?> type, DataComponentPredicate sub)` | 注册名 `anvillib:not`（`LibDataComponentPredicates.NOT`）。当子组件谓词不匹配时返回 `true`。 |
