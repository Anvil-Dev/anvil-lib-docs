# 轮盘控制器、界面与毛玻璃渲染

构建好 `WheelMenuModel` 后，`module.wheel` 提供开箱即用的 `WheelScreenController`、`WheelScreen`、`WheelWidget` 以及底层 GL 着色器毛玻璃管线 (`LibShaders` & `WheelFrostedBackground`)。

## 按键控制器：`WheelScreenController`

`WheelScreenController` 封装了热键的两种典型操作流（避免模组作者自己管理长按判定、松手切出和重复开窗）：

| 方法签名 | 适用模式与行为 |
| --- | --- |
| `openTap(WheelMenuModel menuModel)` | **点按开关模式 (`WheelOpenMode.TAP`)**：打开可点击保持开启的 `WheelScreen.tap(model)`；再按或点击选项后关闭 |
| `onHoldKeyPressed(WheelMenuModel menuModel)` | **长按起手模式 (`WheelOpenMode.HOLD`)**：在按键 `KeyMapping` 首次按下时呼出 `WheelScreen.hold(model)` |
| `onHoldKeyReleased()` | **长按松开收尾**：在对应按键释放时自动调用当前活动轮盘的 `WheelScreen#triggerFromHoldRelease()` 执行悬停选中项动作并播放闭合动画 |

### 在客户端 Tick 中接入快捷键示例

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

## 界面与控件：`WheelScreen` & `WheelWidget`

### `WheelScreen`

`WheelScreen` 继承原版 `Screen`（默认 `isPauseScreen()` 返回 `false`），负责管理多层级子菜单压栈退栈、滚轮翻页（`mouseScrolled`）、点击/Esc 取消（`mouseClicked`、`keyPressed`、`onClose`）以及安全释放显存（`removed()`）：
- 静态构造工厂：`WheelScreen.tap(WheelMenuModel)`、`WheelScreen.hold(WheelMenuModel)`（也可直接 `new WheelScreen(model, openMode)`）。
- 当通过 `triggerFromHoldRelease()` 收起轮盘时，若指针位于有效可选项扇区，会自动触发绑定回调。

### `WheelWidget` 全量扩展接口

如需把径向轮盘直接嵌入现有容器菜单界面（而非作为全屏 `Screen` 打开），可以直接实例化 `WheelWidget`：

- 提供 8 个参数渐进的公共构造器，支持指定屏幕坐标 `(x, y, width, height)`、圆环内外半径 `(ringInnerRadius, ringOuterRadius)`、扇区列表 `List<RawSection>`、中心死区 `deadZone`、缩放文字大小 `textScale`、角度偏移 `degreeOffsetAngle` 以及颜色/动画时长参数。
- 关键配置方法：
  - `setSelectionEffect(WheelSelectionEffect)` / `setSelectionEffectColor(int argb)`
  - `setFrostedBackground(@Nullable WheelFrostedBackground)`
  - `setPageState(boolean hasPreviousPage, boolean hasNextPage)`
  - `setCurrentIndex(int index)` / `clearSelection()`
  - `checkMousePos(double mouseX, double mouseY)` / `mouseScrolled(...)`
  - `render(GuiGraphics, mouseX, mouseY, partialTick)` / `renderClosingAnimation(GuiGraphics)` / `onClosing()`
  - 内嵌辅助类型：`WheelWidget.SectionRenderer`、`WheelWidget.RawSection`、`WheelWidget.WheelSection` 与静态环形绘制方法 `WheelWidget.renderRing(...)`。

## 着色器注册与毛玻璃背景：`LibShaders` & `WheelFrostedBackground`

在 1.21.4 中，`LibShaders` 全面改用 `net.minecraft.client.renderer.ShaderProgram` 注册内置核心着色器，并由 `Minecraft.getInstance().getShaderManager().getProgram(...)` 返回可空的 **`@Nullable CompiledShaderProgram`**，因此自定义绘制逻辑在使用返回着色器前应当判空回退：

| 着色器获取方法 | 注册资源定位 (`anvillib:core/*`) | 顶点格式 | 用途 |
| --- | --- | --- | --- |
| `LibShaders.getRingShader()` | `core/ring` | `POSITION_COLOR` | 圆环边框与外圈高光 |
| `LibShaders.getSelectionShader()` | `core/selection` | `POSITION_COLOR` | 光点选中标示效 |
| `LibShaders.getAnnularSectorShader()` | `core/annular_sector` | `POSITION_COLOR` | 扇环高亮块与分区分隔块 |
| `LibShaders.getDiscShader()` | `core/disc` | `POSITION_COLOR` | 纯色半透明圆盘底色 |
| `LibShaders.getFrostedDiscShader()` | `core/frosted_disc` | `POSITION_TEX_COLOR` | 采样高斯模糊帧缓冲绘制带遮罩圆形毛玻璃 |
| `LibShaders.getBlurShader()` | `core/blur` | `POSITION_TEX` | 双向二维高斯模糊通道着色器 |
| `LibShaders.getSegmentShader()` | `core/segment` | `POSITION_COLOR` | 锐利直线分割边线 |

### `WheelFrostedBackground`（离屏双重高斯模糊）

`WheelFrostedBackground` 实现 `AutoCloseable`，内部维护两个 1.21.4 3 参数 `TextureTarget(width, height, true)` 离屏帧缓冲：
1. 每帧渲染背景前调用 `capture(GuiGraphics)`，从主游戏渲染目标拷贝当前帧画面并执行水平/垂直两趟模糊 Pass；
2. 返回已经完成模糊的 OpenGL Texture ID，供 `WheelWidget#renderFrostedBackground(...)` 采样到 `frosted_disc` 着色器；
3. 窗口或界面关闭时调用 `close()` 销毁内部 `TextureTarget` 释放显存。
