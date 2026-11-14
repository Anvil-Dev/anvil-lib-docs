# GUI 渲染状态扩展 (GuiRenderState)

Minecraft 1.21.11 将 GUI 绘制全面迁移到了基于状态提交与批处理的 `GuiRenderState` 与 `GuiElementRenderState` 体系。在这一新管线下，模组向 `GuiGraphics` 提交的所有几何体都会先被收集排序，再在 `GuiRenderer` 中统一发起 `RenderPass`。

然而原版 `GuiElementRenderState` 存在两个局限：
1. 默认仅能使用原版写死的 `DynamicTransforms` 与 `Projection`，难以绑定自定义的 UBO `GpuBufferSlice`（例如传给自定义片段着色器的渐变、模糊参数或矢量描述参数）；
2. `GuiGraphics` 中的内部提交方法与当前裁剪栈查询往往封装较深。

`dev.anvilcraft.lib.v2.rendering.state` 配合 `GuiRendererMixin` 提供了三个轻量级核心工具来打通这条路径：**`GuiRenderAccess`**、**`LibGuiElementRenderState`** 与 **`LibQuadGuiElementRenderState`**。

---

## 工作原理

1. 模组实现 `LibGuiElementRenderState`（或更简单的矩形特化接口 `LibQuadGuiElementRenderState`），在 `bufferSlices()` 中返回需要绑定的 Uniform 名称与 `GpuBufferSlice` 映射；
2. 通过 `GuiRenderAccess.submit(graphics, state)` 将该状态压入原版当前帧的 GUI 渲染队列；
3. 在 `GuiRenderer` 实际执行渲染通道时，`GuiRendererMixin` 会检测状态是否实现 `LibGuiElementRenderState`：
   - 设置管线前调用 `state.executeDrawBeforeSetPipeline(renderPass)`，默认自动遍历 `bufferSlices()` 并调用 `renderPass.setUniform(name, slice)`；
   - 设置管线后调用 `state.executeDrawAfterSetPipeline(renderPass)`，供执行额外的采样器绑定或自定义状态修正。

---

## 完整示例：在 GUI 中渲染带自定义 UBO 的矩形状态

下面的示例结合 [高斯模糊与 UBO 缓冲布局](./buffers-and-blur) 定义的 `GlowFrameUbo`（假设已在某客户端管线中使用了对应着色器 `GlowParams`），演示如何将包含自定义 `GpuBufferSlice` 的四边形提交到 `GuiGraphics`：

```java
package com.example.mymod.client;

import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import dev.anvilcraft.lib.v2.rendering.state.GuiRenderAccess;
import dev.anvilcraft.lib.v2.rendering.state.LibGuiElementRenderState;
import dev.anvilcraft.lib.v2.rendering.state.LibQuadGuiElementRenderState;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.client.renderer.DynamicUniformStorage;
import org.jetbrains.annotations.Nullable;
import org.joml.Matrix3x2f;
import org.joml.Vector2f;
import org.joml.Vector4f;

import java.util.Map;

public final class CustomShaderQuadHelper {
    private static final DynamicUniformStorage<GlowFrameUbo> STORAGE = GlowFrameUbo.createStorage();

    public static void submitGlowingBox(
        GuiGraphics graphics,
        RenderPipeline customPipeline,
        float x0,
        float y0,
        float x1,
        float y1,
        int baseColor,
        float intensity
    ) {
        GlowFrameUbo params = new GlowFrameUbo(
            new Vector4f(0.2f, 0.8f, 1.0f, 1.0f),
            new Vector2f(x1 - x0, y1 - y0),
            intensity,
            1
        );
        GpuBufferSlice slice = STORAGE.writeUniform(params);
        Matrix3x2f pose = new Matrix3x2f(graphics.pose());
        ScreenRectangle scissor = GuiRenderAccess.scissor(graphics);
        ScreenRectangle bounds = LibGuiElementRenderState.getBounds(pose, x0, y0, x1, y1, scissor);

        GlowingQuadState state = new GlowingQuadState(
            customPipeline,
            pose,
            x0, y0, x1, y1,
            baseColor,
            scissor,
            bounds,
            Map.of("GlowParams", slice)
        );
        GuiRenderAccess.submit(graphics, state);
    }

    public record GlowingQuadState(
        RenderPipeline pipeline,
        Matrix3x2f pose,
        float x0,
        float y0,
        float x1,
        float y1,
        int color,
        @Nullable ScreenRectangle scissorArea,
        @Nullable ScreenRectangle bounds,
        Map<String, GpuBufferSlice> bufferSlices
    ) implements LibQuadGuiElementRenderState {
        // buildVertices 与 textureSetup 已由 LibQuadGuiElementRenderState 默认提供
    }
}
```

---

## API 详解

### `GuiRenderAccess`

包 `dev.anvilcraft.lib.v2.rendering.state` 下的静态访问入口，弥合了 `GuiGraphics` 对状态提交和裁剪栈的包级私有封装。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static @Nullable ScreenRectangle scissor(GuiGraphics graphics)` | `@Nullable ScreenRectangle` | 获取当前 `GuiGraphics` 裁剪矩形栈顶元素（内部调用 `graphics.peekScissorStack()`），若未开启裁剪则返回 `null` |
| `public static void submit(GuiGraphics graphics, GuiElementRenderState state)` | `void` | 向 `GuiGraphics` 当前持有的 `GuiRenderState` 队列提交自定义 `GuiElementRenderState` |

---

### `LibGuiElementRenderState`

继承自原生 `net.minecraft.client.gui.render.state.GuiElementRenderState`，是所有需要扩展渲染通道交互的自定义 GUI 状态基接口。

| 方法 / 默认实现 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `Map<String, GpuBufferSlice> bufferSlices()` | `Map<String, GpuBufferSlice>` | 返回在此次绘制中需要绑定到着色器的 Uniform 名称与 `GpuBufferSlice` 映射表（默认建议返回不可变 `Map`） |
| `default void executeDrawBeforeSetPipeline(RenderPass renderPass)` | `void` | 在设置着色器管线与发起绘制前执行：默认遍历 `bufferSlices()` 并调用 `renderPass.setUniform(name, slice)` 完成所有额外 UBO 绑定 |
| `default void executeDrawAfterSetPipeline(RenderPass renderPass)` | `void` | 在设置管线之后、发起 `drawIndexed` 之前触发的钩子；默认为空操作，可用于追加采样器纹理或其他命令编码器指令 |
| `static @Nullable ScreenRectangle getBounds(Matrix3x2f pose, float x0, float y0, float x1, float y1, @Nullable ScreenRectangle scissorArea)` | `@Nullable ScreenRectangle` | 按 2D 变换矩阵 `pose` 将矩形 `[x0, y0] ~ [x1, y1]` 映射为向上取整后的轴对齐屏幕包围盒；若指定了 `scissorArea`，则自动与之求交并在完全被裁剪不可见时返回 `null` |

---

### `LibQuadGuiElementRenderState`

继承自 `LibGuiElementRenderState`，面向最常见的“纯矩形区域 + 可选基础颜色”着色器片元控件，省去了手写四角顶点与纹理配置的样板代码。

| 方法 | 类型 | 说明 |
| :--- | :--- | :--- |
| `Matrix3x2f pose()` | 抽象（必须实现） | 图形绘制时的当前 2D 变换矩阵 |
| `float x0()` / `float y0()` / `float x1()` / `float y1()` | 抽象（必须实现） | 矩形左上角与右下角局部坐标 |
| `int color()` | 抽象（必须实现） | 传递给矩形四个顶点的 ARGB 顶点色 |
| `default void buildVertices(VertexConsumer consumer)` | 默认实现 | 按逆时针矩形顶点序 `(x0, y0)` → `(x0, y1)` → `(x1, y1)` → `(x1, y0)` 提交 4 个带有 `pose()` 变换的 2D 顶点 |
| `default TextureSetup textureSetup()` | 默认实现 | 返回 `TextureSetup.noTexture()`；若着色器需要绑定采样纹理，可在实现类中覆盖此方法 |

> [!TIP]
> 在实现 `LibQuadGuiElementRenderState` 时，`buildVertices` 仅写入 `Position` 和 `Color`（未写入 UV 通道）。如果你的自定义 `RenderPipeline` 使用了带纹理 UV 的顶点格式（例如 `POSITION_TEX_COLOR`），请像 `SdfGraphics` 一样在状态中覆盖 `buildVertices(VertexConsumer)` 并补全 `.setUv(...)` 等顶点属性。
