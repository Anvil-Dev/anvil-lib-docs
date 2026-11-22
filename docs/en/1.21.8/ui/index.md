# Sprite Themes, 5-State Variants & Base Renderer

`module.ui` provides a flexible widget rendering library (`dev.anvilcraft.lib.v2.ui.flexible`) not tied to vanilla's fixed texture dimensions, supporting auto-sizing to text width, light/dark themes, 3D/flat border styles, and complete 5-state mouse interaction variant resolution.

## Module Info

- Mod ID: `anvillib_ui` (`AnvilLibUi.MODID`)
- Resource path helper: `AnvilLibUi.location(String path)`

## Sprite Matrix Dimensions: `FlexibleSprites`

`FlexibleSprites` addresses every nine-slice button or flyout background along four orthogonal dimensions:

| Dimension Enum | Values | Sprite Naming & Visual Meaning |
| --- | --- | --- |
| `SpriteTheme` | `LIGHT("")`, `DARK("dark")` | Light (no prefix) or dark background theme |
| `SpriteStyle` | `THREE_D("")`, `FLAT("flat")` | Raised 3D border (no prefix) or modern flat style |
| `SpriteType` | `NON_SHADED`, `SHADED_1PX`, `SHADED_2PX` | Controls 4-way padding and bottom/top shadow thickness (pressed states shift shadow to the top edge for a depressed feel) |
| `SpriteVariant` | `NORMAL("")`, `HIGHLIGHTED`, `PRESSED`, `HIGHLIGHTED_PRESSED`, `HIGHLIGHTED_PRESSING` | 5 interaction states: normal, hovered, selected, selected+hovered, hovered+pressing |

Helper static methods & records:
- `FlexibleSprites.pickSprite(SpriteTheme, SpriteStyle, SpriteType, SpriteVariant)`: computes the resolved `SpriteInfo(ResourceLocation sprite, int paddingTop, int paddingBottom, ...)`.
- `FlexibleSprites.pickPointer(SpriteTheme, SpriteStyle, SpriteVariant, PointerDirection)`: computes the flyout pointer's `PointerSprite(ResourceLocation texture, int width, int height, int pointerUpInset)`.

## Interaction State Machine: `ButtonType` & `ButtonInput`

Instead of manually writing `if (hovered && pressed ...)`, specify a `ButtonType` to map live mouse and boolean toggle states to `SpriteVariant`:

```java
public record ButtonInput(boolean toggleState, boolean hovered, boolean pressed, boolean startedInBounds) {}
```

| `ButtonType` Value | Widget Use Case | 5-State Behavior |
| --- | --- | --- |
| `DISPLAY` | Display-only panels, tab badges | Ignores mouse position and press state; always returns `NORMAL` |
| `MOMENTARY` | Momentary action buttons | Returns `HIGHLIGHTED` on hover, `HIGHLIGHTED_PRESSING` when pressed from inside the widget |
| `TOGGLE` | Persistent toggles / tabs | Reads `toggleState` for `PRESSED` or `HIGHLIGHTED_PRESSED`, plus `HIGHLIGHTED_PRESSING` while held |
| `CLICK` | Standard click submit buttons | Combines immediate press and hover feedback during clicks |

`buttonType.variant(ButtonInput)` returns the resolved `SpriteVariant`.

## Abstract Base Renderer: `Renderer<T extends Scope>` & `Scope`

`Renderer` holds invariant appearance config and interaction bindings (reusable across frames in a screen without per-frame allocations); each draw calls `renderer.open()` to open an `AutoCloseable` temporary `Scope`, sets position, font, text, and mouse position, calls `.render()`, and lets `try-with-resources` release frame references to `GuiGraphics` etc.

### `Renderer<T>` Configuration & Input Forwarding API

| Method | Description |
| --- | --- |
| `dark()` | Switches to dark theme `SpriteTheme.DARK` |
| `flat()` | Switches to flat style `SpriteStyle.FLAT` |
| `shaded1px()` / `shaded2px()` | Switches border shadow thickness |
| `highlighted()` / `pressed()` / `highlightedPressed()` / `highlightedPressing()` | Locks to a static display variant (overrides dynamic mouse derivation) |
| `buttonType(ButtonType)` | Sets `ButtonType`, independent of `basedOnMouse(...)` call order |
| `toggleState(BooleanSupplier)` | Binds external selected-state supplier for `TOGGLE` buttons, read each frame |
| `alpha(float alpha)` | Sets overall opacity `[0.0F, 1.0F]` (`NaN` is ignored, keeping previous value); tints sprites and text directly |
| `basedOnMouse()` / `basedOnMouse(IntSet allowedKeys)` | Enables mouse-driven 5-state transitions; no-arg defaults to left and right mouse buttons |
| `onPress(int x, int y)` / `onPress(Vector2f pos)` / `onRelease()` | Forwards press start position and release in `Screen#mouseClicked` and `#mouseReleased` to accurately track whether press started inside |
| `variantOf(T scope)` | Queries the final resolved `SpriteVariant` for the current `Scope` state |
| `open()` | Opens a frame-level render scope `T` |

### `Renderer.Scope` Common Fluent Methods

| Method | Description |
| --- | --- |
| `graphics(GuiGraphics)` / `font(Font)` | Passes target `GuiGraphics` and `Font` |
| `pos(int x, int y)` / `pos(Vector2i)` | Sets top-left screen coordinates |
| `mousePos(int x, int y)` / `mousePos(Vector2f)` | Sets current mouse coordinates (required when non-`DISPLAY` `basedOnMouse` is enabled) |
| `size(int width, int height)` / `size(Vector2i)` | Sets fixed pixel width and height |
| `flexSize(int padding)` / `flexSize(hPad, vPad)` / `flexSize(left, top, right, bottom)` | Auto-computes total size from text width and sprite shadow paddings |
| `literal(String)` / `translatable(String[, args...])` / `translatableWithFallback(...)` / `text(Component)` | Sets rendered text |
| `textOffset(int, int)` / `textOffset(Vector2i)` | Fine-tunes text render offset |
| `contains(@Nullable Vector2f point)` | Hit-tests the widget's bounding box |
| `render()` | Submits sprite background and centered text draw |
| `close()` | Releases frame references inside the scope |
