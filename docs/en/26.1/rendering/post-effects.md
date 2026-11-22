# Post-Processing Pipelines: Bloom, Gaussian Blur & Glitch (`bloom` / `blur` / `glitch`)

<BranchContextCard branch="26.1" />

`module.rendering` includes three fullscreen post-processing effects built on Blaze3D `RenderPass`:
1. **Bloom Post-Processing (`BloomPostEffect`)**: Uses a 5-level **Dual Kawase Downsample & Upsample** blur pyramid pipeline, supporting submitting any world block entity, model, or custom geometry to a separate bloom layer via `CompoundSubmitNodeStorage`, `BloomSubmitNodeStorage`, or `BloomRenderCallback` (while preserving main framebuffer depth occlusion);
2. **Separable Gaussian Blur (`GaussianBlur`)**: Performs two horizontal + two vertical separable Gaussian blur passes on any input `GpuTexture` and returns the blurred `GpuTexture` (e.g., for frosted-glass UI backgrounds);
3. **Glitch Art Post-Processing (`GlitchPostEffect`)**: A digital screen glitch effect that evolves dynamically with game time.

---

## 1. Complete Usage of Bloom Post-Processing (`BloomPostEffect`)

### 1. How to Make Objects Bloom in BlockEntity or World Rendering

Under Minecraft 26.1's `SubmitNodeCollector` architecture, there are three ways to make rendered content bloom:

- **Approach A (Recommended: render normally AND add bloom)**:
  Call `ALRPostEffects.getBloomPostEffect().createCompoundSubmitStorage(normalCollector)` to get a `CompoundSubmitNodeStorage`. Pass it to your model/geometry submission code—draw calls are **automatically dual-written** to both the normal world framebuffer and the bloom framebuffer, marking this frame's bloom as `dirty` (if nothing blooms in a frame, `BloomPostEffect` skips down/upsampling with zero overhead!).
- **Approach B (Submit specific emissive layers to bloom buffer only)**:
  Wrap a collector with `BloomSubmitNodeStorage.wrap(collector)`, or submit directly to `ALRPostEffects.getBloomPostEffect().getSubmitNodeStorage()` and call `markDirty()`.
- **Approach C (Register a per-frame callback `drawBloomed`)**:
  Call `ALRPostEffects.getBloomPostEffect().drawBloomed((nodeCollector, poseStack) -> { ... })` during rendering.

### 2. Code Example: Submitting Both Normal Model and Glowing Energy Core in a BER

```java
package com.example.mymod.client.renderer;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.ALRPostEffects;
import dev.anvilcraft.lib.v2.rendering.bloom.BloomPostEffect;
import dev.anvilcraft.lib.v2.rendering.foundation.compound.CompoundSubmitNodeStorage;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderTypes;

public final class ReactorCoreBloomExample {
    private ReactorCoreBloomExample() {
    }

    public static void submitGlowingCore(PoseStack poseStack, SubmitNodeCollector collector) {
        BloomPostEffect bloom = ALRPostEffects.getBloomPostEffect();

        // Create dual-write compound collector: submissions to glowingCollector render to both main screen and bloom layer
        CompoundSubmitNodeStorage glowingCollector = bloom.createCompoundSubmitStorage(collector);

        glowingCollector.submitCustomGeometry(
            poseStack,
            RenderTypes.lightning(),
            (pose, vertexConsumer) -> {
                // Draw a bright cyan glowing plane
                vertexConsumer.addVertex(pose, -0.5f, 0.5f, -0.5f).setColor(0, 255, 255, 255).setLight(LightTexture.FULL_BRIGHT);
                vertexConsumer.addVertex(pose, -0.5f, 0.5f,  0.5f).setColor(0, 255, 255, 255).setLight(LightTexture.FULL_BRIGHT);
                vertexConsumer.addVertex(pose,  0.5f, 0.5f,  0.5f).setColor(0, 255, 255, 255).setLight(LightTexture.FULL_BRIGHT);
                vertexConsumer.addVertex(pose,  0.5f, 0.5f, -0.5f).setColor(0, 255, 255, 255).setLight(LightTexture.FULL_BRIGHT);
            }
        );
    }
}
```

---

## 2. Using `GaussianBlur` & `GlitchPostEffect`

```java
package com.example.mymod.client.render;

import com.mojang.blaze3d.textures.GpuTexture;
import com.mojang.blaze3d.textures.GpuTextureView;
import dev.anvilcraft.lib.v2.rendering.ALRPostEffects;
import dev.anvilcraft.lib.v2.rendering.blur.GaussianBlur;
import net.minecraft.client.Minecraft;

public final class PostProcessExample {
    // Create a Gaussian blur processor with step length 1.5 and color multiplier 0.9 (call close() when done to free buffers)
    private static GaussianBlur uiBlur;

    public static GpuTexture blurMainScreen() {
        Minecraft mc = Minecraft.getInstance();
        if (uiBlur == null) {
            uiBlur = new GaussianBlur(1.5f, 0.9f);
        }
        return uiBlur.process(mc.getMainRenderTarget().getColorTexture());
    }

    public static GpuTextureView applyGlitchToMainScreen() {
        Minecraft mc = Minecraft.getInstance();
        var mainTarget = mc.getMainRenderTarget();
        return ALRPostEffects.getGlitchPostEffect().process(
            mainTarget.getColorTextureView(),
            mainTarget.width,
            mainTarget.height
        );
    }
}
```

---

## 3. Public Classes & Interfaces API Reference

### 1. `BloomPostEffect` & `BloomRenderCallback` (`dev.anvilcraft.lib.v2.rendering.bloom`)

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public BloomPostEffect()`<br>`public BloomPostEffect(float bloomIntensity, float sampleStepLength, float colorMultiplier, float bloomThreshold, float bloomIntensityMultiplier, int passes, int step)` | — | Default constructor values: `bloomIntensity = 1.25f`, `bloomThreshold = 0.08f`, `bloomIntensityMultiplier = 0.8f`, `passes = 5`, `step = 1`. |
| `public CompoundSubmitNodeStorage createCompoundSubmitStorage(SubmitNodeCollector collector)` | `CompoundSubmitNodeStorage` | Creates a compound collector that submits draw commands to both `this.submitNodeStorage` and `collector` while calling `markDirty()` automatically. |
| `public void drawBloomed(BloomRenderCallback runnable)` | `void` | Registers a per-frame bloom render callback (`void render(SubmitNodeCollector nodeCollector, PoseStack poseStack)`) and marks `dirty = true`. |
| `public void markDirty()` | `void` | Manually marks that bloom content exists this frame and requires post-processing. |
| `public RenderTarget getBloomInputTarget()` | `RenderTarget` | Returns the bloom input render target (automatically copies the depth buffer from `mainRenderTarget` in `beginBloomDraw()` so glowing objects are properly occluded by foreground opaque blocks). |
| `public SubmitNodeStorage getSubmitNodeStorage()` | `SubmitNodeStorage` | Returns the node storage dedicated to the bloom layer. |
| `public BloomParametersUbo getBloomParameters()` | `BloomParametersUbo` | Gets and dynamically adjusts `bloomIntensity`, `bloomBlendThreshold`, and `luminanceSensitivity`. |
| `public void beginFrame()` / `runBloomDraws(Matrix4fc, FeatureRenderDispatcher)` / `process()` / `resize(int, int)` | `void` | Called automatically per frame by `AnvilLibRendering` and `ALRPostEffects`. |

### 2. `GaussianBlur` (`dev.anvilcraft.lib.v2.rendering.blur`)

Implements `AutoCloseable`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public GaussianBlur(float sampleStepLength, float colorMultiplier)` | — | Creates a Gaussian blur instance and initializes internal buffers to the current game window size. |
| `public GpuTexture process(GpuTexture input)` | `GpuTexture` | Runs 2 horizontal + 2 vertical blur passes on `input` and returns the blurred color texture. |
| `public BlurParametersUbo getBlurParameters()` | `BlurParametersUbo` | Returns the blur parameters UBO (for dynamically updating `sampleStepLength` and `colorMultiplier`). |
| `public void resize(int width, int height)` | `void` | Resizes internal framebuffers and rebuilds the fullscreen ortho quad vertex buffer when resolution changes. |
| `public void close()` | `void` | Frees internally created `GpuBuffer`, `GpuSampler`, and `RenderTarget`. |

### 3. `GlitchPostEffect` (`dev.anvilcraft.lib.v2.rendering.glitch`)

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public GpuTextureView process(GpuTextureView input, int width, int height)` | `GpuTextureView` | Renders `input` through `ALRPipelines.GLITCH` into `glitchOutputTarget` (passing dimensions and `(gameTime % 24000 + partialTick) / 10f`), returning the processed `GpuTextureView`. |
| `public RenderTarget getGlitchOutputTarget()` / `public GpuSampler getSampler()` | `RenderTarget` / `GpuSampler` | Returns the glitch output target and linear sampler. |
