# Font Config & Test Screen Widgets (`dev.anvilcraft.lib.v2.font.screen`)

<BranchContextCard branch="26.3" />

The `dev.anvilcraft.lib.v2.font.screen` and `dev.anvilcraft.lib.v2.font.data` packages provide `anvillib_font`'s built-in client font selection screen (`FontConfigScreen`), multi-style render test page (`FontTestScreen`), scroll-capable dropdown widget with occlusion shielding (`Dropdown`), and UI language data generator (`AnvilLibFontData`).

These classes are marked `@ApiStatus.Internal`; players can select `AnvilLib Font` in NeoForge's Mods menu and click "Config" to switch the global SDF rendering font.

---

## 1. Screen Widget Structure & Interaction Flow

1. **`FontConfigScreen` (Main Font Config Screen)**:
   - The top bar renders the currently selected font family and weight name live via `guiGraphics.anvillib$centeredText(AnvilLibFont.getSelectFont(), ...)`;
   - Provides two linked `Dropdown` widgets: selecting a "Font Family" in the upper dropdown calls `FontManager.INSTANCE.getFamilyFontNames(family)` to refresh the lower "Font" dropdown's options, and immediately writes to `AnvilLibFont.CONFIG.setFontFamily` / `setFont` (`config/anvillib/anvillib_font-client.json`);
   - Clicking the `Font Test` button at the top opens `FontTestScreen`.
2. **`FontTestScreen` (Multi-Language & Multi-Style Test Page)**:
   - Uses the selected SDF font to display 10 lines of test text covering Simplified Chinese, Traditional Chinese, English, Japanese kana, digits, and punctuation, verifying red/green/dark-purple colors, `withBold`, `withItalic`, bold-italic, `withUnderlined`, `withStrikethrough`, and dynamic `withObfuscated` rendering.
3. **`Dropdown` (Scrollable Dropdown with Occlusion Shielding)**:
   - When multiple `Dropdown`s are stacked vertically, an expanded upper dropdown overlaps lower ones. `Dropdown` uses `Dropdown.Shielding(x1, y1, x2, y2, dropdown)` to notify the parent screen: while expanded, any other `Dropdown` occluded by its menu rectangle returns `false` in `isMouseOver`, preventing click-through onto underlying widgets.

---

## 2. Class & API Summary (`@ApiStatus.Internal`)

### 1. `FontConfigScreen` & `FontTestScreen`

| Class | Constructor & Core Methods | Description |
| :--- | :--- | :--- |
| `FontConfigScreen` | `public FontConfigScreen(final ModContainer ignored, final Screen parent)` | Registered on `ModContainer` by `AnvilLibFont` via `IConfigScreenFactory`. Manages the font family dropdown, specific font dropdown, and test screen button. |
| `FontTestScreen` | `protected FontTestScreen(final Screen parent)` | Renders 10 lines of SDF test text with different `Style` combinations across CJK, English, and symbols; pressing `ESC` returns to `FontConfigScreen`. |

### 2. `Dropdown` (`dev.anvilcraft.lib.v2.font.screen.widget.Dropdown`)

Extends `net.minecraft.client.gui.components.AbstractWidget`.

| Constructor / Method / Inner Record Signature | Description |
| :--- | :--- |
| `public Dropdown(int x, int y, int width, int height, int screenWidth, int screenHeight, Component message)` | Constructs a dropdown widget, taking screen dimensions to compute maximum available expanded height. |
| `public void setAllow(List<DropdownEntry> allows)` | Sets candidate entries and resets `scrollOffset = 0`; if the previous selection is absent from the new list, selects the first item (or `null` if empty). |
| `public void setValue(@Nullable DropdownEntry value)` / `setValue(@Nullable String value)` | Sets the selected item by `DropdownEntry` or string `id` (does not fire `onValueChanged`). |
| `public @Nullable DropdownEntry getValue()` / `public @Nullable String getValueId()` | Returns the currently selected `DropdownEntry` or its string `id`. |
| `public void setOnValueChanged(Consumer<@Nullable DropdownEntry> callback)` | Sets the callback invoked when the user clicks to change the selected option. |
| `public void setOnShieldingAdd(Consumer<Shielding>)` / `setOnShieldingRemove(Runnable)` / `setShieldingGetter(Supplier<@Nullable Shielding>)` | Binds callbacks to register, remove, and query the expanded list's occlusion shielding region, preventing mouse click-through between stacked dropdowns. |
| `public int calcMaxHeight()` | Computes the maximum height of the expanded list within remaining bottom screen space (floored to a multiple of `getHeight()` to avoid clipped half-rows). |
| `public record DropdownEntry(Component desc, String id)` | Dropdown entry data record. Provides `DropdownEntry.create(String id)` (using translation key `dropdown.anvillib_font.<id>`) and `DropdownEntry.create(String desc, String id)` (using `Component.literal(desc)`). |
| `public record Shielding(double x1, double y1, double x2, double y2, Dropdown dropdown)` | Records the screen rectangle occupied by an expanded list. `isShielding(x, y, dropdown)` returns whether coordinates fall inside the shielding box for any other dropdown. |

### 3. `AnvilLibFontData` (`dev.anvilcraft.lib.v2.font.data.AnvilLibFontData`)

| Class / Method Signature | Description |
| :--- | :--- |
| `public class AnvilLibFontData` / `public static class AnvilLibFontLanguageProvider extends LanguageProvider` | Listens to `GatherDataEvent.Client` for `anvillib_font`, generating the 6 English translation keys for the config screen and dropdown narration (`screen.anvillib_font.config`, `screen.anvillib_font.config.family`, `screen.anvillib_font.config.font`, `screen.anvillib_font.config.test`, `narration.anvillib_font.dropdown.expanded`, `narration.anvillib_font.dropdown.collapsed`). |
