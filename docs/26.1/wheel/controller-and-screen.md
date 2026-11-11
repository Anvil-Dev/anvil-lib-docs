# 轮盘控制器、界面与毛玻璃渲染 (`WheelScreenController` / `WheelScreen` / `WheelWidget`)

<BranchContextCard branch="26.1" />

构建好 `WheelMenuModel` 后，如何将它绑定到客户端按键上，实现按住（`HOLD`）或点按（`TAP`）呼出轮盘？如果在完全自定义的 `Screen` 中不想用默认的 `WheelScreen`，能否单独把轮盘当作一个 `AbstractWidget` 嵌入自己的界面？本篇详解 `WheelScreenController`、`WheelScreen`、`WheelWidget` 以及毛玻璃背景 `WheelFrostedBackground`。

---

## 一、 使用 `WheelScreenController` 绑定快捷键呼出轮盘

`WheelScreenController` 封装了 `TAP` 和 `HOLD` 两种模式的屏幕生命周期管理，自动处理玩家在按住期间因受伤、打开聊天栏或按 `ESC` 提前关闭了 `WheelScreen` 等边界状况。

### 完整代码示例：绑定按键事件驱动 `HOLD` 与 `TAP` 轮盘

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

    // 示例按键（实际项目中请通过 RegisterKeyMappingsEvent 注册）
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

        // 方式 A：驱动按住呼出、松开触发 (HOLD 模式)
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
     * 方式 B：在物品右键或点按快捷键时直接以 TAP 模式打开轮盘（支持点击进入二级子菜单）
     */
    public static void openToolWheelTap() {
        CONTROLLER.openTap(getModel());
    }
}
```

---

## 二、 公开类 API 详解

### 1. `WheelScreenController`（`dev.anvilcraft.lib.v2.wheel.client.input.WheelScreenController`）

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public void openTap(WheelMenuModel menuModel)` | `void` | 以 `WheelOpenMode.TAP` 点按模式打开 `WheelScreen`。 |
| `public void onHoldKeyPressed(WheelMenuModel menuModel)` | `void` | 当检测到热键按下时调用：若当前尚未打开 `currentHoldScreen`，则创建 `WheelScreen.hold(menuModel)` 并设为当前屏幕。 |
| `public void onHoldKeyReleased()` | `void` | 当检测到热键松开时调用：若当前屏幕仍是刚才打开的 `currentHoldScreen`，则调用 `screen.triggerFromHoldRelease()` 触发当前指向的槽位动作并执行收起动画关闭界面。 |

### 2. `WheelScreen`（`dev.anvilcraft.lib.v2.wheel.client.gui.screen.WheelScreen`）

继承自 `net.minecraft.client.gui.screens.Screen`（`isPauseScreen()` 返回 `false`，打开轮盘时不会暂停单人游戏）。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public WheelScreen(WheelMenuModel model, WheelOpenMode openMode)`<br>`public static WheelScreen tap(WheelMenuModel model)`<br>`public static WheelScreen hold(WheelMenuModel model)` | `WheelScreen` | 创建轮盘屏幕。内径默认取 `min(width, height) * 0.17f`，外径默认取 `min(width, height) * 0.33f`。 |
| `public void triggerFromHoldRelease()` | `void` | 在 `HOLD` 模式下由控制器在按键松开时调用，触发当前选中槽位的 `WheelEntryAction` 并启动关闭动画。 |
| **内置交互事件**：<br>• `mouseClicked`（`TAP` 模式下左键点击触发动作或推入子菜单栈 `menuStack`）<br>• `mouseScrolled`（当当前菜单总页数 `> 1` 时循环切换 `currentPageIndex`）<br>• `keyPressed`（按 `ESC` 时若在子菜单则退回上一级，若在根菜单则触发 `wheelWidget.onClosing()` 播放收起动画后关闭） | `boolean` | 完整处理多页翻页、多级子菜单压栈/出栈以及打开/关闭过渡动画。 |

### 3. `WheelWidget`（可独立复用的轮盘 GUI 控件）

位于 `dev.anvilcraft.lib.v2.wheel.client.gui.component.WheelWidget`，继承自原版 `AbstractWidget`。

**视觉与动画特性**：
- **展开与收起动画**：默认支持 `delay = 150ms` 延迟防闪烁、`animationMs = 300ms` 展开动画与 `closingAnimationMs = 150ms` 收起动画；
- **鼠标停驻外扩动效（Settle Expand）**：当鼠标在某个扇区停留超过 `SETTLE_DELAY_MS = 500ms` 后，高亮环扇的内外缘会在 `200ms` 内平滑向外扩张 `2px`；
- **多层合成渲染**：依次绘制 `WheelFrostedBackground` 高斯模糊毛玻璃圆盘 → `SdfGraphics` 半透明深色底盘 → 中心白色分隔圆环 → 指向鼠标方向的尖括号指示器（Hover Chevron）→ 扇区高亮（`AnnularSectorRenderState` 或 `DOT` 发光点）→ 扇区自定义渲染器与标题 → 中心放大 1.4 倍的当前选中项标题与底部分页指示器。

| 关键构造器 / 方法签名 | 说明 |
| :--- | :--- |
| `public record RawSection(Component title, @Nullable SectionRenderer renderer, boolean selectable)` | 传给 `WheelWidget` 的原始扇区定义（其中 `SectionRenderer` 为 `void render(GuiGraphicsExtractor, Matrix3x2fStack, int w, int h)`）。 |
| `public WheelWidget(int x, int y, int width, int height, float ringInnerRadius, float ringOuterRadius, List<RawSection> sections, int deadZone)`（共 8 个构造器重载，可精细定制所有动画时长、颜色、偏移角度 `degreeOffsetAngle` 与文本缩放） | 构造轮盘控件，自动按 `sections.size()` 均分 $360^\circ$ 计算每个扇区的起止判定角。 |
| `setSelectionEffect(WheelSelectionEffect)` / `setSelectionEffectColor(int)` / `setFrostedBackground(@Nullable WheelFrostedBackground)` / `setPageState(boolean hasPrev, boolean hasNext)` | 配置选中特效样式、颜色、毛玻璃背景捕获器及上下页翻页箭头显示状态。 |
| `getCurrentSectionIndex()` / `setCurrentIndex(int)` / `clearSelection()` | 获取或设置当前选中的扇区索引（未选中或位于中心死区内时为 `-1`）。 |
| `public void onClosing()` | 启动收起关闭动画，动画播放完毕后自动关闭当前所属 `Screen`。 |
