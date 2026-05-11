---
title: Wheel API Model Layer
prev: false
next: false
---

# API Model Layer

All classes in the API layer reside in `dev.anvilcraft.lib.v2.wheel.api`, with no dependency on Minecraft client
classes, and can be safely used on the logical server side.

## WheelEntry

An entry on the wheel, which can be an action item or a submenu item.

```java
// Action item: executes an action when selected
WheelEntry actionEntry = WheelEntry.action(
    "entry_id",
    Component.literal("My Action"),
    ctx -> { /* processing logic */ }
);

// Submenu item: expands a submenu (child items only support action)
WheelEntry submenuEntry = WheelEntry.submenu(
    "sub_id",
    Component.literal("Sub Menu"),
    List.of(
        WheelEntry.action("sub_1", Component.literal("Option 1"), ctx -> {}),
        WheelEntry.action("sub_2", Component.literal("Option 2"), ctx -> {})
    )
);
```

Each entry has a unique ID, label, optional renderer (`WheelEntryRenderer`), optional action, and submenu list.

## WheelEntryAction

Functional interface that defines the execution logic when an entry is triggered.

```java
@FunctionalInterface
public interface WheelEntryAction {
    void execute(WheelActionContext ctx);
}
```

### WheelActionContext

| Field       | Description             |
|-------------|-------------------------|
| `pageIndex` | Current page index      |
| `slotIndex` | Current slot index      |
| `entryId`   | Entry unique identifier |
| `openMode`  | Open mode (TAP / HOLD)  |

## WheelEntryRenderer

Optional interface to customize rendering within the wheel sector (replaces default text/item icon, etc.).

```java
@FunctionalInterface
public interface WheelEntryRenderer {
    void render(GuiGraphics graphics, WheelEntry entry, float x, float y, float radius);
}
```

## WheelMenuModel

Complete wheel menu model.

```java
WheelMenuModel model = new WheelMenuModel(
    rootEntries,               // Root entry list
    slotsPerPage,              // Slots per page
    deadZoneRadius,            // Dead zone radius (no sector selected within)
    selectionEffect,           // Selection effect: DOT or ANNULAR_SECTOR
    selectionColor             // Selection effect color
);
```

| Method            | Description                                           |
|-------------------|-------------------------------------------------------|
| `page(int index)` | Generates the `WheelPageModel` for the specified page |

## WheelPageModel

Model for a single page.

```java
WheelPageModel page = model.page(0);

// Check whether a slot is selectable (submenus are not selectable in hold mode)
boolean selectable = page.isSelectable(slotIndex, openMode);
```

A page contains a fixed number of `slots`, automatically padded with placeholders when insufficient.

## WheelPagination

Static utility to calculate the total page count.

```java
int totalPages = WheelPagination.pageCount(totalEntries, slotsPerPage);
```

## Enum Types

### WheelOpenMode

| Value  | Description                                                               |
|--------|---------------------------------------------------------------------------|
| `TAP`  | Tap mode: click triggers the currently selected entry, submenus navigable |
| `HOLD` | Hold mode: trigger action item on release, submenus not triggerable       |

### WheelSelectionEffect <Badge type="tip" text=">=26.1" />

| Value            | Description                              |
|------------------|------------------------------------------|
| `DOT`            | Dot follows the cursor                   |
| `ANNULAR_SECTOR` | Sector highlight fills the entire sector |

## WheelMenuBuilder

Fluent API builder:

```java
WheelMenuModel model = WheelMenuBuilder.create()
    .slotsPerPage(8)
    .deadZone(20.0f)
    .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
    .selectionColor(0xFF4080FF)
    .action("id1", Component.literal("Action 1"), ctx -> {
        // Execute action
    })
    .action("id2", Component.literal("Action 2"), ctx -> {
        // Custom renderer
    })
    .renderer(myCustomRenderer)
    .submenu("sub1", Component.literal("Sub Menu"), sub -> sub
        .action("sub_a", Component.literal("Sub Option A"), ctx -> {})
        .action("sub_b", Component.literal("Sub Option B"), ctx -> {})
    )
    .build();
```

| Method                                                               | Description                   |
|----------------------------------------------------------------------|-------------------------------|
| `slotsPerPage(int)`                                                  | Slots per page                |
| `deadZone(float)`                                                    | Dead zone radius (pixels)     |
| `selectionEffect(WheelSelectionEffect)`                              | Selection effect type         |
| `selectionColor(int)`                                                | Selection effect color (ARGB) |
| `action(String id, Component label, WheelEntryAction)`               | Add an action entry           |
| `submenu(String id, Component label, Consumer<WheelSubmenuBuilder>)` | Add a submenu                 |
| `build()`                                                            | Build the `WheelMenuModel`    |

### Notes

- `WheelSubmenuBuilder` only supports action entries, not nested submenus
- API layer models can be safely transmitted to the server (e.g., for validation or permission checks)
