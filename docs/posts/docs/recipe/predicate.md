---
title: Recipe 谓词系统
prev: false
next: false
---

# 谓词系统

## IRecipePredicate

谓词接口，扩展 `Predicate<InWorldRecipeContext>`、`Consumer<InWorldRecipeContext>` 和 `IPrioritized`。

```java
public interface IRecipePredicate<P extends IRecipePredicate<P>>
        extends Predicate<InWorldRecipeContext>, Consumer<InWorldRecipeContext>, IPrioritized {
    // ... methods
}
```

### 核心方法

| 方法 | 说明 |
|------|------|
| `test(InWorldRecipeContext)` | 判断上下文是否匹配条件 |
| `accept(InWorldRecipeContext)` | 匹配成功后消耗资源（默认空实现，仅冲突谓词需实现） |
| `snapshot(InWorldRecipeContext)` | 创建上下文快照（用于回滚） |
| `rollback(InWorldRecipeContext)` | 回滚到快照状态 |
| `clearStack(InWorldRecipeContext)` | 清空谓词操作栈 |
| `getType()` | 返回谓词的 `Type<P>` 描述符 |

### Type 描述符

```java
interface Type<P extends IRecipePredicate<P>> {
    Identifier getId();           // 注册表唯一 ID
    default boolean conflict() {  // true 表示冲突型（消耗），false 表示非冲突型
        return false;
    }
    MapCodec<P> codec();
    StreamCodec<? super RegistryFriendlyByteBuf, P> streamCodec();
}
```

每个谓词类型注册在 `anvillib:predicate` 注册表中。`conflict()` 返回 `true` 的谓词会被自动归类到 `conflicting` 列表。

## 内置谓词

### HasItem

检测指定位置是否存在特定物品实体。

```java
HasItem.builder()
    .of(Items.IRON_INGOT, Items.GOLD_INGOT)  // 物品列表
    .of(TagKey<Item> items)                   // 或物品 Tag
    .offset(0, 1, 0)                          // 相对偏移
    .count(1, 64)                             // 数量范围
    .consumption(ConsumptionType.CONSUME)      // 消耗模式
    .build();
```

| Builder 方法 | 说明 |
|-------------|------|
| `of(ItemLike...)` | 匹配的物品 |
| `of(TagKey<Item>)` | 匹配的物品标签 |
| `offset(Vec3)` / `offset(x,y,z)` | 相对偏移位置 |
| `count(int min, int max)` | 数量范围 |
| `consumption(ConsumptionType)` | 消耗模式：`CONSUME` / `OPTIONAL` |
| `strict(boolean)` | 严格模式（需完全匹配组件） |

**冲突型**（`Type.conflict() = true`）：消耗匹配的物品实体。

### HasItemIngredient

检测指定位置是否存在满足原料条件的物品实体。与 `HasItem` 类似但语义更接近"原料消耗"，数量表示"至少需要"。

```java
HasItemIngredient.builder()
    .of(Items.COAL, Items.CHARCOAL)
    .offset(0, 0, 0)
    .build();
```

**非冲突型**（仅检查，不消耗）。

### HasBlock

检测指定位置是否存在特定方块。

```java
HasBlock.builder()
    .of(Blocks.STONE, Blocks.DIRT)             // 方块列表
    .of(TagKey<Block> tag)                      // 或方块 Tag
    .with(property, value)                      // 方块状态属性条件
    .with("facing", "north")                    // 字符串键名方式
    .offset(0, -1, 0)                           // 相对偏移
    .nbt(compoundTag)                           // NBT 条件（可选）
    .build();
```

| Builder 方法 | 说明 |
|-------------|------|
| `of(Block...)` | 匹配的方块列表 |
| `of(Collection<Block>)` | 匹配的方块集合 |
| `of(TagKey<Block>)` | 匹配的方块标签 |
| `offset(Vec3)` / `offset(x,y,z)` | 相对偏移 |
| `with(Property<C>, C)` | 方块状态属性精确匹配 |
| `with(String, String)` | 字符串形式属性匹配 |
| `nbt(CompoundTag)` | NBT 条件 |

**非冲突型**（仅检查方块状态，不修改世界）。

### HasBlockIngredient

检测指定位置是否存在满足原料条件的方块。与 `HasBlock` API 一致，语义上表示"作为原料消耗"。

```java
HasBlockIngredient.builder()
    .of(Blocks.STONE)
    .offset(0, 0, 0)
    .build();
```

**非冲突型**。

## 自定义谓词

实现 `IRecipePredicate<P>` 并在 `LibRegistries.PREDICATE_TYPE_REGISTRY` 中注册：

```java
public class MyPredicate implements IRecipePredicate<MyPredicate> {
    public static final Type<MyPredicate> TYPE = ...;
    
    @Override
    public boolean test(InWorldRecipeContext ctx) {
        // 匹配逻辑
    }
    
    @Override
    public Type<MyPredicate> getType() {
        return TYPE;
    }
}
```
