# Multiblock Dynamic Structure System: Definitions & Serialization (`module.multiblock`)

<BranchContextCard branch="1.21.11" />

`module.multiblock` (artifact `anvillib-multiblock-neoforge-1.21.11`, package `dev.anvilcraft.lib.v2.multiblock`) provides a dynamic multiblock structure framework featuring **datapack JSON-driven definitions, main-thread snapshot + background thread-pool async periodic checks, `Codec` `SavedDataType` world persistence, and automatic client-server state sync**.

In traditional multiblock implementations, iterating dozens of `BlockState`s and `BlockEntity` NBTs around every multiblock controller on the server main thread every tick severely degrades TPS when hundreds of multiblocks exist. `module.multiblock` solves this with:
1. **Data-driven definitions (`MultiblockDefinition`)**: Registered under datapack registry `anvillib:multiblock_definitions`, buildable via coordinate points (`Builder`) or layered character grids like shaped recipes (`SeriaBuilder` / `DefinitionSerialization`);
2. **Main-thread snapshot + background async check (`MultiblockCheckSnapshot`)**: On periodic checks, the main thread only copies `BlockState` references (and `CompoundTag`s for block entities needing NBT checks), then offloads expensive predicate matching to the `AnvilLib-MultiblockCheck` daemon pool, returning to the main thread via `server.execute(...)` to update state and broadcast packets.

This module is split into 3 sub-documents by functionality:
- **This page (Definitions & Serialization)**: Covers `AnvilLibMultiblock`, `AnvilLibMultiblockConfig`, `LibRegistries`, `MultiblockDefinition` (including `Builder` & `SeriaBuilder`), and `DefinitionSerialization`.
- **[Controller, World State & Async Check Manager](./controller-and-state)**: Covers `IController`, `SimpleController`, `ControllerRecord`, `ControllerInfo`, `MultiblockState`, `MultiblockPart`, `MultiblockCheckSnapshot`, and `DynamicMultiblockManager`.
- **[Multiblock Lifecycle Events & Network Sync](./events-and-network)**: Covers `DynamicMultiblockEvent` (`Form` / `Unform`), `BlockEventListener`, `MultiblockFormPacket`, and `MultiblockUnformPacket`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.11`, this module is included automatically. To depend on `multiblock` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-multiblock-neoforge-1.21.11:2.0.0")
}
```

---

## 2. Multiblock Structure Definition & JSON Format (`MultiblockDefinition`)

### 1. Core Convention: Controller Fixed at Local Origin `Vec3i.ZERO` / Character `'0'`

In `MultiblockDefinition`, all component block coordinates are **local offsets `Vec3i` relative to the controller block**:
- **The controller itself must be at local origin `Vec3i.ZERO` `(0, 0, 0)`** (`MultiblockDefinition#isController` always checks `definition.get(Vec3i.ZERO)`);
- When using the character grid builder `SeriaBuilder` or authoring datapack JSON:
  - **Character `'0'` always represents the controller block (local `(0, 0, 0)`)** and **must appear exactly once** in the 3D grid (missing or duplicate `'0'` throws `IllegalArgumentException` on deserialization);
  - **Space `' '` means ignored** (no block constraint at that position).

### 2. Datapack JSON Example: `data/my_mod/anvillib/multiblock_definitions/blast_furnace.json`

`LibRegistries.DEFINITIONS_KEY` (`anvillib:multiblock_definitions`) is a datapack registry, so definition files live in `data/<namespace>/anvillib/multiblock_definitions/<name>.json`:

```json
{
  "layers": [
    [
      "BBB",
      "BBB",
      "BBB"
    ],
    [
      "BCB",
      "C0C",
      "BCB"
    ],
    [
      "BBB",
      "BBB",
      "BBB"
    ]
  ],
  "mapping": {
    "0": {
      "blocks": "my_mod:blast_controller"
    },
    "B": {
      "blocks": "minecraft:bricks"
    },
    "C": {
      "blocks": "minecraft:copper_block"
    }
  }
}
```

---

## 3. Full Code Example: Building `MultiblockDefinition` in Code with `SeriaBuilder` or `Builder`

In DataGen (generating datapack entries via `DatapackBuiltinEntriesProvider`), build definitions using **`MultiblockDefinition.seriaBuilder()`** (recommended, maps directly to JSON character grids) or **`MultiblockDefinition.builder()`** (ideal for sparse structures):

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.multiblock.dynamic.definition.MultiblockDefinition;
import dev.anvilcraft.lib.v2.multiblock.init.LibRegistries;
import dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate;
import net.minecraft.core.RegistrySetBuilder;
import net.minecraft.core.Vec3i;
import net.minecraft.data.worldgen.BootstrapContext;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.properties.SlabType;

public final class ModMultiblockDefinitions {
    public static final ResourceKey<MultiblockDefinition> BLAST_FURNACE = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "blast_furnace")
    );

    public static final ResourceKey<MultiblockDefinition> ANVIL_ALTAR = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "anvil_altar")
    );

    private ModMultiblockDefinitions() {
    }

    public static void bootstrap(BootstrapContext<MultiblockDefinition> ctx) {
        // Approach 1: Use SeriaBuilder character grid to build a 3x3x3 blast furnace ('0' is controller origin)
        MultiblockDefinition blastFurnace = MultiblockDefinition.seriaBuilder()
            .layer(
                "BBB",
                "BBB",
                "BBB"
            )
            .layer(
                "BCB",
                "C0C",
                "BCB"
            )
            .layer(
                "BBB",
                "BBB",
                "BBB"
            )
            .mapController(ModBlocks.BLAST_CONTROLLER.get())
            .map('B', Blocks.BRICKS)
            .map('C', Blocks.COPPER_BLOCK)
            .build();
        ctx.register(BLAST_FURNACE, blastFurnace);

        // Approach 2: Use coordinate point Builder to build a sparse altar structure
        MultiblockDefinition anvilAltar = MultiblockDefinition.builder()
            .addController(Blocks.ANVIL)
            .add(new Vec3i(0, -1, 0), Blocks.IRON_BLOCK)
            .add(
                new Vec3i(1, 0, 0),
                BlockStatePredicate.builder()
                    .of(Blocks.SMOOTH_STONE_SLAB)
                    .with(SlabBlock.TYPE, SlabType.BOTTOM)
            )
            .add(
                new Vec3i(-1, 0, 0),
                BlockStatePredicate.builder()
                    .of(Blocks.SMOOTH_STONE_SLAB)
                    .with(SlabBlock.TYPE, SlabType.BOTTOM)
            )
            .build();
        ctx.register(ANVIL_ALTAR, anvilAltar);
    }

    public static void registerToBuilder(RegistrySetBuilder builder) {
        builder.add(LibRegistries.DEFINITIONS_KEY, ModMultiblockDefinitions::bootstrap);
    }
}
```

---

## 4. Core Classes & Config API Reference

### 1. `MultiblockDefinition` & `DefinitionSerialization`

| Class / Record | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`MultiblockDefinition`** | • `public static final Codec<MultiblockDefinition> CODEC`<br>• `public static final Codec<Holder<MultiblockDefinition>> HOLDER_CODEC`<br>• `public static Builder builder()`<br>• `public static SeriaBuilder seriaBuilder()`<br>• `public boolean isController(BlockState state)`<br>• `public boolean test(Level level, BlockPos controllerPos)`<br>• `public Set<Vec3i> getAllOffsets()` / `public Map<Vec3i, BlockStatePredicate> definition()` | Immutable multiblock structure definition record, and element type of registry `anvillib:multiblock_definitions`. |
| **`MultiblockDefinition.Builder`** | • `addController(...)` (overloads for `Block`, `BlockStatePredicate`, `BlockStatePredicate.Builder`, `TagKey<Block>`, `Block...`)<br>• `add(Vec3i offset, ...)` (full matching overloads)<br>• `build()` | Explicit local-offset builder (enforces that `Vec3i.ZERO` is defined and at least 1 block is present). |
| **`MultiblockDefinition.SeriaBuilder`** | • `layer(String... layer)` (stacks 2D layers bottom-to-top along Y)<br>• `mapController(...)` (maps character `'0'`)<br>• `map(char key, ...)` (forbids explicitly mapping space `' '`)<br>• `build()` (builds `DefinitionSerialization` and unpacks it) | Visual ASCII character layer grid builder; automatically locates `'0'` and computes relative offsets for all other characters. |
| **`DefinitionSerialization`** | • `public static final MapCodec<DefinitionSerialization> CODEC`<br>• `public static final Codec<DefinitionSerialization> DIRECT_CODEC`<br>• `public Map<Vec3i, BlockStatePredicate> getDefinition()` | Bidirectional codec for `layers` / `mapping` JSON format; throws immediately if layer dimensions mismatch, `'0'` is missing, or unmapped characters exist. |

### 2. `AnvilLibMultiblock`, `AnvilLibMultiblockConfig` & `LibRegistries`

| Class | Constants / Config Fields / Methods | Description |
| :--- | :--- | :--- |
| **`AnvilLibMultiblock`** | • `MAIN_ID = "anvillib"`, `MOD_ID = "anvillib_multiblock"`<br>• `CONFIG` (`AnvilLibMultiblockConfig` instance)<br>• `Identifier of(String path)` | Module main class; auto-registers network packets, config, and client DataGen. |
| **`AnvilLibMultiblockConfig`** | • `unformedMultiblockCheckInterval` (default `10` ticks, range `[5, 100]`)<br>• `formedMultiblockCheckInterval` (default `20` ticks, range `[5, 100]`)<br>• `asyncThreadPoolSize` (default `4` threads, range `[1, 16]`)<br>• `maxChecksPerTick` (default `128` checks/tick, range `[1, 512]`) | `@Config(group = "anvillib", name = "anvillib_multiblock")` for tuning check intervals and background thread pool throughput. |
| **`LibRegistries`** | `public static final ResourceKey<Registry<MultiblockDefinition>> DEFINITIONS_KEY` | Datapack registry key `anvillib:multiblock_definitions`. |
