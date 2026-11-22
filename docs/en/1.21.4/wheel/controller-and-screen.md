# Wheel Controller, Screen & Frosted-Glass Rendering

Once `WheelMenuModel` is built, `module.wheel` provides out-of-the-box `WheelScreenController`, `WheelScreen`, `WheelWidget`, and the low-level GL shader frosted-glass pipeline (`LibShaders` & `WheelFrostedBackground`).

## Keybind Controller: `WheelScreenController`

`WheelScreenController` encapsulates the two classic hotkey interaction flows (sparing modders from managing hold detection, release switching, and duplicate screen opens):

| Method Signature | Mode & Behavior |
| --- | --- |
| `openTap(WheelMenuModel menuModel)` | **Tap toggle mode (`WheelOpenMode.TAP`)**: opens a click-persistent `WheelScreen.tap(model)`; closes on re-press or option click |
| `onHoldKeyPressed(WheelMenuModel menuModel)` | **Hold start (`WheelOpenMode.HOLD`)**: opens `WheelScreen.hold(model)` when the `KeyMapping` is first pressed |
| `onHoldKeyReleased()` | **Hold release finish**: automatically calls `WheelScreen#triggerFromHoldRelease()` on the active wheel when the key is released to execute the hovered action and play the close animation |

### Example: Hooking Hotkeys in Client Tick

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.wheel.client.input.WheelScreenController;
import net.minecraft.client.KeyMapping;
import net.neoforged.neoforge.client.event.ClientTickEvent;

public final class WheelKeyHandler {
    private static final WheelScreenController CONTROLLER = new WheelScreenController();
    public static KeyMapping OPEN_WHEEL_KEY;
    private static boolean wasDown = false;

    public static void onClientTick(ClientTickEvent.Post event) {
        if (OPEN_WHEEL_KEY == null) return;
        boolean isDown = OPEN_WHEEL_KEY.isDown();
        if (isDown && !wasDown) {
            CONTROLLER.onHoldKeyPressed(ToolWheelMenus.buildToolMenu());
        } else if (!isDown && wasDown) {
            CONTROLLER.onHoldKeyReleased();
        }
        wasDown = isDown;
    }
}
```

## Screen & Widget: `WheelScreen` & `WheelWidget`

### `WheelScreen`

`WheelScreen` extends vanilla `Screen` (`isPauseScreen()` returns `false` by default) and manages nested submenu stack push/pop, scroll pagination (`mouseScrolled`), click/ESC cancellation (`mouseClicked`, `keyPressed`, `onClose`), and safe VRAM disposal (`removed()`):
- Static factories: `WheelScreen.tap(WheelMenuModel)`, `WheelScreen.hold(WheelMenuModel)` (or `new WheelScreen(model, openMode)`).
- When closed via `triggerFromHoldRelease()`, if the cursor is over a valid selectable sector, the bound callback fires automatically.

### `WheelWidget` Full Extension API

To embed the radial wheel directly inside an existing container screen (instead of opening a fullscreen `Screen`), instantiate `WheelWidget` directly:

- Provides 8 progressive public constructors supporting screen coords `(x, y, width, height)`, inner/outer radii `(ringInnerRadius, ringOuterRadius)`, `List<RawSection>`, `deadZone`, `textScale`, `degreeOffsetAngle`, and color/animation duration parameters.
- Key configuration methods:
  - `setSelectionEffect(WheelSelectionEffect)` / `setSelectionEffectColor(int argb)`
  - `setFrostedBackground(@Nullable WheelFrostedBackground)`
  - `setPageState(boolean hasPreviousPage, boolean hasNextPage)`
  - `setCurrentIndex(int index)` / `clearSelection()`
  - `checkMousePos(double mouseX, double mouseY)` / `mouseScrolled(...)`
  - `render(GuiGraphics, mouseX, mouseY, partialTick)` / `renderClosingAnimation(GuiGraphics)` / `onClosing()`
  - Inner helper types: `WheelWidget.SectionRenderer`, `WheelWidget.RawSection`, `WheelWidget.WheelSection`, and static ring draw method `WheelWidget.renderRing(...)`.

## Shader Registration & Frosted-Glass Background: `LibShaders` & `WheelFrostedBackground`

In 1.21.4, `LibShaders` registers built-in core shaders using `net.minecraft.client.renderer.ShaderProgram`, and `Minecraft.getInstance().getShaderManager().getProgram(...)` returns a nullable **`@Nullable CompiledShaderProgram`**, so custom draw logic should null-check and fall back before using the returned shader:

| Shader Getter | Resource Location (`anvillib:core/*`) | Vertex Format | Purpose |
| --- | --- | --- | --- |
| `LibShaders.getRingShader()` | `core/ring` | `POSITION_COLOR` | Ring border and outer highlight |
| `LibShaders.getSelectionShader()` | `core/selection` | `POSITION_COLOR` | Dot selection highlight |
| `LibShaders.getAnnularSectorShader()` | `core/annular_sector` | `POSITION_COLOR` | Annular sector highlight and dividers |
| `LibShaders.getDiscShader()` | `core/disc` | `POSITION_COLOR` | Solid translucent disc backdrop |
| `LibShaders.getFrostedDiscShader()` | `core/frosted_disc` | `POSITION_TEX_COLOR` | Samples Gaussian-blurred framebuffer to draw masked circular frosted glass |
| `LibShaders.getBlurShader()` | `core/blur` | `POSITION_TEX` | Bidirectional 2D Gaussian blur pass shader |
| `LibShaders.getSegmentShader()` | `core/segment` | `POSITION_COLOR` | Crisp straight divider lines |

### `WheelFrostedBackground` (Offscreen Dual-Pass Gaussian Blur)

`WheelFrostedBackground` implements `AutoCloseable`, maintaining two 1.21.4 3-arg `TextureTarget(width, height, true)` offscreen framebuffers:
1. Before rendering the background each frame, `capture(GuiGraphics)` copies the current frame from the main render target and runs horizontal/vertical blur passes;
2. Returns the blurred OpenGL Texture ID for `WheelWidget#renderFrostedBackground(...)` to sample in the `frosted_disc` shader;
3. Calls `close()` when the window/screen closes to destroy internal `TextureTarget`s and free VRAM.
