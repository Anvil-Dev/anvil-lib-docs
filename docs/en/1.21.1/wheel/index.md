# Wheel Model Building, Pagination, Submenus & Trigger Callbacks

`module.wheel` (Mod ID: `anvillib_wheel`) provides a configurable radial wheel menu framework (`dev.anvilcraft.lib.v2.wheel`) for NeoForge 1.21.1 with a Gaussian-blurred frosted-glass disc and custom GLSL shader highlights. The **pure-data menu model (`api`)** is completely decoupled from **client UI/shader rendering (`client`)**; this page covers menu model building, pagination, submenu stacks, and trigger callbacks.

## Setup

### Gradle Repositories & Dependencies

Official releases are available on Maven Central, but `Cjsah Maven` with `exclusiveContent` filtering is recommended to avoid NeoForge Maven's incomplete Maven Central sync causing interface injection or transitive metadata errors:

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### Module Constants: `AnvilLibWheel`

Package: `dev.anvilcraft.lib.v2.wheel`

| Member Signature | Description |
| --- | --- |
| `public static final String MOD_ID = "anvillib_wheel"` | Wheel module Mod ID (used for `@EventBusSubscriber` and shader registration filtering) |
| `public static final String MAIN_ID = "anvillib"` | Main resource namespace |
| `static ResourceLocation of(String path)` | Creates `anvillib:<path>` resource location |

## Core Interaction Design: TAP vs HOLD Mode Behavior

`WheelOpenMode` determines how users select slots and **whether submenus can be selected**:

| Mode Enum | Triggering | Submenu Entry (`submenu`) Behavior |
| --- | --- | --- |
| `WheelOpenMode.TAP` | Tap key to open, **left-click** to confirm hovered sector; `ESC` pops submenu or closes at root | `isSelectable(TAP)` is `true`; clicking pushes submenu and resets page to `0` |
| `WheelOpenMode.HOLD` | Hold key to open, **release key** to trigger hovered sector | `isSelectable(HOLD)` returns **`false`**, ensuring hold-to-quick-select never accidentally enters a submenu |

> [!IMPORTANT]
> Because submenu entries are unselectable in `HOLD` mode (`entry.isSelectable(WheelOpenMode.HOLD) == false`), if you support both hold and tap modes on the same menu, place frequent direct actions at the front of the root menu.

## Full Example: Building a Radial Menu with Icon Rendering, Submenus & Pagination

```java
package com.example.mymod.client.wheel;

import dev.anvilcraft.lib.v2.wheel.api.WheelEntry;
import dev.anvilcraft.lib.v2.wheel.api.WheelEntryRenderer;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuBuilder;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.api.WheelSelectionEffect;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.List;

public final class ToolWheelFactory {
    private static WheelEntryRenderer itemIcon(ItemStack icon) {
        return (graphics, pose, width, height) ->
            graphics.renderItem(icon, (width - 16) / 2, (height - 16) / 2);
    }

    public static WheelMenuModel buildToolMenu() {
        return WheelMenuBuilder.create()
            .slotsPerPage(6)
            .deadZone(18)
            .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
            .selectionEffectColor(0xFF4FC3F7)
            .action(
                "mode.mine",
                Component.translatable("wheel.mymod.mine"),
                itemIcon(new ItemStack(Items.IRON_PICKAXE)),
                ctx -> sendModeSwitch("mine", ctx.pageIndex(), ctx.slotIndex())
            )
            .action(
                "mode.build",
                Component.translatable("wheel.mymod.build"),
                itemIcon(new ItemStack(Items.BRICKS)),
                ctx -> sendModeSwitch("build", ctx.pageIndex(), ctx.slotIndex())
            )
            .submenu(
                "shapes",
                Component.translatable("wheel.mymod.shapes"),
                itemIcon(new ItemStack(Items.COMPASS)),
                sub -> sub
                    .action(
                        "shape.cube",
                        Component.literal("3x3 Cube"),
                        itemIcon(new ItemStack(Items.STONE)),
                        ctx -> sendModeSwitch("cube", ctx.pageIndex(), ctx.slotIndex())
                    )
                    .action(
                        "shape.wall",
                        Component.literal("Wall"),
                        itemIcon(new ItemStack(Items.COBBLESTONE_WALL)),
                        ctx -> sendModeSwitch("wall", ctx.pageIndex(), ctx.slotIndex())
                    )
            )
            .action("preset.1", Component.literal("Preset 1"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .action("preset.2", Component.literal("Preset 2"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .action("preset.3", Component.literal("Preset 3"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .action("preset.4", Component.literal("Preset 4"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .build();
    }

    public static WheelMenuModel buildStaticModelDirectly() {
        List<WheelEntry> mutable = WheelEntry.mutableCopy(List.of(
            WheelEntry.action("ping", Component.literal("Ping"), ctx -> {}),
            WheelEntry.submenu(
                "tools",
                Component.literal("Tools"),
                List.of(WheelEntry.action("reset", Component.literal("Reset"), ctx -> {}))
            )
        ));
        return WheelMenuModel.of(mutable, 8, 24, WheelSelectionEffect.DOT, 0xFFFABC02);
    }

    private static void sendModeSwitch(String id, int page, int slot) {
        if (Minecraft.getInstance().player != null) {
            Minecraft.getInstance().player.displayClientMessage(
                Component.literal("Triggered " + id + " (page=" + page + ", slot=" + slot + ")"),
                true
            );
        }
    }
}
```

## Full Public API Reference

Package: `dev.anvilcraft.lib.v2.wheel.api`

### 1. Enums & Functional Interfaces

| Type & Signature | Description |
| --- | --- |
| `enum WheelOpenMode` | `TAP` (tap to open, click to trigger, supports submenus), `HOLD` (hold to open, release to trigger, submenus disabled) |
| `enum WheelSelectionEffect` | `DOT` (centered glow dot), `ANNULAR_SECTOR` (annular sector highlight, slightly expands after settle) |
| `@FunctionalInterface interface WheelEntryAction` | `void trigger(WheelActionContext context)` — callback when a sector is selected and triggered |
| `@FunctionalInterface interface WheelEntryRenderer` | `void render(GuiGraphics graphics, PoseStack pose, int width, int height)` — draws sector center icon with `pose` pre-translated to `[0..width, 0..height]` |
| `record WheelActionContext(int pageIndex, int slotIndex, String itemId, WheelOpenMode openMode)` | Context passed to `WheelEntryAction`: 0-based page index, in-page slot index, entry ID, and open mode |

### 2. `WheelMenuBuilder` & `WheelSubmenuBuilder`

> [!NOTE]
> Default difference reminder: `WheelMenuBuilder.create()` defaults to `deadZone = 15` and `selectionEffect = WheelSelectionEffect.ANNULAR_SECTOR`, whereas calling 3-arg or 1-arg `WheelMenuModel.of(...)` directly defaults to `deadZone = 30` and `selectionEffect = WheelSelectionEffect.DOT`.

| Method Signature | Description |
| --- | --- |
| `static WheelMenuBuilder create()` | Creates a builder (defaults: `slotsPerPage = 8`, `deadZone = 15`, `selectionEffect = ANNULAR_SECTOR`, `selectionEffectColor = 0xFFFABC02`) |
| `WheelMenuBuilder slotsPerPage(int slotsPerPage)` | Sets sector slots per page; throws `IllegalArgumentException` if `slotsPerPage < 1` |
| `WheelMenuBuilder deadZone(int deadZone)` | Sets center mouse dead-zone radius (pixels) |
| `WheelMenuBuilder selectionEffect(WheelSelectionEffect selectionEffect)` | Sets highlight visual mode (`DOT` or `ANNULAR_SECTOR`) |
| `WheelMenuBuilder selectionEffectColor(int selectionEffectColor)` | Sets highlight ARGB color |
| `WheelMenuBuilder action(String id, Component label, WheelEntryAction action)` | Adds an action entry without a custom icon |
| `WheelMenuBuilder action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | Adds an action entry with a custom icon renderer |
| `WheelMenuBuilder submenu(String id, Component label, Consumer<WheelSubmenuBuilder> submenuBuilder)` | Adds a submenu entry (add child `action`s inside `Consumer`) |
| `WheelMenuBuilder submenu(String id, Component label, WheelEntryRenderer renderer, Consumer<WheelSubmenuBuilder> submenuBuilder)` | Adds a submenu entry with a custom icon |
| `WheelMenuModel build()` | Builds an immutable `WheelMenuModel` |
| `WheelSubmenuBuilder action(String id, Component label, WheelEntryAction action)` | Adds an action entry inside a submenu |
| `WheelSubmenuBuilder action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | Adds an action entry with an icon inside a submenu |

### 3. `WheelEntry`

| Method Signature | Description |
| --- | --- |
| `static WheelEntry action(String id, Component label, WheelEntryAction action)` | Builds an action entry (no renderer) |
| `static WheelEntry action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | Builds an action entry with a renderer |
| `static WheelEntry submenu(String id, Component label, List<WheelEntry> submenu)` | Builds an immutable submenu entry |
| `static WheelEntry submenu(String id, Component label, WheelEntryRenderer renderer, List<WheelEntry> submenu)` | Builds a submenu entry with a renderer |
| `String id()` / `Component label()` | Reads entry ID and centered display title |
| `@Nullable WheelEntryRenderer renderer()` / `@Nullable WheelEntryAction action()` | Gets renderer and trigger callback (both null/no-op for placeholder slots) |
| `List<WheelEntry> submenu()` / `boolean hasSubmenu()` | Gets immutable submenu list and whether non-empty |
| `boolean isPlaceholder()` | Generated by Lombok `@Getter`; checks whether this is an internal empty padding slot for pagination |
| `boolean isSelectable(WheelOpenMode mode)` | Returns `false` for placeholders; `false` in `HOLD` mode when `hasSubmenu()` is true; otherwise `true` if it has an action or submenu |
| `static List<WheelEntry> mutableCopy(List<WheelEntry> entries)` | Returns a shallow-copied mutable `ArrayList<WheelEntry>` for further assembly |

### 4. `WheelMenuModel`, `WheelPageModel` & `WheelPagination`

| Class / Method Signature | Description |
| --- | --- |
| `public static final int DEFAULT_SLOTS_PER_PAGE = 8` | Default 8 slots per page |
| `public static final int DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02` | Default amber-gold highlight color |
| `static WheelMenuModel of(List<WheelEntry> rootEntries)` | `slotsPerPage=8`, `deadZone=30`, `DOT`, `0xFFFABC02` |
| `static WheelMenuModel of(List<WheelEntry> rootEntries, int slotsPerPage, int deadZone)` | Uses `DOT` and default highlight color |
| `static WheelMenuModel of(List<WheelEntry> rootEntries, int slotsPerPage, int deadZone, WheelSelectionEffect selectionEffect)` | Uses default highlight color |
| `static WheelMenuModel of(List<WheelEntry> rootEntries, int slotsPerPage, int deadZone, WheelSelectionEffect selectionEffect, int selectionEffectColor)` | Full-argument factory method |
| `List<WheelEntry> rootEntries()` / `int slotsPerPage()` / `int deadZone()` / `WheelSelectionEffect selectionEffect()` / `int selectionEffectColor()` | Read-only property accessors |
| `int pageCount(List<WheelEntry> entries)` / `int pageCount()` | Computes total page count for the given list or root menu (returns at least 1 page for empty lists) |
| `WheelPageModel page(List<WheelEntry> entries, int pageIndex)` / `WheelPageModel page(int pageIndex)` | Extracts `pageIndex`, padding trailing slots under `slotsPerPage` with hidden placeholder `WheelEntry`s (to keep sector angles uniform); throws `IllegalArgumentException` if out of bounds |
| `record WheelPageModel(int pageIndex, int slotsPerPage, List<WheelEntry> slots)` | Single-page snapshot; validates `slotsPerPage >= 1` and `slots.size() == slotsPerPage` on construction |
| `WheelEntry slot(int slotIndex)` (`WheelPageModel`) | Returns the slot at `slotIndex` (may be a placeholder with `isPlaceholder() == true`) |
| `boolean isSelectable(int slotIndex, WheelOpenMode mode)` (`WheelPageModel`) | Delegates to `isSelectable(mode)` on the target slot |
| `static int WheelPagination.pageCount(int entryCount, int slotsPerPage)` | Ceiling-division pagination helper; returns `1` when `entryCount <= 0`, throws `IllegalArgumentException` if `slotsPerPage < 1` |
