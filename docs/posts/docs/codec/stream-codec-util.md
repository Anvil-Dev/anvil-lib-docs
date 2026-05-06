---
title: StreamCodecUtil
prev: false
next: false
---

# StreamCodecUtil

`StreamCodecUtil` 专注网络数据包的 `StreamCodec`，提供常见游戏对象的紧凑二进制序列化以及高阶组合器。

## 内置流编解码器

| 字段                  | 适用缓冲区                     | 说明                                                  |
|---------------------|---------------------------|-----------------------------------------------------|
| `ITEM`              | `RegistryFriendlyByteBuf` | 通过注册表 ID 读写物品                                       |
| `BLOCK`             | `RegistryFriendlyByteBuf` | 通过注册表 ID 读写方块                                       |
| `ENTITY`            | `RegistryFriendlyByteBuf` | 实体类型流编解码                                            |
| `CHAR`              | `RegistryFriendlyByteBuf` | 单字符 UTF 流编解码                                        |
| `VAR_INT_BLOCK_POS` | `FriendlyByteBuf`         | 使用 VarInt 编码的 BlockPos                              |
| `BLOCK_STATE`       | `ByteBuf`                 | 按全局运行时 state ID 编码方块状态                              |
| `VEC3`              | `FriendlyByteBuf`         | Vec3 三个分量以 float 编码                                 |
| `VEC3I`             | `ByteBuf`                 | Vec3i 打包为 long（等同于 BlockPos 打包方式）                   |
| `NUMBER_PROVIDER`   | `RegistryFriendlyByteBuf` | 紧凑的 NumberProvider 变体编码（Const / Uniform / Binomial） |

## 桥接与转换

### codec2Stream

将带注册表上下文的 `Codec<T>` 通过 NBT 中转转换为 `StreamCodec<RegistryFriendlyByteBuf, T>`：

```java
StreamCodec<RegistryFriendlyByteBuf, MyType> streamCodec =
    StreamCodecUtil.codec2Stream(MyType.CODEC);
```

适用于已有 Codec 的类型，无需手动编写网络序列化。

### nbtWrapped

将 `Codec<T>` 包装为基于 NBT 的 `StreamCodec<FriendlyByteBuf, T>`：

```java
StreamCodec<FriendlyByteBuf, MyType> streamCodec =
    StreamCodecUtil.nbtWrapped(MyType.CODEC);
```

常用于与旧版协议兼容的场景。

## 高阶 composite 方法

提供从 7 到 16 参数的 `composite` 重载，按顺序组合多个字段的编解码：

```java
StreamCodec<B, C> composite(
    StreamCodec<? super B, T1> codec1, Function<C, T1> getter1,
    StreamCodec<? super B, T2> codec2, Function<C, T2> getter2,
    ... ,
    C factory
);
```

每个 `composite` 解码时按顺序读取缓冲区，编码时按 getter 顺序写入。支持 `Function7` 至 `Function16` 作为工厂方法。

### 示例：7 字段对象

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

## 其他实用方法

| 方法                                     | 说明                                  |
|----------------------------------------|-------------------------------------|
| `enumStreamCodec(Class<T>)`            | 基于 ordinal 的枚举流编解码                  |
| `createPairStreamCodec(first, second)` | 组合两个 StreamCodec 为 `Pair<F, S>` 编解码 |
| `numberProviderNetworkEncode(buf, np)` | 手动写入 NumberProvider 的二进制格式          |
| `numberProviderNetworkDecode(buf)`     | 手动读取 NumberProvider 的二进制格式          |

## 使用建议

- 字段数少于 7 时优先使用 `StreamCodec.composite` 的官方重载（1-6 参数）
- 字段数 7-16 时使用 `StreamCodecUtil.composite`
- `codec2Stream` 通过 NBT 中转，存在性能开销，频繁使用的网络包建议手动编写 StreamCodec
- `NUMBER_PROVIDER` 的 STREAM_CODEC 会保留精度：整数型 ConstantValue 压缩为单字节标记 + float
