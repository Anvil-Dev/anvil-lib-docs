---
title: Multiblock
prev: false
next: false
---

# Dynamic Multiblock System <Badge type="tip" text="1.21.1" /> <Badge type="info" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

> **Availability**: This module is available in Minecraft **1.21.1** and **26.1**. Versions 1.21.2 through 1.21.11 were not synced due to development resource constraints. If you are using these versions, the dynamic multiblock feature is unavailable.

The package `dev.anvilcraft.lib.v2.multiblock` provides a **dynamic multiblock structure**
system. It supports defining multiblock shapes via datapack or code, asynchronous block matching, automatic structure state tracking (formed/unformed), and network synchronization to clients.

## Architecture Overview

1. **Definition** (`MultiblockDefinition`) -- Describes the blocks/predicates required at each relative position in the multiblock structure
2. **Controller** (`IController` / `SimpleController`) -- The "brain" of the multiblock, binding a block + definition ID and providing formed/unformed callbacks
3. **State** (`MultiblockState`) -- Runtime multiblock instance, tracking controller position, definition reference, and formed status
4. **Manager** (`DynamicMultiblockManager`) -- Per-dimension global manager, persisted as `SavedData`
5. **Async Detection** -- Independent thread pool performs predicate matching to avoid blocking the main thread
6. **Network Sync** -- `MultiblockFormPacket` / `MultiblockUnformPacket` synchronize state to clients

## Document Index

| Document                   | Content                                                                 |
|---------------------------|-------------------------------------------------------------------------|
| [Definition System](./definition) | `MultiblockDefinition`, `Builder`, `SeriaBuilder`, serialization        |
| [Controller](./controller)  | `IController`, `SimpleController`, `ControllerRecord`                    |
| [Runtime Management](./manager)   | `DynamicMultiblockManager`, `MultiblockState`, async detection, configuration |

## Module Main Class

### AnvilLibMultiblock

Mod entry point, `@Mod("anvillib_multiblock")`.

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_multiblock";
public static final AnvilLibMultiblockConfig CONFIG;

public static Identifier of(String path); // → anvillib:<path>
```

## Quick Workflow

1. Create a `MultiblockDefinition` (Builder or SeriaBuilder)
2. Create a `SimpleController` subclass and register it with `ControllerRecord`
3. Place the definition JSON in the datapack at `data/<ns>/anvillib/definitions/` (or register via code)
4. Place the controller block → the system automatically detects and triggers `onFormed`/`onUnformed`

## Notes

- `'0'` or `Vec3i.ZERO` in definitions represents the controller position
- Adjust the async detection thread pool size based on the actual number of multiblocks
- `MultiblockState` is persisted as `SavedData`, surviving restarts
- State changes are automatically synchronized to all online players via `IClientboundPacket`
