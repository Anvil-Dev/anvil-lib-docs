# 按钮与带指针浮窗渲染器 (`ButtonRenderer` / `FlyoutRenderer` / `ButtonType`)

<BranchContextCard branch="26.3" />

在 `Renderer<T>` 基类之上，`module.ui` 提供了两个具体渲染器实现：
1. **`ButtonRenderer`**：支持 4 种交互行为模式（`ButtonType`）的九宫格柔性按钮渲染器；
2. **`FlyoutRenderer`**：继承自 `ButtonRenderer`，在绘制九宫格本体与文本的同时，在本体上、下、左、右任意一条边外侧附加绘制一枚与本体同主题、同样式、同阴影、同变体的指示箭头（**Pointer**），并支持按 `0.0f ~ 1.0f` 百分比沿边长平滑滑动指针位置。

---

## 一、 四种按钮行为模式 (`ButtonType`) 与状态转换表

`ButtonType#variant(ButtonInput)` 定义了从输入状态 `ButtonInput(boolean selected, boolean hovering, boolean allowedPressed, boolean pressStartedInside)` 到视觉变体 `SpriteVariant` 的映射规则：

| `ButtonType` 枚举值 | 适用场景 | 状态推导规则 |
| :--- | :--- | :--- |
| **`DISPLAY`** | 纯展示面板、信息标签、无交互浮窗 | 始终返回 `SpriteVariant.NORMAL`（不读取鼠标位置，无需在 `Scope` 中传 `mousePos`）。 |
| **`CLICK`** | 仅需悬停高亮、不需要按压下沉动画的轻量按钮 | `hovering == true` 时返回 `HIGHLIGHTED`，否则返回 `NORMAL`。 |
| **`MOMENTARY`** | 标准瞬时动作按钮（点击触发一次操作，松开恢复） | • 当 `pressStartedInside && hovering && allowedPressed`（在本按钮内按下且鼠标仍在按钮内按住）时，返回 **`HIGHLIGHTED_PRESSING`**（完全下沉）；<br>• 其余情况若 `hovering == true` 返回 `HIGHLIGHTED`，否则返回 `NORMAL`。 |
| **`TOGGLE`** | 开关按钮、单选/多选标签页（读取 `toggleState`） | • 当 `pressStartedInside && hovering && allowedPressed` 时，返回 **`HIGHLIGHTED_PRESSING`**；<br>• 当 `!hovering`（鼠标未悬停）时：若 `selected == true` 返回 **`PRESSED`**，否则返回 `NORMAL`；<br>• 当 `hovering`（鼠标悬停）时：若 `selected == true` 返回 **`HIGHLIGHTED_PRESSED`**，否则返回 `HIGHLIGHTED`。 |

> **防闪烁交互细节**：
> 只要 `hovering == true`，无论当前是否有其他鼠标键按住、也无论鼠标是不是从同一个 `Renderer` 的其他按钮上拖过来的，都会稳定保持悬停高亮；只有当按压起点 `startPressMousePos` 确实落在该按钮自身范围内时，才会进入 `HIGHLIGHTED_PRESSING` 下沉态。

---

## 二、 完整代码示例：在 Screen 中同时使用 `TOGGLE` 按钮与带指针 `FlyoutRenderer`

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

    // 1. 定义一个绑定了 autoOutputEnabled 状态的 TOGGLE 按钮渲染器
    private final ButtonRenderer toggleBtnRenderer = new ButtonRenderer();

    // 2. 定义一个深色主题、带 1px 阴影的浮窗 (Flyout) 渲染器
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

        // 绘制 TOGGLE 按钮
        try (ButtonRenderer.Scope scope = this.toggleBtnRenderer.open()) {
            scope.graphics(graphics)
                .font(this.font)
                .pos(btnX, btnY)
                .size(100, 20)
                .mousePos(mouseX, mouseY)
                .text(Component.literal(this.autoOutputEnabled ? "自动输出: 开启" : "自动输出: 关闭")
                    .withStyle(this.autoOutputEnabled ? ChatFormatting.GREEN : ChatFormatting.GRAY))
                .textOffset(10, 4)
                .render();

            // 若鼠标悬停在按钮上，在按钮上方绘制一个指针朝下 (PointerDirection.DOWN) 居中 (0.5f) 的浮窗
            if (scope.contains(new org.joml.Vector2f(mouseX, mouseY))) {
                try (FlyoutRenderer.Scope flyout = this.tooltipFlyoutRenderer.open()) {
                    flyout.graphics(graphics)
                        .font(this.font)
                        .pos(btnX, btnY - 28)
                        .literal("点击切换机器底部自动弹出产物")
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

## 三、 公开类 API 详解

### 1. `ButtonRenderer` 与 `ButtonRenderer.Scope`

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static int textColor(Component text)` | `int` | 提取 `text.getStyle().getColor()` 并补齐不透明 Alpha `0xFF000000`；若未设置样式颜色则返回纯白 `0xFFFFFFFF`。 |
| `public static int color(float alpha)` | `int` | 将 `[0.0f, 1.0f]` 的透明度转换为白色 ARGB 值（供九宫格切图与指针着色）。 |
| `public static int textColor(Component text, float alpha)` | `int` | 组合 `text` 的 RGB 颜色与 `alpha` 透明度。 |
| `public ButtonRenderer.Scope open()` | `ButtonRenderer.Scope` | 打开一个按钮绘制作用域。 |

### 2. `FlyoutRenderer`、`FlyoutRenderer.Scope` 与 `PointerDirection`

`FlyoutRenderer` 继承自 `ButtonRenderer`。

| 类 / 方法签名 | 返回值 | 说明与校验条件 |
| :--- | :--- | :--- |
| `PointerDirection` | `enum` | 指针贴附在浮窗本体的哪条边上：`LEFT`（左边朝左）、`RIGHT`（右边朝右）、`UP`（顶边朝上）、`DOWN`（底边朝下）。 |
| `FlyoutRenderer.Scope#pointer(PointerDirection direction, float percent)` | `FlyoutRenderer.Scope` | 同时设置指针朝向 `direction` 与沿边滑动位置百分比 `percent`（`[0.0f, 1.0f]`，两端自动留出 `POINTER_MARGIN = 2px` 边距，确保指针始终落在本体轮廓范围之内）。 |
| `FlyoutRenderer.Scope#pointerDirection(PointerDirection direction)`<br>`FlyoutRenderer.Scope#pointerPercent(float percent)` | `FlyoutRenderer.Scope` | 分别设置指针方向与百分比。**注意**：若只设置了其中一个而未设置另一个，调用 `render()` 时 `validate` 会报错抛出 `IllegalStateException("Some arguments are missing or invalid: pointerDirection / pointerPercent")`；若两个都不设置，则退化为不带指针的普通 `ButtonRenderer`。 |
| `public static PointerQuad pointerQuad(int x, int y, int width, int height)` | `PointerQuad` | 补偿指针纹理四周 1px 透明边后的实际绘制矩形 `new PointerQuad(x - 1, y - 1, width + 2, height + 2)`。 |
