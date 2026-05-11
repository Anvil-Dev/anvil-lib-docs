---
title: Wheel Client Rendering
prev: false
next: false
---

# Client Rendering

## WheelWidget

A subclass of `AbstractWidget`, the core control responsible for sector computation, interaction, and rendering.

### Layout

Calculates the position and detection angle of each sector (`WheelSection`) based on the center point, inner/outer
radii, and slots per page.

### Interaction

| Method            | Description                                                                                            |
|-------------------|--------------------------------------------------------------------------------------------------------|
| `checkMousePos()` | Determines the currently pointed sector based on polar coordinates of the mouse relative to the center |
| `mouseScrolled()` | Cycles selection between sectors                                                                       |
| `onClosing()`     | Plays the closing animation                                                                            |

No sector is selected within the dead zone (`deadZone`).

### Animation

- Elastic scale animation on open
- Reverse animation on close

### Custom Rendering

- Ring background: `RingRenderState` + custom `RingUniform` shader
- Selection dot: `SelectionRenderState` (`WheelSelectionEffect.DOT`)
- Sector highlight: `AnnularSectorRenderState` (`WheelSelectionEffect.ANNULAR_SECTOR`)
- Entry renderer + text drawing

## WheelScreen

Screen host for the wheel menu, managing the page stack and mode triggers.

### Core Fields

| Field                               | Description                                        |
|-------------------------------------|----------------------------------------------------|
| `WheelMenuModel model`              | Wheel menu model                                   |
| `WheelOpenMode mode`                | Open mode                                          |
| `Deque<List<WheelEntry>> menuStack` | Menu stack (supports submenu push/back navigation) |

### Interaction Behavior

**Tap mode**:

- Left mouse click triggers the currently selected entry
- If no selection, closes the screen
- Enters submenu when present

**Hold mode**:

- `triggerFromHoldRelease()` is called externally on hold release
- Triggers the currently selected action entry (ignores submenus)

### Page Navigation

Mouse scroll wheel switches between pages.

## Render Pipeline and Uniforms <Badge type="info" text="enhanced in 26.1" />

### Shader Pipelines (LibRenders)

| Pipeline                  | Uniform                | Purpose           |
|---------------------------|------------------------|-------------------|
| `RING_PIPELINE`           | `RingUniform`          | Anti-aliased ring |
| `SELECTION_PIPELINE`      | `SelectionUniform`     | Soft-edged dot    |
| `ANNULAR_SECTOR_PIPELINE` | `AnnularSectorUniform` | Sector highlight  |

All pipelines are based on the common `SNIPPET_COMMON`, with UBOs automatically bound via `RingRenderState`,
`SelectionRenderState`, and `AnnularSectorRenderState` (all implementing
`LibQuadGuiElementRenderState`).

### Dynamic Uniforms (LibDynamicUniforms)

Manages and reuses per-frame uniform buffers, avoiding excessive GPU memory allocation per frame:

```java
LibDynamicUniforms uniforms = AnvilLibWheel.getLibDynamicUniforms();

// Write uniform data
uniforms.writeRing(center, innerDiameter, outerDiameter, aa);
uniforms.writeSelection(framebufferSize, center, radius, aa);
uniforms.writeAnnularSector(...);

// Reset at the end of each frame
uniforms.reset();
```

Internally uses `DynamicUniformStorage` with three data classes (`RingUniform`, `SelectionUniform`,
`AnnularSectorUniform`), written in STD140 layout.

The global singleton is obtained via `AnvilLibWheel.getLibDynamicUniforms()`, initialized during
`ConfigureMainRenderTargetEvent`.

## Input Control

### WheelScreenController

Encapsulates input logic for both tap and hold modes, preventing duplicate opening from direct tick-event operations.

```java
WheelScreenController controller = new WheelScreenController();

// Open a tap screen
controller.openTap(menuModel);

// Hold key pressed
controller.onHoldKeyPressed(menuModel);

// Hold key released (triggers selected action + close)
controller.onHoldKeyReleased();
```

## Testing and Examples

The `dev.anvilcraft.lib.v2.test.wheel` package provides a complete runnable example.

### Test Components

| Class                    | Description                                                      |
|--------------------------|------------------------------------------------------------------|
| `WheelTestKeys`          | Registers four keybindings (tap/hold + dot/sector)               |
| `WheelTestClientHandler` | `ClientTickEvent.Pre` handles tap, `InputEvent.Key` handles hold |
| `WheelDemoMenus`         | Builds `buildTapDemo()` / `buildHoldDemo()` demonstration menus  |

### Demo Menu Features

- Action entries
- Submenus
- Custom renderer (renders an apple item icon)

## Extension Guide

### Custom Renderer

```java
// Implement WheelEntryRenderer
WheelEntryRenderer myRenderer = (graphics, entry, x, y, radius) -> {
    // Draw arbitrary GUI elements within the sector
};

// Pass to action or submenu overloads
builder.action("id", Component.literal("Custom"), ctx -> {}, myRenderer);
```

### Dynamic Styling

Adjust via `WheelMenuBuilder` and `WheelWidget` constructor parameters:

- Animation duration
- Selection effect color
- Font scaling
- Dead zone size

### Server Interaction

`WheelEntryAction` can obtain page and slot information via `WheelActionContext` and send network packets using
`PacketDistributor`:

```java
builder.action("action", Component.literal("Do Something"), ctx -> {
    PacketDistributor.sendToServer(new MyActionPacket(ctx.slotIndex(), ctx.openMode()));
});
```
