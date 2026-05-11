---
title: CodecUtil
prev: false
next: false
---

# CodecUtil

`CodecUtil` is an abstract utility class providing static `Codec` / `MapCodec` constants and helper methods for
serializing game objects to JSON, NBT, or configuration files.

## Built-in Codecs

| Field                   | Type                    | Description                                                                                     |
|-------------------------|-------------------------|-------------------------------------------------------------------------------------------------|
| `ITEM`                  | `Codec<Item>`           | Serializes items by registry ID string; air or invalid IDs return an error                      |
| `BLOCK`                 | `Codec<Block>`          | Serializes blocks by registry ID string                                                         |
| `ENTITY`                | `Codec<EntityType<?>>`  | Entity type codec with registry existence validation                                            |
| `CHAR`                  | `Codec<Character>`      | Single character codec                                                                          |
| `NUMBER_PROVIDER`       | `Codec<NumberProvider>` | Supports standard NumberProvider structures and plain integers (auto-expanded to ConstantValue) |
| `BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>`  | Identifies the block via the `"block"` field and carries property values in the `"state"` field |

## Block State Codec

```java
// Build a property codec for a specific BlockState
MapCodec<BlockState> codec = CodecUtil.blockStatePropertiesCodec(state);

// Append a property field to an existing MapCodec
MapCodec<BlockState> extended = CodecUtil.appendBlockStatePropertyCodec(
    base, supplier, name, property, defValue
);
```

## Enum Codecs

| Method                           | Description                            |
|----------------------------------|----------------------------------------|
| `enumCodecInInt(Class<T>)`       | Encode/decode by ordinal integer       |
| `enumCodecInLowerName(Class<T>)` | Encode/decode by lowercase name string |

```java
Codec<MyEnum> intCodec = CodecUtil.enumCodecInInt(MyEnum.class);
Codec<MyEnum> nameCodec = CodecUtil.enumCodecInLowerName(MyEnum.class);
```

## Optional Codec

```java
// Optional codec with an explicit isPresent boolean field
Codec<Optional<T>> codec = CodecUtil.createOptionalCodec(innerCodec);
```

## Collection Codecs

```java
// LinkedList codec
Codec<LinkedList<T>> listCodec = CodecUtil.linkedListOf(innerCodec);

// Deque codec
Codec<Deque<T>> dequeCodec = CodecUtil.dequeOf(innerCodec, factoryFunction);
```

## Recipe-Related

```java
// Create a size-limited NonNullList<Ingredient> codec
Codec<NonNullList<Ingredient>> ingredients = CodecUtil.createIngredientListCodec(
    "ingredients", 9, recipeType
);
```

## Single-Entry Map Conversion

```java
// Convert Codec<Map<K,V>> to Codec<T>, suitable for {"key": value} format
Codec<T> byMap = CodecUtil.byMap(mapCodec, keyGetter, valueGetter, factory);
```

## Usage Examples

```java
// Full block state codec
MapCodec<BlockState> blockStateMapCodec = CodecUtil.BLOCK_STATE_MAP_CODEC;

// Enum codec by name
Codec<MyEnum> enumCodec = CodecUtil.enumCodecInLowerName(MyEnum.class);

// NumberProvider supports both numeric and standard structure formats
Codec<NumberProvider> npCodec = CodecUtil.NUMBER_PROVIDER;
```
