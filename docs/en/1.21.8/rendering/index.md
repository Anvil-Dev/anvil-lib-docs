# Rendering Extensions System

`module.rendering` (Artifact: `anvillib-rendering-neoforge-1.21.8`, root package `dev.anvilcraft.lib.v2.rendering`) targets Minecraft 1.21.8 and NeoForge 21.8.x's Blaze3D `RenderPipeline` and `GuiRenderState` architecture, providing four client graphics subsystems and buffer infrastructure:

- **Structure Projection Rendering (`projection`)**: Bakes structures or block sets into reusable client meshes (`ProjectionRenderer`), using a depth prepass for multi-structure translucent ghost overlays, missing-block hints, and wrong-state/wrong-block highlights.
- **Structure Read-Only Sandbox & UI Preview (`preview`)**: Provides a lightweight read-only `SandboxRenderLevel` decoupled from the real world (retaining only blocks/BEs/fluids/entities), paired with orthographic orbit camera `ViewportCameraRig`, `StructurePreviewPipRenderer` (based on 1.21.8's native `PictureInPictureRenderer`), and floating popup `StructureGuiPreview`.
- **2D SDF Vector Graphics (`sdf`)**: Shader-driven signed distance field pipeline `SdfGraphics` and matching CPU distance math `Sdf2d` for anti-aliased fills, strokes, glow, and hit-testing on rounded boxes, circles, arcs, sectors, pies, uneven capsules, eggs, segments, and triangles.
- **Gaussian Blur, UBO Layouts & GUI State Extensions (`blur` / `bloom` / `foundation.buffers` / `state`)**: Provides 2-axis 4-pass `GaussianBlur`, auto-aligned `Std140`/`Std430` `BufferObject` declarations, and `LibGuiElementRenderState` / `LibQuadGuiElementRenderState` for submitting custom UBOs to `GuiRenderState`.

---

## Setup

If using the full aggregate `anvillib-neoforge-1.21.8`, `module.rendering` is included automatically. To depend on the rendering module standalone, declare `Cjsah Maven` (or `Maven Central`) with `exclusiveContent` in `build.gradle`:

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-rendering-neoforge-1.21.8:2.0.0")
}
```

---

## Module Entry & Built-in Render Pipelines

### `AnvilLibRendering`

`AnvilLibRendering` (package `dev.anvilcraft.lib.v2.rendering`) is the client entry class, declared with `@Mod(value = AnvilLibRendering.MODID, dist = Dist.CLIENT)` and loaded only on the client.

| Member Signature | Description |
| :--- | :--- |
| `public static final String MODID = "anvillib_rendering"` | Rendering module Mod ID, also used as the shader and pipeline resource namespace |
| `public static ResourceLocation location(String path)` | Returns `ResourceLocation.fromNamespaceAndPath(MODID, path)` |

---

### `ALRPipelines`

`ALRPipelines` (`@EventBusSubscriber(modid = AnvilLibRendering.MODID, value = Dist.CLIENT)`) registers shared render pipelines and vertex formats in `RegisterRenderPipelinesEvent`. Other modules (such as `module.wheel`'s frosted glass and custom GUI widgets) can reuse these pipelines or use them as templates.

| Public Member | Type | Description |
| :--- | :--- | :--- |
| `POST_PASS` | `RenderPipeline.Snippet` | Fullscreen post-processing pass snippet: uses `core/blit` vertex shader, `DiffuseSampler`, `Transforms` uniform, `NO_DEPTH_TEST`, depth write disabled, and backface culling disabled |
| `BLUR` | `RenderPipeline` | Gaussian blur pipeline (`pipeline/blur`) built on `POST_PASS`, using fragment shader `anvillib_rendering:core/blur` and binding extra `BlurParameters` uniform |
| `SDF_GRAPHICS_FORMAT` | `VertexFormat` | Dedicated SDF vertex format containing `POSITION`, `COLOR`, `UV0`, `UV1` in order |
| `SDF_GRAPHICS` | `RenderPipeline` | 2D SDF batched graphics pipeline (`pipeline/sdf_graphics`), shader `anvillib_rendering:core/sdf_graphics`, binding `DynamicTransforms`, `Projection`, and `SDFParameters` uniforms, with `BlendFunction.TRANSLUCENT` and backface culling disabled |
| `on(RegisterRenderPipelinesEvent event)` | `static void` | Auto-invoked client bus listener registering `BLUR` and `SDF_GRAPHICS` |

---

## Subsystem Navigation

| Subsystem | Documentation | Use Case |
| :--- | :--- | :--- |
| **Structure Projection** | [Projection Rendering System](./projection) | In-world multiblock/blueprint ghost previews, depth prepass sorting & red/yellow validation overlays |
| **Structure Sandbox & UI Preview** | [Structure Sandbox & UI Preview](./structure-preview) | 3D rotating structures in containers/recipe viewers, Y-layer slicing, mouse picking & floating preview windows |
| **2D SDF Vector Drawing** | [2D SDF Vector Graphics Rendering](./sdf) | Resolution-independent HUD/GUI vector shapes, glow/stroke/smoothing, instance sharing & exact hit testing |
| **Post-Processing Blur & GPU Buffers** | [Gaussian Blur & UBO Buffer Layouts](./buffers-and-blur) | Frosted-glass/post blur texture pipelines, `std140`/`std430` struct UBO/SSBO declarations & empty buffer helpers |
| **GUI Custom State Bridge** | [GUI Render State Extensions](./gui-state) | Binding extra `GpuBufferSlice`s and scissor areas to custom `RenderPipeline`s in 1.21.8 `GuiRenderState` |
