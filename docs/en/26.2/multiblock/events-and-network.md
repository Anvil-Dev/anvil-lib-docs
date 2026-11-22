# Multiblock Events & Network Sync Packets (`DynamicMultiblockEvent` / `network`)

<BranchContextCard branch="26.2" />

In addition to handling multiblock logic via `IController#onFormed` and `onUnformed`, other mods or subsystems can listen to or even cancel any dynamic multiblock's formation and disassembly via the NeoForge event bus. This page covers `DynamicMultiblockEvent`, the built-in `BlockEventListener`, and the server-to-client sync packets.

---

## 1. `DynamicMultiblockEvent` Deep Dive & Usage

### 1. Event Timing & Cancellation Semantics

`DynamicMultiblockEvent` is posted on **`NeoForge.EVENT_BUS`** (the global game event bus) and has two cancellable (`ICancellableEvent`) subclasses:

- **`DynamicMultiblockEvent.Form`**:
  - **Timing**: Fired **before** switching state to `formed = true` and calling `controller.onFormed(level, state)` once all block predicates pass;
  - **Both sides**: Fired on the server in `DynamicMultiblockManager#updateFormed`, and on the client upon receiving `MultiblockFormPacket`;
  - **Cancellation (`event.setCanceled(true)`)**: Prevents formation, resets `formed = false`, skips `controller.onFormed`, and suppresses `MultiblockFormPacket`.
- **`DynamicMultiblockEvent.Unform`**:
  - **Timing**: Fired **before** switching state to `formed = false` and calling `controller.onUnformed(level, state)` when a formed multiblock is broken or fails periodic re-check;
  - **Both sides**: Fired on the server in `DynamicMultiblockManager#updateFormed`, and on the client upon receiving `MultiblockUnformPacket`;
  - **Cancellation (`event.setCanceled(true)`)**: Prevents disassembly, keeps `formed = true`, skips `controller.onUnformed`, and suppresses `MultiblockUnformPacket`.

### 2. Full Code Example: Listening & Conditionally Blocking Formation

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import com.example.mymod.data.ModMultiblockDefinitions;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.event.DynamicMultiblockEvent;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class MultiblockProtectionHandler {
    private MultiblockProtectionHandler() {
    }

    @SubscribeEvent
    public static void onMultiblockForm(DynamicMultiblockEvent.Form event) {
        Level level = event.getLevel();
        MultiblockState state = event.getState();

        // Perform extra environment checks only for a specific multiblock definition
        if (state.getDefinitionKey().equals(ModMultiblockDefinitions.BLAST_KILN)) {
            BlockPos pos = state.getControllerPos();
            // e.g., forbid forming in the Nether
            if (level.dimension() == Level.NETHER) {
                event.setCanceled(true);
            }
        }
    }

    @SubscribeEvent
    public static void onMultiblockUnform(DynamicMultiblockEvent.Unform event) {
        Level level = event.getLevel();
        if (!level.isClientSide()) {
            MyMod.LOGGER.debug(
                "Multiblock {} unformed at {}",
                event.getController().getDefinitionId(),
                event.getState().getControllerPos()
            );
        }
    }
}
```

### 3. `DynamicMultiblockEvent` API Signatures

| Class / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public abstract class DynamicMultiblockEvent extends Event` | — | Abstract base class for dynamic multiblock events. |
| `public Level getLevel()` | `Level` | Returns the level containing the multiblock (`ServerLevel` or `ClientLevel`). |
| `public IController getController()` | `IController` | Returns the controller instance for this multiblock. |
| `public MultiblockState getState()` | `MultiblockState` | Returns the current multiblock state (exposes `getControllerPos()` and `getDefinitionKey()`). |
| `public static class Form extends DynamicMultiblockEvent implements ICancellableEvent` | — | Multiblock formation attempt event (cancellable). |
| `public static class Unform extends DynamicMultiblockEvent implements ICancellableEvent` | — | Multiblock disassembly attempt event (cancellable). |

---

## 2. Built-in Listeners & Sync Packets (`@ApiStatus.Internal`)

The following classes are automatically registered and driven by `module.multiblock`; downstream mods do not need to call them:

### 1. `BlockEventListener` (`dev.anvilcraft.lib.v2.multiblock.event.BlockEventListener`)

| Event & Method Signature | Behavior |
| :--- | :--- |
| `onPlace(BlockEvent.EntityPlaceEvent event)` | Calls `DynamicMultiblockManager.onPlace(level, event.getPos(), event.getState())` when a block is placed on the server. |
| `onBreak(BreakBlockEvent event)` | Calls `DynamicMultiblockManager.onBreak(level, event.getPos())` when a block is broken in the world. |
| `onServerTick(LevelTickEvent.Post event)` | Calls `DynamicMultiblockManager.checkMultiblockFormed(serverLevel)` at the end of each server dimension tick for periodic async snapshot checks. |
| `onServerStopped(ServerStoppedEvent event)` | Calls `DynamicMultiblockManager.shutdownExecutor()` on server stop to shut down the background check thread pool. |

### 2. `MultiblockFormPacket` & `MultiblockUnformPacket` (`dev.anvilcraft.lib.v2.multiblock.network`)

Both packets reside in a `@Network`-annotated package (`PacketProtocol.PLAY`), auto-registered in `AnvilLibMultiblock.onNetwork` via `NetworkRegistrar.register(registrar, AnvilLibMultiblock.MOD_ID)`:

| Class | Payload ID | Direction & Client Behavior (`handleOnClient`) |
| :--- | :--- | :--- |
| `MultiblockFormPacket(MultiblockState state)` | `anvillib:multiblock_form` | `IClientboundPacket` (Server → Client). Adds `state` to the client `DynamicMultiblockManager`, marks `formed = true`, validates the controller, and fires `DynamicMultiblockEvent.Form` and `controller.onFormed(level, state)` on the client. |
| `MultiblockUnformPacket(MultiblockState state)` | `anvillib:multiblock_unform` | `IClientboundPacket` (Server → Client). Marks `state` in the client manager as `formed = false`, validates the controller, and fires `DynamicMultiblockEvent.Unform` and `controller.onUnformed(level, state)` on the client. |
