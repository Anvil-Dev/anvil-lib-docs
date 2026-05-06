---
title: Recipe 构建器
prev: false
next: false
---

# 构建器 (InWorldRecipeBuilder)

`InWorldRecipeBuilder` 提供流式 API 构建 `InWorldRecipe` 实例，同时支持数据生成和进度集成。

## 创建构建器

```java
// 兼容模式：允许多个配方共享输入，谓词不会被消耗
InWorldRecipeBuilder.compatible(trigger)

// 不兼容模式：匹配谓词被消耗，后续配方无法再次匹配
InWorldRecipeBuilder.incompatible(trigger)

// 支持 Supplier 形式
InWorldRecipeBuilder.compatible(() -> trigger)
InWorldRecipeBuilder.incompatible(() -> trigger)
```

## 偏移量控制

构建器维护一个当前偏移量（默认 `Vec3.ZERO`），用于设置后续谓词/产出的相对位置。

### 直接设置偏移

```java
builder.offset(new Vec3(x, y, z));
builder.offset(x, y, z);
```

### 快捷偏移

```java
builder.below();      // 下方 1 格
builder.below(2);     // 下方 2 格
builder.above();      // 上方 1 格
builder.above(2);     // 上方 2 格
```

## 图标

```java
builder.icon(new ItemStackTemplate(Items.ANVIL));
```

## 添加谓词

### 通用方式

```java
// 直接添加谓词实例（自动根据 Type.conflict() 归类到 conflicting/nonConflicting）
builder.with(predicate);
```

### 物品谓词 (hasItem)

所有方法均支持 `(Vec3)`, `(double,double,double)` 或使用当前偏移量。

```java
// Consumer 方式（完全自定义）
builder.hasItem(consumer -> consumer
    .of(Items.IRON_INGOT, Items.GOLD_INGOT)
    .offset(0, 1, 0));

// 指定物品
builder.hasItem(Items.IRON_INGOT);
builder.hasItem(offset, Items.IRON_INGOT, Items.DIAMOND);
builder.hasItem(x, y, z, Items.IRON_INGOT);

// 指定 Tag
builder.hasItem(TagKey<Item> items);
builder.hasItem(offset, TagKey<Item> items);
builder.hasItem(x, y, z, TagKey<Item> items);
```

### 物品原料谓词 (hasItemIngredient)

方法与 `hasItem` 参数形式一致，内部使用 `HasItemIngredient` 谓词。

```java
builder.hasItemIngredient(consumer -> consumer.of(Items.COAL).offset(0, 0, 0));
builder.hasItemIngredient(Items.COAL);
builder.hasItemIngredient(offset, Items.COAL);
builder.hasItemIngredient(TagKey<Item> items);
```

### 方块谓词 (hasBlock)

```java
// 指定方块
builder.hasBlock(Blocks.STONE, Blocks.DIRT);
builder.hasBlock(offset, Blocks.STONE);
builder.hasBlock(collectionOfBlocks);

// 指定 Tag
builder.hasBlock(BlockTag tag);
builder.hasBlock(offset, BlockTag tag);

// 指定 BlockState（自动提取非默认属性作为条件）
builder.hasBlock(state);
builder.hasBlock(x, y, z, state);

// Consumer 方式
builder.hasBlock(consumer -> consumer
    .of(Blocks.OAK_LOG)
    .with(BlockStateProperties.AXIS, Direction.Axis.Y));
```

### 方块原料谓词 (hasBlockIngredient)

```java
builder.hasBlockIngredient(consumer -> consumer.of(Blocks.STONE));
builder.hasBlockIngredient(Blocks.STONE);
builder.hasBlockIngredient(tag);
builder.hasBlockIngredient(state);
```

## 添加产出

### 通用方式

```java
builder.out(outcome);
```

### 生成物品 (spawnItem)

```java
// Consumer 方式
builder.spawnItem(consumer -> consumer.item(stack).offset(0, 1, 0).count(0.5f));

// 快捷方式
builder.spawnItem(offset, chance, stack);
builder.spawnItem(offset, stack);           // chance = 1.0
builder.spawnItem(x, y, z, chance, stack);
builder.spawnItem(x, y, z, stack);
builder.spawnItem(stack);                   // 使用当前偏移
```

### 放置方块 (setBlock)

```java
// Consumer 方式
builder.setBlock(consumer -> consumer.block(state).offset(0, 0, 0).chance(0.8f));

// 快捷方式
builder.setBlock(offset, chance, state);
builder.setBlock(offset, state);            // chance = 1.0
builder.setBlock(x, y, z, chance, state);
builder.setBlock(x, y, z, state);
builder.setBlock(state);                    // 使用当前偏移
```

### 多选一 (chooseOne)

```java
builder.chooseOne(choose -> choose
    .outcome(spawnItemOutcome)
    .outcome(setBlockOutcome));
```

## 配置属性

```java
builder.priority(10);          // 手动设置优先级（否则自动计算）
builder.maxEfficiency(64);     // 每触发最大执行次数
builder.group("my_group");     // 配方分组
```

## 数据生成

实现 `RecipeBuilder` 接口，与 Minecraft 数据生成系统集成：

```java
// 添加解锁条件
builder.unlockedBy("has_iron", InventoryChangeTrigger.TriggerInstance.hasItems(Items.IRON_INGOT));

// 保存配方 JSON + 进度
builder.save(recipeOutput, resourceKey);
builder.save(recipeOutput, identifier);
```

## 构建

```java
InWorldRecipe recipe = builder.build();
```

该方法将存储的谓词/产出列表转为 `ImmutableList`，若未手动设置优先级则自动计算。

## 完整示例

```java
InWorldRecipe recipe = InWorldRecipeBuilder.compatible(trigger)
    .icon(new ItemStackTemplate(Items.ANVIL))
    .offset(0, 0, 0)
    .hasItem(Items.IRON_INGOT)
    .hasBlock(block -> block
        .of(Blocks.STONE)
        .offset(0, -1, 0))
    .spawnItem(0, 1, 0, 1.0, new ItemStackTemplate(Items.DIAMOND))
    .priority(5)
    .maxEfficiency(32)
    .unlockedBy("has_iron", hasIronCriterion)
    .build();
```
