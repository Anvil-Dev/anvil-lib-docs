---
title: Codec 编解码
prev: false
next: false
---

# 编解码器工具（Codec Utilities）

包 `dev.anvilcraft.lib.v2.codec` 包含了用于 Minecraft/NeoForge 开发的高频序列化工具。  
分为两大类：**配置/存档编解码器（`Codec`）** 和 **网络流编解码器（`StreamCodec`）**。

## 1. CodecUtil

`CodecUtil` 是抽象工具类，提供了一批静态 `Codec` / `MapCodec` 常量及辅助方法，用于将游戏对象序列化为 JSON、NBT 或配置文件。

### 1.1 内置编解码器

| 字段                      | 类型                      | 说明                                                  |
|-------------------------|-------------------------|-----------------------------------------------------|
| `ITEM`                  | `Codec<Item>`           | 通过注册表 ID 字符串序列化物品，解析失败或为空气时返回错误                     |
| `BLOCK`                 | `Codec<Block>`          | 类似 `ITEM`，用于方块                                      |
| `ENTITY`                | `Codec<EntityType<?>>`  | 实体类型编解码器，带注册表存在性校验                                  |
| `CHAR`                  | `Codec<Character>`      | 单字符编解码器                                             |
| `NUMBER_PROVIDER`       | `Codec<NumberProvider>` | 既支持标准 NumberProvider 结构，也兼容纯整数（自动展开为 ConstantValue） |
| `BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>`  | 通过 `"block"` 字段确定方块，再用 `"state"` 字段携带属性值            |

### 1.2 辅助方法

#### 方块状态属性编解码

```java
// 构建方块状态属性编解码器
MapCodec<BlockState> codec = CodecUtil.blockStatePropertiesCodec(state);
// 向已有 MapCodec 追加一个属性字段
MapCodec<BlockState> extended = CodecUtil.appendBlockStatePropertyCodec(base, supplier, name, property, defValue);
```

#### 枚举编解码

- `enumCodecInInt(Class<T>)` – 按 ordinal 整数编解码
- `enumCodecInLowerName(Class<T>)` – 按小写名称字符串编解码

#### Optional 编解码

- `createOptionalCodec(Codec<T>)` – 带显式 `isPresent` 布尔字段的 Optional 编解码器

#### 集合编解码

- `linkedListOf(Codec<T>)` – 构建 `LinkedList` 编解码器
- `dequeOf(Codec<T>, Function)` – 构建双端队列编解码器

#### 配方相关

- `createIngredientListCodec(fieldName, size, recipeType)` – 创建限制最大长度的 `NonNullList<Ingredient>` 编解码器

#### 单条目 Map 转换

```java
CodecUtil.<K,V,T>byMap(mapCodec, keyGetter, valueGetter, factory)
```

将一个 `Codec<Map<K,V>>` 转成直接值 `Codec<T>`，适用于 JSON 中类似 `{ "key": value }` 的单条映射。

## 2. StreamCodecUtil

`StreamCodecUtil` 专注于网络数据包的 `StreamCodec`，提供常见游戏对象的紧凑二进制序列化，以及高阶组合器。

### 2.1 内置流编解码器

| 字段                  | 适用缓冲区                     | 说明                                             |
|---------------------|---------------------------|------------------------------------------------|
| `ITEM`              | `RegistryFriendlyByteBuf` | 通过注册表 ID 读写物品                                  |
| `BLOCK`             | `RegistryFriendlyByteBuf` | 通过注册表 ID 读写方块                                  |
| `ENTITY`            | `RegistryFriendlyByteBuf` | 实体类型流编解码                                       |
| `CHAR`              | `RegistryFriendlyByteBuf` | 单字符 UTF 流编解码                                   |
| `VAR_INT_BLOCK_POS` | `FriendlyByteBuf`         | 使用 VarInt 编码的 BlockPos                         |
| `BLOCK_STATE`       | `ByteBuf`                 | 按全局运行时 state ID 编码方块状态                         |
| `VEC3`              | `FriendlyByteBuf`         | 将 Vec3 的三个分量以 float 形式编码                       |
| `VEC3I`             | `ByteBuf`                 | 将 Vec3i 打包为 long（等同于 BlockPos 的打包方式）           |
| `NUMBER_PROVIDER`   | `RegistryFriendlyByteBuf` | 紧凑的 NumberProvider 变体编码：Const、Uniform、Binomial |

### 2.2 桥接与转换

- **`codec2Stream(Codec<T>)`**  
  将带注册表上下文的 `Codec<T>` 通过 NBT 中转转换为 `StreamCodec<RegistryFriendlyByteBuf, T>`。  
  适用于已有的 Codec，无需手动编写网络序列化。

- **`nbtWrapped(Codec<T>)`**  
  将 `Codec<T>` 包装为基于 NBT 的 `StreamCodec<FriendlyByteBuf, T>`，常用于与旧版协议兼容。

### 2.3 高阶 composite 方法

提供了从 7 参数到 16 参数的 `composite` 重载，用于按顺序组合多个字段的编解码。

```java
StreamCodec<B, C> composite(StreamCodec<? super B, T1> codec1, Function<C, T1> getter1, 
                            StreamCodec<? super B, T2> codec2, Function<C, T2> getter2, ... , C factory)
```

每个 `composite` 按照解码顺序读取缓冲区，编码时按 getter 顺序写入。所有重载均支持 `Function7` 至 `Function16` 作为工厂方法。

#### 示例：解码一个包含 7 个字段的对象

```java
public static final StreamCodec<RegistryFriendlyByteBuf, MyObject> STREAM_CODEC = 
    StreamCodecUtil.composite(
        StreamCodecUtil.ITEM,          MyObject::item,
        ByteBufCodecs.VAR_INT,         MyObject::count,
        BlockPos.STREAM_CODEC,         MyObject::pos,
        StreamCodecUtil.VEC3,          MyObject::offset,
        ByteBufCodecs.BOOL,            MyObject::flag1,
        ByteBufCodecs.BOOL,            MyObject::flag2,
        ByteBufCodecs.UTF_8,           MyObject::name,
        MyObject::new
    );
```

### 2.4 其他实用方法

- **`enumStreamCodec(Class<T>)`** – 基于 ordinal 的枚举流编解码器
- **`createPairStreamCodec(first, second)`** – 将两个 StreamCodec 组合为 `Pair<F, S>` 的编解码器
- **`numberProviderNetworkEncode/Decode`** – 手动控制 NumberProvider 的二进制格式

## 3. 使用注意事项

1. **线程安全**：所有预定义的 Codec/StreamCodec 均为不可变常量，可以安全共享。
2. **错误处理**：`ITEM` 和 `BLOCK` 在遇到空气或无效 ID 时会返回 `DataResult.error`，建议在解析时处理异常。
3. **注册表依赖**：多数编解码依赖当前运行的注册表（`BuiltInRegistries`），序列化后的数据会绑定到注册表 ID，注意不同版本间的兼容性。
4. **高参数 composite**：仅当对象字段数介于 7-16 且没有更少的组合器时才使用；字段数更少时优先使用 `StreamCodec.composite`
   的官方重载。
5. **NUMBER_PROVIDER 编码**：默认的 `STREAM_CODEC` 会尝试保留精度，整数型 `ConstantValue` 会压缩为单字节标记后跟
   float；非整数或其它类型则走标准流程。
