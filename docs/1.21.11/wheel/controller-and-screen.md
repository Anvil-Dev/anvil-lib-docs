# 轮盘控制器、界面与毛玻璃渲染

构建好 `WheelMenuModel` 后，`module.wheel` 提供开箱即用的 `WheelScreenController`、`WheelScreen`、`WheelWidget`，并在底层结合 `module.rendering` 的 `GaussianBlur` 与 GUI 渲染状态管线（`LibRenders`、`LibDynamicUniforms`、`*RenderState` 与 `WheelFrostedBackground`）实现高性能离屏模糊毛玻璃盘面与矢量扇环渲染。

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

`WheelScreen` 继承原版 `Screen`（默认 `isPauseScreen()` 返回 `false`），负责管理多层级子菜单压栈退栈、滚轮翻页（`mouseScrolled`）、点击/Esc 取消（`mouseClicked(MouseButtonEvent, boolean)`、`keyPressed(KeyEvent)`、`onClose`）以及安全释放模糊纹理与采样器资源（`removed()`）：
- 静态构造工厂：`WheelScreen.tap(WheelMenuModel)`、`WheelScreen.hold(WheelMenuModel)`（也可直接 `new WheelScreen(model, openMode)`）。
- 当通过 `triggerFromHoldRelease()` 收起轮盘时，若指针位于有效可选项扇区，会自动触发绑定回调。

### `WheelWidget` 全量扩展接口

如需把径向轮盘直接嵌入现有容器菜单界面（而非作为全屏 `Screen` 打开），可以直接实例化 `WheelWidget`：

- 提供 8 个参数渐进的公共构造器，支持指定屏幕坐标 `(x, y, width, height)`、圆环内外半径 `(ringInnerRadius, ringOuterRadius)`、扇区列表 `List<RawSection>`、中心死区 `deadZone`、缩放文字大小 `textScale`、角度偏移 `degreeOffsetAngle` 以及颜色/动画时长参数。
- 关键渲染与交互方法：
  - `setSelectionEffect(WheelSelectionEffect)` / `setSelectionEffectColor(int argb)`
  - `setFrostedBackground(@Nullable WheelFrostedBackground)`
  - `setPageState(boolean hasPreviousPage, boolean hasNextPage)`
  - `setCurrentIndex(int index)` / `clearSelection()`
  - `getSectionCircleRadius()` / `getSectionSize()`
  - `checkMousePos(double mouseX, double mouseY)` / `mouseScrolled(...)` / `shouldRender()`
  - `render(GuiGraphics, mouseX, mouseY, partialTick)` / `renderClosingAnimation(GuiGraphics)` / `onClosing()`
  - 独立图元提交方法：`renderDisc(...)`、`renderFrostedBackground(...)`、`renderSeparatorRing(...)`、`renderSelectionEffect(...)`、`renderAnnularSectorSelection(...)`
  - 内嵌辅助类型：`WheelWidget.SectionRenderer`、`WheelWidget.RawSection`、`WheelWidget.WheelSection`。

## 渲染管线、动态 UBO 与毛玻璃盘面

轮盘部件采用原版 `RenderPipeline` + `DynamicUniformStorage` UBO + `LibQuadGuiElementRenderState` 提交：

- **`LibRenders`**（内部渲染管线定义）：提供 `RING_PIPELINE`（`RingUniform`）、`SELECTION_PIPELINE`（`SelectionUniform`）、`ANNULAR_SECTOR_PIPELINE`（`AnnularSectorUniform`）与 `FROSTED_DISC_PIPELINE`（`FrostedDiscUniform` + `Sampler0`）。
- **`LibDynamicUniforms`**：在 `ConfigureMainRenderTargetEvent` 初始化并由 `AnvilLibWheel.getLibDynamicUniforms()` 持有，通过 `writeRing`、`writeSelection`、`writeAnnularSector`、`writeFrostedDisc` 向 GPU 写入当前帧参数切片，并在 GUI 渲染结束后调用 `reset()`（`endFrame()`）。
- **GUI 元素渲染状态**（均实现 `LibQuadGuiElementRenderState`，通过 `buildVertices(VertexConsumer)` 提交顶点）：`RingRenderState`、`SelectionRenderState`、`AnnularSectorRenderState`、`FrostedDiscRenderState`。
- **`WheelFrostedBackground`（基于 `GaussianBlur` 的离屏毛玻璃）**：实现 `AutoCloseable`，内部持有一个 `new GaussianBlur(2.0f, 1.0f)` 与一个 `GpuSampler`（`AddressMode.CLAMP_TO_EDGE`、`FilterMode.LINEAR`）。每帧渲染背景时：
  1. `capture()` 检查主渲染目标尺寸并在尺寸变更时同步 `blur.resize(width, height)`；
  2. 调用 `blur.process(mainTarget.getColorTexture())` 对主画面做高斯模糊，复用或重建 `GpuTextureView` 并返回 `TextureSetup.singleTexture(this.blurredTextureView, this.sampler)`；
  3. 在界面 `init()` 重建和 `removed()` 关闭时自动调用 `close()` 释放 `GpuSampler`、纹理视图与 `GaussianBlur` 资源。
