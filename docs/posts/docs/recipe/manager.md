---
title: Recipe 运行时管理
prev: false
next: false
---

# 运行时管理

## InWorldRecipeManager

核心运行时管理器，负责存储和调度世界内配方。

### 结构

```java
public class InWorldRecipeManager {
    // 触发器 → 排序配方（按 RecipeHolder.value() 的 Comparator）
    public final Multimap<IRecipeTrigger, RecipeHolder<InWorldRecipe>> recipeHolders;
}
```

### 方法

| 方法                                                        | 说明          |
|-----------------------------------------------------------|-------------|
| `register(RecipeHolder<InWorldRecipe>)`                   | 注册配方，按触发器归类 |
| `trigger(IRecipeTrigger, InWorldRecipeContext)`           | 触发配方检测与执行   |
| `trigger(Supplier<IRecipeTrigger>, InWorldRecipeContext)` | Supplier 形式 |

### 触发逻辑

```java
public void trigger(IRecipeTrigger trigger, InWorldRecipeContext ctx) {
    if (ctx.getLevel().isClientSide()) return;  // 仅服务端
    for (RecipeHolder<InWorldRecipe> holder : recipeHolders.get(trigger)) {
        InWorldRecipe recipe = holder.value();
        boolean accept = false;
        for (int i = 0; i < AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency; i++) {
            if (i >= recipe.maxEfficiency()) break;
            if (!recipe.matches(ctx, ctx.getLevel())) {
                if (!accept) break;
                return;
            }
            accept = true;
            recipe.assemble(ctx);
            NeoForge.EVENT_BUS.post(new InWorldRecipeEvent(
                recipe.getType(), holder.id().identifier(), recipe, ctx
            ));
        }
        if (accept) break;  // 首个匹配的配方执行后停止
    }
}
```

关键行为：

1. 按触发器查找所有注册配方
2. 优先级排序（Multimap 中 TreeSet 排序）
3. 循环检测 `matches()` → `assemble()` 直至不再匹配或达到效率上限
4. 每次成功组装后发布 `InWorldRecipeEvent`
5. 首个匹配成功后如果是不兼容模式则立即 break

### 集成原版 RecipeManager

通过 `IRecipeManagerExtension` 接口（Mixin 注入）集成到 Minecraft 的 `RecipeManager`：

```java
public interface IRecipeManagerExtension {
    void anvillib$setInWorldRecipeManager(InWorldRecipeManager manager);
    InWorldRecipeManager anvillib$getInWorldRecipeManager();
    void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>> recipes);
}
```

## InWorldRecipeContext

承载单次配方执行的运行时状态，实现 `RecipeInput`。

### 构造

```java
new InWorldRecipeContext(ServerLevel level, Vec3 pos, @Nullable Entity entity)
```

### 核心方法

| 方法                                                        | 说明                               |
|-----------------------------------------------------------|----------------------------------|
| `getLevel()`                                              | 获取 `ServerLevel`                 |
| `getPos()`                                                | 获取执行中心位置                         |
| `getEntity()`                                             | 获取相关实体（可为 null）                  |
| `getStack()`                                              | 获取线程安全的谓词操作栈                     |
| `push(IRecipePredicate)` / `pop(IRecipePredicate)`        | 谓词栈推入/弹出（带 snapshot/rollback）    |
| `put(InWorldRecipeData<T>, T)`                            | 存储类型安全的键值数据                      |
| `get(InWorldRecipeData<T>)`                               | 按键获取数据（不存在时使用 Data 的默认 supplier） |
| `computeIfAbsent(InWorldRecipeData<T>)`                   | 惰性计算并缓存                          |
| `putAcceptor(Identifier, Consumer<InWorldRecipeContext>)` | 注册完成回调                           |
| `accept()`                                                | 调用所有已注册的 acceptor                |
| `getFloat(NumberProvider)` / `getInt(NumberProvider)`     | 评估 NumberProvider                |
| `emptyLootContext()`                                      | 创建空战利品上下文                        |

### 预定义数据键

| 键                        | 类型                              | 说明        |
|--------------------------|---------------------------------|-----------|
| `BlockCache.BLOCK_CACHE` | `InWorldRecipeData<BlockCache>` | 方块修改缓存    |
| `ItemCache.ITEM_CACHE`   | `InWorldRecipeData<ItemCache>`  | 物品输入/输出缓存 |
| `TagCache.TAG_CACHE`     | `InWorldRecipeData<TagCache>`   | NBT 标签缓存  |

## 自定义注册表

`LibRegistries` 注册了 5 个 NeoForge 注册表（均限制 512 条目）：

| 注册表                                | Key                           | 注册类型                         |
|------------------------------------|-------------------------------|------------------------------|
| `TRIGGER_REGISTRY`                 | `anvillib:trigger`            | `IRecipeTrigger`             |
| `PREDICATE_TYPE_REGISTRY`          | `anvillib:predicate`          | `IRecipePredicate.Type<?>`   |
| `PREDICATE_FUNCTION_TYPE_REGISTRY` | `anvillib:predicate_function` | `IPredicateFunction.Type<?>` |
| `OUTCOME_TYPE_REGISTRY`            | `anvillib:outcome`            | `IRecipeOutcome.Type<?>`     |
| `OUTCOME_FUNCTION_TYPE_REGISTRY`   | `anvillib:outcome_function`   | `IOutcomeFunction.Type<?>`   |

所有注册表均已同步到客户端，通过 `registerRegistries(NewRegistryEvent)` 事件处理注册。

## 事件系统

### InWorldRecipeEvent

配方执行成功后发布。携带配方类型、ID、实例和上下文。

```java
public class InWorldRecipeEvent extends Event {
    public RecipeType<?> recipeType;
    public Identifier id;
    public InWorldRecipe recipe;
    public InWorldRecipeContext context;
}
```

### InWorldRecipeManagerEvent.Init

`InWorldRecipeManager` 初始化时发布。可获取原版 `RecipeManager`：

```java
event.getManager();      // InWorldRecipeManager
event.getRecipeManager(); // Minecraft RecipeManager
```

### ItemCacheEvent.SpawnItemEntity

物品实体即将生成时发布。可修改或取消生成：

```java
event.getEntity();  // 要生成的 ItemEntity
event.getCache();   // ItemCache 实例
```

### ItemEntityEvent.InToBlock

物品实体进入/碰撞方块时发布：

```java
event.getLevel();     // World
event.getEntity();    // 物品实体
event.getBlockPos();  // 进入的方块位置
event.getPos();       // 精确位置
event.getMotion();    // 运动向量
```

## 注意事项

- `InWorldRecipeManager` 的 `trigger()` 仅在服务端执行
- 配置 `inWorldRecipeMaxEfficiency` 提供全局效率上限，防止无限循环
- 所有注册表通过 NeoForge 的同步注册系统自动同步到客户端
- `InWorldRecipeContext` 实例生命周期仅为单次配方触发，不要跨配方共享
