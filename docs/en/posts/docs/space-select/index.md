---
title: Space Select
prev: false
next: false
---

# Space Select <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.space_select` provides a **visual space selection system** -- hold a
selection tool to define a cubic region in the game world, with support for region expansion, contraction,
movement, scroll-wheel scaling, and network synchronization for client-side rendering.

## Architecture Overview

1. **Data Layer** -- `District` records the start and end points of a selection
2. **Management Layer** -- `DistrictManager` maintains selection state for all players on the server
3. **Item Layer** -- `SpaceSelectItem` is the selection tool item
4. **Client Layer** -- `DistrictRenderer` renders selection outlines on the client, `SpaceSelectScrollHandler` handles scroll-wheel scaling
5. **Network Layer** -- `SpaceSelectPayload` synchronizes selection data to the client
6. **Event Layer** -- `PlayerCreateDistrictEvent` fires when a selection is created

## Quick Start

```java
// Get the player's DistrictManager
DistrictManager manager = DistrictManager.of(player);

// Set a selection
District district = District.create(startPos, endPos);
manager.setDistrict(player, district);

// Get the current selection
District current = manager.getDistrict(level, player);
```

## Core API

| Class                        | Description                                                                         |
|------------------------------|-------------------------------------------------------------------------------------|
| `District`                   | Selection record, supports `expand`/`contraction`/`move`/`scaleOnAxis`/`contains` |
| `DistrictManager`            | Server-side selection management, `setDistrict`/`getDistrict`/`clearDistrict`      |
| `SpaceSelectItem`            | Selection tool, right-click to set selection points                                 |
| `DistrictRenderer`           | Client-side selection wireframe rendering                                          |
| `SpaceSelectScrollHandler`   | Scroll-wheel scaling (chooses scaling axis based on player facing direction)        |
| `PlayerCreateDistrictEvent`  | Selection creation event                                                            |
| `SpaceSelectPayload`         | `IClientboundPacket` for synchronizing selections                                   |

## Dependency Setup

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0"
}
```

## Notes

- Selection data is only stored server-side; clients are synchronized via `SpaceSelectPayload`
- `District`'s `start`/`end` are `MutableBlockPos`, supporting in-place modification
- Selection color is determined by a random value derived from `District.hashCode()`
- Build dependencies: `module.registrum` and `module.network`
