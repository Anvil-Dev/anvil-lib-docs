# Wheel Radial Menu Client API: Builders & Data Models (`module.wheel`)

<BranchContextCard branch="26.1" />

`module.wheel` (artifact `anvillib-wheel-neoforge-26.1`, package `dev.anvilcraft.lib.v2.wheel`) is a client-side **Radial Wheel Menu API** featuring a Gaussian-blurred frosted-glass disc background, 2D SDF separator rings and direction chevrons, smoothly interpolated annular-sector / glow-dot selection effects, scroll pagination, and nested submenus.

This module is split into 2 sub-documents by functionality:
- **This page (Builders, Entries & Data Models)**: Covers `AnvilLibWheel`, `WheelMenuBuilder` (including `WheelSubmenuBuilder`), `WheelMenuModel`, `WheelPageModel`, `WheelPagination`, `WheelEntry`, `WheelEntryAction`, `WheelEntryRenderer`, `WheelActionContext`, `WheelOpenMode`, and `WheelSelectionEffect`.
- **[Wheel Controller, Screen & Frosted-Glass Rendering](./controller-and-screen)**: Covers `WheelScreenController`, `WheelScreen`, `WheelWidget`, `WheelFrostedBackground`, and underlying render pipelines and states.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.1`, this module is included automatically. To depend on `wheel` standalone (note that `wheel` depends on `module.rendering`'s `SdfGraphics` and `GaussianBlur`):

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-wheel-neoforge-26.1:2.0.0")
}
```

---

## 2. Two Open Modes (`WheelOpenMode`) & Submenu Restrictions

`module.wheel` supports two classic radial wheel interaction modes:

1. **`WheelOpenMode.HOLD` (Hold hotkey to open, release to trigger and close)**:
   The wheel opens while the player holds the hotkey; the player moves the mouse toward a sector and **upon releasing the key**, the hovered slot's `WheelEntryAction` fires immediately and the wheel closes.
   - **Important restriction**: in `HOLD` mode, submenu entries (`entry.hasSubmenu() == true`) **cannot be selected (`entry.isSelectable(WheelOpenMode.HOLD) == false`)**, because releasing the key closes the screen immediately and cannot enter a submenu.
2. **`WheelOpenMode.TAP` (Tap to open, left-click to trigger or enter submenu)**:
   The player taps the hotkey to open the wheel (no need to hold) and left-clicks a sector:
   - Clicking an `action` entry executes the action and closes the wheel;
   - Clicking a `submenu` entry pushes the submenu onto `WheelScreen`'s `menuStack` and switches to it (pressing `ESC` returns to the parent menu, or closes at the root menu)!

---

## 3. Full Code Example: Building a Wheel Model with Custom Icon Rendering & Submenus

```java
package com.example.mymod.client.wheel;

import dev.anvilcraft.lib.v2.wheel.api.WheelEntryRenderer;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuBuilder;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.api.WheelSelectionEffect;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class ToolModeWheelMenus {
    private ToolModeWheelMenus() {
    }

    /**
     * Helper: builds a WheelEntryRenderer that draws a 16x16 item icon at the sector center
     */
    public static WheelEntryRenderer itemIcon(ItemStack stack) {
        return (graphics, pose, width, height) -> {
            // Here pose origin is already translated to the sector icon center; offset (-8, -8) to center a 16x16 item
            graphics.item(stack, -8, -8);
        };
    }

    public static WheelMenuModel createMultiToolMenu() {
        return WheelMenuBuilder.create()
            // Show 6 sectors per page (auto-paginates with scroll support when > 6 entries)
            .slotsPerPage(6)
            // 18px center dead-zone radius (no sector selected when cursor is < 18px from center)
            .deadZone(18)
            // Use smoothly interpolated annular sector highlight (ANNULAR_SECTOR or DOT)
            .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
            .selectionEffectColor(0xFFFABC02)
            // 1. Add action entries with item icons
            .action(
                "mode_excavate",
                Component.literal("Vein Mining Mode"),
                itemIcon(new ItemStack(Items.DIAMOND_PICKAXE)),
                ctx -> {
                    // ctx contains pageIndex, slotIndex, itemId, openMode
                    sendModeChangeToServer(ctx.itemId());
                }
            )
            .action(
                "mode_vein",
                Component.literal("Ore Mining Mode"),
                itemIcon(new ItemStack(Items.IRON_ORE)),
                ctx -> sendModeChangeToServer(ctx.itemId())
            )
            // 2. Add a level-2 submenu entry (clickable in TAP mode to expand submenu)
            .submenu(
                "aoe_size_menu",
                Component.literal("Area Mining Size..."),
                itemIcon(new ItemStack(Items.TNT)),
                sub -> sub
                    .action("aoe_3x3", Component.literal("3×3 Area"), ctx -> sendModeChangeToServer(ctx.itemId()))
                    .action("aoe_5x5", Component.literal("5×5 Area"), ctx -> sendModeChangeToServer(ctx.itemId()))
            )
            .build();
    }

    private static void sendModeChangeToServer(String modeId) {
        // Send network packet or run client logic...
    }
}
```

---

## 4. Public Classes, Records & Interfaces API Reference (`dev.anvilcraft.lib.v2.wheel.api`)

### 1. `WheelMenuBuilder` & `WheelMenuBuilder.WheelSubmenuBuilder`

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static WheelMenuBuilder create()` | `WheelMenuBuilder` | Creates a wheel menu builder (defaults: `slotsPerPage = 8`, `deadZone = 15`, `selectionEffect = ANNULAR_SECTOR`, `selectionEffectColor = 0xFFFABC02`). |
| `public WheelMenuBuilder slotsPerPage(int slotsPerPage)` | `WheelMenuBuilder` | Sets sectors per page (must be `>= 1`, else throws `IllegalArgumentException`). When total entries are not a multiple of `slotsPerPage`, trailing slots on the last page are padded with unselectable transparent `WheelEntry.placeholder(i)`. |
| `public WheelMenuBuilder deadZone(int deadZone)` | `WheelMenuBuilder` | Sets the center dead-zone radius (pixels). |
| `public WheelMenuBuilder selectionEffect(WheelSelectionEffect effect)` | `WheelMenuBuilder` | Sets selection visual effect: `WheelSelectionEffect.ANNULAR_SECTOR` or `WheelSelectionEffect.DOT` (SDF glow dot). |
| `public WheelMenuBuilder selectionEffectColor(int argb)` | `WheelMenuBuilder` | Sets selection effect color (ARGB). |
| `public WheelMenuBuilder action(String id, Component label, WheelEntryAction action)`<br>`public WheelMenuBuilder action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | `WheelMenuBuilder` | Adds an action entry to the root menu (with optional custom icon/content `renderer`). |
| `public WheelMenuBuilder submenu(String id, Component label, Consumer<WheelSubmenuBuilder> submenuBuilder)`<br>`public WheelMenuBuilder submenu(String id, Component label, WheelEntryRenderer renderer, Consumer<WheelSubmenuBuilder> submenuBuilder)` | `WheelMenuBuilder` | Adds a level-2 submenu entry to the root menu. `WheelSubmenuBuilder` provides the same two `action(...)` overloads. |
| `public WheelMenuModel build()` | `WheelMenuModel` | Builds an immutable `WheelMenuModel`. |

### 2. `WheelMenuModel`, `WheelPageModel` & `WheelPagination`

| Class | Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| `WheelMenuModel` | • `DEFAULT_SLOTS_PER_PAGE = 8`, `DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02`<br>• `public static WheelMenuModel of(List<WheelEntry> rootEntries, ...)` (4 static factory overloads)<br>• `rootEntries()` / `slotsPerPage()` / `deadZone()` / `selectionEffect()` / `selectionEffectColor()`<br>• `int pageCount()` / `int pageCount(List<WheelEntry> entries)`<br>• `WheelPageModel page(int pageIndex)` / `WheelPageModel page(List<WheelEntry> entries, int pageIndex)` | Immutable wheel menu model. `page(...)` extracts the specified page and pads to `slotsPerPage` with `placeholder`s (throws `IllegalArgumentException` if `pageIndex` is out of bounds). |
| `WheelPageModel` | `public record WheelPageModel(int pageIndex, int slotsPerPage, List<WheelEntry> slots)`<br>• `public WheelEntry slot(int slotIndex)`<br>• `public boolean isSelectable(int slotIndex, WheelOpenMode mode)` | Single-page wheel data model guaranteeing `slots.size() == slotsPerPage`. |
| `WheelPagination` | `public static int pageCount(int entryCount, int slotsPerPage)` | Computes total page count (returns `1` when `entryCount <= 0`). |

### 3. `WheelEntry`, `WheelEntryAction`, `WheelEntryRenderer` & `WheelActionContext`

| Class / Interface | Key Method Signatures | Description |
| :--- | :--- | :--- |
| `WheelEntry` | • `static WheelEntry action(String id, Component label, [WheelEntryRenderer renderer,] WheelEntryAction action)`<br>• `static WheelEntry submenu(String id, Component label, [WheelEntryRenderer renderer,] List<WheelEntry> submenu)`<br>• `static List<WheelEntry> mutableCopy(List<WheelEntry> entries)`<br>• `id()` / `label()` / `renderer()` / `action()` / `submenu()` / `hasSubmenu()` / `isPlaceholder()` / `isSelectable(WheelOpenMode mode)` | Single wheel slot entry. |
| `WheelEntryAction` | `void trigger(WheelActionContext context)` | Callback invoked when a slot action triggers. |
| `WheelEntryRenderer` | `void render(GuiGraphicsExtractor graphics, Matrix3x2fStack pose, int width, int height)` | Custom icon render callback for a slot (`pose` is pre-translated to the slot's center on the ring). |
| `WheelActionContext` | `public record WheelActionContext(int pageIndex, int slotIndex, String itemId, WheelOpenMode openMode)` | Context passed when an action triggers. |
