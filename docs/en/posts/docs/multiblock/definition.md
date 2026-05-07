---
title: Multiblock Definition System
prev: false
next: false
---

# Definition System

## MultiblockDefinition

An immutable record describing the multiblock structure, with the core being `Map<Vec3i, BlockStatePredicate>`, mapping relative positions to block predicates.

```java
public record MultiblockDefinition(
    @Unmodifiable Map<Vec3i, BlockStatePredicate> definition
) {
    public static Builder builder();
    public static SeriaBuilder seriaBuilder();
    ...
}
```

### Core Methods

| Method                                                               | Description                                                                    |
|----------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `toGlobal(BlockPos centerPos)`                                       | Converts relative positions to absolute positions with `centerPos` as the origin |
| `isController(LevelAccessor, BlockState, @Nullable BlockEntity)`     | Tests whether the predicate at `ZERO` matches (determines if a location is a controller) |

### Serialization

Provides `CODEC` (`MapCodec<MultiblockDefinition>`) and `STREAM_CODEC`. Internally uses `DefinitionSerialization`
to convert definitions into a human-readable grid format for serialization.

## Builder (Code-based)

```java
MultiblockDefinition definition = MultiblockDefinition.builder()
    .addController(Blocks.DIAMOND_BLOCK)                    // Position (0,0,0)
    .add(new Vec3i(0, 1, 0), Blocks.GOLD_BLOCK)             // Gold block above
    .add(new Vec3i(0, -1, 0), Blocks.IRON_BLOCK)            // Iron block below
    .add(new Vec3i(1, 0, 0), BlockStatePredicate.builder()  // X+1 oak log horizontal
        .of(Blocks.OAK_LOG)
        .with(BlockStateProperties.AXIS, Direction.Axis.X)
        .build())
    .add(new Vec3i(0, 0, 1), tag)                           // Z+1 with NBT
    .build();
```

### Builder Methods

| Method                                           | Description                                  |
|-------------------------------------------------|----------------------------------------------|
| `add(Vec3i, BlockStatePredicate.Builder)`       | Add a predicate at the position              |
| `add(Vec3i, Block)`                             | Add a block match at the position            |
| `add(Vec3i, CompoundTag)`                       | Add an NBT match at the position             |
| `add(Vec3i, Block, CompoundTag)`                | Add a block+NBT match at the position        |
| `addController(BlockStatePredicate.Builder)`    | Set the predicate at the controller position (`Vec3i.ZERO`) |
| `addController(Block)`                          | Set the controller block                     |
| `addController(CompoundTag)`                    | Set the controller NBT                       |
| `addController(Block, CompoundTag)`             | Set the controller block+NBT                 |
| `build()`                                       | Build an immutable `MultiblockDefinition`    |

## SeriaBuilder (Grid-based)

Uses ASCII character art to define multi-layer multiblock structures, ideal for visual design.

```java
MultiblockDefinition definition = MultiblockDefinition.seriaBuilder()
    .mapController(Blocks.DIAMOND_BLOCK)       // '0' = controller
    .map('G', Blocks.GOLD_BLOCK)
    .map('I', Blocks.IRON_BLOCK)
    .map('S', BlockStatePredicate.builder()    // 'S' = stone brick slab
        .of(Blocks.STONE_BRICK_SLAB)
        .with(BlockStateProperties.SLAB_TYPE, SlabType.BOTTOM)
        .build())
    .layer(          // Y=0 (bottom layer)
        "III",
        "ISI",
        "III"
    )
    .layer(          // Y=1 (middle layer: controller)
        " G ",
        "G0G",
        " G "
    )
    .layer(          // Y=2 (top layer)
        "GGG",
        "G G",
        "GGG"
    )
    .build();
```

### Grid Rules

- Each layer is a `String[]`, with each string representing one row in the Z direction
- Characters in the string represent positions in the X direction
- Multiple layers stack along the Y axis (from bottom to top in the order added)
- The space character `' '` means no match is required at that position
- `'0'` is fixed as the controller position and must be defined
- All coordinates are offset with the controller position as the center when building

### SeriaBuilder Methods

| Method                                           | Description                                      |
|-------------------------------------------------|--------------------------------------------------|
| `layer(String... layer)`                        | Add a layer (each array entry is a Z row, content is X character sequence) |
| `map(char key, BlockStatePredicate.Builder)`    | Map a character to a predicate                   |
| `map(char key, Block)`                          | Map a character to a block                       |
| `map(char key, CompoundTag)`                    | Map a character to NBT                           |
| `map(char key, Block, CompoundTag)`             | Map a character to a block+NBT                   |
| `mapController(...)`                            | Map the controller marker ('0') to the specified predicate/block |
| `build()`                                       | Build the `MultiblockDefinition`                |

## DefinitionSerialization (Internal Format)

A `package-private` record class that handles conversion between grid format and `MultiblockDefinition`.

```java
record DefinitionSerialization(
    String[][] grid,                            // Y → Z → X characters
    Char2ObjectMap<BlockStatePredicate> mapping // Character → predicate mapping
)
```

**`toDefinition()`**: Finds `'0'` as the origin, converts all non-space characters into predicate entries at relative positions.

**`fromDefinition(definition)`**: Reverse conversion: reconstructs a grid from a free-form definition, automatically assigning character keys (`A-Z`, `a-z`, `0-9`, special characters... up to CJK characters).

**Key assignment order**: `A-Z` → `a-z` → `1-9` → special characters → CJK characters starting from `一`

## JSON Serialization Format

```json
{
  "grid": [
    [
      [" ", "G", " "],
      ["G", "0", "G"],
      [" ", "G", " "]
    ]
  ],
  "mapping": {
    "0": { "block": "mymod:controller" },
    "G": { "block": "minecraft:gold_block" }
  }
}
```

- `grid[Y][Z][X]` is a single character
- Datapack path: `data/<namespace>/anvillib/definitions/<name>.json`

## Registry

```java
// Definition registry key
ResourceKey<Registry<MultiblockDefinition>> key = LibRegistries.DEFINITIONS_KEY;
// → anvillib:definitions
```

Registered as a synced datapack registry via `DataPackRegistryEvent.NewRegistry`, using `CODEC.codec()` as both save and network codec.
