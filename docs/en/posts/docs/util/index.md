---
title: Util
prev: false
next: false
---

# AnvilLib Util Module Documentation <Badge type="tip" text="1.21.1" /> <Badge type="info" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

> **Availability**: This module exists as an independent module in Minecraft **1.21.1** and **26.1**. Due to development capacity constraints, `module.util` was not released as a standalone module in versions 1.21.2 through 1.21.11. During that period, the `nullness` functional interfaces (`NonNullSupplier`, etc.) were embedded into `module.registrum` (under the path `dev.anvilcraft.lib.v2.registrum.util.nullness`), while the remaining utility classes were unavailable.

AnvilLib Util is a Minecraft mod development helper library, providing a large collection of common utility classes, serialization interfaces, UI scrolling helpers, a predicate system, and component rendering tools.

This directory contains documentation for the following modules:

- **Core Utilities**: `Lazy`, collection and list utilities, math utilities, general utilities
- **Block Shape Utilities**: `ShapeUtil` (including multi-threaded merging, rotation, mirroring, etc.)
- **Item/ItemStack Utilities**: `InventoryUtil`, `UnlimitedItemStack`
- **Predicate System**: `NbtPredicate`, `ItemPredicate`, `BlockStatePredicate`, etc.
- **UI Scrolling**: `Scrollable`
- **Environment and Distribution**: `DistExecutor`, `ClientTickRecorder`
- **Text Components**: `ComponentUtil`, `MultilineComponentHelper`, `IComponentInfo`
- **Nullness Safety**: `NonNull*` / `Nullable*` functional interfaces and annotations

Click the sidebar navigation to browse detailed documentation for each module.
