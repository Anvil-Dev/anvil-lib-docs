# Wheel Controller, Screen & Frosted-Glass Rendering

Once [`WheelMenuModel`](./index.md) is built, client integration only needs a persistent `WheelScreenController` bound to a keybind. `WheelScreen`, `WheelWidget`, `WheelFrostedBackground`, and `LibShaders` handle menu stack pagination, close animations, 4-pass fullscreen Gaussian blur sampling, and annular sector GLSL rendering.

## Render Pipeline & Keybind Lifecycle

1. **Auto Shader Registration (`LibShaders`)**: Registers 7 Core Shaders (`anvillib:ring`, `selection`, `annular_sector`, `disc`, `frosted_disc`, `blur`, `segment`) in `RegisterShadersEvent`, all with safe uniform fallbacks (falling back to CPU vertex drawing if shader packs interfere).
2. **Input Driving (`WheelScreenController`)**:
   - **TAP mode**: `openTap(model)` opens `WheelScreen.tap(model)`; left-click confirms hovered item (pushes submenu or runs action + close animation), `ESC` pops submenu or closes.
   - **HOLD mode**: call `onHoldKeyPressed(model)` on key press (guards against re-opening and external screens), and `onHoldKeyReleased()` on key release to run `triggerFromHoldRelease()`.
3. **Frosted Background (`WheelFrostedBackground`)**: Captures `Minecraft.getInstance().getMainRenderTarget()` color texture each frame, runs 4 horizontal/vertical Gaussian blur passes across two `TextureTarget`s, and masks/blends via `frosted_disc` inside the wheel radius; automatically frees textures in `WheelScreen.removed()`.

## Full Example: Binding KeyMapping to Drive Both TAP & HOLD Wheel Modes

```java
package com.example.mymod.client;

import com.example.mymod.client.wheel.ToolWheelFactory;
import com.mojang.blaze3d.platform.InputConstants;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.client.input.WheelScreenController;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.client.settings.KeyConflictContext;
import org.lwjgl.glfw.GLFW;

@EventBusSubscriber(modid = "mymod", value = Dist.CLIENT)
public final class WheelKeyHandler {
    private static final KeyMapping RADIAL_HOLD_KEY = new KeyMapping(
        "key.mymod.radial_hold",
        KeyConflictContext.IN_GAME,
        InputConstants.Type.KEYSYM,
        GLFW.GLFW_KEY_R,
        "key.categories.mymod"
    );

    private static final KeyMapping RADIAL_TAP_KEY = new KeyMapping(
        "key.mymod.radial_tap",
        KeyConflictContext.IN_GAME,
        InputConstants.Type.KEYSYM,
        GLFW.GLFW_KEY_G,
        "key.categories.mymod"
    );

    private static final WheelScreenController CONTROLLER = new WheelScreenController();
    private static final WheelMenuModel MENU_MODEL = ToolWheelFactory.buildToolMenu();

    @SubscribeEvent
    public static void onRegisterKeys(RegisterKeyMappingsEvent event) {
        event.register(RADIAL_HOLD_KEY);
        event.register(RADIAL_TAP_KEY);
    }

    @SubscribeEvent
    public static void onClientTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            return;
        }
        if (RADIAL_TAP_KEY.consumeClick() && mc.screen == null) {
            CONTROLLER.openTap(MENU_MODEL);
        }
        if (RADIAL_HOLD_KEY.isDown()) {
            if (mc.screen == null) {
                CONTROLLER.onHoldKeyPressed(MENU_MODEL);
            }
        } else {
            CONTROLLER.onHoldKeyReleased();
        }
    }

    @SubscribeEvent
    public static void onKeyInput(InputEvent.Key event) {
        if (event.getKey() == RADIAL_HOLD_KEY.getKey().getValue() && event.getAction() == GLFW.GLFW_RELEASE) {
            CONTROLLER.onHoldKeyReleased();
        }
    }
}
```

## Full Public API Reference

### 1. `WheelScreenController`

Package: `dev.anvilcraft.lib.v2.wheel.client.input`

| Method Signature | Description & Boundary Protection |
| --- | --- |
| `public WheelScreenController()` | Default no-arg constructor (not a singleton; hold one instance per feature keybind) |
| `void openTap(WheelMenuModel menuModel)` | Sets current screen to `WheelScreen.tap(menuModel)` |
| `void onHoldKeyPressed(WheelMenuModel menuModel)` | Opens `WheelScreen.hold(menuModel)` and records reference; cleans up stale ref if switched away, idempotent if still held |
| `void onHoldKeyReleased()` | Calls `screen.triggerFromHoldRelease()` and clears ref only if `minecraft.screen` is still the Hold screen opened by this controller |

### 2. `WheelScreen`

Package: `dev.anvilcraft.lib.v2.wheel.client.gui.screen` (extends `net.minecraft.client.gui.screens.Screen`)

> Inner and outer radii scale dynamically with the screen's shorter side: `ringInnerRadius = min(w, h) * 0.17f`, `ringOuterRadius = min(w, h) * 0.33f`.

| Constructor / Method Signature | Description |
| --- | --- |
| `public WheelScreen(WheelMenuModel model, WheelOpenMode openMode)` | Constructor; pushes `model.rootEntries()` onto the menu stack |
| `static WheelScreen tap(WheelMenuModel model)` | Creates a `WheelOpenMode.TAP` instance |
| `static WheelScreen hold(WheelMenuModel model)` | Creates a `WheelOpenMode.HOLD` instance |
| `void triggerFromHoldRelease()` | Triggers the currently selected sector action and starts close animation when `openMode == HOLD`; no-op otherwise |
| `boolean isPauseScreen()` | Returns `false` (does not pause singleplayer logic when open) |
| `protected void init()` / `public void removed()` | Manages `WheelFrostedBackground` creation, reuse, and FBO disposal, and calls `rebuildWheelWidget` |
| `void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick)` | Delegates to internal `WheelWidget.render(...)` |
| `boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)` | Scrolls up for next page and down for previous page (wrapping modulo) when multi-page, rebuilding the widget |
| `boolean mouseClicked(double mouseX, double mouseY, int button)` | In `TAP` mode, left-click (`button == 0`) triggers the highlighted action or enters submenu |
| `boolean keyPressed(int keyCode, int scanCode, int modifiers)` | Captures `ESC` (`keyCode == 256`): pops submenu stack and resets page to 0 if depth > 1, else closes screen |
| `void onClose()` | Signals `wheelWidget.onClosing()` to play shrink-close animation before calling `Minecraft.setScreen(null)` |

### 3. `WheelWidget` & Inner Data Records

Package: `dev.anvilcraft.lib.v2.wheel.client.gui.component` (extends `AbstractWidget`)

#### Constants & Records

| Member Signature | Description |
| --- | --- |
| `public static final int IGNORE_CURSOR_MOVE_LENGTH = 15` | Minimum inner radius floor (`Math.max(ringInnerRadius, IGNORE_CURSOR_MOVE_LENGTH)`) |
| `public static final int DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02` | Default selection highlight color |
| `@FunctionalInterface public interface SectionRenderer` | `void render(GuiGraphics graphics, PoseStack pose, int width, int height)` |
| `public record RawSection(Component name, @Nullable SectionRenderer renderer, boolean selectable)` | Raw sector item (2-arg constructor defaults `selectable = true`) |
| `public record WheelSection(Vector2f center, float angle, float angleStart, float angleEnd, Component subTitle, @Nullable SectionRenderer renderer, boolean selectable)` | Runtime sector entry with computed angles and icon center coordinates |

#### Constructors (8 Overloads)

All constructors converge on the full-argument primary constructor:

```java
public WheelWidget(
    int x, int y, int width, int height,
    Component message,
    float ringInnerRadius, float ringOuterRadius,
    int delay, int animationMs, int closingAnimationMs,
    int ringColor, int selectionEffectColor,
    float selectionAnimationSpeedFactor,
    int textColor, float textScale, float degreeOffsetAngle,
    List<RawSection> sections, int deadZone
)
```

Simplified overloads use these defaults:
- Omitted timing/color overloads default to: `delay = 150` ms, `animationMs = 300` ms, `closingAnimationMs = 150` ms, `ringColor = 0x88000000`, `selectionEffectColor = 0xFFFABC02`, `selectionAnimationSpeedFactor = 5f`, `textColor = 0xfdfdfd`, `textScale = 1f`, `degreeOffsetAngle = 0f`, `message = Component.empty()`.
- The other 7 overloads progressively expose `message`, `textScale`, `degreeOffsetAngle`, and `delay/animationMs/closingAnimationMs/ringColor/selectionEffectColor/selectionAnimationSpeedFactor/textColor` subsets.

#### Instance & Static Methods

| Method Signature | Description |
| --- | --- |
| `int getCurrentSectionIndex()` | Provided by `@Getter`; currently selected sector index (`-1` if none or in dead zone) |
| `boolean isClosingAnimationStarted()` / `void setClosingAnimationStarted(boolean)` | Gets or sets close-animation-started flag |
| `WheelWidget setSelectionEffect(WheelSelectionEffect selectionEffect)` | Switches `DOT` / `ANNULAR_SECTOR` (returns `this`) |
| `WheelWidget setSelectionEffectColor(int selectionEffectColor)` | Dynamically updates highlight color |
| `WheelWidget setFrostedBackground(@Nullable WheelFrostedBackground frostedBackground)` | Binds offscreen frosted-glass blur processor |
| `WheelWidget setPageState(boolean hasPreviousPage, boolean hasNextPage)` | Controls visibility of left/right page-turn chevron arrows |
| `WheelWidget setCurrentIndex(int index)` | Programmatically selects a selectable sector and syncs angle animation target |
| `WheelWidget clearSelection()` | Clears current selection (`-1`) |
| `float getSectionCircleRadius()` | Returns the icon center circle radius `(ringOuterRadius + ringInnerRadius) * 0.5f` |
| `int getSectionSize()` | Returns the number of sectors on the current page |
| `boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)` | Standalone step-by-step scroll selection (note: `WheelScreen` intercepts scroll for pagination; use this when embedding `WheelWidget` in custom `Screen`s) |
| `void checkMousePos(double mouseX, double mouseY)` | Computes cursor distance and angle from center; clears selection in dead zone, else updates active sector and settle timer |
| `boolean shouldRender()` | Returns `true` after initial `delay` ms elapses |
| `void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick)` | Renders the full wheel, frosted background, separator ring, sector highlight, icons, centered title, and page indicators |
| `void renderDisc(GuiGraphics guiGraphics, float progress)` | Draws base disc using `ringColor` and scale progress |
| `void renderFrostedBackground(GuiGraphics guiGraphics, float progress)` | Runs Gaussian blur and composites frosted-glass disc via `frosted_disc` shader |
| `void renderSeparatorRing(GuiGraphics guiGraphics, float progress)` | Draws the thin white separator ring between center and sectors |
| `void renderSelectionEffect(GuiGraphics guiGraphics, float centerX, float centerY, int color, float ringWidth)` | Draws `DOT` glow dot (with CPU fallback if shader unavailable) |
| `void renderAnnularSectorSelection(GuiGraphics guiGraphics, float centerX, float centerY, int color, float innerRadius, float outerRadius, float centerAngleRad, float rangeAngleRad)` | Draws `ANNULAR_SECTOR` rounded/anti-aliased highlight sector |
| `void onClosing()` | Starts shrink-close animation, recording start timestamp on first call |
| `void renderClosingAnimation(GuiGraphics guiGraphics)` | Renders shrink-close frames and closes the screen once finished |
| `static void renderRing(GuiGraphics guiGraphics, float centerX, float centerY, int color, float innerDiameter, float outerDiameter)` | Static anti-aliased ring draw helper usable externally |

### 4. `LibShaders` & Internal `WheelFrostedBackground`

| Type & Members | Description |
| --- | --- |
| `LibShaders` (`dev.anvilcraft.lib.v2.wheel.client.init`) | `@EventBusSubscriber(modid = AnvilLibWheel.MOD_ID, value = Dist.CLIENT)`; subscribes to `RegisterShadersEvent` and exposes package-private `@Getter`s: `getRingShader()`, `getSelectionShader()`, `getAnnularSectorShader()`, `getDiscShader()`, `getFrostedDiscShader()`, `getBlurShader()`, `getSegmentShader()` |
| `@ApiStatus.Internal WheelFrostedBackground implements AutoCloseable` | Internal dual-`TextureTarget` ping-pong 4-pass Gaussian blur manager exposing `int capture(GuiGraphics guiGraphics)` and `void close()` |
