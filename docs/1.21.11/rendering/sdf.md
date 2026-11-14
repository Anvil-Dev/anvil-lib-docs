# 2D SDF 矢量图形渲染 (SdfGraphics / Sdf2d)

在 GUI 中绘制高精度圆角面板、进度圆弧、环状扇区或发光徽标时，传统基于贴图拉伸的方法容易在高 DPI 或缩放下出现锯齿、圆角畸变以及边框粗细不均。`dev.anvilcraft.lib.v2.rendering.sdf` 基于片段着色器与有向距离场（Signed Distance Field）数学模型提供了分辨率无关的矢量图形管线：

- **`SdfGraphics`**：单例流式绘制 API，在 `GuiGraphics` 中批量收集图形调用，通过 `GuiRendererMixin` 在 UI 元素网格收集阶段自动调用 `SdfGraphics.flush()` 提交参数与绘制状态。支持 **10 种基础形状**、平滑抗锯齿 (`smooth`)、圆角 (`round`)、空心描边 (`stroke`/`onion`)、径向发光 (`light`)、中心/左上角对齐开关 (`center`)、自由旋转 (`rotate`)，以及 **共享参数实例缓存 (`share`/`cache`)**。
- **`Sdf2d`**：与 GPU 着色器完全一致的纯 CPU 浮点距离计算函数，可直接用于高精度的鼠标悬停/点击碰撞判定（`SdfGraphics#collide` 底层即委托 `Sdf2d.sd(...)`）。
- **`SdfParameters` / `SdfRenderType` / `SdfPassType`**：继承 `BufferObject<SdfParameters>` 的 Uniform 数据对象与形状/通道枚举。

---

## 工作流程与硬性限制

| 容量常数 / 钩子 | 说明 |
| :--- | :--- |
| `SdfGraphics.MAX_SDF_AMOUNT = 256` | 单帧批处理缓冲区容量上限 |
| `SdfGraphics.MAX_SHARED_SDF_AMOUNT = 64` | 通过 `share()` 固定驻留于共享 UBO 槽位供多处复用绘制的最大缓存数 |
| `SdfGraphics.init(ConfigureMainRenderTargetEvent)` | 在客户端主渲染目标初始化时自动准备 `SDFParameters` 动态 Uniform 存储（由模块总线触发） |
| `SdfGraphics.flush()` | 由 `GuiRendererMixin` 自动在 `GuiRenderer` 添加元素时冲刷绘制队列；通常无需手动调用 |

> [!WARNING]
> **链式状态复位**：每次调用 `draw(GuiGraphics)`、`collide(x, y, threshold)` 或 `cache()` 后，若使用直接绘图路径，`SdfGraphics.instance` 不会全部自动归零（只有通过 `draw(GuiGraphics)` 构造参数时才会内部调用 `parameters.duplicate()`）；在绘制下一图形前，若需要完全干净的默认样式，建议先调用 `.reset()`（重设旋转为 `0`、居中为 `true`、颜色为白色，并重置 `SdfParameters`）。

---

## 完整示例：流式绘制与共享缓存复用

下面的 `Screen` 代码展示如何组合使用即时绘制、`SdfParameters` 共享缓存以及基于同一 SDF 轮廓的鼠标碰撞高亮：

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.sdf.SdfGraphics;
import dev.anvilcraft.lib.v2.rendering.sdf.SdfParameters;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.jetbrains.annotations.Nullable;

public class SdfDemoScreen extends Screen {
    private @Nullable SdfParameters badgeRingCache;

    public SdfDemoScreen() {
        super(Component.literal("SDF 矢量演示"));
    }

    @Override
    protected void init() {
        // 预先构建并注册一个“圆环扇区徽章”到共享槽位（最多支持 64 个共享槽位）
        if (this.badgeRingCache == null) {
            this.badgeRingCache = SdfGraphics.instance
                .reset()
                .sector(0, 0, 120.0f, 36.0f, 8.0f)
                .round(3.0f)
                .smooth(1.5f)
                .fill()
                .share();
        }
    }

    @Override
    public void removed() {
        // 界面关闭时务必释放共享槽位，避免占用全局 MAX_SHARED_SDF_AMOUNT(64) 配额
        if (this.badgeRingCache != null) {
            SdfGraphics.instance.unshare(this.badgeRingCache);
            this.badgeRingCache = null;
        }
        super.removed();
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(graphics, mouseX, mouseY, partialTick);

        float cx = this.width / 2.0f;
        float cy = this.height / 2.0f;

        // 1. 定义并检测一个带圆角的矩形按钮碰撞（居中模式）
        SdfGraphics button = SdfGraphics.instance
            .reset()
            .box(cx, cy, 140.0f, 36.0f)
            .round(8.0f)
            .smooth(1.0f);

        boolean hovered = button.collide(mouseX, mouseY, 0.5f);

        // 根据悬停状态切换外发光或实心填充
        if (hovered) {
            button.color(0x8838BDF8).light(10.0f).draw(graphics);
        }
        SdfGraphics.instance
            .reset()
            .box(cx, cy, 140.0f, 36.0f)
            .round(8.0f)
            .smooth(1.0f)
            .stroke(hovered ? 2.5f : 1.5f)
            .color(hovered ? 0xFF7DD3FC : 0xFF94A3B8)
            .draw(graphics);

        // 2. 复用同一个 SdfParameters 缓存，在不同屏幕位置旋转绘制多次
        if (this.badgeRingCache != null) {
            SdfGraphics.instance
                .reset()
                .color(0xFFEAB308)
                .rotate((System.currentTimeMillis() % 3600L) / 10.0f)
                .draw(graphics, this.badgeRingCache, cx - 100.0f, cy);
        }

        super.render(graphics, mouseX, mouseY, partialTick);
    }
}
```

---

## API 详尽参考

### `SdfGraphics` 形状构造与样式方法

全局入口：`SdfGraphics.instance`（仅主渲染线程使用）。所有构建方法均返回 `this` 以支持链式调用。

#### 1. 几何形状方法

| 方法签名 | 几何含义与参数说明 |
| :--- | :--- |
| `box(float x, float y, float width, float height)` | 矩形框，坐标 `(x, y)` 配合 `center(true/false)` 决定中心对齐还是左上角对齐 |
| `circle(float x, float y, float radius)` | 圆形，中心（或基于半径框左上角）及半径 `radius` |
| `arc(float x, float y, float sweep, float radius, float width)` | 圆形圆弧，`sweep` 为扫描角度（度），`radius` 为中心线半径，`width` 为弧粗细 |
| `sector(float x, float y, float sweep, float radius, float width)` | 圆环形扇区（带平齐切边端点），`sweep` 为扫描角（度），`radius` 为平均半径，`width` 为环带宽度 |
| `pie(float x, float y, float sweep, float radius)` | 实心扇形/饼块，`sweep` 为扫描角（度），`radius` 为半径 |
| `capsule(float x, float y, float topRadius, float bottomRadius, float height)` | 上下半径可不等的胶囊形状（`Uneven Capsule`），总扩展高度由 `height` 与两端半径共同构成 |
| `egg(float x, float y, float topRadius, float bottomRadius, float height)` | 蛋形曲线（`Egg`），由 `topRadius`、`bottomRadius` 与中心间距 `height` 定义光滑蛋形轮廓 |
| `segment(float x0, float y0, float x1, float y1)` | 从 `(x0, y0)` 到 `(x1, y1)` 的二维线段；实际可见宽度需结合 `round(...)` 或 `stroke(...)` |
| `triangleEquilateral(float x, float y, float radius)` | 等边三角形，`radius` 控制中心到顶点的外接大小（内部按 `1 / 1.2` 修正内切边长比例） |
| `triangleIsosceles(float x, float y, float width, float height)` | 等腰三角形，底边宽 `width`、高 `height` |

#### 2. 样式与变换方法

| 方法签名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `color(int color)` | `-1`（不透明白） | 使用 32 位 ARGB 整数设置绘图颜色 |
| `color(float red, float green, float blue, float alpha)` | — | 使用 `0.0f..1.0f` 浮点通道设置颜色 |
| `color(int red, int green, int blue, int alpha)` | — | 使用 `0..255` 整数通道设置颜色 |
| `smooth(float radius)` | `0.0f` | 抗锯齿羽化边缘宽度（推荐 GUI 下设为 `1.0f~1.5f`） |
| `round(float radius)` | `0.0f` | 几何外扩倒圆角半径（对盒子、线段、三角形等形状均有效） |
| `stroke(float width)` | `0.0f` | 设置线宽并自动联动 `onion(width > 0.0f)` 切换为空心描边模式 |
| `onion(boolean onion)` | `false` | 手动开关洋葱壳/空心模式 |
| `fill()` | 默认 `FILL` | 切回 `SdfPassType.FILL` 实心/描边模式 |
| `light(float radius)` | `FILL` | 切换至 `SdfPassType.LIGHT` 发光扩散模式，距离衰减半径由 `radius` 指定 |
| `rotate(float degrees)` | `0.0f` | 以角度制绕局部枢轴旋转图形（配合 `center(true/false)` 计算旋转中心） |
| `center(boolean center)` | `true` | `true` 表示传入的 `(x, y)` 为图形中心坐标；`false` 表示将其视为外接包围盒左上角坐标 |

#### 3. 绘制、碰撞、缓存与调试方法

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `draw(GuiGraphics graphics)` | `SdfGraphics` | 按当前状态复制参数快照并提交到本帧 `GuiRenderState` 绘制队列 |
| `draw(GuiGraphics graphics, SdfParameters cache, float x, float y)` | `SdfGraphics` | 复用已调用过 `share()` 的 `cache` 参数对象，在指定 `(x, y)` 处配合当前 `color`/`rotate`/`center` 提交绘制；**若 `cache.isShared()` 为 `false` 则不执行绘制** |
| `collide(float x, float y, float threshold)` | `boolean` | 判断屏幕点 `(x, y)` 是否落入当前 `SdfGraphics` 形状范围内（即 `Sdf2d.sd(...) <= threshold`） |
| `collide(SdfParameters cache, float pointX, float pointY, float x, float y, float threshold)` | `boolean` | 以指定的已缓存 `SdfParameters`（假定放置在 `(x, y)`、应用当前 `rotation`/`centred`）判定点 `(pointX, pointY)` 是否命中 |
| `cache()` | `@NonNull SdfParameters` | 返回当前参数的一个独立拷贝（`isShared() == false`），可用于纯 CPU 碰撞测试，但不绑定 GPU 共享槽 |
| `share()` | `@NonNull SdfParameters` | 复制当前参数并分配永久共享槽位编号后返回，可用于后续多次 `draw(graphics, cache, x, y)` |
| `share(@NotNull SdfParameters cache)` | `void` | 若传入缓存尚未共享，将其注册进共享槽（最多 `MAX_SHARED_SDF_AMOUNT = 64` 个，满额后会覆盖最早或循环槽） |
| `unshare(@NotNull SdfParameters cache)` | `void` | 从共享注册表移除对应 `SdfParameters` 并回收槽位 |
| `reset()` | `SdfGraphics` | 重置几何与样式状态至默认值（白、`rotation=0`、`centred=true`、`SdfParameters.reset()`） |
| `static void debug(boolean enable)` | `void` | 开启/关闭渲染调试线框可视化包围矩形区域 |
| `static void flush()` | `void` | 立即将待提交的动态参数块写入 GPU UBO；由 `GuiRendererMixin` 在每帧结束收集前自动调用 |
| `static void init(ConfigureMainRenderTargetEvent event)` | `void` | 初始化全局动态 Uniform 缓冲存储，已由事件总线自动接管 |

---

### `Sdf2d`（CPU 同步距离场函数库）

`@UtilityClass`，提供与片元着色器对齐的静态数学距离函数（距离 `< 0` 表示内部，`= 0` 表示边界，`> 0` 表示外部）：

| 静态方法签名 | 对应形状 |
| :--- | :--- |
| `sd(SdfParameters params, float pX, float pY, float rX, float rY, float rotation, boolean centred)` | 根据 `params` 完整复刻对齐平移、旋转、`round`/`stroke`/`onion` 后的综合有向距离 |
| `sdRect(float px, float py, float bX, float bY)` | 半宽 `(bX, bY)` 矩形 |
| `sdCircle(float px, float py, float r)` | 半径 `r` 圆 |
| `sdArc(float px, float py, float scx, float scy, float ra, float rb)` | 旋转余弦/正弦 `(scx, scy)`、半径 `ra`、端头半径 `rb` 圆弧 |
| `sdRing(float px, float py, float nx, float ny, float r, float th)` | 扇环 (`nx = cos(a/2), ny = sin(a/2)`, 半径 `r`, 环宽 `th`) |
| `sdPie(float px, float py, float cx, float cy, float r)` | 实心扇形 |
| `sdUnevenCapsule(float px, float py, float r1, float r2, float h)` | 变径胶囊 |
| `sdEgg(float px, float py, float r1, float r2, float h)` | 蛋形曲线 |
| `sdSegment(float px, float py, float ax, float ay, float bx, float by)` | 线段到点 `(px, py)` 最短距离 |
| `sdEquilateralTriangle(float px, float py, float r)` | 等边三角形 |
| `sdIsoscelesTriangle(float px, float py, float qx, float qy)` | 等腰三角形 |

---

### `SdfParameters` / `SdfRenderType` / `SdfPassType`

- **`SdfRenderType`**（枚举）：`BOX`、`CIRCLE`、`ARC`、`SECTOR`、`PIE`、`CAPSULE`、`EGG`、`SEGMENT`、`TRIANGLE_EQUILATERAL`、`TRIANGLE_ISOSCELES`；提供 `static SdfRenderType fromOrdinal(int ordinal)`。
- **`SdfPassType`**（枚举）：`FILL`、`LIGHT`。
- **`SdfParameters`**（继承 `BufferObject<SdfParameters>`）：
  - `DEFINITION`：用于 Std140 Uniform 缓冲上传的布局描述。
  - 方法：`box(float, float)`、`circle(float)`、`arc(float, float, float)`、`sector(float, float, float)`、`pie(float, float)`、`capsule(float, float, float)`、`egg(float, float, float)`、`segment(float, float, float, float)`、`triangleEquilateral(float)`、`triangleIsosceles(float, float)`、`smooth(float)`、`stroke(float)`、`round(float)`、`fill()`、`onion(boolean)`、`light(float)`、`duplicate()`、`reset()`、`getSmooth()`、`getStroke()`、`getRound()`、`getRenderType()`、`isOnion()`、`isShared()`。
