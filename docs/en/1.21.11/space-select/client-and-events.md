# Client Rendering, Scroll Control, Events & Networking

The client side of `module.space-select` automatically handles selection outline rendering, Ctrl/Alt scroll fine-tuning, and selection creation network sync; on the server, mod developers only need to listen to `PlayerCreateDistrictEvent` to receive confirmed selection coordinates.

## Client Management & Live Preview: `ClientDistrictManager`

Access the global singleton via `AnvilLibSpaceSelectClient.MANAGER`. `ClientDistrictManager` extends `DistrictManager` and tracks in-progress corner selection:

| Method | Description |
| --- | --- |
| `isSelecting(DistrictKey key)` | Checks whether the selector in this hand has a start corner set and is waiting for the end corner |
| `startSelect(DistrictKey key, BlockPos blockPos)` | Records the first corner coordinate and enters dynamic drag preview mode |
| `endSelect(DistrictKey key, BlockPos blockPos)` | Confirms the second corner, builds the full `District`, and sends `SpaceSelectPayload` to the server via `ClientPacketDistributor.sendToServer(...)` |
| `clear(DistrictKey key)` | Clears any existing selection and resets selection state |
| `getTempDistrict()` | Returns the temporary preview `District` currently being selected (or `null` if none) |

## Client Visuals & Scroll Fine-Tuning

- **`DistrictRenderer`**: Listens to `RenderLevelStageEvent.AfterParticles`, extracts existing selections and temporary preview selections for mainhand/offhand, builds `BlockOutlineRenderState`, and grabs the line buffer from `RenderTypes.lines()`; draws sub-shapes with debug colors if `SharedConstants.DEBUG_SHAPES` is enabled, otherwise calls `ShapeRenderer.renderShape(poseStack, buffer, state.shape(), dx, dy, dz, color, width)` (line width from `Minecraft.getInstance().getWindow().getAppropriateLineWidth()`) and flushes with `bufferSource.endLastBatch()`.
- **`SpaceSelectScrollHandler`**: Listens to `InputEvent.MouseScrollingEvent`:
  - When holding a `SpaceSelectItem` and scrolling with Ctrl / Alt (`Minecraft#hasControlDown()` / `Minecraft#hasAltDown()`), computes `scaleOnAxis(...)` / `move(...)` via `Direction.getApproximateNearest(lookAngle)` or primary axis to resize/translate the selection live and cancels vanilla hotbar slot scrolling.

## Network Protocol & Server Events

### `SpaceSelectPayload` & `AnvilLibSpaceSelectNetwork`

- Channel name: `anvillib_space_select:space_select` (version `"1"`);
- Payload fields: `BlockPos start` and `BlockPos end` (encoded via `StreamCodec.composite`);
- `handleOnServer(Player player)` validates placement on the server and posts `PlayerCreateDistrictEvent` on the NeoForge event bus.

### Full Example: Listening to `PlayerCreateDistrictEvent`

After the client confirms a selection via `endSelect(...)` and sends the packet to the server, server-side mods can listen to this event to build, clear, or bind data:

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.space_select.event.PlayerCreateDistrictEvent;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public class DistrictEventListener {
    @SubscribeEvent
    public static void onDistrictCreated(PlayerCreateDistrictEvent event) {
        Player player = event.getEntity();
        BlockPos start = event.getStart();
        BlockPos end = event.getEnd();

        if (!player.level().isClientSide()) {
            player.displayClientMessage(
                Component.literal("Selected region from " + start.toShortString() + " to " + end.toShortString()),
                true
            );
        }
    }
}
```
