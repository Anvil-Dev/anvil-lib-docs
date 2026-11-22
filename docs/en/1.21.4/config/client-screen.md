# Client Config Screen & Sidebar (`dev.anvilcraft.lib.v2.config.client`)

<BranchContextCard branch="1.21.4" />

When `@Config(screenStyle = ConfigScreenStyle.SIDEBAR)` is enabled, `module.config` replaces NeoForge's default multi-page nested config screen with **`SidebarConfigScreen`** on the client.

Compared to vanilla's config screen that jumps pages for every subcategory and requires closing/saving to see client changes, `SidebarConfigScreen` provides:
1. **Left Sidebar Tab Navigation (`Sidebar Tabs`)**: Automatically places top-level ungrouped fields in "General" and each top-level `@CollapsibleObject` into its own sidebar tab, preserving scroll position and focus per tab;
2. **Multi-File Dropdown Switcher**: If a mod registers multiple config files (`common`, `client`, `server`), a top-right dropdown switches between them; if there is only one editable `SIDEBAR` config, it skips NeoForge's file picker and opens the sidebar screen directly;
3. **Client Config Live Preview**: When editing `ModConfig.Type.CLIENT` entries (UI offsets, render toggles, volume sliders), every change immediately invokes `ConfigManager.previewClientValue` to sync into the in-memory config fields so you see live results in the background world without closing the screen!

---

## 1. Setup & Opening the Config Screen Manually

### 1. Automatic Setup (Recommended)

As long as you use `ConfigManager.register(MOD_ID, MyConfig::new)` with `screenStyle = ConfigScreenStyle.SIDEBAR` on `@Config`, `IConfigScreenFactory` is registered automatically on the physical client, accessible via **Mods -> Select Your Mod -> Config**.

### 2. Code Example: Opening the Mod Config Screen via Keybind or Command In-Game

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import dev.anvilcraft.lib.v2.config.client.ConfigScreens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.ModList;

public final class ModConfigGuiHelper {
    private ModConfigGuiHelper() {
    }

    /**
     * Open the config screen for the specified modId anywhere on the client
     */
    public static void openConfigScreen(String modId) {
        Minecraft mc = Minecraft.getInstance();
        Screen parent = mc.screen;
        ModContainer container = ModList.get()
            .getModContainerById(modId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown modId: " + modId));

        Screen screen = ConfigScreens.create(container, parent, spec -> ConfigScreenStyle.SIDEBAR);
        mc.setScreen(screen);
    }
}
```

---

## 2. Client Screen Classes API Reference (`dev.anvilcraft.lib.v2.config.client`)

### 1. `ConfigScreens`

Located in `dev.anvilcraft.lib.v2.config.client.ConfigScreens`, physical client only.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static void register(ModContainer mod, Function<ModConfigSpec, ConfigScreenStyle> style)` | `void` | Registers `IConfigScreenFactory` on `mod`. |
| `public static Screen create(ModContainer mod, Screen parent, Function<ModConfigSpec, ConfigScreenStyle> style)` | `Screen` | Creates the mod config screen: returns `SidebarConfigScreen` directly if the mod has only one editable config styled `SIDEBAR`, else returns `ConfigurationScreen` with the file list. |
| `public static @Nullable Component unavailableReason(ModConfig config)` | `@Nullable Component` | Checks if `ModConfig` is currently non-editable: returns a reason tooltip if `spec` is unloaded or if it is a `SERVER` config on a remote server or LAN-opened world; returns `null` when editable. |

### 2. `SidebarConfigScreen`

Extends NeoForge 1.21.4 `ConfigurationScreen.ConfigurationSectionScreen` (adapted to 1.21.4 `OptionsList` scroll canvas APIs).

| Constructor / Behavior | Description |
| :--- | :--- |
| `public SidebarConfigScreen(ConfigurationScreen parent, ModConfig.Type type, ModConfig config, Component title)` | Public constructor for manually instantiating with a custom `ConfigurationScreen`. |
| **Navigation & Nested Modals (`modalPath`)** | • Top-level plain fields go into the first `"general"` tab;<br>• Top-level `@CollapsibleObject` subconfigs appear as left-sidebar tabs;<br>• Level-2+ nested `@CollapsibleObject` or `List<?>` entries show an "Edit › (`anvillib_config.ui.open`)" button that opens a centered modal dialog over the current page; press ESC or click "Back" in the bottom-right to pop layers. |
| **Widget Enhancements** | • **Enum selection**: enums with ≤ 5 values also use a scrollable flat dropdown menu (supporting `TranslatableEnum` names);<br>• **Float sliders (`@Slider`)**: reads range and step from `ConfigManager.slider(value)` to build smooth `OptionInstance` sliders;<br>• **Undo & Reset**: bottom bar provides Undo and Reset buttons scoped to the active subpage. |

### 3. `ConfigTabs`, `FlatButton` & `PanelOptionsList` (Internal UI Support Classes)

| Class | Core Responsibility |
| :--- | :--- |
| `ConfigTabs` | Scans top-level `UnmodifiableConfig` entries in `ModConfigSpec`, splitting into the General tab (`key = ""`) and top-level subtable tabs (`record Tab(String key, Map<String, Object> entries, Map<String, Object> specs)`). |
| `FlatButton` | Modern flat dark button widget (supports `selected` highlight bar, `dropdown`/`expanded` arrow indicators, and auto-truncating ellipsis text). |
| `PanelOptionsList` | Custom smooth-scrolling container extending NeoForge 1.21.4 `OptionsList` (overrides `contentHeight()`, `scrollBarX()`, `maxScrollAmount()`, and `updateScrolling(...)`, auto-switching from 2-column to stacked layout on narrow windows). |
