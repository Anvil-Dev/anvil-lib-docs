# Client Rendering, Scroll Fine-Tuning & Server Event Sync (`client` / `event` / `network`)

<BranchContextCard branch="26.3" />

This page covers `module.space-select`'s client state manager `ClientDistrictManager`, automatic world wireframe renderer `DistrictRenderer`, hotkey scroll fine-tuning handler `SpaceSelectScrollHandler`, and server-side region creation event `PlayerCreateDistrictEvent`.

---

## 1. Client Scroll Hotkey Interaction (`SpaceSelectScrollHandler`)

When the player already has a completed selection on the client (an entry in `ClientDistrictManager#getDistrictMap()` for mainhand or offhand) and no GUI screen is open (`mc.gui.screen() == null`), `SpaceSelectScrollHandler` listens to `InputEvent.MouseScrollingEvent`:

| Key Combo | Effect |
| :--- | :--- |
| **`Ctrl + Mouse Scroll`** | Resizes the selection along the primary axis of the player's look vector (`District.getPrimaryAxis(lookAngle)`) via `district.scaleOnAxis(...)` (and cancels vanilla hotbar scroll switching via `event.setCanceled(true)`). |
| **`Alt + Mouse Scroll`** | Translates the entire selection along the direction nearest the player's look vector (`Direction.getApproximateNearest(lookAngle)`) via `district.move(dir, scrollAmount)` (canceling hotbar scroll switching). |

---

## 2. Full Code Example: Listening to `PlayerCreateDistrictEvent` or Reading Active Selection on Client

In addition to handling selections in `SpaceSelectItem#onCreateDistrict`, you can listen to `PlayerCreateDistrictEvent` on `NeoForge.EVENT_BUS`, or query the player's current `District` directly from `AnvilLibSpaceSelectClient.MANAGER` on the client:

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.space_select.District;
import dev.anvilcraft.lib.v2.space_select.DistrictManager;
import dev.anvilcraft.lib.v2.space_select.client.AnvilLibSpaceSelectClient;
import dev.anvilcraft.lib.v2.space_select.event.PlayerCreateDistrictEvent;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import org.jspecify.annotations.Nullable;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class DistrictEventExample {
    private DistrictEventExample() {
    }

    /**
     * Listen on the server for any player creating a selection via SpaceSelectItem
     */
    @SubscribeEvent
    public static void onPlayerCreateDistrict(PlayerCreateDistrictEvent event) {
        BlockPos start = event.getStart();
        BlockPos end = event.getEnd();
        MyMod.LOGGER.info(
            "Player {} created selection using {}: {} -> {}",
            event.getEntity().getScoreboardName(),
            event.getItemStack(),
            start,
            end
        );
    }

    /**
     * Query the local player's current mainhand District on the client (including latest Ctrl/Alt+scroll adjustments)
     */
    public static @Nullable District getClientMainHandDistrict() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return null;
        DistrictManager.DistrictKey key = new DistrictManager.DistrictKey(
            player.getInventory().getSelectedSlot(),
            false,
            player.getMainHandItem().getItem()
        );
        return AnvilLibSpaceSelectClient.MANAGER.getDistrictMap().get(key);
    }
}
```

---

## 3. Public Classes & Events API Reference

### 1. `AnvilLibSpaceSelectClient` & `ClientDistrictManager`

Located in `dev.anvilcraft.lib.v2.space_select.client`. Access the global client selection manager via `AnvilLibSpaceSelectClient.MANAGER` (extends `DistrictManager`):

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public boolean isSelecting(DistrictKey districtKey)` | `boolean` | Checks whether the given hand slot key is currently in "first corner picked, waiting for second corner" state. |
| `public void startSelect(DistrictKey districtKey, BlockPos blockPos)` | `void` | Records the selection start position `blockPos` in `selectingMap`. |
| `public void endSelect(DistrictKey districtKey, BlockPos blockPos)` | `void` | Pops the start position from `selectingMap`, constructs a `District` with `blockPos`, stores it in `districtMap`, and sends `SpaceSelectPayload` to the server. |
| `public void clear(DistrictKey districtKey)` | `void` | Clears records for the given slot key from both `districtMap` and `selectingMap`. |
| `public @Nullable District getTempDistrict()` | `@Nullable District` | When the player holds a `SpaceSelectItem`, is in `isSelecting` state, and is looking at a block (`HitResult.Type.BLOCK`), returns the live preview `tempDistrict` from start position to targeted block. |
| `public Map<DistrictKey, BlockPos> getSelectingMap()` | `Map<DistrictKey, BlockPos>` | Returns the map of in-progress selection start positions. |

### 2. `DistrictRenderer` (Client Selection Wireframe Renderer, `@ApiStatus.Internal`)

| Method Signature | Description |
| :--- | :--- |
| `extractDistricts(ExtractLevelRenderStateEvent event)` | Collects all completed `District`s and the active `tempDistrict` during level render-state extraction, storing them as a `DistrictOutline` list in `LevelRenderState` (via `OUTLINES` `ContextKey`). |
| `submitDistricts(SubmitCustomGeometryEvent event)` / `renderDistrict(SubmitNodeCollector collector, PoseStack poses, LevelRenderState state)` | Listens to `SubmitCustomGeometryEvent`, reads extracted outlines, and renders each `District` bounding box via `collector.submitShapeOutline(...)` and `RenderTypes.lines()`. |

### 3. `PlayerCreateDistrictEvent` & `SpaceSelectPayload`

| Class | Field / Method Signatures | Description |
| :--- | :--- | :--- |
| **`PlayerCreateDistrictEvent`** | • `public Player getEntity()` (inherited from `PlayerEvent`)<br>• `public ItemStack getItemStack()`<br>• `public BlockPos getStart()`<br>• `public BlockPos getEnd()` | Posted on `NeoForge.EVENT_BUS`. Fired when the server receives `SpaceSelectPayload` from a client; built-in `PlayerCreateDistrictEventHandler` listens to it and calls `item.onCreateDistrict(player, itemStack, start, end)` if `itemStack.getItem() instanceof SpaceSelectItem`. |
| `SpaceSelectPayload` | `public record SpaceSelectPayload(boolean offhand, BlockPos start, BlockPos end) implements IServerboundPacket` | (`@ApiStatus.Internal`) Client-to-server one-way packet reporting the completed selection (channel ID `anvillib_space_select:space_select`). |
