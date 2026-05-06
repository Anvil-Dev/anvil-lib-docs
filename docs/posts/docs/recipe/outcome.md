---
title: Recipe 产出与触发器
prev: false
next: false
---

# 产出与触发器

## IRecipeOutcome

产出接口，定义配方匹配成功后执行的结果。扩展 `Consumer<InWorldRecipeContext>` 和 `IPrioritized`。

```java
public interface IRecipeOutcome<O extends IRecipeOutcome<O>>
        extends Consumer<InWorldRecipeContext>, IPrioritized {
    // ... methods
}
```

### 核心方法

| 方法                                       | 说明                                                     |
|------------------------------------------|--------------------------------------------------------|
| `accept(InWorldRecipeContext)`           | 执行产出逻辑                                                 |
| `acceptWithChance(InWorldRecipeContext)` | 按概率随机决定是否执行，成功则调用 `accept()`                           |
| `chance()`                               | 返回概率 `NumberProvider`，默认 `ConstantValue.exactly(1.0f)` |
| `getType()`                              | 返回 `Type<O>` 描述符                                       |

### Type 描述符

```java
interface Type<O extends IRecipeOutcome<O>> {
    Identifier getId();
    MapCodec<O> codec();
    StreamCodec<? super RegistryFriendlyByteBuf, O> streamCodec();
}
```

产出类型注册在 `anvillib:outcome` 注册表中。

## 内置产出

### SpawnItem

在指定位置生成物品实体。

```java
SpawnItem.builder()
    .item(new ItemStackTemplate(Items.DIAMOND, 3))
    .offset(0, 1, 0)              // 生成位置偏移
    .count(0.5f)                   // 概率 50%
    .build();
```

### SetBlock

在指定位置放置方块。

```java
SetBlock.builder()
    .block(Blocks.DIAMOND_BLOCK.defaultBlockState())
    .offset(0, 0, 0)
    .chance(1.0f)
    .build();
```

### ChooseOneOutcome

从多个子产出中随机选择一个执行。

```java
ChooseOneOutcome.builder()
    .outcome(spawnItemOutcome)
    .outcome(setBlockOutcome)
    .outcome(anotherOutcome)
    .build();
```

### ProduceExplosion

在配方执行位置产生爆炸。

```java
ProduceExplosion create(float radius, boolean fire, Level.ExplosionInteraction interaction);
```

## IRecipeTrigger

触发器接口，定义配方的触发条件。

```java
public interface IRecipeTrigger extends IPrioritized {
    Identifier getId();
}
```

触发器注册在 `anvillib:trigger` 注册表中。内置实现：

```java
// 简单实现
new IRecipeTrigger.Impl(ResourceLocation.fromNamespaceAndPath("mymod", "item_enter_block"));
```

### 触发流程

1. 游戏事件触发（如实体碰撞、方块更新）
2. 调用 `InWorldRecipeManager.trigger(trigger, context)`
3. Manager 遍历该触发器的所有注册配方
4. 按优先级排序，逐一检测 `matches()`
5. 首个匹配成功的配方执行 `assemble()`
6. 若兼容模式且效率未达上限，重复检测下一个配方
