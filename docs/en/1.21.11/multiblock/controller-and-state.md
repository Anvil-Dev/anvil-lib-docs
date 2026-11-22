# Controller, World State & Async Check Manager (`controller` / `dynamic`)

<BranchContextCard branch="1.21.11" />

After defining a multiblock's `MultiblockDefinition` datapack, how do you bind a controller block in code and run business logic when the structure forms or unforms? This page covers `IController`, `SimpleController`, `ControllerRecord`, `MultiblockState`, and `DynamicMultiblockManager`.

---

## 1. Two Ways to Integrate a Controller (`IController` vs `SimpleController`)

`module.multiblock` supports two ways to associate a block with a multiblock definition:

1. **Approach A: Use `SimpleController` + `ControllerRecord.register` (Recommended; supports vanilla blocks or binding one block to multiple multiblocks)**:
   No need to modify the block class itself—construct `new SimpleController(block, definitionId, onFormed, onUnformed)` and call `ControllerRecord.register(controller)`. You can even turn vanilla `Blocks.ANVIL` or `Blocks.BLAST_FURNACE` into multiblock controllers!
2. **Approach B: Have your custom `Block` class implement `IController` directly**:
   When `ControllerRecord.get(block, definitionId)` finds no explicit `SimpleController` registration, if `block instanceof IController`, it automatically caches that `block` as the controller and invokes its `onFormed` / `onUnformed` methods.

---

## 2. Full Code Example: Registering a Controller & Querying Multiblock Formation State

```java
package com.example.mymod.multiblock;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.multiblock.dynamic.DynamicMultiblockManager;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.ControllerRecord;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.SimpleController;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class ModMultiblockControllers {
    public static final Identifier BLAST_FURNACE_ID =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "blast_furnace");

    private ModMultiblockControllers() {
    }

    @SubscribeEvent
    public static void onCommonSetup(FMLCommonSetupEvent event) {
        event.enqueueWork(() -> {
            // Register blast furnace controller: light up controller when 3x3x3 forms, extinguish when unformed
            ControllerRecord.register(new SimpleController(
                ModBlocks.BLAST_CONTROLLER.get(),
                BLAST_FURNACE_ID,
                (level, state) -> {
                    BlockPos pos = state.getControllerPos();
                    BlockState blockState = level.getBlockState(pos);
                    if (blockState.hasProperty(BlockStateProperties.LIT)) {
                        level.setBlockAndUpdate(pos, blockState.setValue(BlockStateProperties.LIT, true));
                    }
                },
                (level, state) -> {
                    BlockPos pos = state.getControllerPos();
                    BlockState blockState = level.getBlockState(pos);
                    if (blockState.hasProperty(BlockStateProperties.LIT)) {
                        level.setBlockAndUpdate(pos, blockState.setValue(BlockStateProperties.LIT, false));
                    }
                }
            ));
        });
    }

    /**
     * Query whether a multiblock at the given controller pos is formed inside a BlockEntity tick or interaction (works on server & client)
     */
    public static boolean isBlastFurnaceFormed(Level level, BlockPos controllerPos) {
        MultiblockState state = DynamicMultiblockManager.get(level).getAt(controllerPos);
        return state != null && state.isFormed();
    }
}
```

---

## 3. Controller Package API Reference (`dev.anvilcraft.lib.v2.multiblock.dynamic.controller`)

### 1. `IController` Interface

| Method Signature | Default | Description |
| :--- | :--- | :--- |
| `default void onFormed(Level level, MultiblockState state)` | Empty | Called on the server main thread when the multiblock transitions from unformed to formed and `DynamicMultiblockEvent.Form` is not canceled. |
| `default void onUnformed(Level level, MultiblockState state)` | Empty | Called on the server main thread when the multiblock transitions from formed to unformed and `DynamicMultiblockEvent.Unform` is not canceled. |
| `default BlockPos correctPos(Level level, BlockPos pos, BlockState state)` | Returns `pos` | When a player places a block triggering `DynamicMultiblockManager.onPlace`, allows redirecting the placement position to the actual controller coordinate (e.g., lower half of a 2-block-tall block). |

### 2. `SimpleController`, `ControllerRecord` & `ControllerInfo`

| Class | Constructors / Method Signatures | Description |
| :--- | :--- | :--- |
| **`SimpleController`** | • `public SimpleController(Block block, Identifier definitionId, BiConsumer<Level, MultiblockState> onFormed, BiConsumer<Level, MultiblockState> onUnformed)`<br>• `public SimpleController(Block block, Identifier definitionId, BiConsumer<Level, MultiblockState> onFormed, BiConsumer<Level, MultiblockState> onUnformed, Function3<Level, BlockPos, BlockState, BlockPos> positionCorrector)`<br>• `getBlock()` / `getDefinitionId()` | General functional implementation of `IController`. |
| **`ControllerRecord`** | • `public static void register(SimpleController controller)`<br>• `public static IController get(Block block, Identifier definitionId)` | Global controller registry. Calling `get` throws `IllegalArgumentException` if unregistered and `block` does not implement `IController`. |
| **`ControllerInfo`** | `public record ControllerInfo(Block block, Identifier definitionId)` | Composite lookup key for `ControllerRecord`. |

---

## 4. State & Manager API Reference (`dev.anvilcraft.lib.v2.multiblock.dynamic`)

### 1. `MultiblockState` (Runtime State of a Single Multiblock Instance)

| Constant / Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final Codec<ResourceKey<MultiblockDefinition>> DEFINITION_KEY_CODEC` | `Codec` | Persistent codec for `MultiblockDefinition` registry keys. |
| `public static final StreamCodec<ByteBuf, ResourceKey<MultiblockDefinition>> DEFINITION_KEY_STREAM_CODEC` | `StreamCodec` | Network stream codec for `MultiblockDefinition` registry keys. |
| `public static final MapCodec<MultiblockState> CODEC` | `MapCodec` | Used for 1.21.11 `SavedData` persistence, encoding `controller_pos`, `definition`, and optional `formed` (default `false`). |
| `public static final StreamCodec<RegistryFriendlyByteBuf, MultiblockState> STREAM_CODEC` | `StreamCodec` | Network stream codec (encodes `VAR_INT_BLOCK_POS` and `DEFINITION_KEY_STREAM_CODEC`). |
| `public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey)`<br>`public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey, boolean formed)` | `MultiblockState` | Constructs a multiblock state (2-arg constructor initializes `formed = false`). |
| `public BlockPos getControllerPos()` | `BlockPos` | Returns the controller block's world position. |
| `public ResourceKey<MultiblockDefinition> getDefinitionKey()` | `ResourceKey<MultiblockDefinition>` | Returns the bound multiblock definition registry key. |
| `public Holder.Reference<MultiblockDefinition> getDefinition(HolderLookup.Provider registries)` | `Holder.Reference` | Resolves and caches `Holder.Reference<MultiblockDefinition>` from the level's `registryAccess()`. |
| `public boolean isFormed()` / `public void setFormed(boolean formed)` | `boolean` / `void` | Gets or sets whether currently formed. |
| `public MultiblockCheckSnapshot getSnapshot()` / `public void setSnapshot(MultiblockCheckSnapshot snapshot)` | Corresponding type | Gets or updates the latest structure check snapshot. |

---

### 2. `DynamicMultiblockManager` (World Multiblock `SavedDataType` & Check Manager)

Extends `net.minecraft.world.level.saveddata.SavedData`. Persisted on 1.21.11 servers via `SavedDataType<DynamicMultiblockManager>` (name `"anvillib_multiblocks"` + `CODEC`) in dimension `DataStorage`, and stored on clients in a `Level`-weak-referenced in-memory cache.

| Constant / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final Codec<DynamicMultiblockManager> CODEC`<br>`public static final SavedDataType<DynamicMultiblockManager> TYPE` | `Codec` / `SavedDataType` | 1.21.11 `SavedData` serialization definition and storage descriptor. |
| `public static DynamicMultiblockManager get(Level level)` | `DynamicMultiblockManager` | Gets the multiblock manager for the given dimension (`computeIfAbsent(TYPE)` on server, cache lookup on client). |
| `public @Nullable MultiblockState getAt(BlockPos pos)` | `@Nullable MultiblockState` | Queries the `MultiblockState` at controller `pos`. |
| `public boolean containsAt(BlockPos pos)` | `boolean` | Checks whether `pos` is registered as a multiblock controller. |
| `public void add(MultiblockState state)` | `void` | Registers a multiblock state and calls `setDirty()`. |
| `public @Nullable MultiblockState removeAt(BlockPos pos)` | `@Nullable MultiblockState` | Removes the multiblock state at controller `pos`. |
| `public void updateFormed(Level level, MultiblockState cur, boolean formed)` | `void` | On formation state change: posts cancellable `DynamicMultiblockEvent.Form` / `Unform` → invokes `controller.onFormed` / `onUnformed` → broadcasts `MultiblockFormPacket` / `MultiblockUnformPacket` to all players in the dimension. |
| `public static void onPlace(ServerLevel level, BlockPos pos, BlockState state)` | `void` | Called automatically by `BlockEventListener` on block placement: if a controller block is placed, registers `MultiblockState` and runs an immediate synchronous formation check. |
| `public static void onBreak(Level level, BlockPos pos)` | `void` | Called automatically by `BlockEventListener` on block break: if the controller is broken, unforms and removes the record; if a component of a formed multiblock is broken, immediately marks it `unformed`. |
| `public static void checkMultiblockFormed(@Nullable ServerLevel level)` | `void` | Called every server tick: builds `MultiblockCheckSnapshot`s per configured interval and per-tick cap and submits them to the background thread pool. |
| `public static void shutdownExecutor()` | `void` | Shuts down the background async check thread pool on server stop. |

---

### 3. `MultiblockCheckSnapshot` & `MultiblockPart`

| Class | Signatures & Description |
| :--- | :--- |
| `MultiblockCheckSnapshot` | `public record MultiblockCheckSnapshot(BlockPos controllerPos, Map<BlockPos, Entry> entries)`<br>• Inner `record Entry(@Nullable BlockState state, @Nullable CompoundTag entityNbt, BlockStatePredicate predicate)`;<br>• `public boolean test()`: safely executes `predicate.testOffThread(state, entityNbt)` for all positions on background worker threads (without accessing `Level`). |
| `MultiblockPart` | `public abstract class MultiblockPart extends BlockEntity`<br>Optional multiblock part block entity base class providing `getControllerPos()` / `setControllerPos(@Nullable BlockPos)`. |
