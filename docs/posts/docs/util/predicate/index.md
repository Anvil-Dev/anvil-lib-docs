# 谓词系统

## NbtPredicate

`dev.anvilcraft.lib.v2.util.predicate.NbtPredicate` – 实现 `Predicate<Tag>`，用于匹配 NBT 数据。

- 测试 `Tag`：`test(Tag)`
- 测试 `ItemStackTemplate`：基于 CustomData 组件
- 测试 `Entity`：通过 `getEntityTagToCompare(Entity)` 提取实体的完整 NBT（含玩家的 `SelectedItem`）

## IItemStackPredicate 及其实现

`IItemStackPredicate` 是 `Predicate<ItemStack>` 接口，额外提供：

- `items()` – 可选的物品 HolderSet
- `components()` – DataComponentMatchers
- `testCount(int count)` – 是否匹配数量
- `testIgnoreCount(ItemStack)` – 忽略数量验证物品与组件

### ItemPredicate

`ItemPredicate` – 通用物品谓词：

- `items` – `HolderSet<Item>`（可选）
- `count` – MinMaxBounds.Ints
- `components` – DataComponentMatchers
- `Builder` 支持：`of(ItemLike...)`、`of(TagKey<Item>)`、`withCount(..)`、`hasComponents(..)`

### ItemIngredientPredicate

`ItemIngredientPredicate` – 适用于配方的原料谓词（数量表示“至少”要求）：

- `count` 的含义是 `stack.count >= count`
- 提供 `getItems()` 返回 `ItemStackTemplate[]`（含缓存）
- Builder 额外支持 `of(ItemStackTemplate)` 从模板自动提取组件谓词

## ChanceItemStack

`dev.anvilcraft.lib.v2.util.predicate.ChanceItemStack` – 带概率的物品生成结果。

- `stack` – ItemStackTemplate，`count` – NumberProvider（支持常量、均匀分布、二项分布）
- `of(...)` 工厂方法，支持各种概率表示
- `getResult(ServerLevel)` – 由 LootContext 计算数量，返回 ItemStackTemplate（数量 1~99）

## ChanceBlockState

`dev.anvilcraft.lib.v2.util.predicate.ChanceBlockState` – 带概率的方块结果。

- `state`, `nbt`, `chance`（NumberProvider）
- `of(Supplier<Block>, CompoundTag)` 等工厂方法
- `getResult(ServerLevel)` 根据概率返回 `Map.Entry<BlockState, CompoundTag>` 或 null

## BlockStatePredicate

`dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate` – 方块状态谓词，支持与/或逻辑及 NBT。

- **属性匹配**：`PropertyMatcher`，包含 `ExactMatcher` (精确值) 和 `RangedMatcher` (范围)
- **逻辑**：内部 properties 是 `List<List<PropertyMatcher>>`，外列表为 OR，内列表为 AND
- **NBT**：可附加 `NbtPredicate` 列表（需全部满足）
- **测试方法**：
    - `test(LevelAccessor, BlockState, @Nullable BlockEntity)` – 完整测试（需访问 Level）
    - `testWithoutEntity(BlockState)` – 忽略 NBT 测试
    - `testEntityOffThread(BlockState, CompoundTag entityNbt)` – 离线/多线程安全
    - `testOffThread(BlockState, CompoundTag entityNbt)` – 组合离线测试
- **渲染缓存**：`getStatesCache()` / `constructStatesForRender()` 用于快速获取可能的状态列表（不保证与实际匹配一致，仅用于预览）
- **Builder** 提供流畅 API：`.of(Block...)`、`.of(TagKey<Block>)`、`.with(Property, value)`、`.or()`、`.nbt(CompoundTag)`

**代码示例**：

```java
BlockStatePredicate pred = BlockStatePredicate.builder()
    .of(Blocks.OAK_LOG, Blocks.BIRCH_LOG)
    .with(BlockStateProperties.AXIS, Direction.Axis.Y)
    .or()
    .with(BlockStateProperties.AXIS, Direction.Axis.X)
    .nbt(new CompoundTag() {{ putBoolean("stripped", true); }})
    .build();
```

**序列化**：所有谓词均提供 `CODEC` 与 `STREAM_CODEC`。
