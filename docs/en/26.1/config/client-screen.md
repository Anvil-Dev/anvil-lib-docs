# Client Config Screen & Sidebar Style (`dev.anvilcraft.lib.v2.config.client`)

<BranchContextCard branch="26.1" />

The `dev.anvilcraft.lib.v2.config.client` package implements `AnvilLib`'s client config screen dispatcher (`ConfigScreens`) and translucent sidebar config screen (`SidebarConfigScreen`).

When you set `screenStyle = ConfigScreenStyle.SIDEBAR` in `@Config`, `ConfigManager` automatically routes that config file to `SidebarConfigScreen` on the client without any manual GUI code. If you wrote a native `ModConfigSpec` without `@Config`, you can still call `ConfigScreens.register(...)` or construct `SidebarConfigScreen` directly to enable the sidebar UI.

---

## 1. Core Design Features

Compared to NeoForge's default centered multi-page config screen, `SidebarConfigScreen` provides:

1. **Left-sidebar top-level category navigation (`ConfigTabs`)**: Automatically groups top-level ungrouped entries into a "General" tab and lists all top-level subsections (`@CollapsibleObject` or `builder.push(...)` first-level subtables) as fixed left-bar buttons for instant switching in the right pane without entering/exiting sub-screens.
2. **In-game translucent visual style & live preview**: When opened in-world, the background uses a translucent dark frosted tint (`backgroundColor(color, inGameAlpha)`) without vanilla's blur overlay. Modifying `ModConfig.Type.CLIENT` entries (especially dragging `@Slider` step sliders) immediately syncs to in-memory fields via `ConfigManager.previewClientValue` so players see live changes while dragging.
3. **Single-file direct access & multi-file top-bar switcher**:
   - If the mod has **only 1 editable config file** using `SIDEBAR`, clicking "Config" in the mod list **skips NeoForge's file selection screen** and opens `SidebarConfigScreen` directly;
   - If the mod has multiple config files, `SidebarConfigScreen` displays a top-right dropdown (`fileButton`) to switch between files while auto-saving the previous one (non-editable server configs are disabled with a reason tooltip).
4. **Modal dialog for nested subsections**: For 2nd-level or deeper nested objects, clicking "Edit ›" opens a centered modal dialog over the current screen while preserving background context, supporting Escape/Back navigation layer by layer.
5. **Adaptive narrow-screen stacked layout (`PanelOptionsList`)**: When the right panel width is `< 330` GUI pixels, option rows automatically switch from "left label + right widget (height 32)" to "top label + bottom widget (height 50)", with smooth marquee scrolling on hover for long button text (`FlatButton`).

---

## 2. Full Code Examples

### Case 1: Automatic via `@Config` Annotation (Recommended)

Simply specify `screenStyle = ConfigScreenStyle.SIDEBAR` in `@Config`, and `ConfigManager.register` handles client screen binding automatically:

```java
package com.example.mymod.config;

import dev.anvilcraft.lib.v2.config.Config;
import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import net.neoforged.fml.config.ModConfig;

@Config(
    name = "my_mod",
    type = ModConfig.Type.COMMON,
    screenStyle = ConfigScreenStyle.SIDEBAR
)
public class MyModCommonConfig {
    public int maxEnergy = 10000;
}
```

### Case 2: Manual Integration with Native `ModConfigSpec` via `ConfigScreens`

If your mod uses native `ModConfigSpec` instead of `@Config`, call `ConfigScreens.register` during client initialization:

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import dev.anvilcraft.lib.v2.config.client.ConfigScreens;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;

@Mod(value = "my_mod", dist = Dist.CLIENT)
public class MyModClient {
    public MyModClient(ModContainer container) {
        // Set all ModConfigSpecs of this mod to SIDEBAR style
        ConfigScreens.register(container, spec -> ConfigScreenStyle.SIDEBAR);
    }
}
```

---

## 3. Public Classes & API Reference

### 1. `ConfigScreens` (Client Config Screen Factory)

Located in `dev.anvilcraft.lib.v2.config.client.ConfigScreens`, **physical client only**.

| Method Signature | Return Type | Parameters & Behavior |
| :--- | :--- | :--- |
| `public static void register(ModContainer mod, Function<ModConfigSpec, ConfigScreenStyle> style)` | `void` | Registers NeoForge's `IConfigScreenFactory` extension point on `mod`. Internally delegates to `create(container, parent, style)`. |
| `public static Screen create(ModContainer mod, Screen parent, Function<ModConfigSpec, ConfigScreenStyle> style)` | `Screen` | Collects all `ModConfig`s under `mod` (sorted by `Type` and `FileName`):<br>• Filters configs using `SIDEBAR` via `style.apply(spec)`.<br>• If there is **exactly 1** editable config (`unavailableReason(config) == null`) and it uses `SIDEBAR`, returns `SidebarConfigScreen` directly.<br>• Otherwise returns `ConfigurationScreen` and overrides click behavior for `SIDEBAR` files to open `SidebarConfigScreen`. |
| `public static @Nullable Component unavailableReason(ModConfig config)` | `@Nullable Component` | Checks whether the given config file is currently non-editable, returning a localized reason component or `null` if editable.<br>Non-editable cases:<br>1. `config.getSpec()` is not a `ModConfigSpec` or `!spec.isLoaded()` → returns `ConfigurationScreen.TOOLTIP_CANNOT_EDIT_NOT_LOADED`;<br>2. `config.getType() == ModConfig.Type.SERVER` on a remote multiplayer server → returns `TOOLTIP_CANNOT_EDIT_THIS_WHILE_ONLINE`;<br>3. `config.getType() == ModConfig.Type.SERVER` in a LAN-opened singleplayer world → returns `TOOLTIP_CANNOT_EDIT_THIS_WHILE_OPEN_TO_LAN`. |

### 2. `SidebarConfigScreen` (Translucent Sidebar Config Screen)

Extends `net.neoforged.neoforge.client.gui.ConfigurationScreen.ConfigurationSectionScreen`.

| Constructor / Method Signature | Description |
| :--- | :--- |
| `public SidebarConfigScreen(ConfigurationScreen parent, ModConfig.Type type, ModConfig config, Component title)` | Public constructor for manually instantiating a single `ModConfig`. |
| `public void onClose()` | Handles closing in order: if an enum or file dropdown is open (`dropdownMenu != null`), closes only the dropdown; if inside a nested modal dialog (`!modalPath.isEmpty()`), flushes unsaved changes and pops the modal stack; if on the main sidebar page, calls `saveFile()` to persist changes, propagates `needsRestart`, and returns to the parent screen. |
| `public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick)` | Auto-closes dropdowns on outside clicks and fixes widget focus order after rebuilding buttons so keyboard focus does not remain on the background page when a modal opens. |
| `public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick)` | Overridden as a no-op to disable vanilla menu Gaussian blur and opaque dirt background textures. |
| `public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick)` | Renders the translucent sidebar background, title, left category list, right options list, nested modal overlay, and top-level dropdown menu, while syncing the active state of bottom "Undo" and "Reset" buttons. |

### 3. Package-Private Collaborators

Although these 3 classes are package-private (no direct external calls needed), understanding them helps when debugging layout or interaction behavior:

| Class | Core Responsibilities & Details |
| :--- | :--- |
| `ConfigTabs` | Scans top-level `ModConfigSpec` entries: groups all non-subtable leaf nodes into the General tab (`key = ""`, translation key `anvillib_config.ui.general`, placed first), and maps each `UnmodifiableConfig` subtable to an independent `Tab(key, entries, specs)` without altering underlying TOML paths or field order. |
| `PanelOptionsList` | Extends vanilla `OptionsList`, constraining option rows within the right panel or modal rectangle (fixing vanilla's centered scrollbar hit-box offset). Automatically enables `stacked` layout when panel width `< 330`; tracks live-applied sliders via `immediateSliders` so `applyUnsavedChanges()` does not forcibly round untouched unaligned manual values. |
| `FlatButton` | Extends vanilla `Button`, preserving keyboard navigation, click sounds, and narration while replacing the visuals with a flat dark block (selected state has a `2px` bright blue indicator bar `#73AEF5` on the left), supporting dropdown arrow rendering and smooth back-and-forth marquee scrolling on hover/selection for long text. |
