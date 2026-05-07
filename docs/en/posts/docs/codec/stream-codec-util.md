---
title: StreamCodecUtil
prev: false
next: false
---

# StreamCodecUtil

`StreamCodecUtil` focuses on `StreamCodec` for network packets, providing compact binary serialization for common game objects as well as higher-order combinators.

## Built-in Stream Codecs

| Field                | Applicable Buffer         | Description                                                             |
|----------------------|---------------------------|-------------------------------------------------------------------------|
| `ITEM`               | `RegistryFriendlyByteBuf` | Reads/writes items by registry ID                                       |
| `BLOCK`              | `RegistryFriendlyByteBuf` | Reads/writes blocks by registry ID                                      |
| `ENTITY`             | `RegistryFriendlyByteBuf` | Entity type stream codec                                                |
| `CHAR`               | `RegistryFriendlyByteBuf` | Single character UTF stream codec                                       |
| `VAR_INT_BLOCK_POS`  | `FriendlyByteBuf`         | BlockPos encoded with VarInt                                            |
| `BLOCK_STATE`        | `ByteBuf`                 | Block state encoded by global runtime state ID                          |
| `VEC3`               | `FriendlyByteBuf`         | Vec3 with three float components                                        |
| `VEC3I`              | `ByteBuf`                 | Vec3i packed as a long (same packing as BlockPos)                       |
| `NUMBER_PROVIDER`    | `RegistryFriendlyByteBuf` | Compact NumberProvider variant encoding (Const / Uniform / Binomial)    |

## Bridging and Conversion

### codec2Stream

Converts a registry-context `Codec<T>` to a `StreamCodec<RegistryFriendlyByteBuf, T>` via NBT relay:

```java
StreamCodec<RegistryFriendlyByteBuf, MyType> streamCodec =
    StreamCodecUtil.codec2Stream(MyType.CODEC);
```

Suitable for types that already have a Codec, eliminating the need to manually write network serialization.

### nbtWrapped

Wraps a `Codec<T>` as an NBT-based `StreamCodec<FriendlyByteBuf, T>`:

```java
StreamCodec<FriendlyByteBuf, MyType> streamCodec =
    StreamCodecUtil.nbtWrapped(MyType.CODEC);
```

Commonly used for compatibility with legacy protocol scenarios.

## Higher-Order composite Methods

Provides `composite` overloads for 7 to 16 parameters, combining the encoding/decoding of multiple fields in order:

```java
StreamCodec<B, C> composite(
    StreamCodec<? super B, T1> codec1, Function<C, T1> getter1,
    StreamCodec<? super B, T2> codec2, Function<C, T2> getter2,
    ... ,
    C factory
);
```

Each `composite` reads from the buffer in order during decoding and writes in getter order during encoding. Supports `Function7` through `Function16` as factory methods.

### Example: 7-field Object

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

## Other Utility Methods

| Method                                 | Description                                                  |
|----------------------------------------|--------------------------------------------------------------|
| `enumStreamCodec(Class<T>)`            | Ordinal-based enum stream codec                              |
| `createPairStreamCodec(first, second)` | Combines two StreamCodecs into a `Pair<F, S>` codec          |
| `numberProviderNetworkEncode(buf, np)` | Manually writes the binary format of a NumberProvider        |
| `numberProviderNetworkDecode(buf)`     | Manually reads the binary format of a NumberProvider         |

## Usage Recommendations

- For fewer than 7 fields, prefer the official `StreamCodec.composite` overloads (1-6 parameters)
- For 7-16 fields, use `StreamCodecUtil.composite`
- `codec2Stream` routes through NBT and incurs a performance cost; for frequently used network packets, consider manually writing the StreamCodec
- `NUMBER_PROVIDER`'s STREAM_CODEC preserves precision: integer ConstantValues are compressed to a single byte tag + float
