# Wheel Model Building, Pagination, Submenus & Trigger Callbacks

`module.wheel` is a client-side widget library designed for radial quick-menu wheels, supporting nested submenus, auto-pagination, center dead-zone shielding, multiple highlight effects (dot cursor or annular sector tinting), and reusable custom-rendered slots.

## Module Info

- Mod ID: `anvillib_wheel` (`AnvilLibWheel.MOD_ID`)
- Main namespace: `anvillib` (`AnvilLibWheel.MAIN_ID`, used for core built-in shaders and shared resource paths `AnvilLibWheel.of(...)`)

## Core Concepts Overview

| Type | Responsibility |
| --- | --- |
| `WheelMenuBuilder` / `WheelSubmenuBuilder` | Fluent DSL declaring root action slots (`action`), nested submenus (`submenu`), page capacity, and highlight styles |
| `WheelMenuModel` | Compiled immutable menu model providing total page count and per-page slicing (`WheelPageModel`) |
| `WheelEntry` | A single entry on the wheel (leaf action entry or submenu opener node) |
| `WheelEntryAction` | Business logic callback interface invoked when an entry is confirmed/released, receiving `WheelActionContext` |
| `WheelEntryRenderer` | Custom sector content renderer for drawing icons, items, or badges at the slot center |
| `WheelOpenMode` | Wheel open interaction mode enum (click-toggle `TAP` vs hold-and-release `HOLD`) |
| `WheelSelectionEffect` | Selection highlight style enum (center glow `DOT` vs full sector `ANNULAR_SECTOR`) |
| `WheelPagination` | Standalone pagination helper `pageCount(int entryCount, int slotsPerPage)` |
| `MathUtil` (`dev.anvilcraft.lib.v2.wheel.util.MathUtil`) | Client geometry math library for wheel angle rotation, vector angles, range checks, and factorial caching |

## `WheelMenuBuilder` & `WheelEntry` API Reference

### `WheelMenuBuilder`

Default config constants: `WheelMenuModel.DEFAULT_SLOTS_PER_PAGE = 8`, `WheelMenuModel.DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02`.

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `WheelMenuBuilder.create()` | `WheelMenuBuilder` | Initializes an empty builder |
| `slotsPerPage(int slotsPerPage)` | `WheelMenuBuilder` | Sets max sectors shown per page (auto-paginates when exceeded) |
| `deadZone(int deadZone)` | `WheelMenuBuilder` | Sets the unresponsive center mouse dead-zone radius (in pixels) |
| `selectionEffect(WheelSelectionEffect effect)` | `WheelMenuBuilder` | Selects visual feedback style for the hovered sector |
| `selectionEffectColor(int argb)` | `WheelMenuBuilder` | Sets highlight graphic color (ARGB) |
| `action(String id, Component label, WheelEntryAction action)` | `WheelMenuBuilder` | Appends a plain-text action entry |
| `action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | `WheelMenuBuilder` | Appends an action entry with a custom icon renderer |
| `submenu(String id, Component label, Consumer<WheelSubmenuBuilder> submenu)` | `WheelMenuBuilder` | Appends a nested submenu group |
| `submenu(String id, Component label, WheelEntryRenderer renderer, Consumer<WheelSubmenuBuilder> submenu)` | `WheelMenuBuilder` | Appends a nested submenu group with a custom icon |
| `build()` | `WheelMenuModel` | Builds the immutable wheel menu model |

### `WheelEntry` & `WheelMenuModel`

- **Factory methods**: `WheelEntry.action(id, label[, renderer], action)`, `WheelEntry.submenu(id, label[, renderer], List<WheelEntry>)`, `WheelEntry.mutableCopy(entries)`.
- **Metadata getters**: `id()`, `label()`, `renderer()`, `action()`, `submenu()`, `hasSubmenu()`, `isSelectable(WheelOpenMode)`.
- **`WheelMenuModel`**: `WheelMenuModel.of(rootEntries[, slotsPerPage, deadZone[, effect, color]])`, `pageCount()`, `pageCount(entries)`, `page(pageIndex)`, `page(entries, pageIndex)`; returned `WheelPageModel` provides `slot(int slotIndex)` and `isSelectable(int slotIndex, WheelOpenMode mode)`.

### Complete Model Building Example

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.wheel.api.WheelEntryRenderer;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuBuilder;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.api.WheelSelectionEffect;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Items;

public final class ToolWheelMenus {
    public static WheelMenuModel buildToolMenu() {
        return WheelMenuBuilder.create()
            .slotsPerPage(6)
            .deadZone(18)
            .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
            .selectionEffectColor(0x9933BBFF)
            .action(
                "mode_dig",
                Component.literal("Tunnel 3x3"),
                itemIcon(Items.IRON_PICKAXE.getDefaultInstance()),
                ctx -> switchMode("tunnel")
            )
            .action(
                "mode_vein",
                Component.literal("Vein Mine"),
                itemIcon(Items.DIAMOND_PICKAXE.getDefaultInstance()),
                ctx -> switchMode("vein")
            )
            .submenu("presets", Component.literal("More Presets"), sub -> sub
                .action("preset_Silk", Component.literal("Silk Touch"), ctx -> switchMode("silk"))
                .action("preset_fortune", Component.literal("Fortune"), ctx -> switchMode("fortune"))
            )
            .build();
    }

    private static WheelEntryRenderer itemIcon(net.minecraft.world.item.ItemStack stack) {
        return (guiGraphics, x, y, width, height) ->
            guiGraphics.renderItem(stack, Math.round(x + width / 2f - 8), Math.round(y + height / 2f - 8));
    }

    private static void switchMode(String mode) {
        // Send mod's custom toggle packet or client notification
    }
}
```

## Wheel-Specific Math Utilities: `dev.anvilcraft.lib.v2.wheel.util.MathUtil`

`module.wheel` includes a static math utility for polar sector hit-testing covering:
- `rotationDegrees(Vector2f v, float deg)` / `rotate(Vector2f v, float rad)` / `copy(Vector2f v)`: rotates 2D vectors around the origin;
- `angle(Vector2f from, Vector2f to)` / `angleDegrees(Vector2f from, Vector2f to)`: computes signed polar angle difference between two 2D vectors;
- `safeDivide(float a, float b)` (returns `1` when `a == b`) and `clampWithProportion(float value, float min, float max)` (periodic circular angle/value wrapping);
- `isInRange(double value, double min, double max)` and 2D overload `isInRange(x, y, minX, minY, maxX, maxY)`;
- `dist(BlockPos a, BlockPos b)`, `getDirection(BlockPos from, BlockPos to)`, `fromDelta(int x, int y, int z)`, `factorial(int value)`.
