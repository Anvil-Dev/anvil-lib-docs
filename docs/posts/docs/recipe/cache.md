---
title: Recipe 缓存系统
prev: false
next: false
---

# 缓存系统 <Badge type="info" text="API renamed in 1.21.10" />

::: tip Note
1.21.10 版本中 `IItemHandlerCache`（接口）→ `ItemResourceHandlerCache`（具体类），`ItemHandlerCacheElement` →
`ItemResourceHandlerCacheElement`。内部方法也做了适配：`getStackInSlot`→`extract`、`getSlotLimit`→`getCapacityAsInt` 等。
`ItemResourceHandlerCacheElement`。详情参考[版本差分文档](../version-diff)。
:::

Recipe 模块采用**事务式缓存**实现世界修改：先模拟修改，配方成功后通过 acceptor 统一提交。这确保了配方失败时世界状态保持完整。

## BlockCache

管理和模拟方块状态变更。所有修改先记录在缓存中，通过 `accept()` 原子提交。

### 获取实例

```java
BlockCache cache = context.get(BlockCache.BLOCK_CACHE);
```

### 核心方法

| 方法                                      | 说明                      |
|-----------------------------------------|-------------------------|
| `getBlockState(BlockPos)`               | 返回模拟或真实的方块状态（优先缓存）      |
| `getBlockEntity(BlockPos)`              | 返回模拟或真实的方块实体            |
| `setBlock(BlockPos, BlockState)`        | 模拟放置方块                  |
| `setBlock(BlockPos, Block)`             | 模拟放置方块（使用默认 BlockState） |
| `setBlockEntity(BlockPos, BlockEntity)` | 模拟设置方块实体                |
| `removeBlock(BlockPos)`                 | 模拟移除方块（设为空气，清理实体）       |
| `accept()`                              | 提交所有修改到世界（仅写入变更的部分）     |

### 工作原理

1. 首次 `getBlockState(pos)` 从 Level 读取真实状态并缓存
2. `setBlock(pos, state)` 覆盖缓存中的值
3. `accept()` 遍历缓存，仅将不同于缓存的真实状态写入世界
4. 方块实体 NBT 同理，通过 `saveWithFullMetadata` 比较差异

### 默认 Acceptor

`BlockCache.DEFAULT_ACCEPTOR` 通过 `context.putAcceptor()` 注册，在配方执行结束时自动调用 `accept()`。

## ItemCache <Badge type="info" text="changed in 26.1" />

管理物品输入/输出，支持从物品实体、方块实体库存中提取和存放物品。

### 获取实例

```java
ItemCache cache = context.get(ItemCache.ITEM_CACHE);
```

### 核心方法

| 方法                                           | 说明                     |
|----------------------------------------------|------------------------|
| `grow(Vec3 center, Vec3 range)`              | 扩展缓存扫描范围               |
| `inRange(Vec3 pos, Vec3 range)`              | 判断位置是否已在扫描范围内          |
| `getInput(ItemLike, Vec3 pos)`               | 获取匹配物品类型的输入            |
| `getInput(ItemLike, Vec3 pos, Vec3 range)`   | 带范围扫描的输入获取             |
| `getInput(ItemStack, Vec3 pos)`              | 按完全匹配获取输入              |
| `getInput(Predicate<ItemStack>, Vec3 pos)`   | 按自定义谓词获取输入             |
| `getOutput(ItemStack, Vec3 pos)`             | 获取输出目标位置               |
| `getOutput(ItemStack, Vec3 pos, Vec3 range)` | 带范围的输出目标               |
| `pushSpawnList(Collection<SpawnOperation>)`  | 添加待生成的物品操作             |
| `endCache()`                                 | 结束缓存：同步所有输入输出，生成队列中的物品 |

### 工作机制

- **输入**：匹配物品实体或方块实体库存中的物品，标记后可从库存中扣除
- **输出**：尝试将物品放入现有物品实体或方块实体库存，否则加入生成列表
- **生成**：`endCache()` 时合并同位置同类型的物品栈，按最大堆叠数拆分生成

默认 Acceptor (`ItemCache.DEFAULT_ACCEPTOR`) 自动调用 `endCache()`。

## TagCache

简单的 NBT 标签缓存，用于在谓词/产出间共享临时数据。

### 获取实例

```java
TagCache cache = context.get(TagCache.TAG_CACHE);
```

### 方法

| 方法                                      | 说明                             |
|-----------------------------------------|--------------------------------|
| `getTag(Identifier)`                    | 按 ID 获取缓存的 NBT Tag（不存在返回 null） |
| `putTag(Identifier, Tag)`               | 存储 NBT Tag                     |
| `computeIfAbsent(Identifier, Function)` | 惰性计算并缓存                        |

## 使用示例

```java
// 在谓词中
public void accept(InWorldRecipeContext ctx) {
    BlockCache blocks = ctx.get(BlockCache.BLOCK_CACHE);
    blocks.removeBlock(pos);  // 模拟破坏方块
    
    ItemCache items = ctx.get(ItemCache.ITEM_CACHE);
    items.getInput(Items.IRON_INGOT, pos);
    
    TagCache tags = ctx.get(TagCache.TAG_CACHE);
    tags.putTag(someId, new CompoundTag());
}
// accept() / endCache() 由默认 acceptor 在配方结束时自动调用
```

## 注意事项

- 缓存修改仅在 `accept()`/`endCache()` 后真正影响世界
- 配方匹配失败时 `context.getStack().clear()` 会触发 `clearStack()` 清理缓存
- `BlockCache.DEFAULT_ACCEPTOR` 和 `ItemCache.DEFAULT_ACCEPTOR` 通过 `context.putAcceptor()` 自动注册
