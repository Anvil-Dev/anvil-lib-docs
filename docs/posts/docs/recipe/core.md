---
title: Recipe 核心配方结构
prev: false
next: false
---

# 核心配方结构

## InWorldRecipe

核心配方类，实现 `Recipe<InWorldRecipeContext>` 和 `IPrioritized`。

### 构造参数

| 参数 | 类型 | 说明 |
|------|------|------|
| icon | `ItemStackTemplate` | 配方图标（JEI/配方书展示） |
| trigger | `IRecipeTrigger` | 触发条件 |
| conflicting | `List<IRecipePredicate<?>>` | 冲突谓词（消耗型匹配，消耗后阻止其他配方） |
| nonConflicting | `List<IRecipePredicate<?>>` | 非冲突谓词（仅检查，不消耗） |
| outcomes | `List<IRecipeOutcome<?>>` | 产出列表 |
| priority | `int` | 优先级（数字越小越优先），可自动计算 |
| compatible | `boolean` | 兼容模式（`true` 允许多配方共享输入） |
| maxEfficiency | `int` | 每触发最大执行次数，默认 `Integer.MAX_VALUE` |

### 构造器重载

```java
// 完整构造
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible, maxEfficiency);

// 省略 maxEfficiency（默认 Integer.MAX_VALUE）
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible);

// 自动计算优先级
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible, maxEfficiency);
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible);
```

### 核心方法

| 方法 | 说明 |
|------|------|
| `matches(InWorldRecipeContext, Level)` | 先检查非冲突谓词（`ShapelessMatcher.compatible`），再检查冲突谓词（兼容模式用 `compatible`，非兼容模式用 `incompatible`）。失败时清空谓词栈。 |
| `assemble(InWorldRecipeContext)` | 依次弹出并消耗冲突谓词，按概率执行所有产出，返回图标 `ItemStack` |
| `getSerializer()` | 返回 `LibRecipeTypes.IN_WORLD_RECIPE_SERIALIZER` |
| `getType()` | 返回 `LibRecipeTypes.IN_WORLD_RECIPE` |

### 优先级自动计算

`calcPriority(trigger, conflicting, nonConflicting, outcomes)` 将 trigger、所有谓词、所有产出的 priority 值求和。

### 序列化

`InWorldRecipe.Serializer` 提供 `CODEC`（`MapCodec<InWorldRecipe>`）和 `STREAM_CODEC`。

**JSON 字段：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `icon` | `ItemStackTemplate` | `minecraft:anvil` | 配方图标 |
| `trigger` | `Identifier` | — | 触发器注册表 ID |
| `conflicting` | `IRecipePredicate[]` | — | 冲突谓词列表 |
| `non_conflicting` | `IRecipePredicate[]` | — | 非冲突谓词列表 |
| `outcomes` | `IRecipeOutcome[]` | — | 产出列表 |
| `priority` | `int` | `1` | 优先级 |
| `compatible` | `bool` | `true` | 兼容模式 |
| `max_efficiency` | `int` | `2147483647` | 最大效率 |

### Getters

```java
public ItemStackTemplate icon();
public IRecipeTrigger trigger();
public List<IRecipePredicate<?>> conflicting();
public List<IRecipePredicate<?>> nonConflicting();
public List<IRecipeOutcome<?>> outcomes();
public int priority();
public boolean compatible();
public int maxEfficiency();
```

## 使用示例

```java
InWorldRecipe recipe = new InWorldRecipe(
    new ItemStackTemplate(Items.CRAFTING_TABLE),
    trigger,
    List.of(hasItemPredicate),
    List.of(hasBlockPredicate),
    List.of(spawnItemOutcome),
    true  // compatible
);
```
