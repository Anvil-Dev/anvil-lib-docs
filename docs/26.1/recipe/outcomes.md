# 配方输出、属性映射与受限批次规划 (`IRecipeOutcome` / `ItemBatchPlan`)

<BranchContextCard branch="26.1" />

**配方结果（`IRecipeOutcome`）** 定义了世界内配方匹配并消耗完原料后产生的世界效果或产物。本篇详解 `IRecipeOutcome` 与 `IPlannedItemOutcome` 接口、5 种内置产出类型（`SpawnItem`、`SetBlock`、`SpawnEntity`、`ProduceExplosion`、`ChooseOneOutcome`）、方块状态属性继承与映射（`BlockPropertyMapping`）、结果函数（`IOutcomeFunction` / `ApplyTagToComponent`）以及容器受限批次规划器 `ItemBatchPlan`。

---

## 一、 5 种内置配方结果一览 (`LibRecipeOutcomeTypes`)

| 结果类名 | 注册表 ID (`anvillib_recipe:*`) | 实现接口 | 核心作用与执行阶段 |
| :--- | :--- | :--- | :--- |
| **`SpawnItem`** | `spawn_item` | `IPlannedItemOutcome<SpawnItem>` | 计算随机数量（`0~99`）、应用方块偏移（`IRecipeResultOffsetBlock`）与结果函数（`IOutcomeFunction`）后，向 `ItemCache` 写入产物物品。 |
| **`SetBlock`** | `set_block` | `IRecipeOutcome<SetBlock>` | 在 `BlockCache` 中设置目标方块状态（支持同名属性继承 `copyProperties`、跨属性映射 `propertyMappings`、双格方块同步转换与方块实体 `CompoundTag` 加载）。 |
| **`SpawnEntity`** | `spawn_entity` | `IRecipeOutcome<SpawnEntity>` | 在规划阶段预创建 `0~99` 只非玩家实体（清洗 UUID/Pos，支持乘客 NBT），并在 `context.afterCommit` 事务提交成功后加入世界。 |
| **`ProduceExplosion`** | `produce_explosion` | `IRecipeOutcome<ProduceExplosion>` | 在 `context.afterCommit` 事务提交成功后，于 `context.pos + offset` 处触发威力为 `power` 的原版爆炸。 |
| **`ChooseOneOutcome`** | `choose_one` | `IRecipeOutcome<ChooseOneOutcome>` | 按前缀和权重（`Choice.weight`）随机抽取一个子 `IRecipeOutcome` 并调用其 `acceptWithChance(context)`。 |

---

## 二、 方块状态继承与映射 (`SetBlock` & `BlockPropertyMapping`)

### 1. 要解决什么问题 / 怎么用

在方块转换配方中（例如：给切制铜楼梯涂蜡变成涂蜡切制铜楼梯，或将朝北的活塞转化为沿 Z 轴放置的原木），通常希望保留原方块的朝向（`facing`）、上下半（`half`）、含水状态（`waterlogged`），或将源属性映射为目标属性。

`SetBlock` 按以下严格顺序计算最终方块状态（`SetBlock#transform(BlockState source)`）：
1. **基础状态**：以 `SetBlock` 配置的 `state` 为起点；
2. **同名属性继承（`copyProperties = true`）**：遍历转换前源方块 `source` 的所有属性，若目标方块也有同名属性且能解析相同的属性字面量名称，则自动复制过来；
3. **显式属性映射（`propertyMappings`）**：遍历 `Map<String, BlockPropertyMapping>`（键为目标属性名），从**同一份初始源状态 `source` 快照**读取 `mapping.source()` 属性值，若 `mapping.values()` 为空则直接按字面量复制给目标属性，否则按 `values` 映射表转换后赋给目标属性。
4. **双格方块自动保持**：当开启了 `copyProperties` 或 `propertyMappings` 时，`BlockCache#transformBlock` 会自动识别门、高草、大型花等双格方块（含 `BlockStateProperties.DOUBLE_BLOCK_HALF`），同步转换上下两半并保持各自的 `UPPER` / `LOWER` 属性不变。

### 2. 代码示例：同名属性继承与类型安全属性映射

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.recipe.outcome.SetBlock;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;

import java.util.Map;

public final class SetBlockMappingExamples {
    // 示例 1：涂蜡切制铜楼梯，自动继承原楼梯的 facing、half、shape 与 waterlogged 属性
    public static SetBlock waxCopperStairs() {
        return SetBlock.builder()
            .block(Blocks.WAXED_CUT_COPPER_STAIRS)
            .copyProperties()
            .build();
    }

    // 示例 2：将水平朝向方块（FACING）映射为原木的轴向（AXIS）
    public static SetBlock horizontalToPillarAxis() {
        return SetBlock.builder()
            .block(Blocks.OAK_LOG)
            .mapProperty(
                HorizontalDirectionalBlock.FACING,
                RotatedPillarBlock.AXIS,
                Map.of(
                    Direction.NORTH, Direction.Axis.Z,
                    Direction.SOUTH, Direction.Axis.Z,
                    Direction.EAST, Direction.Axis.X,
                    Direction.WEST, Direction.Axis.X
                )
            )
            .build();
    }
}
```

---

## 三、 受容器容量约束的批次规划 (`ItemBatchPlan` & `IPlannedItemOutcome`)

### 1. 要解决什么问题 / 怎么用

当世界内配方在容量有限的容器（如机器内部槽位、鱼缸、漏斗）中连续执行多批次时，存在两个棘手问题：
1. **满槽死锁问题**：假设容器只有 1 个槽位且装满了 9 个铁锭，要合成 1 个铁块。如果先检查输出空槽，会认为容器已满无法合成；但实际上消耗掉这 9 个铁锭后，该槽位就空出来可以装入 1 个铁块了。
2. **随机数量与副作用重入问题**：如果一个配方产出带随机数量（`UniformGenerator`）或概率（`chance`），在规划阶段算了一次数量，到了真正写入容器时如果再调一次 `acceptWithChance`，随机数就会改变，甚至导致规划时放得下、提交时放不下而溢出丢物品。

**`ItemBatchPlan` 与 `IPlannedItemOutcome` 的解决方案**：
- **`IPlannedItemOutcome#planWithChance(context)`**：在规划每个候选批次时**只抽一次随机数、算一次结果函数**，返回包含确定 `ItemStack` 与坐标的 `List<PlannedItem>`；
- **`ItemBatchPlan.shared`（输入输出共用槽位）与 `ItemBatchPlan.separate`（输入输出独立槽位）**：
  在内存快照上连续模拟最多 `limit` 批配方。每模拟一批，都会检查累计产出的所有确定产物能否装入扣除已消耗原料后的槽位（自动合并同组件物品，并对有不同物品过滤限制的空槽执行带记忆化剪枝的回溯搜索 `fillEmpty`）。
  这样，即使第 1 批因为原料没扣完暂时装不下，只要第 2 批把原料槽彻底腾空使累计产物能装入，规划器就能选出最长的合法批次前缀！
- **`commit(Consumer<ItemBatchPlan>)`**：先在回调中将最终槽位布局 `plan.inputs()` / `plan.outputs()` 写回真实容器，成功后再统一执行所选批次通过 `batch.afterCommit(Runnable)` 注册的燃料扣除、方块修改或事件副作用。

### 2. 完整代码示例：使用 `ItemBatchPlan` 规划并提交容器内多批次合成

```java
package com.example.mymod.machine;

import dev.anvilcraft.lib.v2.recipe.outcome.PlannedItem;
import dev.anvilcraft.lib.v2.recipe.outcome.SpawnItem;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeContext;
import dev.anvilcraft.lib.v2.recipe.util.ItemBatchPlan;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.List;

public final class CompactorBatchProcessor {
    private CompactorBatchProcessor() {
    }

    public static int processCompactor(
        List<ItemStack> sharedInventorySnapshot,
        int maxBatches,
        InWorldRecipeContext context,
        SpawnItem ironBlockOutcome,
        Runnable onEachBatchCommitted
    ) {
        // 1. 在共用槽位快照上规划最长合法批次
        ItemBatchPlan plan = ItemBatchPlan.shared(
            sharedInventorySnapshot,
            maxBatches,
            // SlotCapacity：无副作用地返回每个槽位允许存放指定物品的最大容量（0 表示拒绝）
            (slot, stack) -> Math.min(64, stack.getMaxStackSize()),
            batch -> {
                // 要求本批存在 1 个铁砧作为催化剂（本批独占，下批可复用）
                if (batch.catalyst(stack -> stack.is(Items.ANVIL), 1).isEmpty()) {
                    return false;
                }
                // 预约消耗 9 个铁锭
                List<ItemStack> consumed = batch.take(stack -> stack.is(Items.IRON_INGOT), 9);
                if (consumed.isEmpty()) {
                    return false;
                }
                // 抽取一次确定产物并放入本批规划（严禁在提交时二次抽取随机数）
                List<PlannedItem> plannedOutputs = ironBlockOutcome.planWithChance(context);
                for (PlannedItem planned : plannedOutputs) {
                    batch.produce(planned.stack());
                }
                // 注册仅在本批最终被采纳并提交成功后才执行的副作用
                batch.afterCommit(onEachBatchCommitted);
                return true;
            }
        );

        // 2. 提交规划结果（若 batches() == 0，commit 会直接安全返回）
        plan.commit(committedPlan -> {
            List<ItemStack> finalLayout = committedPlan.outputs();
            // 将 finalLayout 写回真实容器槽位...
        });

        return plan.batches();
    }
}
```

---

## 四、 公开类与接口 API 详解

### 1. `IRecipeOutcome<O>`、`IPlannedItemOutcome<O>` 与 `PlannedItem`

| 接口 / 记录 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `IRecipeOutcome<O>` | `Type<O> getType()`<br>`default NumberProvider chance()`（默认 `1.0f`）<br>`default void acceptWithChance(InWorldRecipeContext context)` | 配方结果根接口（继承 `Consumer<InWorldRecipeContext>` 与 `IPrioritized`）。`acceptWithChance` 先用 `level.getRandom().nextDouble() <= context.getFloat(chance())` 判定概率，命中才调用 `accept(context)`。 |
| `IPlannedItemOutcome<O>` | `List<PlannedItem> plan(InWorldRecipeContext context)`<br>`default List<PlannedItem> planWithChance(InWorldRecipeContext context)` | 继承自 `IRecipeOutcome<O>`。将物品产物的数量/组件计算（`plan` / `planWithChance`）与世界提交（`PlannedItem#accept`）解耦。 |
| `PlannedItem` | `public record PlannedItem(ItemStack stack, Vec3 pos)`<br>`public void accept(InWorldRecipeContext context)` | 不可变保存已确定数量与组件的产物副本（构造与 `stack()` 均防御性调用 `copy()`）及其世界目标坐标 `pos`。调用 `accept(context)` 会将物品写入 `ItemCache`。 |

### 2. `SpawnItem`（生成物品结果）

```java
public record SpawnItem(ItemStackTemplate item, Vec3 offset, NumberProvider count, List<IOutcomeFunction<?>> functions)
    implements IPlannedItemOutcome<SpawnItem>
```

- **块偏移联动**：在 `plan(context)` 中，若目标位置 `context.pos + offset` 处的方块实现了 `IRecipeResultOffsetBlock`，会自动叠加 `block.getOffset(level, blockPos, state)`。
- **数量范围**：`context.getInt(this.count, 0, 99)`，单次产出数量限制在 `[0, 99]`。
- **`SpawnItem.Builder` 方法**：
  - `offset(Vec3)` / `offset(double, double, double)` / `below(double)` / `below()` / `above(double)` / `above()`
  - `count(NumberProvider)` / `count(float)`
  - `item(ItemStackTemplate)` / `item(Item)` / `item(ItemLike)`
  - `function(IOutcomeFunction<?>...)`
  - `applyComponent(DataComponentType<?> component, Identifier path)`：添加 `new ApplyTagToComponent<>(component, path)`，从 `TagCache` 读取 `path` 下的 NBT 并解码写入产物 `ItemStack` 的对应数据组件。
  - `SpawnItem.fromChance(ChanceItemStack stack, Vec3 offset)`：静态转换工厂。

### 3. `SetBlock` 与 `BlockPropertyMapping`（设置与转换方块结果）

```java
public record SetBlock(
    BlockState state, CompoundTag nbt, Vec3 offset, NumberProvider chance,
    boolean copyProperties, Map<String, BlockPropertyMapping> propertyMappings
) implements IRecipeOutcome<SetBlock>
```

- **构造期合法性校验**：`SetBlock` 紧凑构造器会遍历 `propertyMappings`，若目标方块不存在某个目标属性名，抛出 `IllegalArgumentException("Unknown target property: ...")`；若映射表中的某个目标值无法被目标属性解析，抛出 `IllegalArgumentException("Invalid target property value: ...")`。
- **`SetBlock.Builder` 方法**：
  - `block(BlockState)` / `block(Block)`
  - `nbt(CompoundTag)`：当目标方块为 `EntityBlock` 时，创建新 `BlockEntity` 并通过 `TagValueInput` + `loadWithComponents` 加载该 NBT。
  - `offset(Vec3)` / `offset(double, double, double)` / `below(...)` / `above(...)`
  - `chance(NumberProvider)` / `chance(float)`
  - `copyProperties()` / `copyProperties(boolean)`：启用或禁用同名属性自动继承。
  - `mapProperty(String source, String target, Map<String, String> values)` / `mapProperty(String source, String target)`
  - `<S extends Comparable<S>, T extends Comparable<T>> mapProperty(Property<S> source, Property<T> target, Map<S, T> values)` / `mapProperty(Property<?> source, Property<?> target)`：类型安全的属性映射。
  - `propertyMappings(Map<String, BlockPropertyMapping>)`

### 4. `SpawnEntity`、`ProduceExplosion` 与 `ChooseOneOutcome`

| 类名 | 记录签名与 Builder / 核心行为说明 |
| :--- | :--- |
| `SpawnEntity` | `public record SpawnEntity(EntityType<?> entity, CompoundTag nbt, Vec3 offset, NumberProvider count, NumberProvider chance)`<br>• **安全限制**：禁止生成玩家（`entity == EntityType.PLAYER` 或乘客中含有 `Player` 会立即抛出 `IllegalArgumentException`）；递归清洗 `nbt` 及所有 `Passengers` 中的 `UUID`/`uuid` 与 `Pos`/`pos`，重新分配随机 UUID 并强制设置坐标为 `context.pos + offset`。<br>• **原生初始化**：若 `nbt.isEmpty()` 且生成的实体为 `Mob`，在 `afterCommit` 中自动调用 `EventHooks.finalizeMobSpawn(...)` 执行原版生成初始化（如随机装备、属性加成）。<br>• `Builder` 方法：`entity(EntityType<?>)`、`nbt(CompoundTag)`、`offset(Vec3 / double,double,double)`、`count(NumberProvider / int)`、`chance(NumberProvider / float)`、`build()`。 |
| `ProduceExplosion` | `public record ProduceExplosion(Vec3 offset, float power, boolean fire, Level.ExplosionInteraction explodeInteraction, NumberProvider chance)`<br>• 在 `context.afterCommit` 中调用 `level.explode(null, ctr.x, ctr.y, ctr.z, power, fire, explodeInteraction)`。 |
| `ChooseOneOutcome` | `public record ChooseOneOutcome(NumberProvider chance, List<Choice> choices)`<br>• 子记录 `Choice(IRecipeOutcome<?> outcome, NumberProvider weight)`。<br>• `Builder` 方法：`chance(NumberProvider / float)`、`choice(Choice)`、`choice(IRecipeOutcome<?>, NumberProvider)`、`choice(IRecipeOutcome<?>, float)`、`build()`。 |

### 5. `ItemBatchPlan`（容器批次规划器）

位于 `dev.anvilcraft.lib.v2.recipe.util.ItemBatchPlan`。

| 方法 / 内部类签名 | 返回值 | 说明与约束 |
| :--- | :--- | :--- |
| `public static ItemBatchPlan separate(List<ItemStack> inputs, List<ItemStack> outputs, int limit, SlotCapacity capacity, Predicate<Batch> recipe)` | `ItemBatchPlan` | 输入槽与输出槽分离的批次规划。`limit < 0` 抛出 `IllegalArgumentException`。 |
| `public static ItemBatchPlan shared(List<ItemStack> inventory, int limit, SlotCapacity capacity, Predicate<Batch> recipe)` | `ItemBatchPlan` | 输入与输出共用同一组槽位的批次规划（先扣除已选批次的原料，再将累计产物排布到剩余空间）。 |
| `public List<ItemStack> inputs()` / `public List<ItemStack> outputs()` | `List<ItemStack>` | 获取规划选定的最终输入槽快照与输出槽快照（共用模式下两者内容相同，只需写入一次）。 |
| `public int batches()` | `int` | 返回最终成功选中的连续批次数（`0 <= batches <= limit`）。 |
| `public void commit(Consumer<ItemBatchPlan> inventoryCommit)` | `void` | 提交计划（**每个 `ItemBatchPlan` 实例只允许调用一次 `commit`**，重复调用抛出 `IllegalStateException`）。若 `batches > 0`，先调用 `inventoryCommit.accept(this)`，成功返回后依次执行所有选中批次的 `afterCommit` 副作用。 |
| `ItemBatchPlan.SlotCapacity` | `int capacity(int slot, ItemStack stack)` | 函数式接口：返回第 `slot` 槽位允许存放 `stack` 的最大数量（`0` 表示拒绝，`< 0` 抛出 `IllegalArgumentException`）。 |
| `ItemBatchPlan.Batch` | • `List<ItemStack> take(Predicate<ItemStack> ingredient, int count)`<br>• `List<ItemStack> catalyst(Predicate<ItemStack> ingredient, int count)`<br>• `void produce(ItemStack stack)`<br>• `void afterCommit(Runnable effect)` | 单批次规划操作对象（仅在 `recipe.test(batch)` 执行期间有效，退出回调后调用任何修改方法均抛出 `IllegalStateException`）。`take` 与 `catalyst` 在数量不足时返回空列表且不改变预约状态。 |
