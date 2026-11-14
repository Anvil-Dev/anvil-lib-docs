# 按钮与带指针浮窗渲染器

在 `Renderer` 与 `FlexibleSprites` 之上，`module.ui` 提供了两个开箱即用的具象渲染器：**矩形按钮渲染器 `ButtonRenderer`** 与 **带箭头指针浮窗渲染器 `FlyoutRenderer`**，同时配套枚举 `ButtonType` 与记录类 `ButtonInput` 统一管理点击/瞬时/开关态逻辑。

## 交互状态机：`ButtonType` & `ButtonInput`

当为渲染器启用 `basedOnMouse(...)` 后，控件外观由 `buttonType.variant(ButtonInput)` 精确映射：

| 按钮类型 | 行为说明 | 产生的 `SpriteVariant` |
| --- | --- | --- |
| `DISPLAY` | 纯展示框/静态标签，完全忽略鼠标位置与按键 | 恒为 `NORMAL` |
| `CLICK` | 标准点击按钮，仅区分鼠标是否悬停（按住时不切换按压下沉图） | `NORMAL` / `HIGHLIGHTED` |
| `MOMENTARY` | 瞬时按压按钮：仅当按压起点落在本控件内部且允许键仍被按住同时鼠标仍在控件内时进入按压下沉态 | `NORMAL` / `HIGHLIGHTED` / `HIGHLIGHTED_PRESSING` |
| `TOGGLE` | 开关按钮：结合外部 `toggleState`（选中状态），未悬停时可表现为常态下沉态，悬停/按住均有独立贴图 | `NORMAL` / `PRESSED` / `HIGHLIGHTED` / `HIGHLIGHTED_PRESSED` / `HIGHLIGHTED_PRESSING` |

::: tip 防抖交互设计
悬停高亮不受无关按键按下或鼠标从相邻按钮滑入的影响——**哪怕按住鼠标从按钮 A 拖到按钮 B，按钮 B 依然正确高亮而不会闪烁，且因为 `pressStartedInside` 为 `false`，按钮 B 不会被误触发为 `HIGHLIGHTED_PRESSING`。**
:::

## 完整代码示例：在一个 Screen 中使用自适应开关按钮与带指针提示气泡

下面演示如何用最少代码构建一个交互式面板：左侧是一个根据多语言文本自动撑宽的暗色 3D 开关按钮，右侧根据按钮状态淡入淡出显示一个指针朝左指向按钮中部的提示浮窗。

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

    // 1. 开关按钮渲染器（暗色主题 + 1px 阴影 + TOGGLE 模式）
    private final ButtonRenderer toggleBtn = (ButtonRenderer) new ButtonRenderer()
        .dark()
        .shaded1px()
        .buttonType(ButtonType.TOGGLE)
        .toggleState(() -> this.magnetEnabled)
        .basedOnMouse();

    // 2. 浮窗气泡渲染器（亮色扁平 + 1px 阴影 + DISPLAY 仅展示模式）
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

        // 绘制开关按钮并获取其自适应尺寸与悬停判定
        try (ButtonRenderer.Scope scope = this.toggleBtn.open()) {
            scope.graphics(graphics)
                .font(this.font)
                .pos(btnX, btnY)
                .mousePos(mouseX, mouseY)
                .literal(this.magnetEnabled ? "磁吸模式：开启" : "磁吸模式：关闭")
                .flexSize(8, 5)
                .render();

            btnSize = scope.resolveSize();
            hoveringBtn = scope.contains(new Vector2f(mouseX, mouseY));
        }

        // 平滑更新气泡透明度（NaN 会被 alpha() 安全忽略）
        float targetAlpha = hoveringBtn ? 1.0F : 0.0F;
        this.tipAlpha += (targetAlpha - this.tipAlpha) * 0.25F;
        if (this.tipAlpha > 0.01F && btnSize != null) {
            this.tipFlyout.alpha(this.tipAlpha);
            try (FlyoutRenderer.Scope flyout = this.tipFlyout.open()) {
                flyout.pointer(PointerDirection.LEFT, 0.5F) // 左侧边正中指针指向按钮
                    .graphics(graphics)
                    .font(this.font)
                    .pos(btnX + btnSize.x + 8, btnY)
                    .literal("自动吸附周围 8 格内的掉落物")
                    .flexSize(6, 4)
                    .render();
            }
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        this.toggleBtn.onPress((int) mouseX, (int) mouseY);
        if (button == 0) {
            // 使用临时作用域执行纯命中检测（不调用 render，无副作用）
            try (ButtonRenderer.Scope scope = this.toggleBtn.open()) {
                scope.font(this.font)
                    .pos(this.width / 2 - 90, this.height / 2 - 12)
                    .literal(this.magnetEnabled ? "磁吸模式：开启" : "磁吸模式：关闭")
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

::: warning 使用细节与坑点提示
1. **九宫格切图与指针透明机制**：
   - `ButtonRenderer` 通过 `ButtonRenderer.applyAlpha(graphics, alpha)` 临时改变全局 `RenderSystem.setShaderColor` 并在 `finally` 中调用 `resetAlpha` 恢复，因此嵌套 `alpha` 会与原版全局颜色调制相乘。
   - **原版文本透明丢弃阈值**：Minecraft 原版文字着色器会直接丢弃 `alpha < 0.1` 的文字片段，在淡出动画最后 `0.1` 区间内文字会比九宫格背景更早隐去。
2. **指针参数必须成对出现**：`FlyoutRenderer.Scope` 支持同时不传指针（即当普通浮窗框画），但如果你只调用了 `pointerDirection(...)` 却忘了调用 `pointerPercent(...)`（或只传了其中一个），`render()` 时校验会抛出 `IllegalStateException`。推荐直接使用合写方法 `pointer(direction, percent)`。
3. **指针位置计算边界**：`pointerPercent` 被自动钳制在 `[0.0F, 1.0F]`，并且沿着所贴边前后各自留出 `2px` 边距，指针整体不会探出本体矩形轮廓或遮挡边框内容。
:::

## 公开 API 完整参考

### 1. `ButtonType` & `ButtonInput`

包名：`dev.anvilcraft.lib.v2.ui.flexible`

| 类型 / 成员签名 | 说明 |
| --- | --- |
| `enum ButtonType` | 枚举值：`CLICK`、`MOMENTARY`、`TOGGLE`、`DISPLAY` |
| `SpriteVariant ButtonType.variant(ButtonInput input)` | 根据按钮交互模式与当前输入快照计算目标贴图变体 |
| `record ButtonInput(boolean selected, boolean hovering, boolean allowedPressed, boolean pressStartedInside)` | 状态输入记录；另有 `@Deprecated` 五参数旧构造器 `(..., boolean anyPressed, ...)`（保留二进制兼容并忽略 `anyPressed`） |

### 2. `ButtonRenderer`

包名：`dev.anvilcraft.lib.v2.ui.flexible` · 继承：`Renderer<ButtonRenderer.Scope>`

| 成员 / 方法签名 | 说明 |
| --- | --- |
| `static int textColor(Component text)` | 提取文本组件自身的 `TextColor` 并强制补齐不透明 Alpha `0xFF000000`（缺省为纯白 `0xFFFFFFFF`） |
| `static int textColor(Component text, float alpha)` | 在 `textColor(text)` 基础上按 `alpha` 计算最终 ARGB 文字颜色 |
| `static int color(float alpha)` | 生成仅调制 Alpha 的纯白 ARGB 颜色（供指针或九宫格着色使用） |
| `static float @Nullable [] applyAlpha(GuiGraphics graphics, float alpha)` | 当 `alpha < 1.0F` 时先 `graphics.flush()` 并备份原 `RenderSystem.getShaderColor()` 后乘算 Alpha；若 `alpha >= 1.0F` 则返回 `null` |
| `static void resetAlpha(GuiGraphics graphics, float @Nullable [] previous)` | 将着色器颜色恢复至 `applyAlpha` 前的状态（若 `previous == null` 则无操作） |
| `ButtonRenderer.Scope open()` | 打开按钮渲染器专用单帧作用域 |

### 3. `FlyoutRenderer` & `FlyoutRenderer.Scope`

包名：`dev.anvilcraft.lib.v2.ui.flexible` · 继承：`ButtonRenderer`

| 成员 / 方法签名 | 说明 |
| --- | --- |
| `record PointerQuad(int x, int y, int width, int height)` | 指针贴图绘制矩形参数 |
| `static PointerQuad pointerQuad(int x, int y, int width, int height)` | 根据可见内容区域向外四边各扩展 `1px` 透明边距（生成 `(x - 1, y - 1, width + 2, height + 2)`） |
| `FlyoutRenderer.Scope open()` | 打开浮窗渲染器专用单帧作用域（继承自 `ButtonRenderer.Scope`） |
| `Scope pointer(PointerDirection direction, float percent)` | 一次性设定指针所在边/箭头方向与沿该边的百分比位置 `[0, 1]` |
| `Scope pointerDirection(PointerDirection direction)` | 单独设置指针所在边（必须在绘制前配合 `pointerPercent` 使用） |
| `Scope pointerPercent(float percent)` | 单独设置指针沿边的百分比位置（必须在绘制前配合 `pointerDirection` 使用） |
