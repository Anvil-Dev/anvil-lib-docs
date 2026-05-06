---
title: CodecUtil
prev: false
next: false
---

# CodecUtil

`CodecUtil` 是抽象工具类，提供静态 `Codec` / `MapCodec` 常量及辅助方法，用于将游戏对象序列化为 JSON、NBT 或配置文件。

## 内置编解码器

| 字段                      | 类型                      | 说明                                              |
|-------------------------|-------------------------|-------------------------------------------------|
| `ITEM`                  | `Codec<Item>`           | 通过注册表 ID 字符串序列化物品，空气或无效 ID 返回 error             |
| `BLOCK`                 | `Codec<Block>`          | 通过注册表 ID 字符串序列化方块                               |
| `ENTITY`                | `Codec<EntityType<?>>`  | 实体类型编解码，带注册表存在性校验                               |
| `CHAR`                  | `Codec<Character>`      | 单字符编解码器                                         |
| `NUMBER_PROVIDER`       | `Codec<NumberProvider>` | 支持标准 NumberProvider 结构与纯整数（自动展开为 ConstantValue） |
| `BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>`  | 通过 `"block"` 字段确定方块，`"state"` 字段携带属性值           |

## 方块状态编解码

```java
// 为特定 BlockState 构建属性编解码器
MapCodec<BlockState> codec = CodecUtil.blockStatePropertiesCodec(state);

// 向已有 MapCodec 追加一个属性字段
MapCodec<BlockState> extended = CodecUtil.appendBlockStatePropertyCodec(
    base, supplier, name, property, defValue
);
```

## 枚举编解码

| 方法                               | 说明              |
|----------------------------------|-----------------|
| `enumCodecInInt(Class<T>)`       | 按 ordinal 整数编解码 |
| `enumCodecInLowerName(Class<T>)` | 按小写名称字符串编解码     |

```java
Codec<MyEnum> intCodec = CodecUtil.enumCodecInInt(MyEnum.class);
Codec<MyEnum> nameCodec = CodecUtil.enumCodecInLowerName(MyEnum.class);
```

## Optional 编解码

```java
// 带显式 isPresent 布尔字段的 Optional 编解码器
Codec<Optional<T>> codec = CodecUtil.createOptionalCodec(innerCodec);
```

## 集合编解码

```java
// LinkedList 编解码
Codec<LinkedList<T>> listCodec = CodecUtil.linkedListOf(innerCodec);

// 双端队列编解码
Codec<Deque<T>> dequeCodec = CodecUtil.dequeOf(innerCodec, factoryFunction);
```

## 配方相关

```java
// 创建限制最大长度的 NonNullList<Ingredient> 编解码器
Codec<NonNullList<Ingredient>> ingredients = CodecUtil.createIngredientListCodec(
    "ingredients", 9, recipeType
);
```

## 单条目 Map 转换

```java
// 将 Codec<Map<K,V>> 转为 Codec<T>，适用于 {"key": value} 格式
Codec<T> byMap = CodecUtil.byMap(mapCodec, keyGetter, valueGetter, factory);
```

## 使用示例

```java
// 方块状态的完整编解码
MapCodec<BlockState> blockStateMapCodec = CodecUtil.BLOCK_STATE_MAP_CODEC;

// 枚举按名称编解码
Codec<MyEnum> enumCodec = CodecUtil.enumCodecInLowerName(MyEnum.class);

// NumberProvider 同时支持数值和标准结构
Codec<NumberProvider> npCodec = CodecUtil.NUMBER_PROVIDER;
```
