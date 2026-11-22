# Multiblock Definition, Builders & Datapack Registration (`module.multiblock`)

<BranchContextCard branch="26.1" />

`module.multiblock` (artifact `anvillib-multiblock-neoforge-26.1`, package `dev.anvilcraft.lib.v2.multiblock`) provides a dynamic multiblock structure framework featuring **datapack registry definitions, main-thread snapshot + background thread-pool async polling, `SavedData` persistence of formed state, and automatic client synchronization**.

This module is split into 3 sub-documents by functionality:
- **This page (Definition, Builders & Datapack Registration)**: Covers `AnvilLibMultiblock`, `AnvilLibMultiblockConfig`, `MultiblockDefinition` (including `Builder` & `SeriaBuilder`), `DefinitionSerialization`, and `LibRegistries`.
- **[Controller, Formation State & Dynamic Manager](./controller-and-state)**: Covers `IController`, `SimpleController`, `ControllerRecord`, `ControllerInfo`, `DynamicMultiblockManager`, `MultiblockState`, `MultiblockPart`, and `MultiblockCheckSnapshot`.
- **[Multiblock Events & Network Sync Packets](./events-and-network)**: Covers `DynamicMultiblockEvent` (`Form` / `Unform`), `BlockEventListener`, `MultiblockFormPacket`, and `MultiblockUnformPacket`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.1`, this module is included automatically. To depend on `multiblock` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-multiblock-neoforge-26.1:2.0.0")
}
```

---

## 2. Core Concepts: How Multiblocks Are Defined & Serialized

A multiblock structure is described by **`MultiblockDefinition`**, backed by an immutable map `Map<Vec3i, BlockStatePredicate>`:
- **Local origin `Vec3i.ZERO` `(0, 0, 0)`**: Always represents the **controller block** position;
- **Relative offset `Vec3i`**: Represents each component's 3D offset `(dx, dy, dz)` relative to the controller;
- **State & NBT predicate `BlockStatePredicate`** (from `module.util`): Specifies the block, block tag, block state properties, or block entity NBT conditions required at that position.

Although backed by `Map<Vec3i, BlockStatePredicate>`, when serialized to datapack JSON, `MultiblockDefinition.CODEC` converts it via **`DefinitionSerialization`** into an intuitive 2D character grid slice format:
- `"grid"`: 3D string array `String[y][z]` (outer array ordered bottom-to-top along `Y`, inner array along `Z` rows, characters in each string along `X` columns);
- **Character `'0'`**: Always represents the controller block (local `(0, 0, 0)`);
- **Space `' '`**: Ignored position (any block allowed, excluded from checks);
- **Other single characters (e.g., `'#'`, `'A'`)**: Mapped in `"mapping"` to concrete `BlockStatePredicate`s.

---

## 3. Full Code Example

`MultiblockDefinition` provides two builders:
1. **`MultiblockDefinition.seriaBuilder()` (Character Grid Builder, Recommended)**: Draw layers (`layer`) like a crafting recipe and bind predicates with `mapController(...)` and `map(char, ...)`;
2. **`MultiblockDefinition.builder()` (Coordinate Offset Builder)**: Ideal for sparse or procedurally generated structures, adding block requirements directly by `Vec3i` offset.

### 1. Registering Multiblock Definitions in Datapack Bootstrap

Multiblock definitions are stored in the datapack registry `LibRegistries.DEFINITIONS_KEY` (registry path `anvillib:definitions`, JSON directory `data/<namespace>/anvillib/definitions/<path>.json`):

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.multiblock.dynamic.definition.MultiblockDefinition;
import dev.anvilcraft.lib.v2.multiblock.init.LibRegistries;
import dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate;
import net.minecraft.core.Vec3i;
import net.minecraft.data.worldgen.BootstrapContext;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;

public final class ModMultiblockDefinitions {
    public static final ResourceKey<MultiblockDefinition> BLAST_KILN = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "blast_kiln")
    );

    public static final ResourceKey<MultiblockDefinition> BEACON_PILLAR = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "beacon_pillar")
    );

    private ModMultiblockDefinitions() {
    }

    public static void bootstrap(BootstrapContext<MultiblockDefinition> ctx) {
        // Approach 1: Use seriaBuilder() to build a 3x2x3 blast kiln layer by layer ('0' = controller, ' ' = air/any)
        MultiblockDefinition blastKiln = MultiblockDefinition.seriaBuilder()
            .layer( // Y = 0 bottom layer
                "BBB",
                "B0B",
                "BBB"
            )
            .layer( // Y = 1 top layer
                "GGG",
                "G G",
                "GGG"
            )
            // Bind '0' controller block (requires a lit furnace or custom controller block)
            .mapController(
                Blocks.FURNACE,
                Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.LIT, true)
            )
            // Bind 'B' to stone bricks tag
            .map('B', BlockStatePredicate.builder().of(BlockTags.STONE_BRICKS))
            // Bind 'G' to glass block
            .map('G', Blocks.GLASS)
            .build();

        ctx.register(BLAST_KILN, blastKiln);

        // Approach 2: Use builder() directly with relative coordinate offsets
        MultiblockDefinition beaconPillar = MultiblockDefinition.builder()
            .addController(ModBlocks.PILLAR_CORE.get())
            .add(new Vec3i(0, 1, 0), Blocks.IRON_BLOCK)
            .add(new Vec3i(0, 2, 0), Blocks.GOLD_BLOCK)
            .add(new Vec3i(0, 3, 0), Blocks.DIAMOND_BLOCK)
            .build();

        ctx.register(BEACON_PILLAR, beaconPillar);
    }
}
```

### 2. Corresponding Datapack JSON Format (`data/my_mod/anvillib/definitions/blast_kiln.json`)

```json
{
  "grid": [
    [
      "BBB",
      "B0B",
      "BBB"
    ],
    [
      "GGG",
      "G G",
      "GGG"
    ]
  ],
  "mapping": {
    "0": {
      "blocks": "minecraft:furnace",
      "state": {
        "lit": "true"
      }
    },
    "B": {
      "blocks": "#minecraft:stone_bricks"
    },
    "G": {
      "blocks": "minecraft:glass"
    }
  }
}
```

---

## 4. Public Classes & Builders API Reference

### 1. `MultiblockDefinition` (Multiblock Structure Definition)

Located in `dev.anvilcraft.lib.v2.multiblock.dynamic.definition.MultiblockDefinition`.

| Constant / Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `MultiblockDefinition.CODEC` | `MapCodec<MultiblockDefinition>` | `MapCodec` implemented via `DefinitionSerialization.CODEC.xmap(...)`. |
| `MultiblockDefinition.STREAM_CODEC` | `StreamCodec<RegistryFriendlyByteBuf, MultiblockDefinition>` | Network stream codec. |
| `public MultiblockDefinition(Map<Vec3i, BlockStatePredicate> definition)` | — | Constructs a definition directly from a relative-offset-to-predicate map (must include `Vec3i.ZERO` for the controller predicate). |
| `public static Builder builder()` | `MultiblockDefinition.Builder` | Creates a `Vec3i` relative-offset builder. |
| `public static SeriaBuilder seriaBuilder()` | `MultiblockDefinition.SeriaBuilder` | Creates a character grid slice (`layer` + `map`) builder. |
| `public @Unmodifiable Map<BlockPos, BlockStatePredicate> toGlobal(BlockPos centerPos)` | `Map<BlockPos, BlockStatePredicate>` | Adds controller world position `centerPos` to all local offsets, returning the world-space check map. |
| `public boolean isController(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | `boolean` | Tests whether the given block state and block entity satisfy the controller predicate at `Vec3i.ZERO`. |

### 2. `MultiblockDefinition.Builder` (Coordinate Offset Builder)

| Method Signature | Description |
| :--- | :--- |
| `add(Vec3i localPos, BlockStatePredicate.Builder predicate)` | Adds a custom builder predicate at relative offset `localPos`. |
| `add(Vec3i localPos, Block block)` | Requires `block` at `localPos`. |
| `add(Vec3i localPos, BlockState state)` | Requires matching `state` properties at `localPos`. |
| `add(Vec3i localPos, Block block, BlockState state)` | Requires `block` and matching `state` properties at `localPos`. |
| `add(Vec3i localPos, CompoundTag tag)` | Requires block entity at `localPos` to match `CompoundTag` NBT. |
| `add(Vec3i localPos, Block block, CompoundTag tag)` | Requires `block` and block entity matching `tag` at `localPos`. |
| `add(Vec3i localPos, BlockState state, CompoundTag tag)` | Requires matching `state` properties and `tag` NBT. |
| `add(Vec3i localPos, Block block, BlockState state, CompoundTag tag)` | Requires matching `block`, `state`, and `tag`. |
| `addController(...)` (8 overloads matching `add`) | Equivalent to adding the controller block predicate at `Vec3i.ZERO` `(0, 0, 0)`. |
| `public MultiblockDefinition build()` | Builds an immutable `MultiblockDefinition`. |

### 3. `MultiblockDefinition.SeriaBuilder` (Character Grid Slice Builder)

| Method Signature | Description |
| :--- | :--- |
| `public SeriaBuilder layer(String... layer)` | Appends a horizontal slice from bottom to top (increasing Y). Strings in a layer represent Z rows, and characters in a string represent X columns. **Note**: all layers must have consistent string array lengths. |
| `public SeriaBuilder map(char key, ...)` (8 overloads matching `Builder#add`) | Maps grid character `key` to the corresponding `BlockStatePredicate`. |
| `public SeriaBuilder mapController(...)` (8 overloads) | Equivalent to `this.map('0', ...)`, binding the controller predicate for `'0'` in the grid. |
| `public MultiblockDefinition build()` | Parses the grid via `new DefinitionSerialization(result, this.mapping).toDefinition()` and returns `MultiblockDefinition`. Throws `IllegalArgumentException("Undefined key '...' found")` if the grid contains any non-space character missing from `mapping`. |

### 4. `DefinitionSerialization` (Intermediate Grid Serialization Record)

```java
public record DefinitionSerialization(String[][] grid, Char2ObjectMap<BlockStatePredicate> mapping)
```

| Constant / Method Signature | Description |
| :--- | :--- |
| `DefinitionSerialization.CODEC` / `STREAM_CODEC` | `MapCodec` and `StreamCodec` for grids and character mappings. |
| `public MultiblockDefinition toDefinition()` | Searches `grid` for `'0'` as the controller origin `offset` (or `Vec3i.ZERO` if not found), then subtracts `offset` from all non-space coordinates to build `MultiblockDefinition`. |
| `public static DefinitionSerialization fromDefinition(MultiblockDefinition definition)` | Compactly encodes a `Vec3i`-based `MultiblockDefinition` back into `String[][] grid` and character mappings (assigning `'0'` to the controller and unique characters from `'A'..'Z'`, `'a'..'z'`, `'1'..'9'`, symbols, and CJK characters for distinct predicates). |

### 5. `AnvilLibMultiblock`, `AnvilLibMultiblockConfig` & `LibRegistries`

| Class | Constants / Field Signatures | Description |
| :--- | :--- | :--- |
| `AnvilLibMultiblock` | `MAIN_ID = "anvillib"`<br>`MOD_ID = "anvillib_multiblock"`<br>`CONFIG` (`AnvilLibMultiblockConfig`)<br>`public static Identifier of(String path)` | Module main class; automatically registers packet channels and config file `config/anvillib/anvillib_multiblock-common.toml`. |
| `AnvilLibMultiblockConfig` | `public int unformedMultiblockCheckInterval = 10` (`[5, 100]`)<br>`public int formedMultiblockCheckInterval = 20` (`[5, 100]`)<br>`public int asyncThreadPoolSize = 4` (`[1, 16]`)<br>`public int maxChecksPerTick = 128` (`[1, 512]`) | • `unformedMultiblockCheckInterval`: ticks between checks for unformed multiblocks (default 10 ticks = 0.5s);<br>• `formedMultiblockCheckInterval`: ticks between re-checks for formed multiblocks (default 20 ticks = 1s);<br>• `asyncThreadPoolSize`: max threads in the background async check pool;<br>• `maxChecksPerTick`: max multiblocks submitted for async checking per tick. |
| `LibRegistries` | `public static final ResourceKey<Registry<MultiblockDefinition>> DEFINITIONS_KEY` | Datapack registry key `anvillib:definitions`, configured with server-to-client auto-sync in `DataPackRegistryEvent.NewRegistry`. |
