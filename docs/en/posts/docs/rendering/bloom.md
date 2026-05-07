---
title: Rendering Bloom Post-Processing
prev: false
next: false
---

# Bloom Post-Processing <Badge type="tip" text=">=26.1" />

## BloomPostEffect

Core class that manages the entire bloom input, downsampling, upsampling, blur, and blending process.

### Initialization

```java
// Obtain via ALRendering
BloomPostEffect bloom = ALRendering.getBloomPostEffect();

// Or construct directly (customizable parameters)
BloomPostEffect bloom = new BloomPostEffect(bloomIntensity, threshold, sensitivity);
```

The constructor creates `BloomParametersUbo`, `BlurParametersUbo`, `BloomPipelineParametersUbo` and corresponding GPU buffers, and initializes
the `downsampleTargets[]` and `upsampleTargets[]` target textures.

### Main Methods

| Method                                                  | Description                                                    |
|---------------------------------------------------------|----------------------------------------------------------------|
| `beginFrame()`                                          | Clears temporary textures and dirty flags at the start of each frame |
| `drawBloomed(BloomRenderCallback)`                      | Registers objects that need additional rendering on the bloom input texture |
| `process(modelViewMatrix, featureRenderDispatcher)`     | Executes the complete bloom processing pipeline                |
| `resize(width, height)`                                 | Resizes all target textures when the window size changes       |
| `markDirty()`                                           | Manually marks as needing reprocessing                         |

### process Flow

```
1. runBloomDraws ← Execute all BloomRenderCallbacks, render to bloomInputTarget
2. doDownSample  ← Progressively downsample bloom texture (half size each step)
3. doUpSample    ← Progressively upsample using 5×5 Gaussian kernel, blending current layer + previous layer
4. applyBloom    ← Blend bloom result back into the main render target
```

### Callback Interface

```java
@FunctionalInterface
public interface BloomRenderCallback {
    void render(SubmitNodeCollector nodeCollector, PoseStack poseStack);
}
```

```java
bloom.drawBloomed((nodeCollector, poseStack) -> {
    // Render objects that should bloom onto bloomInputTarget
    // e.g., rendering glowing items, blocks, etc.
});
```

### Internal Passes

| Pass       | Pipeline       | Shader                       | Description                                      |
|------------|----------------|------------------------------|--------------------------------------------------|
| DownSample | `DOWNSAMPLE`   | `down_sample.fsh`            | Average 4 pixels, halve resolution               |
| UpSample   | `UPSAMPLE`     | `up_sample.fsh` + `blur.fsh` | 5×5 Gaussian blur, blend with previous layer     |
| ApplyBloom | `APPLY_BLOOM`  | `apply_bloom.fsh`            | Blend bloom texture with main framebuffer         |

### Blend Formula

```
color + bloom * pow(threshold, luminance * sensitivity)
```

## Bloom UBOs

### BloomParametersUbo

```java
public class BloomParametersUbo extends UboObject<BloomParametersUbo> {
    float bloomIntensity;       // Bloom intensity
    float bloomBlendThreshold;   // Blend threshold
    float luminanceSensitivity;  // Luminance sensitivity
}
```

### BlurParametersUbo

```java
public class BlurParametersUbo extends UboObject<BlurParametersUbo> {
    Vec2f direction;        // Blur direction
    float sampleStepLength; // Sample step length
    float colorMultiplier;  // Color multiplier
}
```

### BloomPipelineParametersUbo

```java
public class BloomPipelineParametersUbo extends UboObject<BloomPipelineParametersUbo> {
    Vec2f resolution; // Render resolution
    int frameIndex;   // Frame index
}
```

### TransformsUbo

```java
public class TransformsUbo extends UboObject<TransformsUbo> {
    Matrix4f projMat; // Orthographic projection matrix
}
```

## Usage Example

```java
// Get the bloom instance
BloomPostEffect bloom = ALRendering.getBloomPostEffect();

// Register bloom draw callbacks
bloom.drawBloomed((nodeCollector, poseStack) -> {
    // Render glowing objects
    ItemRenderer.renderItem(itemStack, poseStack, ...);
});

// Manually mark as dirty
bloom.markDirty();
```
