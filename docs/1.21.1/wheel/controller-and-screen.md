# 轮盘控制器、界面与毛玻璃渲染

构建好 [`WheelMenuModel`](./index.md) 后，客户端接入仅需一个常驻的 `WheelScreenController` 实例挂载按键映射即可。底层 `WheelScreen`、`WheelWidget`、`WheelFrostedBackground` 与 `LibShaders` 会接管菜单栈翻页、关闭收起动画、全屏四遍高斯模糊毛玻璃采样以及环扇高亮 GLSL 着色器绘制。

## 渲染管线与按键生命周期

1. **着色器自动注册（`LibShaders`）**：在 `RegisterShadersEvent` 阶段注册 `anvillib:ring`、`selection`、`annular_sector`、`disc`、`frosted_disc`、`blur`、`segment` 共 7 个 Core Shader，全部采用安全 Uniform 回退机制（若光影包导致某着色器未就绪，会自动回落到 CPU 顶点绘制 fallback）。
2. **输入驱动（`WheelScreenController`）**：
   - **TAP 模式**：调用 `openTap(model)` 打开 `WheelScreen.tap(model)`；左键点击确认当前悬停项（若为子菜单则入栈，若为动作则执行并播关闭动画），`ESC` 返回上一级或关闭。
   - **HOLD 模式**：按键按下帧调用 `onHoldKeyPressed(model)`（内置防重复开启与外部界面打断检测），按键松开帧调用 `onHoldKeyReleased()` 自动执行 `triggerFromHoldRelease()`。
3. **毛玻璃背景（`WheelFrostedBackground`）**：每帧捕获 `Minecraft.getInstance().getMainRenderTarget()` 颜色纹理，在两张 `TextureTarget` 间执行水平/垂直交替共 4 pass 高斯模糊，再由 `frosted_disc` 着色器在轮盘半径内裁剪并叠加半透明底色；在 `WheelScreen.removed()` 时自动释放纹理缓冲避免显存泄漏。

## 完整示例：绑定 KeyMapping 驱动 TAP 与 HOLD 双模式轮盘

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

## 公开 API 完整参考

### 1. `WheelScreenController`

包名：`dev.anvilcraft.lib.v2.wheel.client.input`

| 方法签名 | 说明与边界保护 |
| --- | --- |
| `public WheelScreenController()` | 默认无参构造器（非单例，建议每个功能快捷键持有一个独立实例） |
| `void openTap(WheelMenuModel menuModel)` | 设置当前界面为 `WheelScreen.tap(menuModel)` |
| `void onHoldKeyPressed(WheelMenuModel menuModel)` | 打开 `WheelScreen.hold(menuModel)` 并记录引用。若玩家已切换到其他 `Screen` 会先清理旧引用；若当前仍在按住该 Hold 界面则幂等返回 |
| `void onHoldKeyReleased()` | 仅当 `minecraft.screen` 仍为本控制器打开的 Hold 界面时，调用 `screen.triggerFromHoldRelease()` 并清空引用 |

### 2. `WheelScreen`

包名：`dev.anvilcraft.lib.v2.wheel.client.gui.screen`（继承 `net.minecraft.client.gui.screens.Screen`）

> 轮盘内外半径按屏幕短边比例动态计算：`ringInnerRadius = min(w, h) * 0.17f`，`ringOuterRadius = min(w, h) * 0.33f`。

| 构造 / 方法签名 | 说明 |
| --- | --- |
| `public WheelScreen(WheelMenuModel model, WheelOpenMode openMode)` | 构造方法，初始将 `model.rootEntries()` 压入菜单栈 |
| `static WheelScreen tap(WheelMenuModel model)` | 创建 `WheelOpenMode.TAP` 实例 |
| `static WheelScreen hold(WheelMenuModel model)` | 创建 `WheelOpenMode.HOLD` 实例 |
| `void triggerFromHoldRelease()` | 当 `openMode == HOLD` 时触发当前选中扇区动作并启动关闭动画；否则无操作 |
| `boolean isPauseScreen()` | 返回 `false`（打开轮盘时不暂停客户端单人世界逻辑） |
| `protected void init()` / `public void removed()` | 管理 `WheelFrostedBackground` 的创建、复用清理与 FBO 销毁，并调用 `rebuildWheelWidget` |
| `void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick)` | 委托给内部 `WheelWidget.render(...)` |
| `boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)` | 多页时滚轮向上切下一页、向下切上一页（环形取模）并重建组件 |
| `boolean mouseClicked(double mouseX, double mouseY, int button)` | 在 `TAP` 模式下左键 (`button == 0`) 触发当前高亮项或子菜单 |
| `boolean keyPressed(int keyCode, int scanCode, int modifiers)` | 捕获 `ESC` (`keyCode == 256`)：子菜单栈深度大于 1 时弹栈回到上一级并重置页码为 0，否则关闭屏幕 |
| `void onClose()` | 优先通知 `wheelWidget.onClosing()` 播放缩回关闭动画（待关闭动画结束后由控件回调 `Minecraft.setScreen(null)`） |

### 3. `WheelWidget` 及内部数据记录

包名：`dev.anvilcraft.lib.v2.wheel.client.gui.component`（继承 `AbstractWidget`）

#### 常量与记录类

| 成员签名 | 说明 |
| --- | --- |
| `public static final int IGNORE_CURSOR_MOVE_LENGTH = 15` | 内环半径最小下限常量（`Math.max(ringInnerRadius, IGNORE_CURSOR_MOVE_LENGTH)`） |
| `public static final int DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02` | 默认选择高亮色 |
| `@FunctionalInterface public interface SectionRenderer` | `void render(GuiGraphics graphics, PoseStack pose, int width, int height)` |
| `public record RawSection(Component name, @Nullable SectionRenderer renderer, boolean selectable)` | 原始扇区构造项（提供两参默认 `selectable = true` 构造） |
| `public record WheelSection(Vector2f center, float angle, float angleStart, float angleEnd, Component subTitle, @Nullable SectionRenderer renderer, boolean selectable)` | 已完成角度分布与图标中心坐标计算的运行时扇区条目 |

#### 构造方法（8 个重载）

全部构造方法最终汇聚到全参数主构造：

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

简化重载提供的默认值如下：
- 省略时间/颜色参数的重载默认使用：`delay = 150` ms、`animationMs = 300` ms、`closingAnimationMs = 150` ms、`ringColor = 0x88000000`、`selectionEffectColor = 0xFFFABC02`、`selectionAnimationSpeedFactor = 5f`、`textColor = 0xfdfdfd`、`textScale = 1f`、`degreeOffsetAngle = 0f`、`message = Component.empty()`。
- 其余 7 个简化重载依次按需求开放 `message`、`textScale`、`degreeOffsetAngle`、`delay/animationMs/closingAnimationMs/ringColor/selectionEffectColor/selectionAnimationSpeedFactor/textColor` 子集。

#### 实例与静态方法

| 方法签名 | 说明 |
| --- | --- |
| `int getCurrentSectionIndex()` | 由 `@Getter` 提供，当前选中扇区索引（无选中或在死区内为 `-1`） |
| `boolean isClosingAnimationStarted()` / `void setClosingAnimationStarted(boolean)` | 读取或设置关闭动画状态标志 |
| `WheelWidget setSelectionEffect(WheelSelectionEffect selectionEffect)` | 切换 `DOT` / `ANNULAR_SECTOR`（链式返回自身） |
| `WheelWidget setSelectionEffectColor(int selectionEffectColor)` | 动态调整高亮颜色 |
| `WheelWidget setFrostedBackground(@Nullable WheelFrostedBackground frostedBackground)` | 绑定毛玻璃离屏模糊器 |
| `WheelWidget setPageState(boolean hasPreviousPage, boolean hasNextPage)` | 控制左右翻页尖括号指示箭头的显隐 |
| `WheelWidget setCurrentIndex(int index)` | 编程式选中指定可交互扇区并同步角度动画目标 |
| `WheelWidget clearSelection()` | 清空当前高亮选中项（设为 `-1`） |
| `float getSectionCircleRadius()` | 返回扇区图标所在的中心圆周半径 `(ringOuterRadius + ringInnerRadius) * 0.5f` |
| `int getSectionSize()` | 返回当前页扇区数量 |
| `boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)` | 独立的逐项滚轮步进高亮逻辑（注：`WheelScreen` 本身将滚轮拦截用于翻页，若直接在自定义 `Screen` 中使用 `WheelWidget` 可利用该方法逐槽步进） |
| `void checkMousePos(double mouseX, double mouseY)` | 计算光标相对于中心的距离与角度，死区内清空选中，否则更新选中扇区及停留计时 |
| `boolean shouldRender()` | 超过初始延迟 `delay` 毫秒后返回 `true` |
| `void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick)` | 执行一帧完整轮盘、毛玻璃背景、分隔环、扇区高亮、图标、居中标题与翻页指示绘制 |
| `void renderDisc(GuiGraphics guiGraphics, float progress)` | 使用当前 `ringColor` 与缩放进度绘制盘面底圆 |
| `void renderFrostedBackground(GuiGraphics guiGraphics, float progress)` | 触发高斯模糊并使用 `frosted_disc` 着色器混合叠加毛玻璃盘面 |
| `void renderSeparatorRing(GuiGraphics guiGraphics, float progress)` | 绘制内圈中心区与扇区之间的白色分隔细环 |
| `void renderSelectionEffect(GuiGraphics guiGraphics, float centerX, float centerY, int color, float ringWidth)` | 绘制 `DOT` 模式发光圆点（无着色器时自动回退） |
| `void renderAnnularSectorSelection(GuiGraphics guiGraphics, float centerX, float centerY, int color, float innerRadius, float outerRadius, float centerAngleRad, float rangeAngleRad)` | 绘制 `ANNULAR_SECTOR` 模式带圆角/抗锯齿边线的环形高亮扇区 |
| `void onClosing()` | 启动关闭缩回动画，首次调用将记录动画计时起点 |
| `void renderClosingAnimation(GuiGraphics guiGraphics)` | 播放缩放收起帧；动画结束后自动执行关闭屏幕逻辑 |
| `static void renderRing(GuiGraphics guiGraphics, float centerX, float centerY, int color, float innerDiameter, float outerDiameter)` | 静态圆环绘制工具方法，供内外部通用绘制高精度抗锯齿圆环 |

### 4. `LibShaders` 与内部 `WheelFrostedBackground`

| 类型与成员 | 说明 |
| --- | --- |
| `LibShaders` (`dev.anvilcraft.lib.v2.wheel.client.init`) | `@EventBusSubscriber(modid = AnvilLibWheel.MOD_ID, value = Dist.CLIENT)`；订阅 `RegisterShadersEvent` 提供 package-private `@Getter`：`getRingShader()`、`getSelectionShader()`、`getAnnularSectorShader()`、`getDiscShader()`、`getFrostedDiscShader()`、`getBlurShader()`、`getSegmentShader()` |
| `@ApiStatus.Internal WheelFrostedBackground implements AutoCloseable` | 内部双 `TextureTarget` 乒乓 4-pass 高斯模糊管理类，公开 `int capture(GuiGraphics guiGraphics)` 与 `void close()` |
