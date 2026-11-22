# UI Flexible Widget Library: Sprite Matrix, Themes & Render Scopes (`module.ui`)

<BranchContextCard branch="26.1" />

`module.ui` (artifact `anvillib-ui-neoforge-26.1`, package `dev.anvilcraft.lib.v2.ui`) is a client-side **nine-slice flexible button and pointer flyout rendering library** for GUIs.

When building custom GUIs, drawing separate fixed-size textures for every button, tab, and tooltip bubble causes an explosion of assets, while hand-coding hover, press-sink, toggle-held, and text-fit (`flexSize`) logic easily introduces flicker bugs. `module.ui` solves this with an orthogonal **4D sprite matrix (theme × 3D style × shadow depth × 5-state interaction variant)** and a reusable **`Renderer<S>.Scope`** model.

This module is split into 2 sub-documents by functionality:
- **This page (Sprite Matrix, Themes & `Renderer` Scope Base)**: Covers `AnvilLibUi`, `FlexibleSprites`, `SpriteTheme`, `SpriteStyle`, `SpriteType`, `SpriteVariant`, `PointerDirection`, and `Renderer<T>`.
- **[Buttons & Pointer Flyout Renderers](./buttons-and-flyouts)**: Covers `ButtonRenderer`, `FlyoutRenderer`, `ButtonType`, and `ButtonInput`.

---

## 1. Setup & Client-Side Restrictions

> **Physical Side Note**: `module.ui` is annotated with `@Mod(value = "anvillib_ui", dist = Dist.CLIENT)` and runs only on the physical client.

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-ui-neoforge-26.1:2.0.0")
}
```

---

## 2. 4D Sprite Matrix & Auto Padding Compensation (`FlexibleSprites`)

`FlexibleSprites` pre-generates all $2 \times 2 \times 3 \times 5 = 60$ nine-slice sprite combinations and their 4-way paddings (`leftPadding, topPadding, rightPadding, bottomPadding`) at class init using `FlattenLoop`:

| Dimension Enum | Values | Texture Path Segment (`getPath()`) & Visual Meaning |
| :--- | :--- | :--- |
| **Theme (`SpriteTheme`)** | `LIGHT` (default), `DARK` | `LIGHT` has no prefix (`""`); `DARK` uses `"dark"`. |
| **3D Style (`SpriteStyle`)** | `THREE_D` (default), `FLAT` | `THREE_D` has no prefix (`""`); `FLAT` uses `"flat"`. |
| **Shadow Type (`SpriteType`)** | `NON_SHADED` (default)<br>`SHADED_1PX`<br>`SHADED_2PX` | • `NON_SHADED`: no bottom 3D shadow; padding is always `[2, 2, 2, 2]`;<br>• `SHADED_1PX`: normal state has 1px bottom shadow (`[2, 2, 2, 3]`); when pressed, top padding thickens to 3px and bottom shrinks to 2px (`[2, 3, 2, 2]`), creating a crisp **1px button-depress effect**;<br>• `SHADED_2PX`: normal state has 2px bottom shadow (`[2, 2, 2, 4]`), `PRESSED` sinks 1px (`[2, 3, 2, 3]`), and `HIGHLIGHTED_PRESSING` sinks 2px (`[2, 4, 2, 2]`). |
| **Interaction Variant (`SpriteVariant`)** | `NORMAL` (default, no suffix)<br>`HIGHLIGHTED`<br>`PRESSED`<br>`HIGHLIGHTED_PRESSED`<br>`HIGHLIGHTED_PRESSING` | • `NORMAL`: resting state;<br>• `HIGHLIGHTED`: unselected and hovered;<br>• `PRESSED`: selected (toggle active) and unhovered;<br>• `HIGHLIGHTED_PRESSED`: selected and hovered;<br>• `HIGHLIGHTED_PRESSING`: mouse pressed inside button and held down. |

When `ButtonRenderer` draws text, the text origin automatically adds `info.leftPadding() + 1` and `info.topPadding() + 1`—so when pressing a `SHADED_1PX` or `SHADED_2PX` button shifts `topPadding` from `2` to `3` or `4`, **the button text automatically shifts down 1–2 pixels with the button face** with zero manual coordinate math!

---

## 3. Core Usage of `Renderer<T>` & `Renderer.Scope`

`Renderer<T>` separates **frame-invariant style/interaction config** (stored on `Renderer`) from **per-draw position, size, text, and mouse coordinates** (configured inside `try (var scope = renderer.open())`):

- One `ButtonRenderer` or `FlyoutRenderer` instance can call `.open()` dozens of times in a screen to draw identically styled buttons;
- Calling `renderer.onPress(mouseX, mouseY)` in `mouseClicked` and `renderer.onRelease()` in `mouseReleased` lets every button under that `Renderer` accurately check whether the press started inside itself (preventing accidental press state when dragging in from outside).

### Code Example: Reusable `Renderer` with `flexSize` Auto-Sizing

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.ui.flexible.ButtonRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.ButtonType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.joml.Vector2i;

public final class FlexibleRendererBasicExample {
    // Create a dark-theme, 2px-shaded momentary button renderer with hover and press feedback
    private static final ButtonRenderer DARK_MOMENTARY_BTN = new ButtonRenderer();

    static {
        DARK_MOMENTARY_BTN.dark()
            .shaded2px()
            .buttonType(ButtonType.MOMENTARY)
            .basedOnMouse();
    }

    public static void renderAdaptiveButton(GuiGraphicsExtractor graphics, int x, int y, int mouseX, int mouseY) {
        Font font = Minecraft.getInstance().font;

        // Open a Scope per draw (try-with-resources clears references to graphics etc. on close)
        try (ButtonRenderer.Scope scope = DARK_MOMENTARY_BTN.open()) {
            scope.graphics(graphics)
                .font(font)
                .pos(x, y)
                .mousePos(mouseX, mouseY)
                .literal("Auto-Fit Button")
                // flexSize(horizontal 6px, vertical 3px): computes total size from text width and nine-slice borders
                .flexSize(6, 3);

            // Query resolved dimensions before rendering for layout calculations
            Vector2i actualSize = scope.resolveSize();
            scope.render();
        }
    }
}
```

---

## 4. Public Classes & Enums API Reference

### 1. `FlexibleSprites`, `SpriteInfo` & `PointerSprite`

| Method / Record Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static SpriteInfo pickSprite(SpriteTheme theme, SpriteStyle style, SpriteType type, SpriteVariant variant)` | `SpriteInfo` | $O(1)$ bitmask lookup of the nine-slice sprite info for the given combination from the prebuilt table. |
| `public static @Nullable PointerSprite pickPointer(SpriteTheme theme, SpriteStyle style, SpriteType type, SpriteVariant variant, PointerDirection direction)` | `@Nullable PointerSprite` | Returns the flyout pointer texture and visible pixel dimensions for the combination and direction (`LEFT` / `RIGHT` / `UP` / `DOWN`), parsed via `NativeImage` on first read with 1px transparent borders trimmed and cached. |
| `record SpriteInfo(Identifier sprite, int leftPadding, int topPadding, int rightPadding, int bottomPadding, int pointerUpInset)` | `record` | Nine-slice sprite ID, 4-way border paddings, and extra downward pixel offset `pointerUpInset` for upward-pointing pointers outside top shadow bands. |
| `record PointerSprite(Identifier texture, int width, int height, int pointerUpInset)` | `record` | Pointer texture path, visible content width/height, and `pointerUpInset`. |

### 2. `Renderer<T>` Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `dark()` / `flat()` / `shaded1px()` / `shaded2px()` | `Renderer<T>` | Switches to dark theme (default light), flat style (default 3D), or 1px / 2px shadow (default non-shaded). |
| `highlighted()` / `highlightedPressed()` / `highlightedPressing()` / `pressed()` | `Renderer<T>` | Locks the renderer to a static visual variant (ignoring mouse state). |
| `buttonType(ButtonType buttonType)` | `Renderer<T>` | Sets button interaction mode (`DISPLAY`, `CLICK`, `MOMENTARY`, `TOGGLE`; default `DISPLAY`). |
| `toggleState(BooleanSupplier toggleState)` | `Renderer<T>` | Sets the callback supplying external selected state when `buttonType == ButtonType.TOGGLE`. |
| `basedOnMouse()`<br>`basedOnMouse(IntSet allowedKeys)` | `Renderer<T>` | Enables dynamic variant derivation from mouse position and button state (no-arg overload allows `GLFW_MOUSE_BUTTON_LEFT` and `GLFW_MOUSE_BUTTON_RIGHT`). |
| `alpha(float alpha)` | `Renderer<T>` | Sets overall opacity `[0.0f, 1.0f]` (applies to nine-slice body, pointer, and text; `NaN` is safely ignored). |
| `onPress(int x, int y)` / `onPress(Vector2f pos)`<br>`onRelease()` | `void` | Records or clears `startPressMousePos` on mouse press/release. |
| `variantOf(T scope)` / `open()` | `SpriteVariant` / `T` | Resolves the current variant for `scope`, or opens a new draw `Scope`. |

### 3. `Renderer<T>.Scope` Methods

Implements `AutoCloseable`.

| Method Signature | Return Type | Description & Validation |
| :--- | :--- | :--- |
| `graphics(GuiGraphicsExtractor)` / `font(Font)` | `Scope` | Sets the current frame's `GuiGraphicsExtractor` (required) and `Font` for text rendering. |
| `pos(int x, int y)` / `pos(Vector2i pos)` | `Scope` | Sets the widget's top-left screen coordinates (required). |
| `mousePos(int x, int y)` / `mousePos(Vector2f pos)` | `Scope` | Sets current mouse coordinates (required when `basedOnMouse` is enabled and `buttonType != DISPLAY`; missing throws `IllegalStateException` on `render()`). |
| `size(int width, int height)` / `size(Vector2i size)` | `Scope` | Sets fixed pixel width and height. |
| `flexSize(int padding)`<br>`flexSize(int horizontalPadding, int verticalPadding)`<br>`flexSize(int left, int top, int right, int bottom)` | `Scope` | Dynamically computes width/height from `font`, `text` width/line height, current variant's nine-slice paddings, and extra padding (`font` and `text` must be set, else throws `IllegalStateException`). |
| `text(Component)` / `literal(String)` / `translatable(String, [Object...])` / `translatableWithFallback(String, String, [Object...])` | `Scope` | Sets the text component displayed inside the button/flyout (text color comes from `Component`'s `Style#getColor()`, defaulting to white `0xFFFFFFFF`). |
| `textOffset(int offsetX, int offsetY)` / `textOffset(Vector2i)` | `Scope` | Sets extra pixel offset for text relative to the nine-slice padding origin (`flexSize` sets `textOffset` to `(leftPadding, topPadding)` automatically). |
| `resolveSize()` / `contains(@Nullable Vector2f point)` | `@Nullable Vector2i` / `boolean` | Returns resolved width/height, or hit-tests `point` against the widget bounds (hit testing always uses `SpriteVariant.NORMAL` padding to avoid infinite recursion with `basedOnMouse`). |
| `render()` / `close()` | `Scope` / `void` | Validates required parameters and draws, or closes the scope and clears internal references. |
