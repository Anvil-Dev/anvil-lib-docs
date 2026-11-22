# Font Config & Test Screens (`dev.anvilcraft.lib.v2.font.screen`)

<BranchContextCard branch="1.21.11" />

`module.font` includes a visual client font config screen **`FontConfigScreen`**, a multi-language/multi-style layout test screen **`FontTestScreen`**, and a general-purpose scrollable dropdown widget **`Dropdown`** with click-shielding.

Players can open **Mods -> AnvilLib Font (`anvillib_font`) -> Config** from the main menu to switch system font families and weights and preview SDF rendering live.

---

## 1. Screen & Dropdown Widget API Reference

### 1. `FontConfigScreen` & `FontTestScreen` (`@ApiStatus.Internal`)

| Class | Constructor Signature | Description |
| :--- | :--- | :--- |
| **`FontConfigScreen`** | `public FontConfigScreen(final ModContainer ignored, final Screen parent)` | Main font config screen registered on `IConfigScreenFactory`. Provides linked "Family" and "Font" dropdowns, previews the selected font live via `guiGraphics.anvillib$centeredText`, and auto-saves to `config/anvillib/anvillib_font-client.json` on change. |
| **`FontTestScreen`** | `public FontTestScreen(final Screen parent)` | Entered via the "Font Test" button on the config screen. Side-by-side comparison of **vanilla bitmap font (`GuiGraphics#drawString`)** vs **AnvilLib SDF font (`GuiGraphics#anvillib$*`)** across plain text, colored bold/italic/underline/strikethrough `Component`s, obfuscated text, centered text, backdrop text, and English/Chinese word wrap. |

---

### 2. `Dropdown` (Scrollable Dropdown with Occlusion Shielding)

Located in `dev.anvilcraft.lib.v2.font.screen.widget.Dropdown` (marked `@Beta`), extending `AbstractWidget` and implementing `Renderable`, `GuiEventListener`, and `NarratableEntry` (adapted to `1.21.11` `GuiGraphics` and 2D transform semantics).

#### Key Inner Records & Interfaces

- `Dropdown.DropdownEntry(String id, Component label)`: dropdown item record with static factories:
  - `DropdownEntry.create(String id, Component label)`
  - `DropdownEntry.create(String id, String label)`
- `Dropdown.Shielding`: occlusion shield blocking hover and click events on underlying widgets outside the expanded dropdown area.

#### Public Constructors & Methods

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public Dropdown(int x, int y, int width, int height, int screenWidth, int screenHeight, Component message)`<br>`public Dropdown(int x, int y, int width, int height, int screenWidth, int screenHeight, Component message, List<DropdownEntry> allow)` | `Dropdown` | Creates a dropdown widget (popup max height `120px`, row height `18px`, automatically expanding downward or upward based on `screenHeight`). |
| `public void setAllow(List<DropdownEntry> allow)` | `void` | Updates candidate entries, switching to the first entry if the current selection is absent. |
| `public @Nullable DropdownEntry getValue()` / `public String getValueId()` | `DropdownEntry` / `String` | Returns the selected entry or its ID (`getValueId()` returns `""` when unselected). |
| `public void setValue(@Nullable DropdownEntry value)` / `public void setValue(@Nullable String id)` | `void` | Sets the current selection (fires `onValueChanged` if changed and set). |
| `public void setOnValueChanged(@Nullable Consumer<@Nullable DropdownEntry> onValueChanged)` | `void` | Sets the selection change listener. |
| `public void setPlaceholder(Component placeholder)` | `void` | Sets placeholder text when nothing is selected (defaults to `"Select..."`). |
| `public void setMaxPopupHeight(int maxPopupHeight)` | `void` | Sets max popup height in pixels (clamped to at least one row `18px`). |
| `public void setOnShieldingAdd(Consumer<Shielding>)`<br>`public void setOnShieldingRemove(Runnable)`<br>`public void setShieldingGetter(Supplier<Shielding>)` | `void` | Binds parent `Screen` shielding callbacks to prevent click-through between multiple dropdowns. |
