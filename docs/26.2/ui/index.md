# UI 柔性控件库：精灵矩阵、主题与渲染作用域 (`module.ui`)

<BranchContextCard branch="26.2" />

`module.ui`（构件名 `anvillib-ui-neoforge-26.2`，包名 `dev.anvilcraft.lib.v2.ui`）是一套面向客户端 GUI 的**九宫格柔性按钮与带指针浮窗（Flyout）渲染库**。

在编写自定义 GUI 时，不同尺寸的按钮、标签切换卡和气泡提示框如果各自画一套固定大小贴图，贴图数量会呈指数爆炸；而手写悬停、按住下沉、选中保持、内边距自适应文本宽度（`flexSize`）又容易写出状态闪烁 Bug。`module.ui` 通过一套正交的**四维精灵矩阵（主题 × 立体风格 × 阴影厚度 × 五态交互变体）**和可复用的 **`Renderer<S>.Scope`** 作用域模型解决了这一问题。

本模块按功能拆分为 2 篇子文档：
- **本篇（精灵矩阵、主题スタイル与 `Renderer` 作用域基类）**：详解 `AnvilLibUi`、`FlexibleSprites`、`SpriteTheme`、`SpriteStyle`、`SpriteType`、`SpriteVariant`、`PointerDirection` 与 `Renderer<T>`。
- **[按钮与带指针浮窗渲染器](./buttons-and-flyouts)**：详解 `ButtonRenderer`、`FlyoutRenderer`、`ButtonType` 与 `ButtonInput`。

---

## 一、 接入配置与客户端限制

> **物理端提示**：`module.ui` 标注了 `@Mod(value = "anvillib_ui", dist = Dist.CLIENT)`，仅在物理客户端运行。

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-ui-neoforge-26.2:2.0.0")
}
```

---

## 二、 四维精灵矩阵与内边距自动补偿 (`FlexibleSprites`)

`FlexibleSprites` 在类初始化时利用 `FlattenLoop` 预生成了全部 $2 \times 2 \times 3 \times 5 = 60$ 种九宫格切图组合及其四向内边距（`leftPadding, topPadding, rightPadding, bottomPadding`）：

| 维度枚举 | 可选枚举值 | 贴图路径段 (`getPath()`) 与视觉含义 |
| :--- | :--- | :--- |
| **配色主题 (`SpriteTheme`)** | `LIGHT`（默认）、`DARK` | `LIGHT` 无前缀（`""`），`DARK` 前缀为 `"dark"`。 |
| **立体风格 (`SpriteStyle`)** | `THREE_D`（默认）、`FLAT` | `THREE_D` 无前缀（`""`），`FLAT` 前缀为 `"flat"`（扁平风格）。 |
| **阴影类型 (`SpriteType`)** | `NON_SHADED`（默认）<br>`SHADED_1PX`<br>`SHADED_2PX` | • `NON_SHADED`：无立体底边阴影，四向边距恒为 `[2, 2, 2, 2]`；<br>• `SHADED_1PX`：常态底边带 1px 阴影（边距 `[2, 2, 2, 3]`），按下时顶边加厚为 3px、底边收为 2px（`[2, 3, 2, 2]`），形成真实的**按钮下沉 1px 视觉效果**；<br>• `SHADED_2PX`：常态底边带 2px 阴影（`[2, 2, 2, 4]`），选中态（`PRESSED`）下沉 1px（`[2, 3, 2, 3]`），悬停按压态（`HIGHLIGHTED_PRESSING`）完全下沉 2px（`[2, 4, 2, 2]`）。 |
| **交互变体 (`SpriteVariant`)** | `NORMAL`（默认，无后缀）<br>`HIGHLIGHTED`<br>`PRESSED`<br>`HIGHLIGHTED_PRESSED`<br>`HIGHLIGHTED_PRESSING` | • `NORMAL`：常态；<br>• `HIGHLIGHTED`：未选中但鼠标悬停高亮；<br>• `PRESSED`：已选中（Toggle 激活）且鼠标未悬停；<br>• `HIGHLIGHTED_PRESSED`：已选中且鼠标悬停；<br>• `HIGHLIGHTED_PRESSING`：鼠标在按钮内按下且尚未松开（正在按压）。 |

当使用 `ButtonRenderer` 绘制文本时，文本起点会自动加上当前变体的 `info.leftPadding() + 1` 和 `info.topPadding() + 1`——这意味着当 `SHADED_1PX` 或 `SHADED_2PX` 按钮被按下导致 `topPadding` 从 `2` 变为 `3` 或 `4` 时，**按钮上的文字也会自动跟着向下位移 1~2 像素**，无需手动调整文字坐标！

---

## 三、 `Renderer<T>` 与 `Renderer.Scope` 核心用法

`Renderer<T>` 将**跨帧不变的样式/交互配置**（保存在 `Renderer` 实例上）与**单次绘制的位置、尺寸、文本和鼠标坐标**（保存在 `try (var scope = renderer.open())` 作用域中）分离：

- 同一个 `ButtonRenderer` 或 `FlyoutRenderer` 实例可以在一个界面中反复调用 `.open()` 绘制几十个同风格按钮；
- 在界面的 `mouseClicked` 中调用 `renderer.onPress(mouseX, mouseY)` 记录按压起点，在 `mouseReleased` 中调用 `renderer.onRelease()` 清空起点，即可让同一个 `Renderer` 下的所有按钮精确判断“本次按压是否起始于当前按钮内部”（防止从按钮外按住鼠标拖入按钮内时误触发按压态）。

### 代码示例：配置复用 `Renderer` 并使用 `flexSize` 自适应文本尺寸

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.ui.flexible.ButtonRenderer;
import dev.anvilcraft.lib.v2.ui.flexible.ButtonType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.joml.Vector2i;

public final class FlexibleRendererBasicExample {
    // 创建一个深色主题、2px 立体阴影、支持鼠标悬停与按压反馈的瞬时按钮渲染器
    private static final ButtonRenderer DARK_MOMENTARY_BTN = new ButtonRenderer();

    static {
        DARK_MOMENTARY_BTN.dark()
            .shaded2px()
            .buttonType(ButtonType.MOMENTARY)
            .basedOnMouse();
    }

    public static void renderAdaptiveButton(GuiGraphicsExtractor graphics, int x, int y, int mouseX, int mouseY) {
        Font font = Minecraft.getInstance().font;

        // 每次绘制打开一个 Scope（try-with-resources 结束时自动清空对 graphics 等对象的引用）
        try (ButtonRenderer.Scope scope = DARK_MOMENTARY_BTN.open()) {
            scope.graphics(graphics)
                .font(font)
                .pos(x, y)
                .mousePos(mouseX, mouseY)
                .literal("自适应宽度按钮")
                // flexSize(水平内边距 6px, 垂直内边距 3px)：根据文本宽度与九宫格边框自动算出总宽高
                .flexSize(6, 3);

            // 可在绘制前查询计算出的实际宽高用于排版
            Vector2i actualSize = scope.resolveSize();
            scope.render();
        }
    }
}
```

---

## 四、 公开类与枚举 API 详解

### 1. `FlexibleSprites`、`SpriteInfo` 与 `PointerSprite`

| 方法 / 记录签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static SpriteInfo pickSprite(SpriteTheme theme, SpriteStyle style, SpriteType type, SpriteVariant variant)` | `SpriteInfo` | 从预构建查找表中按位掩码 $O(1)$ 获取对应组合的九宫格切图信息。 |
| `public static @Nullable PointerSprite pickPointer(SpriteTheme theme, SpriteStyle style, SpriteType type, SpriteVariant variant, PointerDirection direction)` | `@Nullable PointerSprite` | 获取对应组合及方向（`LEFT` / `RIGHT` / `UP` / `DOWN`）的浮窗指针纹理及其可见像素尺寸（首次读取时通过 `NativeImage` 解析并减去四周 1px 透明边后缓存）。 |
| `record SpriteInfo(Identifier sprite, int leftPadding, int topPadding, int rightPadding, int bottomPadding, int pointerUpInset)` | `record` | 九宫格切图 ID、四向边框内边距，以及朝上指针在顶部阴影带外需额外下移的像素数 `pointerUpInset`。 |
| `record PointerSprite(Identifier texture, int width, int height, int pointerUpInset)` | `record` | 指针贴图纹理路径、可见内容宽高及 `pointerUpInset`。 |

### 2. `Renderer<T>` 方法一览

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `dark()` / `flat()` / `shaded1px()` / `shaded2px()` | `Renderer<T>` | 切换为深色主题（默认浅色）、扁平风格（默认 3D）、1px 或 2px 阴影（默认无阴影）。 |
| `highlighted()` / `highlightedPressed()` / `highlightedPressing()` / `pressed()` | `Renderer<T>` | 将渲染器固定为某一种静态变体（不随鼠标变化）。 |
| `buttonType(ButtonType buttonType)` | `Renderer<T>` | 设置按钮交互行为（`DISPLAY`、`CLICK`、`MOMENTARY`、`TOGGLE`，默认 `DISPLAY`）。 |
| `toggleState(BooleanSupplier toggleState)` | `Renderer<T>` | 设置当 `buttonType == ButtonType.TOGGLE` 时读取外部选中状态的回调。 |
| `basedOnMouse()`<br>`basedOnMouse(IntSet allowedKeys)` | `Renderer<T>` | 启用基于鼠标位置与按键状态的动态变体推导（无参重载默认允许左键 `GLFW_MOUSE_BUTTON_LEFT` 与右键 `GLFW_MOUSE_BUTTON_RIGHT`）。 |
| `alpha(float alpha)` | `Renderer<T>` | 设置整体不透明度 `[0.0f, 1.0f]`（同时作用于九宫格本体、指针与文本；传入 `NaN` 会被安全忽略）。 |
| `onPress(int x, int y)` / `onPress(Vector2f pos)`<br>`onRelease()` | `void` | 在鼠标按下/松开时记录或清除按压起点坐标 `startPressMousePos`。 |
| `variantOf(T scope)` / `open()` | `SpriteVariant` / `T` | 解析给定作用域当前的变体，或打开一个新的绘制作用域 `Scope`。 |

### 3. `Renderer<T>.Scope` 方法一览

实现 `AutoCloseable`。

| 方法签名 | 返回值 | 说明与校验条件 |
| :--- | :--- | :--- |
| `graphics(GuiGraphicsExtractor)` / `font(Font)` | `Scope` | 设置当前帧的 `GuiGraphicsExtractor`（必填）与绘制文本所用的 `Font`。 |
| `pos(int x, int y)` / `pos(Vector2i pos)` | `Scope` | 设置控件左上角屏幕坐标（必填）。 |
| `mousePos(int x, int y)` / `mousePos(Vector2f pos)` | `Scope` | 设置当前鼠标坐标（当启用了 `basedOnMouse` 且 `buttonType != DISPLAY` 时必填，缺失会在 `render()` 时抛出 `IllegalStateException`）。 |
| `size(int width, int height)` / `size(Vector2i size)` | `Scope` | 设置固定像素宽高。 |
| `flexSize(int padding)`<br>`flexSize(int horizontalPadding, int verticalPadding)`<br>`flexSize(int left, int top, int right, int bottom)` | `Scope` | 根据 `font`、`text` 宽度/行高、当前变体的九宫格四向边距以及传入的额外内边距动态计算宽高（要求必须先或后设置 `font` 与 `text`，否则抛 `IllegalStateException`）。 |
| `text(Component)` / `literal(String)` / `translatable(String, [Object...])` / `translatableWithFallback(String, String, [Object...])` | `Scope` | 设置按钮或浮窗内部显示的文本组件（文本颜色取自 `Component` 自身的 `Style#getColor()`，缺省为白色 `0xFFFFFFFF`）。 |
| `textOffset(int offsetX, int offsetY)` / `textOffset(Vector2i)` | `Scope` | 设置文本相对于九宫格内边距起点的额外像素偏移（调用 `flexSize` 时会自动将 `textOffset` 设为 `(leftPadding, topPadding)`）。 |
| `resolveSize()` / `contains(@Nullable Vector2f point)` | `@Nullable Vector2i` / `boolean` | 获取当前解析出的宽高，或测试点 `point` 是否落在控件命中区域内（命中判定固定使用 `SpriteVariant.NORMAL` 的内边距计算尺寸，防止与 `basedOnMouse` 产生无限递归）。 |
| `render()` / `close()` | `Scope` / `void` | 校验必填参数并执行绘制，或关闭作用域清空内部引用。 |
