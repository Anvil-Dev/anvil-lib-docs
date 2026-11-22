# Sprite Themes, 5-State Variants & Base Renderer

`module.ui` (Mod ID: `anvillib_ui`) provides a lightweight **client-side flexible widget rendering library (`dev.anvilcraft.lib.v2.ui.flexible`)** for NeoForge 1.21.1. Using a nine-slice sprite lookup table (`FlexibleSprites`) and a **configured `Renderer` + per-frame `Scope`** separation model, it effortlessly draws auto-sizing 3D/flat buttons, dual-theme toggles, and pointer flyouts.

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

### Entry & Client Restrictions

- **`AnvilLibUi`**: Marked `@Mod(value = AnvilLibUi.MOD_ID, dist = Dist.CLIENT)` (`MOD_ID = "anvillib_ui"`), providing `AnvilLibUi.of(String path)` for `anvillib_ui:<path>` resource locations.
- All classes in this module belong to the client rendering domain and may only be used on `Dist.CLIENT` render paths.

## Design Philosophy: 4D Sprite Lookup & Scope Lifecycle

### 1. 4D Addressing of Nine-Slice Sprites

All built-in flexible widget sprite paths follow `anvillib_ui:flex_button/<theme><style><type><variant>`, uniquely determined by 4 orthogonal enums:

| Dimension | Enum | Values & Path Segments (`getPath()`) | Design Semantics |
| --- | --- | --- | --- |
| **Theme** | `SpriteTheme` | `LIGHT` (`""`), `DARK` (`"dark"`) | Light/dark panel color scheme |
| **Style** | `SpriteStyle` | `THREE_D` (`""`), `FLAT` (`"flat"`) | Raised bevel border / flat style |
| **Shadow** | `SpriteType` | `NON_SHADED`, `SHADED_1PX`, `SHADED_2PX` | Controls bottom shadow pixels; pressed states shift bottom shadow to top padding for a "depressed" look |
| **Variant** | `SpriteVariant` | `NORMAL` (`""`), `HIGHLIGHTED`, `PRESSED`, `HIGHLIGHTED_PRESSED`, `HIGHLIGHTED_PRESSING` | Normal, hovered, selected, selected+hovered, hovered+pressing |

`FlexibleSprites` precomputes nine-slice paddings (`left/top/right/bottomPadding`) and upward pointer inset (`pointerUpInset = max(0, topPadding - 2)`) for all 4D combinations at class init with zero per-frame allocation.

### 2. Lifecycle Separation Between `Renderer` and `Scope`

- **`Renderer<T extends Scope>`** (long-lived): holds widget appearance settings (theme, style, type, button mode, `BooleanSupplier` toggle state, press start pos, and current `alpha`), reusable across frames as a `Screen` field.
- **`Renderer.Scope`** (per-frame short-lived, implements `AutoCloseable`): binds per-draw dynamic context (`GuiGraphics`, `pos`, `size` / `flexSize`, `mousePos`, `font`, `text`, `textOffset`).
  - **Recommended pattern**: `try (var scope = renderer.open()) { ... scope.render(); }` each frame. Exiting clears references to `graphics`, `font`, `text`, etc. to prevent leaks.
  - **Press/hit-test cycle guard**: `flexSize(...)` generates separate variant-bound draw `size` and fixed-`NORMAL` `hitSize` functions, preventing infinite recursion when `basedOnMouse` calls `contains` -> `size` -> variant. Consequently, shaded buttons depress visually by 1px while keeping `NORMAL` hit-test height for anti-flicker stability.

## Full Public API Reference

### 1. `AnvilLibUi`

Package: `dev.anvilcraft.lib.v2.ui`

| Member Signature | Description |
| --- | --- |
| `public static final String MOD_ID = "anvillib_ui"` | Module Mod ID |
| `static ResourceLocation of(String path)` | Creates `anvillib_ui:<path>` resource location |

### 2. Core Enums & `FlexibleSprites`

Package: `dev.anvilcraft.lib.v2.ui.flexible`

| Type / Method Signature | Description |
| --- | --- |
| `enum SpriteTheme` (`LIGHT`, `DARK`) | Provides `getPath()` (`""` / `"dark"`) |
| `enum SpriteStyle` (`THREE_D`, `FLAT`) | Provides `getPath()` (`""` / `"flat"`) |
| `enum SpriteType` (`NON_SHADED`, `SHADED_1PX`, `SHADED_2PX`) | Provides `getPath()` (`"non_shaded"` / `"shaded_1px"` / `"shaded_2px"`) |
| `enum SpriteVariant` (`NORMAL`, `HIGHLIGHTED`, `PRESSED`, `HIGHLIGHTED_PRESSED`, `HIGHLIGHTED_PRESSING`) | Provides `getPath()` |
| `enum PointerDirection` (`LEFT`, `RIGHT`, `UP`, `DOWN`) | Provides `getPath()` (`"left"` / `"right"` / `"up"` / `"down"`) |
| `static SpriteInfo FlexibleSprites.pickSprite(SpriteTheme, SpriteStyle, SpriteType, SpriteVariant)` | Returns the exact matching body sprite and padding `SpriteInfo` |
| `static @Nullable PointerSprite FlexibleSprites.pickPointer(SpriteTheme, SpriteStyle, SpriteType, SpriteVariant, PointerDirection)` | Loads and caches `textures/gui/pointer/...png` visible dimensions (trimming `1px` transparent margin on all 4 sides); returns `null` if that variant texture is absent |
| `record SpriteInfo(ResourceLocation sprite, int leftPadding, int topPadding, int rightPadding, int bottomPadding, int pointerUpInset)` | Also provides a 5-arg compat constructor (defaulting `pointerUpInset = 0`) |
| `record PointerSprite(ResourceLocation texture, int width, int height, int pointerUpInset)` | Pointer texture path and visible pixel dimensions |

### 3. `Renderer<T extends Renderer<T>.Scope>` & `Renderer.Scope`

Package: `dev.anvilcraft.lib.v2.ui.flexible`

#### `Renderer<T>` Appearance & Interaction Configuration Methods

| Method Signature | Description |
| --- | --- |
| `getTheme()` / `getStyle()` / `getType()` / `getAlpha()` | Lombok `@Getter` property accessors |
| `Renderer<T> dark()` | Switches to dark theme `SpriteTheme.DARK` |
| `Renderer<T> flat()` | Switches to flat style `SpriteStyle.FLAT` |
| `Renderer<T> shaded1px()` / `shaded2px()` | Switches to `SHADED_1PX` / `SHADED_2PX` shadow type |
| `Renderer<T> highlighted()` / `pressed()` / `highlightedPressed()` / `highlightedPressing()` | Locks this renderer to a static variant (overriding mouse derivation) |
| `Renderer<T> buttonType(ButtonType buttonType)` | Sets button interaction mode (default `ButtonType.DISPLAY`) |
| `Renderer<T> toggleState(BooleanSupplier toggleState)` | Binds selected-state supplier for `ButtonType.TOGGLE` (default `() -> false`) |
| `Renderer<T> alpha(float alpha)` | Sets overall opacity clamped to `[0.0F, 1.0F]`; ignores `NaN` to prevent fade flicker |
| `Renderer<T> basedOnMouse()` | Enables mouse-adaptive interaction (allows left and right click press feedback) |
| `Renderer<T> basedOnMouse(IntSet allowedKeys)` | Enables mouse-adaptive interaction with custom allowed GLFW mouse button codes |
| `void onPress(int x, int y)` / `onPress(Vector2f pos)` | Called in `Screen#mouseClicked` to record press start coordinates |
| `void onRelease()` | Called in `Screen#mouseReleased` to clear press start coordinates |
| `SpriteVariant variantOf(T scope)` | Evaluates the `SpriteVariant` for `scope` without drawing |
| `abstract T open()` | Opens a single-frame draw scope |

#### `Renderer.Scope` Fluent Config & Draw Methods (`implements AutoCloseable`)

| Method Signature | Description |
| --- | --- |
| `Scope graphics(GuiGraphics graphics)` | Binds this frame's `GuiGraphics` (required) |
| `Scope font(Font font)` | Binds the `Font` used for text drawing and `flexSize` calculation |
| `Scope pos(int x, int y)` / `pos(Vector2i pos)` | Sets top-left pixel coordinates (required) |
| `Scope mousePos(int x, int y)` / `mousePos(Vector2f pos)` | Binds this frame's mouse coordinates (required when `basedOnMouse` and not `DISPLAY`) |
| `Scope size(int width, int height)` / `size(Vector2i size)` | Manually sets fixed rectangle dimensions (mutually exclusive with `flexSize`; one is required) |
| `Scope flexSize(int padding)` / `(horizontalPadding, verticalPadding)` / `(left, top, right, bottom)` | Auto-computes dimensions from `font` + `text` size, extra padding, and sprite border thickness, and sets `textOffset` automatically |
| `Scope literal(String)` / `translatable(...)` / `translatableWithFallback(...)` / `text(Component)` | Sets the text component for drawing and measurement |
| `Scope textOffset(int x, int y)` / `textOffset(Vector2i)` | Manually sets extra text offset inside top-left padding (call **after** `flexSize`, since `flexSize` overwrites it) |
| `@Nullable Vector2i resolveSize()` | Returns resolved render dimensions, or `null` if neither `size` nor `flexSize` was called |
| `boolean contains(@Nullable Vector2f point)` | Checks whether `point` falls inside this widget's hit box (using `hitSize`) |
| `Scope render()` | Validates all required fields (throws `IllegalStateException` if missing), executes subclass draw, and returns `this` |
| `void close()` | Clears frame-held references and releases the scope |
