# 按钮与带指针浮窗渲染器 (`ButtonRenderer` & `FlyoutRenderer`)

`ButtonRenderer` 与 `FlyoutRenderer` 均继承自 `Renderer`，是 `module.ui` 中直接面对业务的两种最终控件渲染器：前者绘制常规自适应按钮，后者在此基础上增加四个方向及百分比滑动的指向尖角贴图（常用于引导提示条、工具栏浮窗与上下文弹出框）。

控件精灵与指针纹理统一通过 `RenderPipelines.GUI_TEXTURED` 管线结合逐实例 ARGB 颜色提交，整体透明度通过颜色参数直接生效，不会受同帧内其它 UI 绘制 flush 的影响。

## `ButtonRenderer` 详解

### 颜色、透明度与静态辅助方法

| 方法 | 说明 |
| --- | --- |
| `ButtonRenderer.textColor(Component text)` | 提取文本组件样式自带前景色并补齐不透明 Alpha（`0xFF000000`），缺省为白色 `0xFFFFFFFF` |
| `ButtonRenderer.textColor(Component text, float alpha)` | 按文本样式颜色与整体透明度 `alpha` 组合返回 ARGB 颜色整数 |
| `ButtonRenderer.color(float alpha)` | 按 `alpha`（钳位至 `[0.0F, 1.0F]`）返回带透明度的白色 ARGB 着色整数 |
| `open()` | 返回 `ButtonRenderer.Scope` 帧作用域 |

## `FlyoutRenderer`（带指针尖角浮窗）详解

`FlyoutRenderer` 继承 `ButtonRenderer`，核心用于绘制**带小三角指针的气泡面板**：

### 方向枚举：`PointerDirection`

可选值包括 `UP` / `DOWN` / `LEFT` / `RIGHT`，通过 `getPath()` 拼接指针贴图资源路径，配合 `FlyoutRenderer.pointerQuad(int x, int y, int width, int height)` 计算指针相对于主框的精确像素坐标 `PointerQuad(int x, int y, int width, int height)`。

### `FlyoutRenderer.Scope` 扩充方法

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `pointer(PointerDirection direction, float percent)` | `FlyoutRenderer.Scope` | 同时设置指针所指朝向与沿该边的滑动比例（`0.0F ~ 1.0F`，常用 `0.5F` 居中） |
| `pointerDirection(PointerDirection direction)` | `FlyoutRenderer.Scope` | 单独设置指针指向哪一侧边缘 |
| `pointerPercent(float percent)` | `FlyoutRenderer.Scope` | 设置指针沿锚定边的位置百分比 |

`FlyoutRenderer` 底层通过：
`graphics.blit(RenderPipelines.GUI_TEXTURED, texture, quad.x(), quad.y(), 0.0F, 0.0F, quad.width(), quad.height(), quad.width(), quad.height(), quad.width(), quad.height(), ButtonRenderer.color(this.alpha))`
完成指针贴图混合着色，可随主窗体 `.alpha(...)` 平滑渐隐渐现。

## 完整示例：在 Screen 中绘制交互按钮与提示浮窗

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

        // 1. 渲染随文字自动拉伸的内边距按钮
        try (ButtonRenderer.Scope scope = (ButtonRenderer.Scope) this.actionBtn.open()
            .graphics(graphics)
            .font(this.font)
            .pos(btnX, btnY)
            .mousePos(mouseX, mouseY)
            .literal("Apply Settings")
            .flexSize(10, 6)) {
            scope.render();

            // 2. 若鼠标悬停在按钮上，则在下方弹出暗色扁平带尖角浮窗
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
