# Wheel Controller, Screen & Frosted-Glass Rendering (`WheelScreenController` / `WheelScreen` / `WheelWidget`)

<BranchContextCard branch="26.1" />

Once you have built a `WheelMenuModel`, how do you bind it to a client keybind for `HOLD` or `TAP` activation? And if you don't want the default `WheelScreen` in a custom `Screen`, can you embed the radial wheel as a standalone `AbstractWidget`? This page covers `WheelScreenController`, `WheelScreen`, `WheelWidget`, and `WheelFrostedBackground`.

---

## 1. Binding Keybinds to Open the Wheel with `WheelScreenController`

`WheelScreenController` encapsulates screen lifecycle management for both `TAP` and `HOLD` modes, automatically handling edge cases such as the player closing `WheelScreen` early via damage, chat, or `ESC` while holding the key.

### Full Code Example: Driving `HOLD` & `TAP` Wheels from Key Events

```java
package com.example.mymod.client.input;

import com.example.mymod.MyMod;
import com.example.mymod.client.wheel.ToolModeWheelMenus;
import com.mojang.blaze3d.platform.InputConstants;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.client.input.WheelScreenController;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import org.lwjgl.glfw.GLFW;

@EventBusSubscriber(modid = MyMod.MOD_ID, value = Dist.CLIENT)
public final class WheelKeyHandler {
    private static final WheelScreenController CONTROLLER = new WheelScreenController();
    private static WheelMenuModel cachedModel;

    // Example keybind (in real projects, register via RegisterKeyMappingsEvent)
    public static final KeyMapping HOLD_WHEEL_KEY = new KeyMapping(
        "key.my_mod.hold_wheel",
        InputConstants.Type.KEYSYM,
        GLFW.GLFW_KEY_R,
        "key.categories.my_mod"
    );

    private static boolean wasHolding = false;

    private WheelKeyHandler() {
    }

    private static WheelMenuModel getModel() {
        if (cachedModel == null) {
            cachedModel = ToolModeWheelMenus.createMultiToolMenu();
        }
        return cachedModel;
    }

    @SubscribeEvent
    public static void onClientTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        // Approach A: Hold to open, release to trigger (HOLD mode)
        long window = mc.getWindow().getWindow();
        boolean isKeyDown = InputConstants.isKeyDown(window, HOLD_WHEEL_KEY.getKey().getValue());

        if (isKeyDown && !wasHolding && mc.screen == null) {
            wasHolding = true;
            CONTROLLER.onHoldKeyPressed(getModel());
        } else if (!isKeyDown && wasHolding) {
            wasHolding = false;
            CONTROLLER.onHoldKeyReleased();
        }
    }

    /**
     * Approach B: Open directly in TAP mode on item right-click or key press (supports clicking into submenus)
     */
    public static void openToolWheelTap() {
        CONTROLLER.openTap(getModel());
    }
}
```

---

## 2. Public Classes API Reference

### 1. `WheelScreenController` (`dev.anvilcraft.lib.v2.wheel.client.input.WheelScreenController`)

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public void openTap(WheelMenuModel menuModel)` | `void` | Opens `WheelScreen` in `WheelOpenMode.TAP` mode. |
| `public void onHoldKeyPressed(WheelMenuModel menuModel)` | `void` | Call when the hotkey is pressed: if `currentHoldScreen` is not yet open, creates `WheelScreen.hold(menuModel)` and sets it as the active screen. |
| `public void onHoldKeyReleased()` | `void` | Call when the hotkey is released: if the active screen is still `currentHoldScreen`, calls `screen.triggerFromHoldRelease()` to fire the hovered slot action and play the close animation. |

### 2. `WheelScreen` (`dev.anvilcraft.lib.v2.wheel.client.gui.screen.WheelScreen`)

Extends `net.minecraft.client.gui.screens.Screen` (`isPauseScreen()` returns `false`, so opening the wheel does not pause singleplayer).

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public WheelScreen(WheelMenuModel model, WheelOpenMode openMode)`<br>`public static WheelScreen tap(WheelMenuModel model)`<br>`public static WheelScreen hold(WheelMenuModel model)` | `WheelScreen` | Creates the wheel screen. Inner radius defaults to `min(width, height) * 0.17f`; outer radius defaults to `min(width, height) * 0.33f`. |
| `public void triggerFromHoldRelease()` | `void` | Called by the controller in `HOLD` mode when the hotkey is released; triggers the currently hovered slot's `WheelEntryAction` and starts the close animation. |
| **Built-in Interaction Events**:<br>• `mouseClicked` (`TAP` mode left-click triggers action or pushes submenu onto `menuStack`)<br>• `mouseScrolled` (cycles `currentPageIndex` when total pages `> 1`)<br>• `keyPressed` (`ESC` pops back to parent menu if in a submenu, or triggers `wheelWidget.onClosing()` to play the close animation and close if at root) | `boolean` | Handles multi-page pagination, nested submenu stack push/pop, and open/close transition animations. |

### 3. `WheelWidget` (Standalone Reusable Radial Wheel GUI Widget)

Located in `dev.anvilcraft.lib.v2.wheel.client.gui.component.WheelWidget`, extending vanilla `AbstractWidget`.

**Visual & Animation Features**:
- **Open & close animations**: defaults to `delay = 150ms` anti-flicker delay, `animationMs = 300ms` open animation, and `closingAnimationMs = 150ms` close animation;
- **Settle Expand**: when the mouse lingers on a sector for more than `SETTLE_DELAY_MS = 500ms`, the highlight ring sector's inner and outer radii smoothly expand outward by `2px` over `200ms`;
- **Multi-layer composited rendering**: sequentially draws `WheelFrostedBackground` Gaussian-blurred frosted disc → `SdfGraphics` translucent dark disc → center white separator ring → hover chevron pointing toward the mouse → sector highlight (`AnnularSectorRenderState` or `DOT` glow dot) → sector custom renderer & title → 1.4× scaled selected title at center & bottom pagination indicator.

| Key Constructor / Method Signatures | Description |
| :--- | :--- |
| `public record RawSection(Component title, @Nullable SectionRenderer renderer, boolean selectable)` | Raw sector definition passed to `WheelWidget` (where `SectionRenderer` is `void render(GuiGraphicsExtractor, Matrix3x2fStack, int w, int h)`). |
| `public WheelWidget(int x, int y, int width, int height, float ringInnerRadius, float ringOuterRadius, List<RawSection> sections, int deadZone)` (8 constructor overloads for customizing animation durations, colors, `degreeOffsetAngle`, and text scaling) | Constructs the wheel widget, automatically dividing $360^\circ$ evenly across `sections.size()` to compute each sector's start/end angles. |
| `setSelectionEffect(WheelSelectionEffect)` / `setSelectionEffectColor(int)` / `setFrostedBackground(@Nullable WheelFrostedBackground)` / `setPageState(boolean hasPrev, boolean hasNext)` | Configures selection effect style, color, frosted background capturer, and prev/next page arrow visibility. |
| `getCurrentSectionIndex()` / `setCurrentIndex(int)` / `clearSelection()` | Gets or sets the currently selected sector index (`-1` when unselected or inside the center dead zone). |
| `public void onClosing()` | Starts the close animation and automatically closes the owning `Screen` once finished. |
