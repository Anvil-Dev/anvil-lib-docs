# Button & Pointer Flyout Renderers (`ButtonRenderer` / `FlyoutRenderer` / `ButtonType`)

<BranchContextCard branch="26.1" />

Building on `Renderer<T>`, `module.ui` provides two concrete renderers:
1. **`ButtonRenderer`**: A nine-slice flexible button renderer supporting 4 interaction behavior modes (`ButtonType`);
2. **`FlyoutRenderer`**: Extends `ButtonRenderer`; alongside drawing the nine-slice body and text, draws a matching **Pointer** arrow on any outer edge (top, bottom, left, or right) with the same theme, style, shadow, and variant, sliding smoothly along the edge by a `0.0f–1.0f` percentage.

---

## 1. Four Button Behavior Modes (`ButtonType`) & State Transition Table

`ButtonType#variant(ButtonInput)` defines the mapping from `ButtonInput(boolean selected, boolean hovering, boolean allowedPressed, boolean pressStartedInside)` to visual `SpriteVariant`:

| `ButtonType` Value | Use Case | State Derivation Rule |
| :--- | :--- | :--- |
| **`DISPLAY`** | Display-only panels, info labels, non-interactive flyouts | Always returns `SpriteVariant.NORMAL` (ignores mouse position; no need to pass `mousePos` in `Scope`). |
| **`CLICK`** | Lightweight buttons needing hover highlight without press-sink animation | Returns `HIGHLIGHTED` when `hovering == true`, else `NORMAL`. |
| **`MOMENTARY`** | Standard momentary action buttons (trigger on click, release back to normal) | • When `pressStartedInside && hovering && allowedPressed` (pressed inside this button and mouse still held inside), returns **`HIGHLIGHTED_PRESSING`** (fully depressed);<br>• Otherwise returns `HIGHLIGHTED` if `hovering == true`, else `NORMAL`. |
| **`TOGGLE`** | Toggle switches, radio/multi-select tabs (reads `toggleState`) | • When `pressStartedInside && hovering && allowedPressed`, returns **`HIGHLIGHTED_PRESSING`**;<br>• When `!hovering`: returns **`PRESSED`** if `selected == true`, else `NORMAL`;<br>• When `hovering`: returns **`HIGHLIGHTED_PRESSED`** if `selected == true`, else `HIGHLIGHTED`. |

> **Anti-Flicker Interaction Detail**:
> Whenever `hovering == true`, the button stays cleanly highlighted regardless of whether other mouse buttons are held or the cursor dragged in from another button on the same `Renderer`; `HIGHLIGHTED_PRESSING` is only entered if `startPressMousePos` actually originated inside this button.

---

## 2. Full Code Example: Using a `TOGGLE` Button & Pointer `FlyoutRenderer` in a `Screen`

```java
package com.example.mymod.client.gui.screen;

import dev.anvilcraft.lib.v2.ui.flexible.ButtonRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.ButtonType;
import dev.anvilcraft.lib.v2.ui.flexible.FlyoutRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.PointerDirection;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

public class FlexibleDemoScreen extends Screen {
    private boolean autoOutputEnabled = false;

    // 1. Define a TOGGLE button renderer bound to autoOutputEnabled
    private final ButtonRenderer toggleBtnRenderer = new ButtonRenderer();

    // 2. Define a dark-theme Flyout renderer with 1px shadow
    private final FlyoutRenderer tooltipFlyoutRenderer = new FlyoutRenderer();

    public FlexibleDemoScreen() {
        super(Component.literal("Flexible UI Demo"));

        this.toggleBtnRenderer
            .shaded2px()
            .buttonType(ButtonType.TOGGLE)
            .toggleState(() -> this.autoOutputEnabled)
            .basedOnMouse();

        this.tooltipFlyoutRenderer
            .dark()
            .shaded1px()
            .buttonType(ButtonType.DISPLAY);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);

        int btnX = this.width / 2 - 50;
        int btnY = this.height / 2 - 10;

        // Draw TOGGLE button
        try (ButtonRenderer.Scope scope = this.toggleBtnRenderer.open()) {
            scope.graphics(graphics)
                .font(this.font)
                .pos(btnX, btnY)
                .size(100, 20)
                .mousePos(mouseX, mouseY)
                .text(Component.literal(this.autoOutputEnabled ? "Auto-Output: ON" : "Auto-Output: OFF")
                    .withStyle(this.autoOutputEnabled ? ChatFormatting.GREEN : ChatFormatting.GRAY))
                .textOffset(10, 4)
                .render();

            // If mouse hovers the button, draw a flyout above it with PointerDirection.DOWN centered at 0.5f
            if (scope.contains(new org.joml.Vector2f(mouseX, mouseY))) {
                try (FlyoutRenderer.Scope flyout = this.tooltipFlyoutRenderer.open()) {
                    flyout.graphics(graphics)
                        .font(this.font)
                        .pos(btnX, btnY - 28)
                        .literal("Click to toggle automatic bottom item ejection")
                        .flexSize(6, 4)
                        .pointer(PointerDirection.DOWN, 0.5f)
                        .render();
                }
            }
        }
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        this.toggleBtnRenderer.onPress((int) event.x(), (int) event.y());
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        int btnX = this.width / 2 - 50;
        int btnY = this.height / 2 - 10;
        if (event.x() >= btnX && event.x() < btnX + 100 && event.y() >= btnY && event.y() < btnY + 20) {
            this.autoOutputEnabled = !this.autoOutputEnabled;
        }
        this.toggleBtnRenderer.onRelease();
        return super.mouseReleased(event);
    }
}
```

---

## 3. Public Classes API Reference

### 1. `ButtonRenderer` & `ButtonRenderer.Scope`

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static int textColor(Component text)` | `int` | Extracts `text.getStyle().getColor()` with opaque alpha `0xFF000000`, defaulting to pure white `0xFFFFFFFF` if unset. |
| `public static int color(float alpha)` | `int` | Converts `[0.0f, 1.0f]` opacity to a white ARGB integer (for tinting nine-slice sprites and pointers). |
| `public static int textColor(Component text, float alpha)` | `int` | Combines `text`'s RGB color with `alpha` opacity. |
| `public ButtonRenderer.Scope open()` | `ButtonRenderer.Scope` | Opens a button draw scope. |

### 2. `FlyoutRenderer`, `FlyoutRenderer.Scope` & `PointerDirection`

`FlyoutRenderer` extends `ButtonRenderer`.

| Class / Method Signature | Return Type | Description & Validation |
| :--- | :--- | :--- |
| `PointerDirection` | `enum` | Which edge of the flyout body the pointer attaches to: `LEFT` (left edge pointing left), `RIGHT` (right edge pointing right), `UP` (top edge pointing up), `DOWN` (bottom edge pointing down). |
| `FlyoutRenderer.Scope#pointer(PointerDirection direction, float percent)` | `FlyoutRenderer.Scope` | Sets both pointer `direction` and edge slide `percent` (`[0.0f, 1.0f]`, automatically inset by `POINTER_MARGIN = 2px` at both ends so the pointer stays within the body bounds). |
| `FlyoutRenderer.Scope#pointerDirection(PointerDirection direction)`<br>`FlyoutRenderer.Scope#pointerPercent(float percent)` | `FlyoutRenderer.Scope` | Sets direction and percentage separately. **Note**: setting only one without the other throws `IllegalStateException("Some arguments are missing or invalid: pointerDirection / pointerPercent")` on `render()`; setting neither degrades to a plain `ButtonRenderer` without a pointer. |
| `public static PointerQuad pointerQuad(int x, int y, int width, int height)` | `PointerQuad` | Actual draw rectangle compensating for the 1px transparent border around pointer textures: `new PointerQuad(x - 1, y - 1, width + 2, height + 2)`. |
