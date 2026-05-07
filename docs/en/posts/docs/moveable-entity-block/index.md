---
title: Moveable Entity Block
prev: false
next: false
---

# Moveable Entity Block Module <Badge type="tip" text=">=1.21.1" /> <Badge type="danger" text="API redesigned in 26.1" />

The package `dev.anvilcraft.lib.v2.piston` solves the issue of vanilla pistons being unable to push blocks with block entities. Through a set of Mixins and interfaces, it allows blocks to carry custom
NBT data during movement and write the data back to the block entity at the destination when the piston stops.

## Document Index

| Document                  | Content                                                          |
|--------------------------|------------------------------------------------------------------|
| [Core Interfaces](./api)        | `IMoveableEntityBlock`, `IPistonMovingBlockEntityExtension`     |
| [Mixin and Usage](./usage)      | Mixin modification points, complete usage example                |

## Overview

In vanilla, a piston pushing a block with a block entity has no effect. This module injects into the piston movement logic:

1. **Before movement** -- Calls `clearData` to extract block entity data
2. **During movement** -- Data is temporarily stored in `PistonMovingBlockEntity`
3. **After movement** -- Calls `setData` to write data back to the block entity at the new position

The entire process is transparent to the server and requires no modification to the vanilla piston core logic.

## Notes

- All data transfer occurs server-side; the client does not retain additional data
- `clearData` should return only the custom data that needs to be preserved, not serialize the entire block entity
- `IMoveableEntityBlock` extends `EntityBlock`; if your block is already a `BaseEntityBlock` subclass, you only need to additionally implement this interface
- Mixin priority is `priority = 943`; may need adjustment if conflicting with other piston-modifying mods
