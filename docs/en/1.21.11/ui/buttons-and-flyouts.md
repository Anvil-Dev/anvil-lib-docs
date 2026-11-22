# Button & Pointer Flyout Renderers (`ButtonRenderer` & `FlyoutRenderer`)

Both `ButtonRenderer` and `FlyoutRenderer` extend `Renderer` and are the two concrete widget renderers in `module.ui`: the former draws standard auto-sizing buttons, while the latter adds a directional pointer triangle sliding by percentage along any of the 4 edges (ideal for tutorial callouts, toolbar flyouts, and context popups).

Widget sprites and pointer textures are submitted via `RenderPipelines.GUI_TEXTURED` with per-instance ARGB color, so overall opacity applies cleanly through the color parameter without being affected by other UI flushes in the same frame.

## `ButtonRenderer` Deep Dive

### Color, Alpha & Static Helpers

| Method | Description |
| --- | --- |
| `ButtonRenderer.textColor(Component text)` | Extracts the text component's foreground style color with opaque alpha (`0xFF000000`), defaulting to white `0xFFFFFFFF` |
| `ButtonRenderer.textColor(Component text, float alpha)` | Combines the text style color with overall `alpha` into an ARGB integer |
| `ButtonRenderer.color(float alpha)` | Returns a white ARGB tint with `alpha` (clamped to `[0.0F, 1.0F]`) |
| `open()` | Returns a `ButtonRenderer.Scope` frame scope |

## `FlyoutRenderer` (Pointer Flyout) Deep Dive

`FlyoutRenderer` extends `ButtonRenderer` to draw **bubble panels with a small triangular pointer**:

### Direction Enum: `PointerDirection`

Values `UP` / `DOWN` / `LEFT` / `RIGHT` build the pointer texture path via `getPath()`, paired with `FlyoutRenderer.pointerQuad(int x, int y, int width, int height)` to compute exact pixel coordinates `PointerQuad(int x, int y, int width, int height)` relative to the main box.

### `FlyoutRenderer.Scope` Extension Methods

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `pointer(PointerDirection direction, float percent)` | `FlyoutRenderer.Scope` | Sets both the pointer direction and slide percentage along that edge (`0.0F–1.0F`, commonly `0.5F` centered) |
| `pointerDirection(PointerDirection direction)` | `FlyoutRenderer.Scope` | Sets which edge the pointer attaches to |
| `pointerPercent(float percent)` | `FlyoutRenderer.Scope` | Sets the pointer's percentage position along the anchored edge |

`FlyoutRenderer` internally tints the pointer texture via:
`graphics.blit(RenderPipelines.GUI_TEXTURED, texture, quad.x(), quad.y(), 0.0F, 0.0F, quad.width(), quad.height(), quad.width(), quad.height(), quad.width(), quad.height(), ButtonRenderer.color(this.alpha))`
so it fades smoothly alongside the main window's `.alpha(...)`.

## Full Example: Drawing Interactive Buttons & Tooltip Flyouts in a `Screen`

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.ui.flexible.ButtonRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.ButtonType;
import dev.anvilcraft.lib.v2.ui.flexible.FlyoutRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.PointerDirection;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.joml.Vector2f;

public class MyFlexibleScreen extends Screen {
    private final ButtonRenderer actionBtn = new ButtonRenderer()
        .shaded1px()
        .buttonType(ButtonType.MOMENTARY)
        .basedOnMouse();

    private final FlyoutRenderer hintFlyout = new FlyoutRenderer()
        .dark()
        .flat()
        .alpha(0.95F);

    public MyFlexibleScreen() {
        super(Component.literal("Flexible UI Demo"));
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);

        int btnX = this.width / 2 - 50;
        int btnY = this.height / 2 - 12;

        // 1. Render a button whose padded size auto-fits its text
        try (ButtonRenderer.Scope scope = (ButtonRenderer.Scope) this.actionBtn.open()
            .graphics(graphics)
            .font(this.font)
            .pos(btnX, btnY)
            .mousePos(mouseX, mouseY)
            .literal("Apply Settings")
            .flexSize(10, 6)) {
            scope.render();

            // 2. If hovered, show a dark flat pointer flyout below it
            if (scope.contains(new Vector2f(mouseX, mouseY))) {
                try (FlyoutRenderer.Scope tip = this.hintFlyout.open()
                    .pointer(PointerDirection.UP, 0.5F)) {
                    tip.graphics(graphics)
                        .font(this.font)
                        .pos(btnX - 10, btnY + 32)
                        .literal("Writes current parameters to config")
                        .flexSize(8, 5)
                        .render();
                }
            }
        }
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean isDoubleClick) {
        this.actionBtn.onPress((int) event.x(), (int) event.y());
        return super.mouseClicked(event, isDoubleClick);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        this.actionBtn.onRelease();
        return super.mouseReleased(event);
    }
}
```
