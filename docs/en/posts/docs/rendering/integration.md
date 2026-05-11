---
title: Rendering Integration
prev: false
next: false
---

# Rendering Integration <Badge type="tip" text=">=26.1" />

## ALRendering

Mod entry point main class, registered via `@Mod` and `@EventBusSubscriber`.

### Initialization and Events

| Event                              | Handling                                                            |
|------------------------------------|---------------------------------------------------------------------|
| `RenderFrameEvent.Pre`             | `bloomPostEffect.beginFrame()`                                      |
| `RenderLevelStageEvent.AfterLevel` | `bloomPostEffect.process(modelViewMatrix, featureRenderDispatcher)` |
| `RegisterPipelineModifiersEvent`   | Register `REDIRECT_TO_BLOOM` modifier                               |

```java
// Get the bloom instance
BloomPostEffect bloom = ALRendering.getBloomPostEffect();
```

### Pipeline Creation

`ALRendering.createPipelines()` is called in the `MinecraftMixin` construction end callback to initialize the bloom
instance.

## Shaders and Pipelines

### Shader Files

| File              | Type     | Purpose                                                 |
|-------------------|----------|---------------------------------------------------------|
| `blit.vsh`        | Vertex   | Full-screen quad transform, outputs UV                  |
| `blur.fsh`        | Fragment | 7-weight Gaussian blur (direction + step length)        |
| `apply_bloom.fsh` | Fragment | Blend bloom onto the game framebuffer by intensity      |
| `down_sample.fsh` | Fragment | Average 4 pixels for downsampling                       |
| `up_sample.fsh`   | Fragment | 5×5 Gaussian kernel upsample, blend with previous frame |
| `util.glsl`       | Utility  | `saturate()`, `toneMap()` helper functions              |

### Pipeline Registration (ALRPipelines)

4 pipelines based on the `POST_PASS` fragment:

| Pipeline      | Purpose                    |
|---------------|----------------------------|
| `BLUR`        | Gaussian blur              |
| `APPLY_BLOOM` | Bloom blend to framebuffer |
| `DOWNSAMPLE`  | Downsampling               |
| `UPSAMPLE`    | Upsampling                 |

The base fragment `POST_PASS` uses `blit.vsh`, binds `Transforms` UBO and `DiffuseSampler`, and disables face culling.

## Mixin

### MinecraftMixin

- Calls `ALRendering.createPipelines()` at construction end to initialize the bloom instance
- Restores bloom texture size on window resize

### GuiRendererMixin

- Tracks the `GuiElementRenderState` corresponding to each GUI draw element
- When an element implements `LibGuiElementRenderState`, binds the UBO slices returned by its `bufferSlices()` to the
  RenderPass before drawing

## State Interfaces

### LibGuiElementRenderState

Extends `GuiElementRenderState`, allowing GUI elements to inject custom Uniforms.

```java
public interface LibGuiElementRenderState extends GuiElementRenderState {
    // Returns the UBO buffer slices to bind
    Map<String, GpuBufferSlice> bufferSlices();
}
```

### LibQuadGuiElementRenderState

Provides convenient viewport calculation and vertex construction for quad elements:

```java
public interface LibQuadGuiElementRenderState extends LibGuiElementRenderState {
    AABB getBounds();           // Viewport bounding box
    void buildVertices(...);    // Vertex construction
}
```

## Testing and Debugging

`ALRTest` provides examples (e.g., rendering items with bloom):

```java
// Enable debug mode: add JVM property
// -Danvillib.rendering.debugMode=true
```

```java
ALRTest.renderCarrotBloomed(); // Render a glowing carrot
```

## Custom GUI Element UBO Injection

```java
public class MyGuiElement implements LibQuadGuiElementRenderState {
    @Override
    public Map<String, GpuBufferSlice> bufferSlices() {
        Map<String, GpuBufferSlice> slices = new HashMap<>();
        slices.put("MyUniform", myUniformBuffer);
        return slices;
    }
}
```
