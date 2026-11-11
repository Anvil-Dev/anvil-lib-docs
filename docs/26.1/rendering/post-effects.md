# 后处理管线：泛光 (Bloom)、高斯模糊与故障特效 (`bloom` / `blur` / `glitch`)

<BranchContextCard branch="26.1" />

`module.rendering` 内置了三套基于 Blaze3D `RenderPass` 的全屏后处理效果：
1. **泛光后处理 (`BloomPostEffect`)**：采用 5 级 **Dual Kawase 降采样（Downsample）与升采样（Upsample）** 金字塔模糊管线，支持通过 `CompoundSubmitNodeStorage`、`BloomSubmitNodeStorage` 或 `BloomRenderCallback` 将世界中的任意方块实体、模型或自定义几何体提交到独立泛光图层（同时完整保留主帧缓冲深度遮挡关系）；
2. **双向高斯模糊 (`GaussianBlur`)**：对任意输入 `GpuTexture` 执行两轮水平 + 两轮垂直可分离高斯模糊，返回模糊后的 `GpuTexture`（例如用于毛玻璃 UI 背景）；
3. **故障艺术后处理 (`GlitchPostEffect`)**：随游戏时间动态演化的屏幕数字故障效果。

---

## 一、 泛光后处理 (`BloomPostEffect`) 完整用法

### 1. 如何在方块实体或世界渲染中让物体产生泛光（Bloom）？

在 Minecraft 26.1 的 `SubmitNodeCollector` 渲染架构下，让你的渲染内容产生泛光有三种方式：

- **方式 A（推荐，同时正常渲染物体并叠加泛光）**：
  调用 `ALRPostEffects.getBloomPostEffect().createCompoundSubmitStorage(normalCollector)` 获取一个 `CompoundSubmitNodeStorage`。将它传给你的模型或几何体提交代码，你的绘制指令会**自动双写**一份到正常世界帧缓冲、一份到泛光帧缓冲，并自动标记本帧泛光为 `dirty`（若本帧没有任何泛光绘制提交，`BloomPostEffect` 会零开销直接跳过降/升采样通道！）。
- **方式 B（仅将特定发光层提交到泛光缓冲）**：
  使用 `BloomSubmitNodeStorage.wrap(collector)` 包装收集器，或直接向 `ALRPostEffects.getBloomPostEffect().getSubmitNodeStorage()` 提交并调用 `markDirty()`。
- **方式 C（注册单帧回调 `drawBloomed`）**：
  在渲染阶段调用 `ALRPostEffects.getBloomPostEffect().drawBloomed((nodeCollector, poseStack) -> { ... })`。

### 2. 代码示例：在方块实体渲染器中同时提交正常模型与泛光能量核心

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

        // 创建双写复合收集器：提交给 glowingCollector 的内容会同时渲染到主屏幕和泛光图层
        CompoundSubmitNodeStorage glowingCollector = bloom.createCompoundSubmitStorage(collector);

        glowingCollector.submitCustomGeometry(
            poseStack,
            RenderTypes.lightning(),
            (pose, vertexConsumer) -> {
                // 绘制一个亮青色发光平面
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

## 二、 使用 `GaussianBlur` 与 `GlitchPostEffect`

```java
package com.example.mymod.client.render;

import com.mojang.blaze3d.textures.GpuTexture;
import com.mojang.blaze3d.textures.GpuTextureView;
import dev.anvilcraft.lib.v2.rendering.ALRPostEffects;
import dev.anvilcraft.lib.v2.rendering.blur.GaussianBlur;
import net.minecraft.client.Minecraft;

public final class PostProcessExample {
    // 创建步长为 1.5、亮度倍率为 0.9 的高斯模糊处理器（不用时需调用 close() 释放缓冲）
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

## 三、 公开类与接口 API 详解

### 1. `BloomPostEffect` 与 `BloomRenderCallback` (`dev.anvilcraft.lib.v2.rendering.bloom`)

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public BloomPostEffect()`<br>`public BloomPostEffect(float bloomIntensity, float sampleStepLength, float colorMultiplier, float bloomThreshold, float bloomIntensityMultiplier, int passes, int step)` | — | 默认构造器参数：`bloomIntensity = 1.25f`、`bloomThreshold = 0.08f`、`bloomIntensityMultiplier = 0.8f`、`passes = 5`、`step = 1`。 |
| `public CompoundSubmitNodeStorage createCompoundSubmitStorage(SubmitNodeCollector collector)` | `CompoundSubmitNodeStorage` | 创建将绘制指令同时提交到 `this.submitNodeStorage` 与 `collector` 并自动调用 `markDirty()` 的复合收集器。 |
| `public void drawBloomed(BloomRenderCallback runnable)` | `void` | 注册本帧泛光绘制回调（`void render(SubmitNodeCollector nodeCollector, PoseStack poseStack)`）并标记 `dirty = true`。 |
| `public void markDirty()` | `void` | 手动标记本帧存在泛光内容需要执行后处理。 |
| `public RenderTarget getBloomInputTarget()` | `RenderTarget` | 获取泛光输入渲染目标（在 `beginBloomDraw()` 时会自动从 `mainRenderTarget` 拷贝深度缓冲，确保发光物体被前景不透明方块正确遮挡）。 |
| `public SubmitNodeStorage getSubmitNodeStorage()` | `SubmitNodeStorage` | 获取专用于泛光图层的节点存储。 |
| `public BloomParametersUbo getBloomParameters()` | `BloomParametersUbo` | 获取并动态调节泛光强度（`bloomIntensity`）、混合阈值（`bloomBlendThreshold`）与亮度敏感度（`luminanceSensitivity`）。 |
| `public void beginFrame()` / `runBloomDraws(Matrix4fc, FeatureRenderDispatcher)` / `process()` / `resize(int, int)` | `void` | 由 `AnvilLibRendering` 与 `ALRPostEffects` 自动按帧调用。 |

### 2. `GaussianBlur` (`dev.anvilcraft.lib.v2.rendering.blur`)

实现 `AutoCloseable`。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public GaussianBlur(float sampleStepLength, float colorMultiplier)` | — | 创建高斯模糊实例并按当前游戏窗口尺寸初始化内部缓冲。 |
| `public GpuTexture process(GpuTexture input)` | `GpuTexture` | 对输入纹理执行 2 次水平模糊 + 2 次垂直模糊，返回模糊后的颜色纹理。 |
| `public BlurParametersUbo getBlurParameters()` | `BlurParametersUbo` | 获取模糊参数 UBO（可动态修改 `sampleStepLength` 与 `colorMultiplier`）。 |
| `public void resize(int width, int height)` | `void` | 当目标分辨率改变时调整内部帧缓冲尺寸并重建正交全屏四边形顶点缓冲。 |
| `public void close()` | `void` | 释放内部创建的 `GpuBuffer`、`GpuSampler` 与 `RenderTarget`。 |

### 3. `GlitchPostEffect` (`dev.anvilcraft.lib.v2.rendering.glitch`)

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public GpuTextureView process(GpuTextureView input, int width, int height)` | `GpuTextureView` | 将 `input` 纹理视图通过 `ALRPipelines.GLITCH` 渲染到 `glitchOutputTarget`（自动传入宽高与 `(gameTime % 24000 + partialTick) / 10f`），返回处理后的 `GpuTextureView`。 |
| `public RenderTarget getGlitchOutputTarget()` / `public GpuSampler getSampler()` | `RenderTarget` / `GpuSampler` | 获取故障特效输出目标与线性采样器。 |
