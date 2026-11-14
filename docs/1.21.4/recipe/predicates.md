# 配方条件谓词与谓词函数 (`dev.anvilcraft.lib.v2.recipe.predicate`)

<BranchContextCard branch="1.21.4" />

**配方谓词（`IRecipePredicate`）**用于描述世界内配方执行所需的条件与原料消耗。根据 `predicate.getType().conflict()` 的不同，谓词分为两大类：
- **非冲突条件谓词（`conflict() == false`）**：只检查世界状态而不消耗资源（如 `HasItem`、`HasBlock`、`HasEntity`）；
- **冲突原料谓词（`conflict() == true`）**：在匹配阶段（`snapshot`）先在缓存中预扣/预约资源（若后续条件失败则通过 `rollback` 无损回滚），并在匹配成功组装阶段（`accept`）真正登记资源消耗（如 `HasItemIngredient`、`HasBlockIngredient`、`HasEntityIngredient`）。

---

## 一、 内置的 6 种配方谓词一览 (`LibRecipePredicateTypes`)

| 谓词类名 | 注册表 ID (`anvillib_recipe:<id>`) | 是否冲突 (`conflict`) | 默认优先级 (`priority`) | 核心语义 |
| :--- | :--- | :---: | :---: | :--- |
| **`HasItem`** | `anvillib_recipe:has_item` | `false` | `1` | 检查区域内是否存在满足 `ItemPredicate`（含数量区间、组件与子谓词）的物品，**不消耗**。 |
| **`HasItemIngredient`** | `anvillib_recipe:has_item_ingredient` | **`true`** | `1` | 检查并在匹配时预扣满足 `ItemIngredientPredicate` 的物品原料；支持设置 **`.consume(false)` 作为催化剂（本批独占预约，批末恢复，不消耗）**。 |
| **`HasBlock`** | `anvillib_recipe:has_block` | `false` | `1` | 检查相对偏移 `offset` 处的方块状态与方块实体 NBT 是否满足 `BlockStatePredicate`，**不改变方块**。 |
| **`HasBlockIngredient`** | `anvillib_recipe:has_block_ingredient` | **`true`** | `1` | 检查相对偏移 `offset` 处的方块状态，并在配方提交时**将该坐标方块消耗替换为空气 `Blocks.AIR`**。 |
| **`HasEntity`** | `anvillib_recipe:has_entity` | `false` | `1` | 检查区域内是否存在满足原版 `EntityPredicate` 与数量范围 `MinMaxBounds.Ints` 的存活实体，**不消耗也不预约**。 |
| **`HasEntityIngredient`** | `anvillib_recipe:has_entity_ingredient` | **`true`** | `1` | 在匹配时独占预约区域内的非玩家实体（防止同一实体被多个条件或配方重复匹配），并在提交时**移除实体并按配置产生死亡掉落物与经验奖励**。 |

---

## 二、 物品条件与物品原料谓词 (`HasItem` & `HasItemIngredient`)

两者均继承自 `HasItemBase<T, P>`，通过 `ItemCache` 同时检索指定中心 `ctx.getPos().add(offset)` 周围 `range` 包围盒内的地面掉落物（`ItemEntity`）与邻近容器槽位（`IItemHandler`）。`applyFunctions` 会在调用谓词函数前先对 `ItemStack` 执行 `.copy()`，避免污染原始堆栈。

### 1. 催化剂预约机制 (`HasItemIngredient.Builder#consume(false)`)

当你在 `HasItemIngredient.Builder` 上调用 **`.consume(false)`** 时：
- 在同一个批次内，该谓词依然会调用 `input.shrink(count)` 预扣该物品，从而**防止同一个催化剂被同一批次的另一个原料谓词重复占用**；
- 在该批次 `accept(ctx)` 结算时，若 `input.supportsConsumptionReceipts()` 为 `true`（内置 `ICacheInputOutputImpl` 已实现），框架先对被预扣的物品快照 `getConsumedItems()` 执行 `functions`（例如通过 `saveComponent` 提取催化剂上的附魔或名称），随后立即调用 `input.restoreConsumedItems()` 将催化剂原封不动地归还回原始物理槽位或掉落物。

### 2. 谓词函数：`SaveComponentToTag` (`anvillib_recipe:save_component_2_tag`)

`HasItem` 和 `HasItemIngredient` 均支持挂载 `List<IPredicateFunction<?>>`。内置的 **`SaveComponentToTag<T>(DataComponentType<T> component, ResourceLocation path)`** 可以将匹配到的输入物品上的指定 `DataComponentType<T>` 序列化为 NBT（若组件不存在则从 `TagCache` 移除该键），并按给定的 `ResourceLocation path` 存入当前上下文的 **`TagCache`** 中，供后续 `SpawnItem` 的 `ApplyTagToComponent` 读取继承。

### 3. 逻辑组合子谓词 (`AndPredicate` / `OrPredicate` / `NotPredicate`)

`LibItemSubPredicates` 向原版 `BuiltInRegistries.ITEM_SUB_PREDICATE_TYPE` 注册了 3 个逻辑组合 `ItemSubPredicate`：
- `LibItemSubPredicates.AND` (`anvillib:and`)：`AndPredicate(List<Map.Entry<Type<?>, ItemSubPredicate>> subPredicates)`，提供静态工厂 `AndPredicate.of(type, subPredicate)` 与链式 `.with(type, subPredicate)`；
- `LibItemSubPredicates.OR` (`anvillib:or`)：`OrPredicate(List<Map.Entry<Type<?>, ItemSubPredicate>> subPredicates)`，提供静态工厂 `OrPredicate.of(type, subPredicate)` 与链式 `.with(type, subPredicate)`；
- `LibItemSubPredicates.NOT` (`anvillib:not`)：`NotPredicate(Type<?> type, ItemSubPredicate subPredicate)`，提供静态工厂 `NotPredicate.of(type, subPredicate)`。

### 4. `HasItem` / `HasItemIngredient` 与 `Builder` 方法详表

| 方法签名 | 适用类 | 说明 |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(x, y, z)` / `below([d])` / `above([d])` | 两者共有 | 设置相对配方中心的检索中心偏移量（默认 `Vec3.ZERO`）。 |
| `range(Vec3)` / `range(x, y, z)` / `range(double r)` | 两者共有 | 设置检索长方体三轴尺度（默认 `(1.0, 1.0, 1.0)`；`Range.of(pos, range)` 取半长 `range / 2`）。 |
| `of(ItemLike... items)` / `of(TagKey<Item> tag)` | 两者共有 | 设置允许匹配的物品或物品标签。 |
| `has(DataComponentPredicate components)` | 两者共有 | 设置必须满足的数据组件谓词。 |
| `<T extends ItemSubPredicate> with(ItemSubPredicate.Type<T> type, T predicate)` | 两者共有 | 添加物品子谓词（如耐久度、附魔或 `AndPredicate`/`OrPredicate`/`NotPredicate`）。 |
| `saveComponent(DataComponentType<?> component, ResourceLocation path)`<br>`function(IPredicateFunction<?>... function)` | 两者共有 | 提取匹配物品上的数据组件保存到 `TagCache` 的 `path` 路径下。 |
| `count(MinMaxBounds.Ints)` / `moreThan(int min)` / `between(int min, int max)` / `lessThan(int max)` | 仅 `HasItem.Builder` | 设置检测数量范围（闭区间）。 |
| `count(int count)` | 仅 `HasItemIngredient.Builder` | 设置需要消耗/预约的正整数物品数量（必须 `> 0`，默认 `1`）。 |
| `consume(boolean consume)` | 仅 `HasItemIngredient.Builder` | 设为 `false` 时作为不消耗的催化剂预约（默认 `true`）。 |
| `static HasItemIngredient fromPredicate(ItemIngredientPredicate, Vec3 offset, Vec3 range)` | `HasItemIngredient` | 从已有的 `ItemIngredientPredicate` 直接构造 `HasItemIngredient`。 |

---

## 三、 方块条件与方块原料谓词 (`HasBlock` & `HasBlockIngredient`)

两者均继承自 `HasBlockBase<T>`，内部持有一个 `Vec3 offset` 和一个 `BlockStatePredicate predicate`（来自 `module.util`）。在 `test(ctx)` 时通过 `BlockCache` 读取 `BlockPos.containing(ctx.getPos().add(offset))` 处的方块状态和方块实体并校验。

| Builder 方法签名（`HasBlock.Builder` 与 `HasBlockIngredient.Builder` 相同） | 说明 |
| :--- | :--- |
| `offset(Vec3)` / `offset(x, y, z)` / `below([d])` / `above([d])` | 设置目标方块相对于配方触发点的偏移坐标（默认 `Vec3.ZERO`）。 |
| `predicate(Consumer<BlockStatePredicate.Builder> consumer)` | 直接操作底层 `BlockStatePredicate.Builder`（如通过它设置 `withNbt(...)` 等）。 |
| `of(Block... blocks)` / `of(Collection<Block> blocks)` / `of(TagKey<Block> tag)` | 设置允许的方块列表或方块标签。 |
| `with(Property<?> property, String value)`<br>`with(Property<Integer>, int)` / `with(Property<Boolean>, boolean)`<br>`<T extends Comparable<T>> with(Property<T>, T value)` | 添加单个方块属性的精确匹配条件。 |
| `<T extends Comparable<T>> with(Property<T> property, @Nullable T minValue, @Nullable T maxValue)`<br>`withMin(Property<T>, T minValue)` / `withMax(Property<T>, T maxValue)` | 添加方块属性的闭区间范围匹配条件。 |
| `or()` | 结束当前一组 `AND` 属性条件，开启下一组 `OR` 分支。 |
| `build()` | 构建 `HasBlock` 或 `HasBlockIngredient` 实例。 |

> **剪枝加速提示**：
> 所有通过 `HasBlock` 或 `HasBlockIngredient` 限定了非空方块集合（`blocks.size() > 0`）的配方，在注册进 `InWorldRecipeManager` 时都会被自动提取进 `PrunePlan` 二部图剪枝器中。同一相对坐标 `offset` 只会读取一次世界方块，不匹配的配方在进入 `recipe.matches(...)` 前就会被批量一票否决。

---

## 四、 实体条件与实体原料谓词 (`HasEntity` & `HasEntityIngredient`)

两者构建器均继承自 `EntityConditionBuilder<B>`，通过 `EntityCache` 在以 `ctx.getPos().add(offset)` 为中心、`range` 为包围盒尺度的区域内搜索存活实体（按距离原点由近到远、再按 UUID 排序）。

### 1. 安全边界与物品宿主互斥

在检索阶段（`EntityCache#find`）：
- `HasEntity` 和 `HasEntityIngredient` 都会自动忽略未存活实体（`!entity.isAlive()`）；
- `HasEntityIngredient`（`ingredient = true`）还会**强制跳过所有玩家实体（`entity instanceof Player`）**，并且通过 `ItemCache#canConsumeEntity` 确保：若某实体自身带有物品槽位（如实现 `IItemHandlerCache` 或带 `#anvillib:item_cache` 标签）且其槽位物品已被本配方其他条件占用，则禁止再将该实体作为实体原料整只消耗；反之，一旦某实体被 `HasEntityIngredient` 预约，其携带的槽位也不能再被 `ItemCache` 使用。

### 2. 代码示例：`HasEntity` 与 `HasEntityIngredient`（含掉落物与经验奖励）

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.predicate.entity.HasEntity;
import dev.anvilcraft.lib.v2.recipe.predicate.entity.HasEntityIngredient;
import net.minecraft.advancements.critereon.MinMaxBounds;
import net.minecraft.world.entity.EntityType;

public final class EntityPredicateExamples {
    // 示例 1：要求周围 5x5x5 范围内至少存在 2 只绵羊（仅检查，不消耗）
    public static HasEntity checkTwoSheepNearby() {
        return HasEntity.builder()
            .of(EntityType.SHEEP)
            .range(5.0)
            .count(MinMaxBounds.Ints.atLeast(2))
            .build();
    }

    // 示例 2：消耗配方中心上方 1 格处的 1 只铁傀儡，保留死亡战利品并产出 1.5 倍经验
    public static HasEntityIngredient sacrificeIronGolem() {
        return HasEntityIngredient.builder()
            .offset(0.0, 1.0, 0.0)
            .range(2.0, 2.0, 2.0)
            .of(EntityType.IRON_GOLEM)
            .count(1)
            .dropItems(true)
            .experienceMultiplier(1.5F)
            .build();
    }
}
```

### 3. `EntityConditionBuilder`、`HasEntity.Builder` 与 `HasEntityIngredient.Builder` 方法详表

| 方法签名 | 适用类 | 说明 |
| :--- | :--- | :--- |
| `offset(Vec3)` / `offset(double x, double y, double z)` | 两者共有 | 设置实体搜索中心相对配方触发点的偏移量（默认 `Vec3.ZERO`）。 |
| `range(Vec3)` / `range(double x, double y, double z)` / `range(double size)` | 两者共有 | 设置搜索包围盒尺寸（默认 `(1, 1, 1)`）。 |
| `predicate(EntityPredicate)` / `predicate(Consumer<EntityPredicate.Builder>)` | 两者共有 | 使用原版 `EntityPredicate` 进行深度过滤（如装备、生命、运动状态、NBT 等）。 |
| `of(EntityType<?> type)`<br>`of(HolderGetter<EntityType<?>> lookup, TagKey<EntityType<?>> tag)` | 两者共有 | 按单个实体类型（`BuiltInRegistries.ENTITY_TYPE`）或实体类型标签过滤。 |
| `count(MinMaxBounds.Ints count)`<br>`count(int count)` | 仅 `HasEntity.Builder` | 设置要求存在的实体数量范围（默认 `MinMaxBounds.Ints.atLeast(1)`；`count(int)` 等价于 `atLeast(count)`）。 |
| `count(int count)` | 仅 `HasEntityIngredient.Builder` | 设置本批次需要预约并消耗的实体数量（必须 `> 0`，默认 `1`）。 |
| `experienceMultiplier(float multiplier)` | 仅 `HasEntityIngredient.Builder` | 经验掉落倍率（必须有限且 `>= 0`，默认 `0f`；受游戏规则 `RULE_DOMOBLOOT` 约束）。 |
| `dropItems(boolean dropItems)` | 仅 `HasEntityIngredient.Builder` | 是否在实体消耗时通过 `EntityDropCapture` 捕获其死亡战利品并在提交后投入世界（默认 `false`；受 `RULE_DOMOBLOOT` / `RULE_DOENTITYDROPS` 约束）。 |

---

## 五、 自定义 `IRecipePredicate` 与 `IPredicateFunction` 扩展指南

若需编写自定义配方条件或谓词函数，请分别注册到：
- `LibRegistries.PREDICATE_KEY`（`anvillib:predicate` / `LibRegistries.PREDICATE_TYPE_REGISTRY`）
- `LibRegistries.PREDICATE_FUNCTION_KEY`（`anvillib:predicate_function` / `LibRegistries.PREDICATE_FUNCTION_TYPE_REGISTRY`）

| `IRecipePredicate<P>` 生命周期方法 | 调用阶段与职责 |
| :--- | :--- |
| `boolean test(InWorldRecipeContext context)` | 判断当前世界/缓存状态是否满足条件（不得在此方法内做不可逆修改）。 |
| `default void snapshot(InWorldRecipeContext context)` | 当 `test(ctx)` 通过并被压入 `ctx.push(predicate)` 时调用：在缓存中预扣或预约资源。 |
| `default void rollback(InWorldRecipeContext context)` | 当后续谓词匹配失败触发回溯弹出 `ctx.pop(predicate)` 时调用：撤销刚才在 `snapshot` 中做的预扣。 |
| `default void accept(InWorldRecipeContext context)` | 当整条配方所有谓词全部匹配成功、进入 `recipe.assemble` 时调用：登记最终提交动作（`ctx.putAcceptor` 或 `ctx.afterCommit`）。 |
| `default void clearStack(InWorldRecipeContext context)` | 单个批次组装完成收尾时调用，清理临时回滚栈帧。 |
| `IRecipePredicate.Type<P>#conflict()` | 返回 `true` 表示冲突性原料谓词（进入 `conflicting` 列表并参与回溯/顺序匹配），默认 `false`。 |
