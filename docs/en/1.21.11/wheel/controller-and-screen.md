# Wheel Controller, Screen & Frosted-Glass Rendering

Once `WheelMenuModel` is built, `module.wheel` provides out-of-the-box `WheelScreenController`, `WheelScreen`, and `WheelWidget`, backed by `module.rendering`'s `GaussianBlur` and GUI render-state pipeline (`LibRenders`, `LibDynamicUniforms`, `*RenderState`, and `WheelFrostedBackground`) for high-performance offscreen-blurred frosted discs and vector annular sectors.

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

`WheelScreen` extends vanilla `Screen` (`isPauseScreen()` returns `false` by default) and manages nested submenu stack push/pop, scroll pagination (`mouseScrolled`), click/ESC cancellation (`mouseClicked(MouseButtonEvent, boolean)`, `keyPressed(KeyEvent)`, `onClose`), and safe disposal of blur textures and samplers (`removed()`):
- Static factories: `WheelScreen.tap(WheelMenuModel)`, `WheelScreen.hold(WheelMenuModel)` (or `new WheelScreen(model, openMode)`).
- When closed via `triggerFromHoldRelease()`, if the cursor is over a valid selectable sector, the bound callback fires automatically.

### `WheelWidget` Full Extension API

To embed the radial wheel directly inside an existing container screen (instead of opening a fullscreen `Screen`), instantiate `WheelWidget` directly:

- Provides 8 progressive public constructors supporting screen coords `(x, y, width, height)`, inner/outer radii `(ringInnerRadius, ringOuterRadius)`, `List<RawSection>`, `deadZone`, `textScale`, `degreeOffsetAngle`, and color/animation duration parameters.
- Key rendering & interaction methods:
  - `setSelectionEffect(WheelSelectionEffect)` / `setSelectionEffectColor(int argb)`
  - `setFrostedBackground(@Nullable WheelFrostedBackground)`
  - `setPageState(boolean hasPreviousPage, boolean hasNextPage)`
  - `setCurrentIndex(int index)` / `clearSelection()`
  - `getSectionCircleRadius()` / `getSectionSize()`
  - `checkMousePos(double mouseX, double mouseY)` / `mouseScrolled(...)` / `shouldRender()`
  - `render(GuiGraphics, mouseX, mouseY, partialTick)` / `renderClosingAnimation(GuiGraphics)` / `onClosing()`
  - Standalone primitive submission: `renderDisc(...)`, `renderFrostedBackground(...)`, `renderSeparatorRing(...)`, `renderSelectionEffect(...)`, `renderAnnularSectorSelection(...)`
  - Inner helper types: `WheelWidget.SectionRenderer`, `WheelWidget.RawSection`, `WheelWidget.WheelSection`.

## Render Pipelines, Dynamic UBOs & Frosted Disc

The wheel widget submits via vanilla `RenderPipeline` + `DynamicUniformStorage` UBOs + `LibQuadGuiElementRenderState`:

- **`LibRenders`** (internal pipeline definitions): provides `RING_PIPELINE` (`RingUniform`), `SELECTION_PIPELINE` (`SelectionUniform`), `ANNULAR_SECTOR_PIPELINE` (`AnnularSectorUniform`), and `FROSTED_DISC_PIPELINE` (`FrostedDiscUniform` + `Sampler0`).
- **`LibDynamicUniforms`**: initialized on `ConfigureMainRenderTargetEvent` and held by `AnvilLibWheel.getLibDynamicUniforms()`, writing per-frame parameter slices via `writeRing`, `writeSelection`, `writeAnnularSector`, and `writeFrostedDisc`, and calling `reset()` (`endFrame()`) after GUI rendering.
- **GUI element render states** (all implementing `LibQuadGuiElementRenderState` and submitting vertices via `buildVertices(VertexConsumer)`): `RingRenderState`, `SelectionRenderState`, `AnnularSectorRenderState`, `FrostedDiscRenderState`.
- **`WheelFrostedBackground` (Offscreen Frosted Glass via `GaussianBlur`)**: implements `AutoCloseable`, holding `new GaussianBlur(2.0f, 1.0f)` and a `GpuSampler` (`AddressMode.CLAMP_TO_EDGE`, `FilterMode.LINEAR`). Each frame when rendering the background:
  1. `capture()` checks the main render target dimensions and calls `blur.resize(width, height)` on size change;
  2. Calls `blur.process(mainTarget.getColorTexture())` to Gaussian-blur the main view, reusing or recreating `GpuTextureView`, and returns `TextureSetup.singleTexture(this.blurredTextureView, this.sampler)`;
  3. Automatically calls `close()` on `init()` rebuild and `removed()` to free `GpuSampler`, texture views, and `GaussianBlur` resources.
