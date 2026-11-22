# Multiblock Lifecycle Events & Network Sync (`event` / `network`)

<BranchContextCard branch="1.21.8" />

When a multiblock forms or unforms on the server, in addition to invoking `IController#onFormed` / `onUnformed`, `DynamicMultiblockManager` posts **cancellable (`ICancellableEvent`)** lifecycle events on `NeoForge.EVENT_BUS` and automatically syncs state changes to clients.

---

## 1. Full Code Example: Listening & Conditionally Blocking Multiblock Formation

For instance, to require a multiblock altar to only form under specific environmental conditions, listen to **`DynamicMultiblockEvent.Form`** and call `event.setCanceled(true)` to block formation:

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import com.example.mymod.multiblock.ModMultiblockControllers;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.event.DynamicMultiblockEvent;
import net.minecraft.world.level.Level;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class MultiblockEventHandlers {
    private MultiblockEventHandlers() {
    }

    @SubscribeEvent
    public static void onMultiblockForm(DynamicMultiblockEvent.Form event) {
        Level level = event.getLevel();
        MultiblockState state = event.getState();

        // Check if this is the blast furnace multiblock definition we care about
        if (state.getDefinitionKey().location().equals(ModMultiblockControllers.BLAST_FURNACE_ID)) {
            // Example: block formation if the block above the controller is submerged in water
            if (level.isWaterAt(state.getControllerPos().above())) {
                event.setCanceled(true);
            }
        }
    }

    @SubscribeEvent
    public static void onMultiblockUnform(DynamicMultiblockEvent.Unform event) {
        MultiblockState state = event.getState();
        MyMod.LOGGER.info(
            "Multiblock {} unformed at {}",
            state.getDefinitionKey().location(),
            state.getControllerPos()
        );
    }
}
```

---

## 2. Multiblock Event API Reference (`dev.anvilcraft.lib.v2.multiblock.dynamic.event`)

All `DynamicMultiblockEvent`s extend NeoForge's `LevelEvent` and are posted on **`NeoForge.EVENT_BUS`** (the game event bus).

| Event Class | Cancellable (`ICancellableEvent`) | Timing & Cancellation Effect | Public Getters |
| :--- | :---: | :--- | :--- |
| **`DynamicMultiblockEvent`** | — | Abstract base class. | • `public Level getLevel()`<br>• `public IController getController()`<br>• `public MultiblockState getState()` |
| **`DynamicMultiblockEvent.Form`** | **Yes** | Fired on the server after checks pass and right before `controller.onFormed(level, state)` is invoked.<br>**Cancellation effect**: resets `state.setFormed(false)`, skips `controller.onFormed`, and suppresses `MultiblockFormPacket`. | Same as above |
| **`DynamicMultiblockEvent.Unform`** | **Yes** | Fired on the server after block breaking or periodic re-check failure and right before `controller.onUnformed(level, state)` is invoked.<br>**Cancellation effect**: keeps `state.setFormed(true)`, skips `controller.onUnformed`, and suppresses `MultiblockUnformPacket`. | Same as above |

---

## 3. Built-in World Event Listeners & Sync Packets (`@ApiStatus.Internal`)

### 1. `BlockEventListener` (`dev.anvilcraft.lib.v2.multiblock.event.BlockEventListener`)

The framework automatically registers the following world listeners via `@EventBusSubscriber(modid = AnvilLibMultiblock.MOD_ID)`—downstream mods do not need to bind them:

| Event | Internal Behavior |
| :--- | :--- |
| `BlockEvent.EntityPlaceEvent` | Calls `DynamicMultiblockManager.onPlace(serverLevel, pos, placedBlock)` when a block is placed in `ServerLevel`. |
| `BlockEvent.BreakEvent` | Calls `DynamicMultiblockManager.onBreak(serverLevel, pos)` when a block is broken in `ServerLevel`. |
| `LevelTickEvent.Post` | Calls `DynamicMultiblockManager.checkMultiblockFormed(serverLevel)` at the end of each server level tick to drive async formation/disassembly checks. |
| `ServerStoppedEvent` | Calls `DynamicMultiblockManager.shutdownExecutor()` on server stop to safely shut down the async check thread pool. |

### 2. Client Sync Packets (`dev.anvilcraft.lib.v2.multiblock.network`)

Both packets are `@ApiStatus.Internal` and implement `IClientboundPacket`, auto-registered by `AnvilLibMultiblock` via `@Network`:

| Packet Record | Channel ID (`CustomPacketPayload.Type`) | Client Handling (`handleOnClient`) |
| :--- | :--- | :--- |
| **`MultiblockFormPacket(MultiblockState state)`** | `anvillib:multiblock_form` | Stores `state` in client `DynamicMultiblockManager.get(level)` and calls `updateFormed(level, state, true)`. |
| **`MultiblockUnformPacket(MultiblockState state)`** | `anvillib:multiblock_unform` | If the client controller position has been broken to air, removes it from the client manager via `removeAt(pos)`; otherwise sets `updateFormed(level, state, false)`. |
