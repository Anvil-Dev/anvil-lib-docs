# 2D SDF 矢量图形渲染 (`SdfGraphics` / `Sdf2d` / `SdfParameters`)

<BranchContextCard branch="26.1" />

在自定义 GUI 界面、HUD 指示器或轮盘菜单中绘制圆角矩形、圆环、扇形、胶囊体或任意角度旋转的几何图形时，传统贴图缩放会出现模糊与锯齿，而手工拆三角面片难以实现平滑抗锯齿（Anti-aliasing）、描边（Onion Stroke）和外发光（Light Glow）。

`dev.anvilcraft.lib.v2.rendering.sdf` 包提供了一套**基于有符号距离场（Signed Distance Field, SDF）的 2D 矢量图形渲染与几何碰撞测试库**：
- **GPU 端像素级解析渲染 (`SdfGraphics`)**：基于 `ALRPipelines.SDF_GRAPHICS` 着色器管线，支持 **10 种基础 2D 图元**，全部原生支持任意像素的**圆角（`round`）**、**边缘抗锯齿平滑过渡（`smooth`）**、**空心描边（`stroke` / `onion`）**、**指数衰减外发光（`light`）** 与 **旋转（`rotate`）**；
- **CPU 端完全一致的数学距离场与碰撞检测 (`Sdf2d` / `SdfGraphics#collide`)**：提供与片段着色器数学公式 100% 对齐的 Java 端距离计算函数，可直接用于判断鼠标光标是否悬停在旋转后的扇形、圆弧、三角形或圆角矩形内！

---

## 一、 支持的 10 种 2D SDF 图元 (`SdfRenderType`)

| 图元类型 (`SdfRenderType`) | `SdfGraphics` 方法签名 | `Sdf2d` 数学原语 | 参数含义说明 |
| :--- | :--- | :--- | :--- |
| **`BOX`** | `box(float x, float y, float width, float height)` | `sdRect(px, py, bx, by)` | 矩形（配合 `.round(r)` 即为圆角矩形）。 |
| **`CIRCLE`** | `circle(float x, float y, float radius)` | `sdCircle(px, py, r)` | 圆形，`radius` 为半径。 |
| **`ARC`** | `arc(float x, float y, float sweep, float radius, float width)` | `sdArc(px, py, scx, scy, ra, rb)` | 带圆头端点的圆弧：`sweep` 为半张角角度（度），`radius` 为外半径，`width` 为弧线粗细。 |
| **`SECTOR`** | `sector(float x, float y, float sweep, float radius, float width)` | `sdRing(px, py, nx, ny, r, th)` | 平头扇环（环形扇区）：`sweep` 为张角角度（度），`radius` 为外半径，`width` 为环宽（极其适合绘制轮盘菜单扇区！）。 |
| **`PIE`** | `pie(float x, float y, float sweep, float radius)` | `sdPie(px, py, cx, cy, r)` | 实心扇形（饼图切片）：`sweep` 为半张角角度（度），`radius` 为半径。 |
| **`CAPSULE`** | `capsule(float x, float y, float topRadius, float bottomRadius, float height)` | `sdUnevenCapsule(px, py, r1, r2, h)` | 上下半径可不等的胶囊体（水滴/圆台柱）。 |
| **`EGG`** | `egg(float x, float y, float topRadius, float bottomRadius, float height)` | `sdEgg(px, py, he, ra, rb)` | 卵形（鸡蛋轮廓）。 |
| **`SEGMENT`** | `segment(float x0, float y0, float x1, float y1)` | `sdSegment(px, py, ax, ay, bx, by)` | 从 `(x0, y0)` 到 `(x1, y1)` 的线段（配合 `.round(r)` 或 `.stroke(w)` 控制线宽）。 |
| **`TRIANGLE_EQUILATERAL`** | `triangleEquilateral(float x, float y, float radius)` | `sdEquilateralTriangle(px, py, r)` | 等边三角形。 |
| **`TRIANGLE_ISOSCELES`** | `triangleIsosceles(float x, float y, float width, float height)` | `sdIsoscelesTriangle(px, py, qx, qy)` | 等腰三角形。 |

---

## 二、 完整代码示例：绘制圆角发光卡片、旋转扇环并执行鼠标碰撞测试

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.rendering.sdf.SdfGraphics;
import dev.anvilcraft.lib.v2.rendering.sdf.SdfParameters;
import net.minecraft.client.gui.GuiGraphicsExtractor;

public final class SdfHudExample {
    // 持久共享静态形状参数（占用 UBO 尾部共享槽位，无需每帧重复上传 UBO 数据）
    private static SdfParameters sharedRingSector;

    private SdfHudExample() {
    }

    public static void initSharedShapes() {
        SdfGraphics sdf = SdfGraphics.getInstance();
        sharedRingSector = sdf.reset()
            .sector(0, 0, 45.0f, 60.0f, 16.0f)
            .round(3.0f)
            .smooth(1.0f)
            .fill()
            .share(); // 分配共享 UBO 索引并缓存
    }

    public static void renderAndTestHover(GuiGraphicsExtractor graphics, int mouseX, int mouseY) {
        SdfGraphics sdf = SdfGraphics.getInstance();

        // 1. 绘制带外发光（light）的圆角矩形背景
        sdf.reset()
            .box(20, 20, 140, 60)
            .round(8.0f)
            .light(12.0f)
            .color(0x8000E5FF)
            .draw(graphics);

        // 2. 绘制圆角矩形实心主体（fill）
        sdf.reset()
            .box(20, 20, 140, 60)
            .round(8.0f)
            .smooth(1.0f)
            .fill()
            .color(0xE01E222A)
            .draw(graphics);

        // 3. 绘制圆角矩形 2px 空心描边（stroke）
        sdf.reset()
            .box(20, 20, 140, 60)
            .round(8.0f)
            .smooth(1.0f)
            .stroke(2.0f)
            .fill()
            .color(0xFF00E5FF)
            .draw(graphics);

        // 4. 使用共享参数在屏幕 (200, 120) 处以中心锚点旋转 30 度并判断鼠标是否悬停
        if (sharedRingSector != null) {
            sdf.reset()
                .center(true)
                .rotate(30.0f);

            boolean hovered = sdf.collide(sharedRingSector, mouseX, mouseY, 200.0f, 120.0f, 0.0f);
            sdf.color(hovered ? 0xFFFFCC00 : 0xCCFFFFFF)
                .draw(graphics, sharedRingSector, 200.0f, 120.0f);
        }
    }
}
```

---

## 三、 `SdfGraphics`、`SdfParameters` 与 `Sdf2d` API 详解

### 1. `SdfGraphics`（链式绘制与共享 UBO 管理器）

通过 `SdfGraphics.getInstance()`（或静态字段 `SdfGraphics.instance`）获取全局单例。

> **UBO 容量与 `share()` 机制说明**：
> `SdfGraphics` 内部维护一个包含 `MAX_SDF_AMOUNT = 256` 个槽位的 UBO 数组：
> - **普通即時绘制（`draw(graphics)`）**：从槽位 `0` 开始向后递增分配，每帧结束时在 `GuiRendererMixin` 中调用 `SdfGraphics.flush()` 重置回 `0`（单帧最多绘制 `256 - 已共享数` 个即时图元）；
> - **跨帧共享参数（`share()` / `unshare(cache)`）**：从 UBO 尾部（槽位 `255` 往前，最多 `MAX_SHARED_SDF_AMOUNT = 64` 个）分配固定槽位，仅在首次绘制或参数修改后上传一次 UBO，后续每帧直接通过索引引用，零 UBO 带宽开销！

| 方法分类 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **图元设定** | `box(x, y, w, h)`、`circle(x, y, r)`、`arc(x, y, sweep, r, w)`、`sector(x, y, sweep, r, w)`、`pie(x, y, sweep, r)`、`capsule(x, y, topR, bottomR, h)`、`egg(x, y, topR, bottomR, h)`、`segment(x0, y0, x1, y1)`、`triangleEquilateral(x, y, r)`、`triangleIsosceles(x, y, w, h)` | 设置当前图元类型、基准坐标 `(x, y)`、外接矩形与形状参数。 |
| **样式修饰** | • `color(int argb)` / `color(float r, float g, float b, float a)` / `color(int r, int g, int b, int a)`<br>• `round(float radius)`：圆角半径<br>• `smooth(float radius)`：边缘抗锯齿宽度<br>• `stroke(float width)`：描边宽度（自动將 `onion` 设为 `width > 0`）<br>• `onion(boolean onion)`：开启/关闭空心环化（`d = abs(d) - stroke * 0.5`）<br>• `rotate(float degrees)`：旋转角度（度）<br>• `center(boolean center)`：`true` 表示 `(x, y)` 为图元中心，否则为左上角<br>• `fill()`：实心填充通道（`SdfPassType.FILL`）<br>• `light(float radius)`：指数发光通道（`SdfPassType.LIGHT`） | 链式配置 SDF 渲染参数。 |
| **提交与重置** | • `draw(GuiGraphicsExtractor graphics)`<br>• `draw(GuiGraphicsExtractor graphics, SdfParameters sharedParams, float x, float y)`<br>• `reset()`<br>• `static void flush()`<br>• `static void debug(boolean enable)` | 提交 GUI 元素渲染状态到 `GuiGraphicsExtractor`（开启 `debug(true)` 时会额外绘制蓝色外接框 `0xFF0000FF`）。 |
| **碰撞测试** | • `boolean collide(float pointX, float pointY, float threshold)`<br>• `boolean collide(SdfParameters params, float pointX, float pointY, float x, float y, float threshold)` | 判断点 `(pointX, pointY)` 到当前（或指定 `params`）图元边界的有符号距离是否 `< threshold`（传 `0.0f` 即判断点是否在图形内部）。 |
| **缓存与共享** | • `SdfParameters cache()`<br>• `SdfParameters share()` / `void share(SdfParameters cache)`<br>• `void unshare(SdfParameters cache)` | 克隆当前 `SdfParameters`（`cache()`），或将其注册到尾部共享 UBO 槽位（`share()`）。不再需要时调用 `unshare` 释放槽位。 |

### 2. `Sdf2d`（纯 CPU 端 2D 有符号距离场数学工具类）

位于 `dev.anvilcraft.lib.v2.rendering.sdf.Sdf2d`。返回值 `< 0` 表示点在图形内部，`= 0` 表示在边界上，`> 0` 表示在图形外部：

| 静态方法签名 | 说明 |
| :--- | :--- |
| `float sd(SdfParameters params, float pX, float pY, float rX, float rY, float rotation, boolean centred)` | 完整复刻着色器变换（含中心偏移、旋转逆变换、圆角偏移与 Onion 描边）的距离计算。 |
| `sdRect(px, py, bx, by)` / `sdCircle(px, py, r)` / `sdArc(px, py, scx, scy, ra, rb)` / `sdRing(px, py, nx, ny, r, th)` / `sdPie(px, py, cx, cy, r)` / `sdUnevenCapsule(px, py, r1, r2, h)` / `sdEgg(px, py, he, ra, rb)` / `sdSegment(px, py, ax, ay, bx, by)` / `sdEquilateralTriangle(px, py, r)` / `sdIsoscelesTriangle(px, py, qx, qy)` | 各基础图元在局部原点 `(0, 0)` 处的标准有符号距离函数。 |
