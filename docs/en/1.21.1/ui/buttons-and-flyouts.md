# Button & Pointer Flyout Renderers

Built on `Renderer` and `FlexibleSprites`, `module.ui` provides two ready-to-use concrete renderers: **rectangular button renderer `ButtonRenderer`** and **pointer flyout renderer `FlyoutRenderer`**, paired with `ButtonType` and `ButtonInput` to manage click/momentary/toggle state logic.

## Interaction State Machine: `ButtonType` & `ButtonInput`

When `basedOnMouse(...)` is enabled on a renderer, widget appearance is mapped by `buttonType.variant(ButtonInput)`:

| Button Type | Behavior | Resulting `SpriteVariant` |
| --- | --- | --- |
| `DISPLAY` | Display-only box / static label; ignores mouse position and clicks | Always `NORMAL` |
| `CLICK` | Standard click button; distinguishes hover only (does not switch to press-sink sprite while held) | `NORMAL` / `HIGHLIGHTED` |
| `MOMENTARY` | Momentary press button: enters depressed state only if press started inside, allowed key is held, and mouse is still inside | `NORMAL` / `HIGHLIGHTED` / `HIGHLIGHTED_PRESSING` |
| `TOGGLE` | Toggle switch: combines external `toggleState` (selected) with hover/press states | `NORMAL` / `PRESSED` / `HIGHLIGHTED` / `HIGHLIGHTED_PRESSED` / `HIGHLIGHTED_PRESSING` |

::: tip Anti-Flicker Interaction Design
Hover highlighting is unaffected by unrelated mouse buttons or dragging from adjacent buttons—**even if you drag from Button A into Button B while holding the mouse, Button B highlights cleanly without flickering, and since `pressStartedInside` is `false`, Button B will not falsely enter `HIGHLIGHTED_PRESSING`.**
:::

## Full Code Example: Auto-Sizing Toggle Button & Pointer Flyout Tooltip in a `Screen`

The example below builds an interactive panel with minimal code: a dark 3D toggle button on the left that auto-sizes to localized text, and a left-pointing flyout tooltip on the right fading in/out based on button state.

```java
package com.example.examplemod.client;

import dev.anvilcraft.lib.v2.ui.flexible.ButtonRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.ButtonType;
import dev.anvilcraft.lib.v2.ui.flexible.FlyoutRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.PointerDirection;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.joml.Vector2f;
import org.joml.Vector2i;

public class DemoFlexibleUiScreen extends Screen {
    private boolean magnetEnabled = false;
    private float tipAlpha = 0.0F;

    // 1. Toggle button renderer (dark theme + 1px shadow + TOGGLE mode)
    private final ButtonRenderer toggleBtn = (ButtonRenderer) new ButtonRenderer()
        .dark()
        .shaded1px()
        .buttonType(ButtonType.TOGGLE)
        .toggleState(() -> this.magnetEnabled)
        .basedOnMouse();

    // 2. Flyout bubble renderer (light flat + 1px shadow + DISPLAY mode)
    private final FlyoutRenderer tipFlyout = (FlyoutRenderer) new FlyoutRenderer()
        .flat()
        .shaded1px();

    public DemoFlexibleUiScreen() {
        super(Component.literal("Flexible UI Demo"));
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);

        int btnX = this.width / 2 - 90;
        int btnY = this.height / 2 - 12;
        Vector2i btnSize;
        boolean hoveringBtn;

        // Draw toggle button and get its auto-fitted size and hover state
        try (ButtonRenderer.Scope scope = this.toggleBtn.open()) {
            scope.graphics(graphics)
                .font(this.font)
                .pos(btnX, btnY)
                .mousePos(mouseX, mouseY)
                .literal(this.magnetEnabled ? "Magnet Mode: ON" : "Magnet Mode: OFF")
                .flexSize(8, 5)
                .render();

            btnSize = scope.resolveSize();
            hoveringBtn = scope.contains(new Vector2f(mouseX, mouseY));
        }

        // Smoothly update flyout alpha (NaN is safely ignored by alpha())
        float targetAlpha = hoveringBtn ? 1.0F : 0.0F;
        this.tipAlpha += (targetAlpha - this.tipAlpha) * 0.25F;
        if (this.tipAlpha > 0.01F && btnSize != null) {
            this.tipFlyout.alpha(this.tipAlpha);
            try (FlyoutRenderer.Scope flyout = this.tipFlyout.open()) {
                flyout.pointer(PointerDirection.LEFT, 0.5F) // Pointer on left edge middle pointing at button
                    .graphics(graphics)
                    .font(this.font)
                    .pos(btnX + btnSize.x + 8, btnY)
                    .literal("Automatically pulls nearby drops within 8 blocks")
                    .flexSize(6, 4)
                    .render();
            }
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        this.toggleBtn.onPress((int) mouseX, (int) mouseY);
        if (button == 0) {
            // Use temporary scope for pure hit testing (no render call, zero side effects)
            try (ButtonRenderer.Scope scope = this.toggleBtn.open()) {
                scope.font(this.font)
                    .pos(this.width / 2 - 90, this.height / 2 - 12)
                    .literal(this.magnetEnabled ? "Magnet Mode: ON" : "Magnet Mode: OFF")
                    .flexSize(8, 5);
                if (scope.contains(new Vector2f((float) mouseX, (float) mouseY))) {
                    this.magnetEnabled = !this.magnetEnabled;
                    return true;
                }
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        this.toggleBtn.onRelease();
        return super.mouseReleased(mouseX, mouseY, button);
    }
}
```

::: warning Usage Details & Pitfall Notes
1. **Nine-slice sprite & pointer transparency**:
   - `ButtonRenderer` temporarily modifies global `RenderSystem.setShaderColor` via `ButtonRenderer.applyAlpha(graphics, alpha)` and restores it in `finally` via `resetAlpha`, so nested `alpha` multiplies with vanilla's global color tint.
   - **Vanilla text alpha discard threshold**: Vanilla's text shader discards fragments with `alpha < 0.1`, so during the final `0.1` of a fade-out animation, text disappears slightly before the nine-slice background.
2. **Pointer parameters must be paired**: `FlyoutRenderer.Scope` allows omitting the pointer altogether (drawing a plain flyout box), but calling `pointerDirection(...)` without `pointerPercent(...)` (or vice versa) throws `IllegalStateException` on `render()`. Prefer the combined `pointer(direction, percent)` method.
3. **Pointer clamping bounds**: `pointerPercent` is automatically clamped to `[0.0F, 1.0F]` with a `2px` margin at both ends of the anchored edge, so the pointer never protrudes past the body outline or overlaps border corners.
:::

## Full Public API Reference

### 1. `ButtonType` & `ButtonInput`

Package: `dev.anvilcraft.lib.v2.ui.flexible`

| Type / Member Signature | Description |
| --- | --- |
| `enum ButtonType` | Values: `CLICK`, `MOMENTARY`, `TOGGLE`, `DISPLAY` |
| `SpriteVariant ButtonType.variant(ButtonInput input)` | Computes target sprite variant from button interaction mode and current input snapshot |
| `record ButtonInput(boolean selected, boolean hovering, boolean allowedPressed, boolean pressStartedInside)` | Input state record; also has a `@Deprecated` 5-arg legacy constructor `(..., boolean anyPressed, ...)` ignoring `anyPressed` for binary compatibility |

### 2. `ButtonRenderer`

Package: `dev.anvilcraft.lib.v2.ui.flexible` · Extends: `Renderer<ButtonRenderer.Scope>`

| Member / Method Signature | Description |
| --- | --- |
| `static int textColor(Component text)` | Extracts the `TextColor` of `text` with opaque alpha `0xFF000000` (defaults to pure white `0xFFFFFFFF`) |
| `static int textColor(Component text, float alpha)` | Computes final ARGB text color by combining `textColor(text)` with `alpha` |
| `static int color(float alpha)` | Generates a pure white ARGB color with modulated alpha (for tinting pointers or nine-slices) |
| `static float @Nullable [] applyAlpha(GuiGraphics graphics, float alpha)` | When `alpha < 1.0F`, flushes via `graphics.flush()`, backs up `RenderSystem.getShaderColor()`, and multiplies alpha; returns `null` if `alpha >= 1.0F` |
| `static void resetAlpha(GuiGraphics graphics, float @Nullable [] previous)` | Restores shader color to the state before `applyAlpha` (no-op if `previous == null`) |
| `ButtonRenderer.Scope open()` | Opens a single-frame scope for `ButtonRenderer` |

### 3. `FlyoutRenderer` & `FlyoutRenderer.Scope`

Package: `dev.anvilcraft.lib.v2.ui.flexible` · Extends: `ButtonRenderer`

| Member / Method Signature | Description |
| --- | --- |
| `record PointerQuad(int x, int y, int width, int height)` | Draw rectangle parameters for pointer texture |
| `static PointerQuad pointerQuad(int x, int y, int width, int height)` | Expands visible content bounds by `1px` transparent margin on all 4 sides (`(x - 1, y - 1, width + 2, height + 2)`) |
| `FlyoutRenderer.Scope open()` | Opens a single-frame scope for `FlyoutRenderer` (extends `ButtonRenderer.Scope`) |
| `Scope pointer(PointerDirection direction, float percent)` | Sets both pointer edge/direction and percentage position `[0, 1]` along that edge |
| `Scope pointerDirection(PointerDirection direction)` | Sets pointer edge separately (must be paired with `pointerPercent` before drawing) |
| `Scope pointerPercent(float percent)` | Sets pointer percentage position separately (must be paired with `pointerDirection` before drawing) |
