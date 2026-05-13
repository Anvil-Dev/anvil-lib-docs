---
title: Rendering SDF 图形系统
prev: false
next: false
---

# SDF 2D 图形系统 <Badge type="tip" text=">=26.1" />

包 `dev.anvilcraft.lib.v2.rendering.sdf` 提供了一套基于**有符号距离场（Signed Distance Field）**的 2D 图形渲染系统。通过
GPU UBO 传输参数，支持 7 种图形类型和填充/发光两种渲染 Pass。

## SdfGraphics

核心入口类，提供流式 Builder API。全局单例通过 `SdfGraphics.getInstance()` 获取。

### 图形绘制方法

所有方法返回 `this` 支持链式调用，每个方法设置当前参数状态，调用 `draw(graphics)` 提交渲染。

| 方法                                            | 参数                 | 说明  |
|-----------------------------------------------|--------------------|-----|
| `box(x, y, w, h)`                             | 位置 + 尺寸            | 矩形  |
| `circle(x, y, radius)`                        | 中心 + 半径            | 圆形  |
| `arc(x, y, radius, startAngle, arcLength)`    | 中心 + 半径 + 起始角 + 弧长 | 弧形  |
| `sector(x, y, radius, startAngle, arcLength)` | 中心 + 半径 + 起始角 + 弧长 | 扇形环 |
| `pie(x, y, radius, startAngle)`               | 中心 + 半径 + 起始角      | 饼形  |
| `capsule(x, y, w, h, radius)`                 | 中心 + 宽 + 高 + 圆角半径  | 胶囊形 |
| `egg(x, y, radiusTop, radiusBottom, height)`  | 中心 + 上半径 + 下半径 + 高 | 蛋形  |

### 样式方法

| 方法                      | 说明                        |
|-------------------------|---------------------------|
| `color(int argbHex)`    | 设置颜色（ARGB）                |
| `rotate(float degrees)` | 设置旋转角度（度，自动 wrap 到 0-360） |
| `center(boolean)`       | 是否以中心为锚点                  |
| `stroke(int width)`     | 设置描边宽度（0=填充, >0=描边）       |
| `round(float radius)`   | 设置圆角半径（≥0）                |
| `fill()`                | 设置填充 Pass（默认）             |
| `light(int)`            | 设置发光 Pass                 |
| `reset()`               | 重置参数为默认值                  |
| `onion(boolean)`        | 启用中空描边模式                  |

### 碰撞检测

```java
// 判断点 (mouseX, mouseY) 是否在 SDF 距离阈值内
boolean hit = SdfGraphics.getInstance().collide(mouseX, mouseY, threshold);
```

### 复制与重置

```java
// 复制当前参数状态（创建新的 SdfGraphics 实例）
SdfGraphics copy = SdfGraphics.getInstance().cache();

// 重置参数为默认值
SdfGraphics.getInstance().reset();

// 刷新全局状态（重置参数 + 清零 UBO 索引）
SdfGraphics.flush();
```

### 使用示例

```java
// 获取全局实例
SdfGraphics sdf = SdfGraphics.getInstance();

// 绘制填充圆角矩形
sdf.box(100, 50, 200, 80)
   .color(0xFFFF4080)
   .round(10)
   .draw(graphics);

// 绘制描边圆形
sdf.circle(200, 150, 60)
   .color(0xFF4080FF)
   .stroke(4)
   .draw(graphics);

// 绘制发光矩形
sdf.box(300, 100, 150, 60)
   .color(0xFFFFC832)
   .light(8)
   .draw(graphics);

// 帧结束时刷新
SdfGraphics.flush();
```

## SdfRenderType

```java
public enum SdfRenderType {
    BOX, CIRCLE, ARC, SECTOR, PIE, CAPSULE, EGG
}
```

## SdfPassType

```java
public enum SdfPassType {
    FILL,   // 填充渲染
    LIGHT   // 发光渲染
}
```

## SdfParameters

UBO 参数类，继承 `UboObject<SdfParameters>`。通过 `SdfGraphics` 的 Builder 方法设置，内部通过 GPU UBO 传输到着色器。

### 布局定义 (STD140)

| 字段             | 类型      | 分量                           | 说明     |
|----------------|---------|------------------------------|--------|
| `sharedParams` | `vec4`  | smooth, stroke, round, light | 共享样式参数 |
| `shapeParams`  | `vec4`  | x, y, z, w                   | 图形特定参数 |
| `rect`         | `vec4`  | x, y, width, height          | 包围矩形   |
| `typeParams`   | `ivec4` | pass, renderType, onion, _   | 类型控制参数 |

### reset()

重置所有参数为默认值（零向量、白色、零旋转、非居中）。

## Sdf2d

工具类 (`@UtilityClass`)，包含 9 个核心 SDF 数学函数：

| 函数                                   | 说明                           |
|--------------------------------------|------------------------------|
| `sd(parameters, x, y)`               | 主分发函数，根据 RenderType 选择具体 SDF |
| `sdRect(px, py, bx, by)`             | 矩形 SDF                       |
| `sdCircle(px, py, r)`                | 圆形 SDF                       |
| `sdArc(px, py, scx, scy, ra, rb)`    | 弧形 SDF                       |
| `sdRing(px, py, nx, ny, r, th)`      | 扇形环 SDF                      |
| `sdPie(px, py, cx, cy, r)`           | 饼形 SDF                       |
| `sdUnevenCapsule(px, py, r1, r2, h)` | 不等径胶囊形 SDF                   |
| `sdEgg(px, py, he, ra, rb)`          | 蛋形 SDF                       |

## 内部渲染流程

```
SdfGraphics.box().color().round().draw(graphics)
  → SdfParameters 设置对应的 Vector4f/Vector4i 分量
  → _draw() 函数:
    1. 计算扩展尺寸 (round + stroke) * 2
    2. 构建 Matrix3x2f 变换（平移 + 旋转 + 缩放）
    3. 通过 UBO offset 写入 SdfParameters
    4. 创建 RenderState (实现 LibGuiElementRenderState)
    5. 通过 graphics.submitGuiElementRenderState() 提交
    6. 着色器通过 ALRPipelines.SDF_GRAPHICS 管线渲染
```

## 容量限制

- 全局 UBO 缓冲区大小: `SDF_PARAMETER_SIZE * 256 = 16 * 16 * 256 = 65536 字节`
- 每帧最多 256 个 SDF 绘制调用
- 每帧结束时应调用 `SdfGraphics.flush()` 重置索引计数器

## 注意事项

- SDF 渲染依赖 `ConfigureMainRenderTargetEvent` 初始化 GPU 资源（UBO、CommandEncoder）
- 渲染通过 `ALRPipelines.SDF_GRAPHICS` 管线，无需纹理绑定（`TextureSetup.noTexture()`）
- `stroke(0)` 为填充模式，`stroke(>0)` 为描边模式
- 颜色使用 ARGB 格式，`color(int)` 接受 `0xAARRGGBB`
