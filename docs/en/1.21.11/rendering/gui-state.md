# GUI Render State Extensions (`GuiRenderState`)

Minecraft 1.21.11 migrated GUI rendering completely to a deferred-submission, batched `GuiRenderState` and `GuiElementRenderState` architecture. All geometry submitted to `GuiGraphics` is collected and sorted first, then drawn in `RenderPass`es by `GuiRenderer`.

However, vanilla `GuiElementRenderState` has two limitations:
1. By default it only exposes hardcoded `DynamicTransforms` and `Projection`, making it hard to bind custom UBO `GpuBufferSlice`s (e.g., gradient, blur, or vector shape parameters for custom fragment shaders);
2. Internal submission methods and current scissor stack queries on `GuiGraphics` are deeply encapsulated.

`dev.anvilcraft.lib.v2.rendering.state` together with `GuiRendererMixin` provides three lightweight core utilities to bridge this path: **`GuiRenderAccess`**, **`LibGuiElementRenderState`**, and **`LibQuadGuiElementRenderState`**.

---

## How It Works

1. Implement `LibGuiElementRenderState` (or the simpler quad specialization `LibQuadGuiElementRenderState`), returning a map of uniform names to `GpuBufferSlice`s in `bufferSlices()`;
2. Submit the state to the current frame's GUI render queue via `GuiRenderAccess.submit(graphics, state)`;
3. When `GuiRenderer` executes the render pass, `GuiRendererMixin` checks whether the state implements `LibGuiElementRenderState`:
   - Before setting the pipeline, calls `state.executeDrawBeforeSetPipeline(renderPass)`, which iterates `bufferSlices()` and calls `renderPass.setUniform(name, slice)` by default;
   - After setting the pipeline, calls `state.executeDrawAfterSetPipeline(renderPass)` for extra sampler bindings or custom state adjustments.

---

## Full Example: Rendering a Quad State with a Custom UBO in GUI

The example below uses `GlowFrameUbo` defined in [Gaussian Blur & UBO Buffer Layouts](./buffers-and-blur) (assuming a client pipeline with shader uniform `GlowParams`) to submit a quad with a custom `GpuBufferSlice` to `GuiGraphics`:

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
        // buildVertices and textureSetup are provided by default by LibQuadGuiElementRenderState
    }
}
```

---

## API Reference

### `GuiRenderAccess`

Static access entry under `dev.anvilcraft.lib.v2.rendering.state`, bridging package-private state submission and scissor-stack encapsulation on `GuiGraphics`.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static @Nullable ScreenRectangle scissor(GuiGraphics graphics)` | `@Nullable ScreenRectangle` | Gets the top element of `GuiGraphics`'s scissor rectangle stack (internally calls `graphics.peekScissorStack()`), or `null` if scissor is disabled |
| `public static void submit(GuiGraphics graphics, GuiElementRenderState state)` | `void` | Submits a custom `GuiElementRenderState` to `GuiGraphics`'s `GuiRenderState` queue |

---

### `LibGuiElementRenderState`

Extends vanilla `net.minecraft.client.gui.render.state.GuiElementRenderState`; base interface for all custom GUI states needing extended render-pass hooks.

| Method / Default | Return Type | Description |
| :--- | :--- | :--- |
| `Map<String, GpuBufferSlice> bufferSlices()` | `Map<String, GpuBufferSlice>` | Returns the map of uniform names to `GpuBufferSlice`s to bind for this draw (recommend returning an immutable `Map`) |
| `default void executeDrawBeforeSetPipeline(RenderPass renderPass)` | `void` | Executed before setting the pipeline and drawing: iterates `bufferSlices()` and calls `renderPass.setUniform(name, slice)` by default |
| `default void executeDrawAfterSetPipeline(RenderPass renderPass)` | `void` | Hook fired after setting the pipeline and before `drawIndexed`; no-op by default, usable for extra sampler textures or encoder commands |
| `static @Nullable ScreenRectangle getBounds(Matrix3x2f pose, float x0, float y0, float x1, float y1, @Nullable ScreenRectangle scissorArea)` | `@Nullable ScreenRectangle` | Transforms `[x0, y0] ~ [x1, y1]` by 2D matrix `pose` into a ceil-rounded axis-aligned screen box, intersected with `scissorArea` (`null` if fully clipped) |

---

### `LibQuadGuiElementRenderState`

Extends `LibGuiElementRenderState` for the most common "plain rectangle + optional base color" shader-quad widgets, eliminating 4-vertex and texture-setup boilerplate.

| Method | Type | Description |
| :--- | :--- | :--- |
| `Matrix3x2f pose()` | Abstract (required) | Current 2D transform matrix for drawing |
| `float x0()` / `float y0()` / `float x1()` / `float y1()` | Abstract (required) | Top-left and bottom-right local coordinates of the rectangle |
| `int color()` | Abstract (required) | ARGB vertex color passed to the four rectangle vertices |
| `default void buildVertices(VertexConsumer consumer)` | Default | Submits 4 2D vertices transformed by `pose()` in counter-clockwise order `(x0, y0) -> (x0, y1) -> (x1, y1) -> (x1, y0)` |
| `default TextureSetup textureSetup()` | Default | Returns `TextureSetup.noTexture()`; override if the shader needs bound sampler textures |

> [!TIP]
> When implementing `LibQuadGuiElementRenderState`, `buildVertices` only writes `Position` and `Color` (no UV channel). If your custom `RenderPipeline` uses a textured UV vertex format (e.g., `POSITION_TEX_COLOR`), override `buildVertices(VertexConsumer)` like `SdfGraphics` does and supply `.setUv(...)` attributes.
