---
title: Recipe 世界内配方
prev: false
next: false
---

# 世界内配方模块 (Recipe Module)

包 `dev.anvilcraft.lib.v2.recipe` 提供了一套**世界内交互配方系统**，允许配方在世界中通过实体/方块交互触发，而非在传统的合成台中执行。该系统支持条件谓词、概率化产出、事务式缓存、数据包定义以及完整的网络同步。

## 1. 核心概念

一个世界内配方由以下部分组成：

- **触发器 (`IRecipeTrigger`)**：定义什么事件触发配方检测（如物品实体进入方块）。
- **谓词 (`IRecipePredicate`)**：定义配方匹配的条件。分为**冲突谓词**（conflicting，消耗型）和**非冲突谓词**（non-conflicting，仅检查）。
- **产出 (`IRecipeOutcome`)**：配方匹配后执行的结果（生成物品、放置方块、多选一等）。
- **上下文 (`InWorldRecipeContext`)**：携带配方执行过程中的运行时状态。
- **缓存**：`BlockCache`、`ItemCache`、`TagCache` 提供事务式语义，模拟修改后原子提交。

## 2. 模块主类

### AnvilLibRecipe

模组入口，`@Mod("anvillib_recipe")`。负责初始化数据组件谓词和配方注册。

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_recipe";
public static final AnvilLibRecipeConfig CONFIG; // 通过 ConfigManager 加载

public static Identifier of(String path) { ... } // 创建 anvillib 命名空间的 Identifier
```

## 3. 配方结构

### InWorldRecipe

核心配方类，实现 `Recipe<InWorldRecipeContext>` 和 `IPrioritized`。

| 构造参数 | 类型 | 说明 |
|---------|------|------|
| icon | `ItemStackTemplate` | 配方图标（JEI/配方书展示） |
| trigger | `IRecipeTrigger` | 触发条件 |
| conflicting | `List<IRecipePredicate>` | 冲突谓词（消耗型匹配） |
| nonConflicting | `List<IRecipePredicate>` | 非冲突谓词（仅检查） |
| outcomes | `List<IRecipeOutcome>` | 产出列表 |
| priority | `int` | 优先级（数字越小越优先） |
| compatible | `boolean` | 兼容模式（`true` 表示可与其他配方共享输入） |
| maxEfficiency | `int` | 每触发最大执行次数 |

**方法**：

- `matches(InWorldRecipeContext, Level)` — 先检查非冲突谓词（兼容模式），再检查冲突谓词
- `assemble(InWorldRecipeContext)` — 消耗冲突谓词，执行所有产出
- `getSerializer()` / `getType()` — 返回 `LibRecipeTypes` 中注册的类型

**优先级自动计算**：`calcPriority(trigger, conflicting, nonConflicting, outcomes)` 根据谓词和产出的优先级加权求和。

## 4. 触发器、谓词与产出

### IRecipeTrigger

触发器接口，扩展 `IPrioritized`。仅需提供唯一 ID：

```java
public interface IRecipeTrigger extends IPrioritized {
    Identifier getId();
}
```

触发器通过 `LibRegistries.TRIGGER_REGISTRY`（`anvillib:trigger`）注册。

### IRecipePredicate

谓词接口，扩展 `Predicate<InWorldRecipeContext>`、`Consumer<InWorldRecipeContext>` 和 `IPrioritized`。

| 方法 | 说明 |
|------|------|
| `test(InWorldRecipeContext)` | 判断上下文是否匹配 |
| `accept(InWorldRecipeContext)` | 匹配成功后消耗（仅冲突谓词） |
| `snapshot(InWorldRecipeContext)` | 创建上下文快照（用于回滚） |
| `rollback(InWorldRecipeContext)` | 回滚到快照 |
| `clearStack(InWorldRecipeContext)` | 清空操作栈 |
| `getType()` | 返回谓词的 `Type<P>` 描述符 |

**内置谓词类型**（通过 `LibRecipePredicateTypes` 注册）：
- `HasItem` — 检测物品实体
- `HasItemIngredient` — 检测物品原料
- `HasBlock` — 检测方块状态
- `HasBlockIngredient` — 检测方块原料

### IRecipeOutcome

产出接口，扩展 `Consumer<InWorldRecipeContext>` 和 `IPrioritized`。

| 方法 | 说明 |
|------|------|
| `accept(InWorldRecipeContext)` | 执行产出逻辑 |
| `acceptWithChance(InWorldRecipeContext)` | 按概率随机决定是否执行 |
| `chance()` | 返回概率 `NumberProvider`，默认 1.0 |
| `getType()` | 返回产出的 `Type<O>` 描述符 |

**内置产出类型**（通过 `LibRecipeOutcomeTypes` 注册）：
- `SpawnItem` — 生成物品实体
- `SetBlock` — 放置方块
- `ChooseOneOutcome` — 多选一
- `ProduceExplosion` — 产生爆炸

## 5. 构建器 (InWorldRecipeBuilder)

`InWorldRecipeBuilder` 提供流式 API，支持数据生成和配方 JSON 输出。

### 创建构建器

```java
// 兼容模式：允许多个配方共享输入
InWorldRecipeBuilder.compatible(trigger)

// 不兼容模式：配方消耗输入后其他配方不可用
InWorldRecipeBuilder.incompatible(trigger)
```

### 添加谓词和产出

```java
InWorldRecipeBuilder.compatible(trigger)
    .icon(iconStack)
    // 添加物品谓词
    .hasItem(items -> items.of(Items.IRON_INGOT).offset(0, 0, 0))
    // 添加方块谓词
    .hasBlock(block -> block.of(Blocks.STONE).offset(0, -1, 0))
    // 添加产出
    .spawnItem(Items.DIAMOND, 1, 1.0)
    .setBlock(Blocks.AIR, 0, 0, 0)
    .build();
```

| 方法 | 说明 |
|------|------|
| `icon(ItemStackTemplate)` | 设置配方图标 |
| `with(IRecipePredicate)` | 添加谓词（自动区分冲突/非冲突） |
| `hasItem(...)` | 添加 `HasItem` 谓词，支持物品/Tag/坐标/自定义 |
| `hasItemIngredient(...)` | 添加 `HasItemIngredient` 谓词 |
| `hasBlock(...)` | 添加 `HasBlock` 谓词，支持方块/状态/Tag/自定义 |
| `hasBlockIngredient(...)` | 添加 `HasBlockIngredient` 谓词 |
| `spawnItem(...)` | 添加 `SpawnItem` 产出 |
| `setBlock(...)` | 添加 `SetBlock` 产出 |
| `chooseOne(Consumer)` | 添加多选一产出 |
| `out(IRecipeOutcome)` | 直接添加产出 |
| `priority(Integer)` | 手动设优先级（否则自动计算） |
| `maxEfficiency(int)` | 每触发最大执行次数 |
| `offset(Vec3)` / `below(double)` / `above(double)` | 设置位置偏移 |

数据生成方法（实现 `RecipeBuilder`）：
- `save(RecipeOutput, ResourceKey)` — 保存配方 JSON 及进度
- `unlockedBy(String, Criterion)` — 添加解锁条件
- `group(String)` — 设置配方分组

## 6. 运行时管理

### InWorldRecipeManager

核心运行时管理器，负责存储和调度配方。

```java
InWorldRecipeManager manager = ...;
// 注册配方
manager.register(recipeHolder);
// 触发配方
manager.trigger(trigger, context);
```

在触发时，对每个匹配的配方重复执行 `matches` → `assemble`，直至未匹配或达到 `maxEfficiency` 上限。每次成功组装后发布 `InWorldRecipeEvent`。

通过 `IRecipeManagerExtension` 接口（Mixin 注入 `RecipeManager`）集成到原版配方系统。

### InWorldRecipeContext

运行时上下文，承载单次配方执行的所有状态。

| 方法 | 说明 |
|------|------|
| `getLevel()` | 获取 `ServerLevel` |
| `getPos()` | 获取执行位置 |
| `getEntity()` | 获取相关实体 |
| `push(IRecipePredicate)` / `pop(IRecipePredicate)` | 谓词栈操作 |
| `put(InWorldRecipeData<T>, T)` / `get(InWorldRecipeData<T>)` | 类型安全的数据存取 |
| `getFloat(NumberProvider)` / `getInt(NumberProvider)` | 数值提供器求值 |
| `emptyLootContext()` | 创建空战利品上下文 |

## 7. 缓存系统

配方执行采用事务式缓存，先模拟修改，配方成功后统一提交。

### BlockCache

```java
BlockCache cache = context.get(InWorldRecipeContext.BLOCK_CACHE);
cache.setBlock(pos, newState);     // 模拟放置方块
cache.removeBlock(pos);            // 模拟移除方块
// 配方成功结束后通过 DEFAULT_ACCEPTOR 自动调用 accept()
cache.accept();                    // 提交所有修改
```

### ItemCache

```java
ItemCache cache = context.get(InWorldRecipeContext.ITEM_CACHE);
cache.grow(center, range);         // 扩展扫描范围
cache.getInput(itemPredicate, pos, range);   // 获取匹配输入
cache.getOutput(stack, pos, range);          // 获取输出位置
cache.pushSpawnList(operations);   // 添加待生成物品
cache.endCache();                  // 同步输入输出 + 生成物品
```

### TagCache

简单的 NBT 标签缓存，通过 ID 存取，适用于跨谓词/产出共享数据。

## 8. 事件系统

| 事件 | 用途 |
|------|------|
| `InWorldRecipeEvent` | 配方成功执行后发布，携带配方 ID、类型、上下文 |
| `InWorldRecipeManagerEvent.Init` | `InWorldRecipeManager` 初始化时发布，可获取 `RecipeManager` |
| `ItemCacheEvent.SpawnItemEntity` | 物品实体即将生成时发布 |
| `ItemEntityEvent.InToBlock` | 物品实体进入方块时发布，携带位置和运动信息 |

## 9. 自定义注册表

`LibRegistries` 注册了 5 个 NeoForge 注册表（均限制 512 条目）：

| 注册表 | Key | 说明 |
|--------|-----|------|
| `TRIGGER_REGISTRY` | `anvillib:trigger` | 触发器注册 |
| `PREDICATE_TYPE_REGISTRY` | `anvillib:predicate` | 谓词类型注册 |
| `PREDICATE_FUNCTION_TYPE_REGISTRY` | `anvillib:predicate_function` | 谓词函数类型注册 |
| `OUTCOME_TYPE_REGISTRY` | `anvillib:outcome` | 产出类型注册 |
| `OUTCOME_FUNCTION_TYPE_REGISTRY` | `anvillib:outcome_function` | 产出函数类型注册 |

## 10. 完整示例

```java
// 1. 定义触发器
IRecipeTrigger myTrigger = new IRecipeTrigger.Impl(
    ResourceLocation.fromNamespaceAndPath("mymod", "my_trigger")
);

// 2. 构建配方
InWorldRecipe recipe = InWorldRecipeBuilder.compatible(myTrigger)
    .icon(new ItemStackTemplate(Items.CRAFTING_TABLE))
    .hasItem(items -> items
        .of(Items.IRON_INGOT)
        .offset(0, 1, 0)
        .count(1))
    .hasBlock(block -> block
        .of(Blocks.STONE)
        .offset(0, -1, 0))
    .spawnItem(Items.DIAMOND, 0, 1, 0, 1.0)
    .maxEfficiency(16)
    .build();

// 3. 通过数据生成保存
// builder.save(recipeOutput, recipeKey);
```

## 注意事项

1. **线程安全**：配方检测在服务端执行。`InWorldRecipeContext` 不是线程安全的，不要跨线程共享。
2. **效率限制**：每个配方的 `maxEfficiency` 防止无限循环。配置 `inWorldRecipeMaxEfficiency` 提供全局上限。
3. **缓存提交**：使用缓存时务必在配方结束时提交，否则修改不会写入世界。
4. **兼容模式**：`compatible=true` 允许多个配方共享输入，适合非消耗型检查。`compatible=false` 时冲突谓词会被消耗，阻止其他配方使用。
5. **注册表同步**：所有注册表 (`anvillib:trigger` 等) 均同步到客户端，无需额外处理。
