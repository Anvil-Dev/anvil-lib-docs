# District Model, Selector Item & Manager

`module.space-select` provides complete infrastructure for in-game 3D cuboid region selection, covering the selection data structure (`District`), held-item marker interface (`SpaceSelectItem`), and slot-isolated manager (`DistrictManager`).

## Module Info

- Mod ID: `anvillib_space_select` (`AnvilLibSpaceSelect.MOD_ID`)
- Resource namespace: `AnvilLibSpaceSelect.MOD_ID`

## Core Components Overview

| Type / Member | Responsibility |
| --- | --- |
| `SpaceSelectItem` | Marker interface making an item a valid space selector; provides default `select(Player, BlockPos)` / `cancel(Player)` implementations, checked by both server validation and client scroll fine-tuning |
| `District` | Selection record model holding opposite corners `start` / `end` and metadata, encapsulating expand, contract, move, `scaleOnAxis`, and `VoxelShape` construction |
| `DistrictManager` | Maps multiple selections by `(slot, offhand, item)` key (`DistrictKey`), allowing one player's hotbar to hold multiple independent selector tools |
| `PlayerCreateDistrictEvent` | NeoForge player event fired when a selection is submitted from the client and validated on the server |

## `District` Data & Spatial Transform API

`District` is a 3D adjustable coordinate bounding box record:

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `District.create(BlockPos start, BlockPos end)` | `District` | Initializes a new selection from any two opposite corners |
| `expand(Direction direction, int size)` | `void` | Expands or contracts the boundary face in `direction` |
| `contraction(Direction direction, int size)` | `void` | Contracts inward from `direction` by `size` blocks |
| `move(Direction direction, int step)` | `void` | Translates the entire bounding box by `step` blocks along `direction` without changing size |
| `contains(double x, double y, double z)` | `boolean` | Checks whether world floating-point coordinates fall inside this discrete block region |
| `District.getPrimaryAxis(Vec3 lookAngle)` | `Direction.Axis` | Extracts the primary axis with the largest absolute component in the look vector (for single-axis scroll resizing) |
| `scaleOnAxis(Direction.Axis axis, int scrollAmount, Vec3 playerPos, AABB boundingBox, Vec3 lookAngle)` | `void` | Decides whether to push/pull the positive or negative boundary face based on player position relative to the selection and scroll direction |
| `shape()` | `VoxelShape` | Converts the integer bounding box to `Shapes.box(...)` for wireframe rendering or collision checks |
| `color()` | `int` | Returns a translucent deterministic highlight color from the selection's hash via `ARGB.colorFromFloat(...)` |

## `DistrictManager` & `DistrictKey`

To prevent multiple selector tools in different inventory slots from overwriting each other, `DistrictManager` isolates state by `DistrictKey(int slot, boolean offhand, Item item)` (mainhand uses `player.getInventory().getSelectedSlot()`):

| Method | Description |
| --- | --- |
| `select(DistrictKey key, District district)` | Writes or updates the selection bound to that slot's item |
| `clear(DistrictKey key)` | Removes the selection bound to that slot |
| `DistrictKey#check(@Nullable Player player)` | Verifies the player still holds the same `SpaceSelectItem` in that slot |

## Full Example: Implementing a Custom Region Selection Tool

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.space_select.DistrictManager;
import dev.anvilcraft.lib.v2.space_select.SpaceSelectItem;
import dev.anvilcraft.lib.v2.space_select.client.AnvilLibSpaceSelectClient;
import dev.anvilcraft.lib.v2.space_select.client.ClientDistrictManager;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

public class RegionWandItem extends Item implements SpaceSelectItem {
    public RegionWandItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Level level = context.getLevel();
        Player player = context.getPlayer();
        if (player == null) return InteractionResult.PASS;

        if (level.isClientSide()) {
            boolean offhand = context.getHand() == InteractionHand.OFF_HAND;
            int slot = player.getInventory().getSelectedSlot();
            DistrictManager.DistrictKey key = new DistrictManager.DistrictKey(slot, offhand, this);

            ClientDistrictManager manager = AnvilLibSpaceSelectClient.MANAGER;
            BlockPos clicked = context.getClickedPos();
            if (!manager.isSelecting(key)) {
                manager.startSelect(key, clicked);
            } else {
                // Finish selection and automatically send SpaceSelectPayload to server via ClientPacketDistributor
                manager.endSelect(key, clicked);
            }
        }
        return InteractionResult.SUCCESS;
    }
}
```
