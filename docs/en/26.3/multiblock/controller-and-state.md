# Controller, Formation State & Dynamic Manager (`IController` / `DynamicMultiblockManager`)

<BranchContextCard branch="26.3" />

After defining a `MultiblockDefinition` in a datapack, you need to bind a controller block to that definition and run business logic when the multiblock forms or unforms. This page covers the controller interfaces (`IController` / `SimpleController` / `ControllerRecord`), runtime multiblock data (`MultiblockState` / `MultiblockCheckSnapshot`), and the core scheduler `DynamicMultiblockManager`.

---

## 1. Core Runtime Mechanics

1. **Immediate synchronous check on block placement (`DynamicMultiblockManager.onPlace`)**:
   When any block is placed in the world, `BlockEventListener` triggers `DynamicMultiblockManager.onPlace`. The manager iterates all `MultiblockDefinition`s in the registry:
   - Calls the controller's `correctPos(level, pos, state)` (allowing outer parts to redirect the check anchor to the controller position; defaults to returning `pos`);
   - If the block at `correctedPos` satisfies `definition.isController(...)`, immediately creates a `MultiblockState`, adds it to the manager, and runs `checkMultiblockFormedSync` on the main thread for an instant initial formation check.
2. **Periodic background async snapshot checks (`DynamicMultiblockManager.checkMultiblockFormed`)**:
   For controllers already tracked by the manager (e.g., player placed the controller first and then built the surrounding blocks, or blocks changed via pistons/commands), the manager increments tick counters on the server:
   - Unformed structures are checked every `10` ticks by default, and formed structures every `20` ticks (up to `128` candidates per tick);
   - **Main-thread snapshot + worker-thread lock-free test**: the main thread calls `buildSnapshot` to pack `BlockState`s (and serialized `CompoundTag`s for `BlockEntity`s requiring NBT checks) of loaded chunks into an immutable `MultiblockCheckSnapshot`, then hands it to the `AnvilLib-MultiblockCheck` daemon thread pool to run `snapshot.test()` (`BlockStatePredicate#testOffThread`);
   - Upon completion, it schedules `updateFormed(level, current, formed)` back on the server main thread via `level.getServer().execute(...)`, ensuring thread safety while eliminating main-thread TPS overhead from polling many multiblocks.
3. **Immediate disassembly on block break (`DynamicMultiblockManager.onBreak`)**:
   When a block is broken, if it is the controller itself, it triggers unform (`updateFormed(..., false)`) and removes the record; if it is a component block of a formed multiblock (while the controller remains), it updates the state to `formed = false` while keeping the controller registered so it can auto-reform once repaired.

---

## 2. Full Code Examples

The example below shows both ways to register a multiblock controller: **Approach A (using `SimpleController` + `ControllerRecord.register`, attachable to vanilla or any block)** and **Approach B (having a custom block class implement `IController` directly)**.

```java
package com.example.mymod.multiblock;

import com.example.mymod.MyMod;
import com.example.mymod.data.ModMultiblockDefinitions;
import dev.anvilcraft.lib.v2.multiblock.dynamic.DynamicMultiblockManager;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.ControllerRecord;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.IController;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.SimpleController;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

public final class ModMultiblockControllers {
    private ModMultiblockControllers() {
    }

    /**
     * Approach A: Register a SimpleController via ControllerRecord.register during mod init
     * Advantage: grants multiblock controller behavior to vanilla blocks (e.g., furnace, dispenser), and one block can bind multiple definitionIds
     */
    public static void init() {
        ControllerRecord.register(new SimpleController(
            Blocks.FURNACE,
            ModMultiblockDefinitions.BLAST_KILN.identifier()
        ) {
            @Override
            public void onFormed(Level level, MultiblockState state) {
                BlockPos controllerPos = state.getControllerPos();
                MyMod.LOGGER.info("Blast Kiln formed at {} (client={})", controllerPos, level.isClientSide());
            }

            @Override
            public void onUnformed(Level level, MultiblockState state) {
                BlockPos controllerPos = state.getControllerPos();
                MyMod.LOGGER.info("Blast Kiln unformed at {} (client={})", controllerPos, level.isClientSide());
            }
        });
    }

    /**
     * Approach B: Have a custom controller block implement IController directly
     * When no explicit registration exists, ControllerRecord.get detects block instanceof IController and caches it automatically
     */
    public static class PillarCoreBlock extends Block implements IController {
        public PillarCoreBlock(Properties properties) {
            super(properties);
        }

        @Override
        public Block getBlock() {
            return this;
        }

        @Override
        public Identifier getDefinitionId() {
            return ModMultiblockDefinitions.BEACON_PILLAR.identifier();
        }

        @Override
        public void onFormed(Level level, MultiblockState state) {
            // Called on both sides when formed (on server when check passes, on client when MultiblockFormPacket arrives)
        }

        @Override
        public void onUnformed(Level level, MultiblockState state) {
            // Called on both sides when unformed
        }
    }

    /**
     * Query anywhere whether a controller position is currently formed
     */
    public static boolean isMultiblockActive(Level level, BlockPos controllerPos) {
        MultiblockState state = DynamicMultiblockManager.get(level).getAt(controllerPos);
        return state != null && state.isFormed();
    }
}
```

---

## 3. Public Classes & Interfaces API Reference

### 1. `IController` & `SimpleController` (Controller Interface & Abstract Base)

Located in `dev.anvilcraft.lib.v2.multiblock.dynamic.controller`.

| Method / Constructor Signature | Default Implementation | Description |
| :--- | :--- | :--- |
| `Block getBlock()` | — | Returns the block instance bound to this controller. |
| `Identifier getDefinitionId()` | — | Returns the `MultiblockDefinition` registry ID (`ResourceKey#identifier()`) bound to this controller. |
| `default void onFormed(Level level, MultiblockState state)` | Empty `{}` | Triggered when the multiblock transitions from `unformed` to `formed` (and `DynamicMultiblockEvent.Form` is not canceled). **Note**: fired on both server and client (after `MultiblockFormPacket`); check `!level.isClientSide()` for server-only logic. |
| `default void onUnformed(Level level, MultiblockState state)` | Empty `{}` | Triggered when the multiblock transitions from `formed` to `unformed` (and `DynamicMultiblockEvent.Unform` is not canceled). Fired on both sides. |
| `default BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state)` | `return pos;` | Called in `DynamicMultiblockManager.onPlace` when `state` is placed at `pos` to redirect to the controller position (defaults to `pos` itself). |
| `protected SimpleController(Block block, Identifier definitionId)` | — | Protected constructor of `SimpleController`, automatically implementing `getBlock()` and `getDefinitionId()`. |

### 2. `ControllerRecord` & `ControllerInfo` (Controller Registry)

| Class / Method Signature | Description |
| :--- | :--- |
| `public record ControllerInfo(Block block, Identifier definitionId)` | Composite lookup key consisting of controller `block` and multiblock definition ID `definitionId` (so a single block can correspond to multiple multiblock definitions). |
| `public static void ControllerRecord.register(SimpleController controller)` | Registers a `SimpleController` instance into the global `CONTROLLERS` map. |
| `public static IController ControllerRecord.get(Block block, Identifier definitionId)` | Looks up `IController` by `(block, definitionId)`.<br>If not explicitly registered but `block instanceof IController`, caches and returns it automatically; otherwise throws `IllegalArgumentException("Attempt to get non IController and unregistered block...")`. |

### 3. `DynamicMultiblockManager` (World Multiblock State Manager)

Extends `net.minecraft.world.level.saveddata.SavedData`. Persisted on the server in `data/anvillib_multiblocks.dat` (`SavedDataType` ID `anvillib:multiblocks`), and stored on the client in a `Level`-weak-referenced `CLIENT_SIDE` in-memory map.

| Constant / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `DynamicMultiblockManager.CODEC` / `TYPE` | `Codec` / `SavedDataType` | Server `SavedData` persistence codec and type definition. |
| `public static DynamicMultiblockManager get(Level level)` | `DynamicMultiblockManager` | Gets the manager instance for `level` (loaded/created from `ServerLevel#getDataStorage()` on server, or `WeakHashMap` on client). |
| `public @Nullable MultiblockState getAt(BlockPos pos)` | `@Nullable MultiblockState` | Queries the `MultiblockState` registered at controller `pos`; returns `null` if unregistered. |
| `public void add(MultiblockState state)` | `void` | Registers a `MultiblockState` and calls `setDirty()`. |
| `public @Nullable MultiblockState removeAt(BlockPos pos)` | `@Nullable MultiblockState` | Removes the `MultiblockState` at controller `pos` and marks `setDirty()`. |
| `public boolean containsAt(BlockPos pos)` | `boolean` | Checks whether `pos` is registered as a multiblock controller. |
| `public void updateFormed(Level level, MultiblockState cur, boolean formed)` | `void` | Updates `cur`'s formed state. On state change: validates the controller on the server, posts `DynamicMultiblockEvent.Form` / `Unform` (rolling back `formed` if `setCanceled(true)`), calls `controller.onFormed` / `onUnformed`, and broadcasts `MultiblockFormPacket` / `MultiblockUnformPacket` to all online players in the dimension. |
| `public static void onPlace(ServerLevel level, BlockPos pos, BlockState state)` | `void` | Handler entry for block placement (called automatically by `BlockEventListener`). |
| `public static void onBreak(Level level, BlockPos pos)` | `void` | Handler entry for block breaking (called automatically by `BlockEventListener`). |
| `public static void checkMultiblockFormed(@Nullable ServerLevel level)` | `void` | Periodic async server tick check entry (called automatically by `BlockEventListener`). |
| `public static void shutdownExecutor()` | `void` | Shuts down the background check thread pool and waits up to 5 seconds (called automatically on `ServerStoppedEvent`). |

### 4. `MultiblockState`, `MultiblockPart` & `MultiblockCheckSnapshot`

| Class | Key Constants / Constructors / Method Signatures | Description |
| :--- | :--- | :--- |
| `MultiblockState` | `DEFINITION_KEY_CODEC` / `DEFINITION_KEY_STREAM_CODEC`<br>`CODEC` (`MapCodec<MultiblockState>`)<br>`STREAM_CODEC` (`StreamCodec<RegistryFriendlyByteBuf, MultiblockState>`)<br>`public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey)`<br>`public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey, boolean formed)`<br>`public BlockPos getControllerPos()`<br>`public ResourceKey<MultiblockDefinition> getDefinitionKey()`<br>`public boolean isFormed()` / `setFormed(boolean)`<br>`public MultiblockCheckSnapshot getSnapshot()` / `setSnapshot(...)`<br>`public Holder.Reference<MultiblockDefinition> getDefinition(HolderLookup.Provider registries)` | Represents the state of a single multiblock instance in the world.<br>Note: `STREAM_CODEC` transmits `controllerPos` (`VAR_INT_BLOCK_POS`) and `definitionKey`. |
| `MultiblockPart` | `public record MultiblockPart(MultiblockState state, Vec3i partPos)` | Lightweight record pairing a `MultiblockState` with a component's local offset `partPos`. |
| `MultiblockCheckSnapshot` | `public record MultiblockCheckSnapshot(BlockPos controllerPos, Map<BlockPos, Entry> entries)`<br>`public boolean test()`<br>`public record Entry(@Nullable BlockState blockState, @Nullable CompoundTag entityNbt, BlockStatePredicate predicate)` | Snapshot for lock-free multiblock structure checking on background worker threads. If a component block's chunk is unloaded (`!level.isLoaded(pos)`), reuses the previous snapshot's `Entry`; if never loaded (`blockState == null`), `Entry#test()` defaults to `true` to prevent false disassembly across chunk borders. |
