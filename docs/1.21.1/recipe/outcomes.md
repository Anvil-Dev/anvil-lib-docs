# 配方结果、属性映射与受限批次规划 (`IRecipeOutcome` / `ItemBatchPlan`)

<BranchContextCard branch="1.21.1" />

**配方结果（`IRecipeOutcome`）**定义了世界内配方匹配并消耗完原料后产生的世界效果或产物。本篇详解 `IRecipeOutcome` 与 `IPlannedItemOutcome` 接口、5 种内置产出类型（`SpawnItem`、`SetBlock`、`SpawnEntity`、`ProduceExplosion`、`ChooseOneOutcome`）、方块状态属性继承与映射（`BlockPropertyMapping`）、结果函数（`IOutcomeFunction` / `ApplyTagToComponent`）以及容器受限批次规划器 `ItemBatchPlan`。

---

## 一、 5 种内置配方结果一览 (`LibRecipeOutcomeTypes`)

| 结果类名 | 注册表 ID (`anvillib_recipe:<id>`) | 实现接口 | 核心作用与执行阶段 |
| :--- | :--- | :--- | :--- |
| **`SpawnItem`** | `anvillib_recipe:spawn_item` | `IPlannedItemOutcome<SpawnItem>` | 计算随机数量（钳制到 `[0, 99]`）、应用方块偏移（`IRecipeResultOffsetBlock`）与结果函数（`IOutcomeFunction`）后，向 `ItemCache` 写入产物物品。 |
| **`SetBlock`** | `anvillib_recipe:set_block` | `IRecipeOutcome<SetBlock>` | 在 `BlockCache` 中设置目标方块状态（支持同名属性继承 `copyProperties`、跨属性映射 `propertyMappings`、双格方块同步转换与方块实体 `CompoundTag` 加载）。 |
| **`SpawnEntity`** | `anvillib_recipe:spawn_entity` | `IRecipeOutcome<SpawnEntity>` | 在规划阶段预创建 `[0, 99]` 只非玩家实体（清洗 `UUID`/`Pos`，支持乘客 NBT），并在 `context.afterCommit` 事务提交成功后加入世界。 |
| **`ProduceExplosion`** | `anvillib_recipe:produce_explosion` | `IRecipeOutcome<ProduceExplosion>` | 在 `context.afterCommit` 事务提交成功后，于 `context.pos + offset` 处触发威力为 `power` 的原版爆炸。 |
| **`ChooseOneOutcome`** | `anvillib_recipe:choose_one` | `IRecipeOutcome<ChooseOneOutcome>` | 按前缀和权重（`Choice.weight`）随机抽取一个子 `IRecipeOutcome` 并调用其 `acceptWithChance(context)`。 |

### `IRecipeOutcome<O>` 与 `IPlannedItemOutcome<O>`

| 方法签名 | 所属接口 | 说明 |
| :--- | :--- | :--- |
| `Type<O> getType()` | `IRecipeOutcome<O>` | 返回注册于 `LibRegistries.OUTCOME_TYPE_REGISTRY` 的结果类型。 |
| `default NumberProvider chance()` | `IRecipeOutcome<O>` | 返回触发概率（默认 `ConstantValue.exactly(1.0f)`）。 |
| `default void acceptWithChance(InWorldRecipeContext context)` | `IRecipeOutcome<O>` | 抽取随机数判定 `level.getRandom().nextDouble() <= context.getFloat(chance())` 后执行 `accept(context)`。 |
| `List<PlannedItem> plan(InWorldRecipeContext context)` | `IPlannedItemOutcome<O>` | 仅计算产物物品与目标坐标而不修改真实世界状态；用于与容量规划复用同一份随机抽取结果。 |
| `default List<PlannedItem> planWithChance(InWorldRecipeContext context)` | `IPlannedItemOutcome<O>` | 每个候选批次调用一次以固定概率与随机数量结果；`accept` / `acceptWithChance` 默认遍历返回的 `PlannedItem` 并调用 `PlannedItem#accept`。 |

---

## 二、 `SpawnItem` 与 `ApplyTagToComponent`

`SpawnItem(ItemStack item, Vec3 offset, NumberProvider count, List<IOutcomeFunction<?>> functions)`（另有重载构造 `SpawnItem(Holder<Item>, DataComponentPatch, Vec3, NumberProvider, List<IOutcomeFunction<?>>)`）在执行 `plan(context)` 时：
1. 调用 `context.getInt(this.count, 0, 99)` 计算本次产出数量（为 `0` 时返回空列表）；
2. 计算坐标 `offset = context.getPos().add(this.offset)`，若 `BlockCache` 中该方块实现了 `IRecipeResultOffsetBlock`，则叠加 `block.getOffset(level, blockPos, state)`（常用于炼药锅内部偏置等场景）；
3. 按顺序应用 `functions` 中的每个 `IOutcomeFunction<ItemStack>`；
4. 返回非空的 `PlannedItem(stack, offset)` 列表，在提交阶段通过 `ItemCache#getOutput(stack, pos).grow(stack, true)` 写入相邻容器或生成掉落物。

### 结果函数：`ApplyTagToComponent<T>` (`anvillib_recipe:apply_tag_2_component`)

`ApplyTagToComponent(DataComponentType<T> component, ResourceLocation path)` 从 `TagCache` 读取 `SaveComponentToTag` 存入的 NBT 标签，使用 `context.getNbtRegistryOps()` 反序列化并写回产物 `ItemStack` 的指定 `DataComponentType<T>`。

### `SpawnItem` 与 `SpawnItem.Builder` 方法表

| 方法签名 | 说明 |
| :--- | :--- |
| `static Builder builder()` | 创建构建器。 |
| `static SpawnItem fromChance(ChanceItemStack stack, Vec3 offset)` | 从 `module.util` 的 `ChanceItemStack` 快速转换。 |
| `offset(Vec3)` / `offset(x, y, z)` / `below([d])` / `above([d])` | 设置产物生成偏移量（默认 `Vec3.ZERO`）。 |
| `count(NumberProvider)` / `count(float count)` | 设置产物数量或随机数量提供器（默认 `ConstantValue.exactly(1.0f)`）。 |
| `item(ItemStack)` / `item(Item)` / `item(ItemLike)` | 设置产物基础物品堆。 |
| `function(IOutcomeFunction<?>... function)` | 挂载自定义结果函数。 |
| `applyComponent(DataComponentType<?> component, ResourceLocation path)` | 挂载 `ApplyTagToComponent` 从 `TagCache` 恢复数据组件。 |
| `build()` | 构建 `SpawnItem` 实例。 |

---

## 三、 方块设置与属性映射 (`SetBlock` & `BlockPropertyMapping`)

### 1. 要解决什么问题 / 怎么用

在方块转换配方中（例如给切制铜楼梯涂蜡、将朝北的方块转换为特定轴向的原木），通常希望保留原方块的朝向、上下半、含水状态或将源属性名映射为目标属性名。

`SetBlock#transform(BlockState source)` 按以下严格顺序计算最终方块状态：
1. **基础状态**：以 `SetBlock` 配置的 `state` 为起点；
2. **同名属性继承（`copyProperties = true`）**：遍历转换前源方块 `source` 的所有属性，若目标方块也有同名属性且能解析相同的属性字面量名称，则复制过来；
3. **显式属性映射（`propertyMappings`）**：遍历 `Map<String, BlockPropertyMapping>`（键为目标属性名），从**同一份初始源状态 `source` 快照**读取 `mapping.source()` 属性值；若 `mapping.values()` 为空则直接按字面量复制给目标属性，否则按 `values` 映射表转换后赋给目标属性；
4. **双格方块自动保持**：当开启了 `copyProperties` 或 `propertyMappings` 时，`BlockCache#transformBlock` 会自动识别门、大型花等双格方块（含 `BlockStateProperties.DOUBLE_BLOCK_HALF`），同步转换上下两半并保持各自的 `UPPER` / `LOWER` 属性不变。

> **构造校验**：`SetBlock` 主构造器会立即校验 `propertyMappings` 中的每个目标属性名及其映射值是否确实存在于 `state.getBlock().getStateDefinition()` 中，非法属性名或枚举值会在构建/反序列化阶段直接抛出 `IllegalArgumentException`。

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

### 3. `SetBlock`、`SetBlock.Builder` 与 `BlockPropertyMapping` API 表

| 方法签名 | 所属类 | 说明 |
| :--- | :--- | :--- |
| `SetBlock(state, nbt, offset, chance)` | `SetBlock` | 兼容构造器（默认 `copyProperties = false`，`propertyMappings = Map.of()`）。 |
| `static SetBlock fromState(ChanceBlockState state, Vec3 offset)` | `SetBlock` | 从 `ChanceBlockState` 快速构造。 |
| `BlockState transform(BlockState source)` | `SetBlock` | 对指定源方块状态应用属性继承与映射。 |
| `copyProperties()` / `copyProperties(boolean copy)` | `SetBlock.Builder` | 开启或关闭同名属性自动继承。 |
| `propertyMappings(Map<String, BlockPropertyMapping> mappings)` | `SetBlock.Builder` | 批量合并目标属性映射规则。 |
| `mapProperty(String source, String target[, Map<String, String> values])` | `SetBlock.Builder` | 按属性名映射（`values` 为空时直接按序列化字面量复制）。 |
| `<S, T> mapProperty(Property<S> source, Property<T> target[, Map<S, T> values])` | `SetBlock.Builder` | 类型安全属性映射。 |
| `block(BlockState)` / `block(Block)` / `nbt(CompoundTag)` | `SetBlock.Builder` | 设置目标方块状态（默认 `Blocks.AIR`）及写入 `EntityBlock` 的 NBT（通过 `entity.loadWithComponents`）。 |
| `offset(Vec3)` / `offset(x,y,z)` / `below([d])` / `above([d])` | `SetBlock.Builder` | 设置目标坐标偏移。 |
| `chance(NumberProvider)` / `chance(float)` | `SetBlock.Builder` | 设置触发概率。 |
| `BlockPropertyMapping(String source[, Map<String, String> values])` | `BlockPropertyMapping` | `source` 不能为空白；`apply(input, output, target)` 从 `input` 读取后写入 `output`。 |

---

## 四、 `SpawnEntity`、`ProduceExplosion` 与 `ChooseOneOutcome`

### 1. `SpawnEntity` (`anvillib_recipe:spawn_entity`)

- **安全校验**：禁止生成 `EntityType.PLAYER` 及玩家乘客（否则抛 `IllegalArgumentException`）；自动递归清洗 `nbt` 与 `Passengers`/`passengers` 中的 `"UUID"`、`"uuid"`、`"Pos"`、`"pos"`，强制写入当前 `entity` 的注册表 ID 与随机 `UUID`。
- **生成时机**：在 `accept(ctx)` 规划阶段校验 `amount = context.getInt(count, 0, 99)` 并调用 `EntityType.loadEntityRecursive` 预构造全部实体；待事务进入 `context.afterCommit` 时，若 `nbt.isEmpty()` 且为 `Mob`，先触发 `EventHooks.finalizeMobSpawn(..., MobSpawnType.TRIGGERED, null)`，再调用 `level.tryAddFreshEntityWithPassengers(result)` 加入世界。
- **`SpawnEntity.Builder` 方法**：`entity(EntityType<?>)`、`nbt(CompoundTag)`、`offset(Vec3 / x,y,z)`、`count(NumberProvider / int)`、`chance(NumberProvider / float)`、`build()`。

### 2. `ProduceExplosion` (`anvillib_recipe:produce_explosion`)

- 记录定义：`ProduceExplosion(Vec3 offset, float power, boolean fire, Level.ExplosionInteraction explodeInteraction, NumberProvider chance)`（注意 JSON 字段中交互类型键名为 `"interact"`，类型为 `Level.ExplosionInteraction`）。
- 执行逻辑：通过 `ctx.afterCommit` 延迟到所有物品/方块/实体提交成功后，在 `ctx.getPos().add(offset)` 处调用 `level.explode(null, x, y, z, power, fire, explodeInteraction)`。

### 3. `ChooseOneOutcome` (`anvillib_recipe:choose_one`)

- 记录定义：`ChooseOneOutcome(NumberProvider chance, List<Choice> choices)`，其中 `Choice(IRecipeOutcome<?> outcome, NumberProvider weight)` 可通过 `ChooseOneOutcome.quickChoice(outcome, weight)` 构造。
- 算法：计算所有 `choices` 的 `context.getFloat(choice.weight())` 前缀和数组 `checkpoints`，以 `random.nextFloat() * weightSum` 命中首个 `<= checkpoints[i]` 的选项，并调用该选项的 `acceptWithChance(context)`。
- **`ChooseOneOutcome.Builder` 方法**：`choice(Choice)`、`choice(IRecipeOutcome<?>, NumberProvider / float weight)`、`chance(NumberProvider / float)`、`build()`。

---

## 五、 容器受限批次规划器 (`ItemBatchPlan`)

### 1. 要解决什么问题 / 怎么用

当机器方块（如自动合成台、流体混合槽或容器内转化设备）希望在**有有限槽位容量约束的容器快照上**，一次性计算最多能连续执行多少个世界内配方批次（并允许后续批次消耗前置批次的剩余原料或腾出的空槽位来放置新产物）时，可直接使用 `dev.anvilcraft.lib.v2.recipe.util.ItemBatchPlan`：

- **输入/输出分离容器**：调用 `ItemBatchPlan.separate(inputs, outputs, limit, capacity, recipe)`；
- **输入/输出共用槽位容器**：调用 `ItemBatchPlan.shared(inventory, limit, capacity, recipe)`（每批先扣除原料并归还催化剂，再通过回溯布局求解器 `fit` / `fillEmpty` 验证全部累计产物能否完整装入容器）；
- **规划回调 `Predicate<Batch>`**：在回调中调用 `batch.take(predicate, count)` 消耗原料、调用 `batch.catalyst(predicate, count)` 预约催化剂（本批独占、批末归还）、调用 `batch.produce(stack)` 登记产物、调用 `batch.afterCommit(effect)` 注册仅在最终提交成功后执行的副作用；
- **单次原子提交 `commit(Consumer<ItemBatchPlan>)`**：由调用方在回调内校验真实库存是否仍与初始快照一致并写入槽位，成功返回后自动依次执行已选定批次的全部 `effects`（每个 `ItemBatchPlan` 仅允许提交一次）。

### 2. `ItemBatchPlan` 与 `Batch` 公开 API 表

| 类 / 接口 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`ItemBatchPlan`** | `static ItemBatchPlan separate(inputs, outputs, limit, capacity, recipe)` | 输入输出分开存放时规划最长连续可执行批次数（`limit >= 0`）。 |
| **`ItemBatchPlan`** | `static ItemBatchPlan shared(inventory, limit, capacity, recipe)` | 输入输出共用同一份槽位列表时规划最长连续批次数。 |
| **`ItemBatchPlan`** | `List<ItemStack> inputs()` / `List<ItemStack> outputs()` / `int batches()` | 返回选中批次的最终输入/输出槽位深拷贝快照与可执行批次数。 |
| **`ItemBatchPlan`** | `void commit(Consumer<ItemBatchPlan> inventoryCommit)` | 执行库存提交回调并在其正常返回后运行 `effects`；重复调用抛 `IllegalStateException`。 |
| **`SlotCapacity`** | `int capacity(int slot, ItemStack stack)` | 函数式接口：返回指定槽位允许存放该物品的最大数量（`0` 表示拒绝，负值抛 `IllegalArgumentException`）。 |
| **`Batch`** | `List<ItemStack> take(Predicate<ItemStack> ingredient, int count)` | 按槽位顺序预扣原料，返回包含实际组件的收据副本；不足时返回空列表且不修改状态。 |
| **`Batch`** | `List<ItemStack> catalyst(Predicate<ItemStack> ingredient, int count)` | 在当前批次独占预约催化剂（下批可复用），返回实际匹配物品收据。 |
| **`Batch`** | `void produce(ItemStack stack)` | 记录已确定数量与组件的产物。 |
| **`Batch`** | `void afterCommit(Runnable effect)` | 注册延迟副作用；仅在回调开放期间可用，超时抛 `IllegalStateException`。 |

---

## 六、 自定义 `IRecipeOutcome` 与 `IOutcomeFunction` 注册表

- 自定义结果类型注册键：`LibRegistries.OUTCOME_KEY`（`anvillib:outcome` / `LibRegistries.OUTCOME_TYPE_REGISTRY`），实现 `IRecipeOutcome<O>` 与 `IRecipeOutcome.Type<O>`。
- 自定义结果函数注册键：`LibRegistries.OUTCOME_FUNCTION_KEY`（`anvillib:outcome_function` / `LibRegistries.OUTCOM_FUNCTIONE_TYPE_REGISTRY`），实现 `IOutcomeFunction<T>` 与 `IOutcomeFunction.Type<O>`。
