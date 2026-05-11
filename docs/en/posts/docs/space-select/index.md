---
title: Space Select
prev: false
next: false
---

# Space Select Module <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.space_select` provides a **visual space selection system**. Items implementing the
`SpaceSelectItem` interface allow players to define cubic regions in the world, with support for
expand/contract/move/scroll-scale operations. Selection state is stored server-side and rendered as wireframes on the
client.

## Architecture Overview

1. **Data Layer** — `District` records the start and end positions of a selection
2. **Server Management** — `DistrictManager` maintains selections keyed by `DistrictKey(slot, offhand, item)`
3. **Client Management** — `ClientDistrictManager` (`AnvilLibSpaceSelectClient.MANAGER`) tracks selection process and
   render data
4. **Item Layer** — `SpaceSelectItem` interface implements selection logic (`select`/`cancel`/`onCreateDistrict`)
5. **Network Layer** — `SpaceSelectPayload` (`IServerboundPacket`) client→server submits selections
6. **Rendering Layer** — `DistrictRenderer` draws selection wireframes, `SpaceSelectScrollHandler` handles scroll zoom
7. **Event Layer** — `PlayerCreateDistrictEvent` triggers on server when a district is created

## Data Flow

```
Player right-clicks selection tool
  → SpaceSelectItem.select(player, pos)
    → ClientDistrictManager.startSelect / endSelect
      → SpaceSelectPayload (C→S, IServerboundPacket)
        → PlayerCreateDistrictEvent
          → Business logic processes the selection
```

## Core API

### District

Selection record defined by `start`/`end` `MutableBlockPos`.

```java
District district = District.create(pos1, pos2);
boolean inside = district.contains(x, y, z);
```

| Method                                                               | Description                                     |
|----------------------------------------------------------------------|-------------------------------------------------|
| `create(BlockPos, BlockPos)`                                         | Create district with auto min/max normalization |
| `expand(Direction, int)`                                             | Expand in the given direction                   |
| `contraction(Direction, int)`                                        | Contract from the given direction               |
| `move(Direction, int)`                                               | Move the entire district                        |
| `scaleOnAxis(Axis, scrollAmount, playerPos, boundingBox, lookAngle)` | Scale based on player position and view         |
| `getPrimaryAxis(Vec3 lookAngle)`                                     | Determine primary axis from view angle          |
| `contains(double, double, double)`                                   | Point containment check                         |
| `shape()`                                                            | Returns the district VoxelShape                 |
| `color()`                                                            | Random semi-transparent color based on hashCode |

### DistrictManager

Server-side selection storage, indexed by `DistrictKey`.

```java
DistrictManager.DistrictKey key = new DistrictManager.DistrictKey(
    slot,    // inventory slot (-1 for offhand)
    offhand, // whether in offhand
    item     // the item used
);

manager.select(key, district);
manager.clear(key);
```

### SpaceSelectItem

Interface for items. Default logic: right-click tracks selection through `AnvilLibSpaceSelectClient.MANAGER` (
startSelect→endSelect), sending `SpaceSelectPayload` on completion.

```java
public class MySelectTool extends Item implements SpaceSelectItem {
    @Override
    public void onCreateDistrict(Player player, ItemStack stack,
                                  BlockPos start, BlockPos end) { }
}
```

### Network Packet

`SpaceSelectPayload` is `IServerboundPacket` (client→server), carrying `offhand`, `start`, `end`. Server posts
`PlayerCreateDistrictEvent` on receipt.

## Dependency

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0"
}
```

## Notes

- `SpaceSelectPayload` is **serverbound** (`IServerboundPacket`), sent from client to server
- Districts are keyed by `(slot, offhand, item)` triple — different slots/items have independent selections
- `District.start`/`end` are `MutableBlockPos` for in-place modification
- District color is a random semi-transparent color derived from `District.hashCode()`
- Depends on `module.registrum` and `module.network`
- Client rendering via `DistrictRenderer` at `RenderLevelStageEvent.AfterTranslucentParticles`
