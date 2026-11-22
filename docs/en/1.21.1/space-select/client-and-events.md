# Client Rendering, Scroll Control, Events & Networking

This page explains `module.space-select`'s client state management, rendering, and mouse-scroll interactions, as well as the server-side event and network payload for custom responses.

## Client Interaction & Rendering Flow

### 1. State Manager (`AnvilLibSpaceSelectClient` & `ClientDistrictManager`)

Under `Dist.CLIENT`, `AnvilLibSpaceSelectClient.MANAGER` maintains a global `ClientDistrictManager` singleton extending `DistrictManager` and tracking two additional temporary states:

- **`selectingMap` (`Map<DistrictKey, BlockPos>`)**: stores the "in-progress start corner" after the player clicks once before confirming the end corner.
- **`tempDistrict` (`District`)**: reuses a single mutable `District` instance, updating live each frame from the active hand's start corner to the targeted block (`Minecraft.hitResult` when `HitResult.Type.BLOCK`).

### 2. Automatic World Rendering (`DistrictRenderer`)

`DistrictRenderer` runs automatically at `RenderLevelStageEvent.Stage.AFTER_PARTICLES`, collecting all completed regions in `AnvilLibSpaceSelectClient.MANAGER.getDistrictMap().values()` plus `getTempDistrict()`, and drawing bounding boxes with `RenderType.lines()`:
- In normal mode, calls `LevelRenderer.renderVoxelShape` with `district.color()` (alpha `102 / 255`).
- When `SharedConstants.DEBUG_SHAPES` is enabled, draws opaque white wireframes (`LevelRenderer.renderLineBox`).

Developers can also call its public method `DistrictRenderer.renderDistrict(bufferSource, poseStack, cameraPos)` from other custom HUD/render hooks.

### 3. Scroll Fine-Tuning (`SpaceSelectScrollHandler`)

When the player holds a valid `SpaceSelectItem`, has no GUI open (`mc.screen == null`), and has already confirmed a `District` for that hand key, the module intercepts these hotkeys and cancels the scroll event (`event.setCanceled(true)`):

| Key Combo | Effect | Internal Call |
| --- | --- | --- |
| **`Ctrl` + Scroll** | Expands/contracts the selection face along the primary look axis | `District.getPrimaryAxis(lookAngle)` -> `district.scaleOnAxis(...)` |
| **`Alt` + Scroll** | Translates the entire selection along the nearest look direction | `Direction.getNearest(lookAngle)` -> `district.move(dir, scrollAmount)` |

::: tip Holding Both `Ctrl` and `Alt`
The source checks `if (ctrlDown)` before `else` for translation; holding both `Ctrl` and `Alt` prioritizes **scaling** and will not translate simultaneously.
:::

## Server Event Listener: `PlayerCreateDistrictEvent`

Beyond implementing `SpaceSelectItem#onCreateDistrict`, any mod can listen independently to `PlayerCreateDistrictEvent` (extending `PlayerEvent`) on the server event bus for region stats, claim conflict checks, or command recording:

```java
package com.example.examplemod.event;

import dev.anvilcraft.lib.v2.space_select.District;
import dev.anvilcraft.lib.v2.space_select.event.PlayerCreateDistrictEvent;
import net.minecraft.world.phys.AABB;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = "examplemod")
public final class DistrictEventsListener {
    @SubscribeEvent
    public static void onDistrictCreated(PlayerCreateDistrictEvent event) {
        // event.getStart() / event.getEnd() are the raw clicked corners; normalize with District.create if needed
        District normalized = District.create(event.getStart(), event.getEnd());
        AABB areaBox = AABB.encapsulatingFullBlocks(normalized.start(), normalized.end());
        long blockVolume = (long) areaBox.getXsize() * (long) areaBox.getYsize() * (long) areaBox.getZsize();
        System.out.println(
            event.getEntity().getName().getString() + " created a selection of volume " + blockVolume + " blocks, holding: " + event.getItemStack()
        );
    }
}
```

## Public & Internal API Reference

### `dev.anvilcraft.lib.v2.space_select.client`

| Class / Member Signature | Description |
| --- | --- |
| `AnvilLibSpaceSelectClient.MANAGER` | `public static final ClientDistrictManager`: global client selection manager singleton |
| `boolean ClientDistrictManager.isSelecting(DistrictKey key)` | Checks whether the given hand key has a start corner recorded and is awaiting the second click |
| `void ClientDistrictManager.startSelect(DistrictKey key, BlockPos blockPos)` | Records the start corner and enters in-progress selection mode |
| `void ClientDistrictManager.endSelect(DistrictKey key, BlockPos blockPos)` | Finishes selection: saves the normalized `District` and immediately sends `SpaceSelectPayload` to the server |
| `void ClientDistrictManager.clear(DistrictKey key)` | Clears both the confirmed selection and any in-progress start corner |
| `@Nullable District ClientDistrictManager.getTempDistrict()` | Returns the live-updating temporary `District` if holding a `SpaceSelectItem` while selecting and looking at a block |
| `Map<DistrictKey, BlockPos> ClientDistrictManager.getSelectingMap()` | Returns the map of all in-progress selection start corners (Lombok `@Getter`) |
| `@ApiStatus.Internal DistrictRenderer` | `static void renderDistrict(MultiBufferSource.BufferSource, PoseStack, Vec3 cameraPos)`; auto-draws all selections and `tempDistrict` at `AFTER_PARTICLES` |
| `@ApiStatus.Internal SpaceSelectScrollHandler` | Listens to `InputEvent.MouseScrollingEvent`, providing `Ctrl`-scroll scaling and `Alt`-scroll moving |

### `dev.anvilcraft.lib.v2.space_select.event` & `network`

| Class / Member Signature | Description |
| --- | --- |
| `PlayerCreateDistrictEvent` | Extends `PlayerEvent` (Lombok `@Getter`); constructor `(Player player, ItemStack itemStack, BlockPos start, BlockPos end)` with `getEntity()`, `getItemStack()`, `getStart()`, `getEnd()` |
| `@ApiStatus.Internal PlayerCreateDistrictEventHandler` | Auto-listens to `PlayerCreateDistrictEvent` and invokes `onCreateDistrict(...)` if the held item is a `SpaceSelectItem` |
| `@ApiStatus.Internal AnvilLibSpaceSelectNetwork` | Auto-registers module payloads at protocol version `"1"` via `NetworkRegistrar` |
| `@ApiStatus.Internal SpaceSelectPayload` | `IServerboundPacket` (`record SpaceSelectPayload(boolean offhand, BlockPos start, BlockPos end)`, ID `anvillib_space_select:space_select`); posts `PlayerCreateDistrictEvent` on server receipt |
