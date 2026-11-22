# Rendering Extensions: Core Entry Points & Global Config (`module.rendering`)

<BranchContextCard branch="26.3" />

`module.rendering` (artifact `anvillib-rendering-neoforge-26.3`, package `dev.anvilcraft.lib.v2.rendering`) provides a high-performance graphics extension library on `dev/26.3` built atop Minecraft 26.3's new Blaze3D `GpuDevice` / `CommandEncoder` pipeline. It injects **Compute Shader pipelines**, **Bindless Textures (ARB)**, and **GPU Occlusion Queries** into Blaze3D, powering **Cached Block Entity Rendering (CachedBER)**, **Hi-Z Occlusion Culling (with AMD FidelityFX SPD single-pass downsampling)**, **Bloom / Blur / Glitch post-processing**, **Structure Projection**, **2D SDF Vector Graphics**, and **GUI PiP block/structure rendering**.

Due to its large scope, this module is split into 10 independent sub-documents by functional subdomain:
- **This page (Core Entry Points & Global Config)**: Covers `AnvilLibRendering`, `ALROptions`, `ALRPipelines`, `ALRComputePipelines`, `ALRPostEffects`, `ALROptimizations`, `ALRDebugEntries`, `ALRSharedMath`, `MainTargetResizeEvent`, and `RegisterComputePipelinesEvent`.
- **[Blaze3D Extensions, Compute Shaders & Bindless Textures](./blaze3d-compute)**: Covers `ALRGpuDeviceExtension`, `ALRCommandEncoderExtension`, `ALRHICapabilities`, `ALRComputePipeline`, `ALRComputePass`, `ComputeBindingLayout`, `ALRComputeShaderManager`, `ExtendedGpuTexture`, `BindlessTexturingSupport`, and `GpuQueryObject`.
- **[Buffer Layouts, UBO/SSBO Objects & Resource Pools](./buffers-foundation)**: Covers `BufferLayout` (`Std140` / `Std430`), `BufferObject`, `FullTransformsUbo` / `IntSizeUbo`, `StagingSupport`, `FullyBufferedBufferSource`, `VertexBufferHost`, `GpuReusableResourcePool`, `CompoundSubmitNodeStorage`, `ALRMeshSorting`, and `GpuBufferConstants`.
- **[Post-Processing: Bloom, Gaussian Blur & Glitch](./post-effects)**: Covers `BloomPostEffect`, `BloomRenderCallback`, `BloomSubmitNodeStorage`, `GaussianBlur`, and `GlitchPostEffect`.
- **[Cached Block Entity Rendering (CachedBER)](./cached-ber)**: Covers `CachedBlockEntityRenderer`, `CachedBlockEntityRenderState`, `CachedBlockEntityRenderDispatcher`, `CachedBlockEntityRenderingPipeline`, and `IrisSupport`.
- **[Occlusion Culling: Hi-Z & GPU Query](./occlusion-culling)**: Covers `OcclusionCuller`, `HierarchicalZOcclusionCuller`, `GpuQueryOcclusionCuller`, `OcclusionKey`, `OcclusionSubmitNodeCollection`, `OcclusionFeatureRendererHelper`, `CullingStatistics`, and F3 debug entries.
- **[Structure Projection Rendering (Projection)](./projection)**: Covers `ProjectionScene`, `ProjectionMesh`, `ProjectionRenderer`, `ProjectionOverlay`, `ProjectionRenderTypes`, and `ProjectionRenderEvents`.
- **[Structure Sandbox & UI Preview](./structure-preview)**: Covers `SandboxRenderLevel`, `StructureSandboxFactory`, `ViewportCameraRig`, `StructurePreviewRenderer`, `StructurePreviewPipRenderer`, `StructurePreviewPicker`, `StructureGuiProviders`, `StructureGuiSession`, and `StructureGuiPreview`.
- **[2D SDF Vector Graphics Rendering](./sdf)**: Covers `Sdf2d`, `SdfGraphics`, `SdfParameters`, `SdfPassType`, and `SdfRenderType`.
- **[GUI Picture-in-Picture (PiP) & Fake World Access](./gui-and-fakeworld)**: Covers `GuiRenderExtras`, `GuiGraphicsExtractorExtension`, `BlockStatePipRenderer`, `StructurePipRenderer`, `DynamicTextureBlitRenderState`, `FakeDisplayLevel`, etc.

---

## 1. Setup & Client-Side Restrictions

> **Important Physical Side Note**: `module.rendering`'s main class `@Mod(value = "anvillib_rendering", dist = Dist.CLIENT)` is only loaded on the physical client, and most classes in this module directly reference `com.mojang.renderpearl.api.*`, `com.mojang.blaze3d.*`, and `net.minecraft.client.*`. Always isolate physical sides in common code and never reference this module's classes on dedicated server classloading paths.

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-rendering-neoforge-26.3:2.0.0")
}
```

---

## 2. Frame Render Pipeline Hook Timeline

`AnvilLibRendering` drives each subsystem on the client every frame in the following event order:

1. **`RenderFrameEvent.Pre` (Before Frame Starts)**:
   - Advances `CachedBlockEntityRenderingPipeline.getInstance().runTasks()` to process completed chunk mesh rebuild tasks and upload VBOs;
   - Calls `ALRPostEffects.getBloomPostEffect().beginFrame()` to reset bloom submit node storage;
   - Calls `ALROptimizations.getOcclusionCuller().beginRenderingFrame()` to rotate and read back the previous frame's async occlusion culling results.
2. **`PrepareRenderBuffersEvent` (Prepare Render Buffers)**:
   - Calls `CachedBlockEntityRenderingPipeline#prepare(camera.cullFrustum, camera.pos)` to prepare visible chunk layers and enqueue bloom-marked cached layers (`enqueueBloom()`).
3. **`RenderLevelStageEvent.AfterOpaqueBlocks` (After Opaque Blocks)**:
   - Calls `CachedBlockEntityRenderingPipeline#render(false, event.getRenderPass(), null)` to batch-render all opaque cached block entity meshes.
4. **`RenderLevelStageEvent.AfterTranslucentFeatures` (After Translucent Features)**:
   - Calls `CachedBlockEntityRenderingPipeline#render(true, event.getRenderPass(), null)` to batch-render all translucent cached block entity meshes.
5. **`RenderLevelStageEvent.OitTranslucent` (OIT Translucent Pass)**:
   - Calls `CachedBlockEntityRenderingPipeline#render(true, event.getRenderPass(), event.getOitStage())` to render translucent cached layers with Order-Independent Transparency (OIT).
6. **`RenderLevelStageEvent.AfterLevel` (After Level Rendering)**:
   - Calls `ALROptimizations.getOcclusionCuller().processFeatures(event.getLevelRenderState().cameraRenderState)` to process submitted occlusion-tested custom geometry;
   - Calls `ALRPostEffects.runBloomDraws(event.getModelViewMatrix())` to draw emissive geometry into the separate `bloomTarget` framebuffer;
   - Calls `ALRPostEffects.getBloomPostEffect().process()` to run Dual Kawase downsample/upsample blur and composite bloom back onto `mainRenderTarget`.

---

## 3. Full Code Example: Registering a Custom Compute Shader Pipeline & Listening to Main Target Resize

```java
package com.example.mymod.client.render;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.rendering.event.MainTargetResizeEvent;
import dev.anvilcraft.lib.v2.rendering.event.RegisterComputePipelinesEvent;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.compute.pipeline.ALRComputePipeline;
import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID, value = Dist.CLIENT)
public final class ModRenderPipelines {
    // Define a Compute Shader pipeline with a UBO, an input texture, and a write-only output image
    public static final ALRComputePipeline PARTICLE_SIM_PIPELINE = ALRComputePipeline.builder()
        .withName(Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "particle_sim"))
        .withShader(Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "compute/particle_sim.csh"))
        .withUniformBlock("SimParams")
        .withShaderStorage("ParticleBuffer")
        .build();

    private ModRenderPipelines() {
    }

    @SubscribeEvent
    public static void onRegisterComputePipelines(RegisterComputePipelinesEvent event) {
        event.registerPipeline(PARTICLE_SIM_PIPELINE);
    }

    @SubscribeEvent
    public static void onMainTargetResize(MainTargetResizeEvent event) {
        int width = event.getNewWidth();
        int height = event.getNewHeight();
        MyMod.LOGGER.debug("Main render target resized to: {}x{}", width, height);
    }
}
```

---

## 4. Top-Level Public Classes, JVM Options & Event API Reference

### 1. `ALROptions` (JVM Startup Debug Flags)

Located in `dev.anvilcraft.lib.v2.rendering.ALROptions`. Controls low-level graphics fallbacks and debugging via JVM `-D<key>=<value>` properties:

| Static Constant | JVM System Property (`-D...`) | Default | Description |
| :--- | :--- | :---: | :--- |
| `AnvilLibRendering.DEBUG` | `anvillib.rendering.debugMode` | `false` (`true` if present) | Enables rendering debug mode. |
| `SPD_OPTION_WAVE_INTEROP_LDS` | `alrSpdOptionUseWaveInteropLds` | `true` (`true` unless `"false"`) | Controls whether the FidelityFX SPD downsampler shader uses the Wave Interop + LDS shared memory path. |
| `OCCLUSION_QUERY_USE_FRUSTUM_PRE_PASS` | `alrOcclusionQueryUseFrustumPrePass` | `false` | Controls whether `GpuQueryOcclusionCuller` performs CPU frustum culling before submitting hardware occlusion query boxes. |
| `OCCLUSION_CULLING_FORCE_IMPL` | `alrOcclusionCullingForceImplementation` | `null` | Forces a specific occlusion culling backend: `"hiz"` (force Hi-Z), `"gpu_query"` (force hardware query), or `"no_op"` (disable culling). Defaults to auto-selection by GPU capability. |
| `TEXTURE_DEBUG_CLEAR` | `alrTextureDebugClear` | `false` | Whether to zero-clear pixel data on texture creation for RenderDoc frame captures. |
| `DEBUG_CONTEXT` | `alrEnableDebugContext` | `false` | Whether to enable an OpenGL Debug Context. |

### 2. `ALRPipelines` & `ALRComputePipelines` (Built-in Render & Compute Pipeline Constants)

| Class | Constant | Location (`anvillib_rendering:*`) | Purpose |
| :--- | :--- | :--- | :--- |
| `ALRPipelines` | `POST_PASS` (`RenderPipeline.Snippet`) | — | Fullscreen post-processing quad base snippet (vertex shader `core/blit`, including `Transforms` UBO, `DiffuseSampler`, and `ColorTargetState.DEFAULT`). |
| `ALRPipelines` | `GLITCH` / `BLUR` / `APPLY_BLOOM` / `DOWNSAMPLE` / `UPSAMPLE` | `glitch` / `blur` / `apply_bloom` / `down_sample` / `up_sample` | Graphics pipelines for glitch effect, Gaussian blur, bloom composition, and Dual Kawase down/upsampling. |
| `ALRPipelines` | `SDF_GRAPHICS_FORMAT` / `SDF_GRAPHICS` | `sdf_graphics` | 2D SDF vector graphics render pipeline and vertex format (`Position + Color + UV0 + UV1`). |
| `ALRPipelines` | `OCCLUSION_QUERY` | `occlusion_query` | Hardware occlusion query depth-test pipeline (`WRITE_NONE` disables color writes; `CompareOp.GREATER_THAN_OR_EQUAL` tests depth without writing, adapted for reverse-Z depth buffers). |
| `ALRComputePipelines` | `FFX_SPD_DOWNSAMPLE_PASS` (4 variants incl. `_BINDLESS`, `_NO_LDS`, `_BINDLESS_NO_LDS`) | `ffx_spd_downsample_pass*` | AMD FidelityFX Single Pass Downsampler (SPD) compute pipeline for single-pass max-depth pyramid generation (selectively registered in `RegisterComputePipelinesEvent` per `HierarchicalZSupport.hasEnoughImageUnits` / `useBindlessTexturing` and `shaderSubgroup()`). |
| `ALRComputePipelines` | `DEPTH_CONVERT` | `depth_convert` | Compute pipeline copying the main depth buffer into Hi-Z Mip 0 `R32F` image. |
| `ALRComputePipelines` | `HIZ_OCCLUSION_TEST` / `HIZ_OCCLUSION_TEST_BINDLESS` | `hiz_occlusion_test*` | Compute pipeline projecting bounding boxes to screen space and sampling corresponding Hi-Z mip levels for batch visibility testing (registered per image-unit / bindless path). |

### 3. `ALRPostEffects`, `ALROptimizations`, `ALRDebugEntries`, `ALRSharedMath` & Events

| Class | Method / Field Signatures | Description |
| :--- | :--- | :--- |
| `ALRPostEffects` | • `public static BloomPostEffect getBloomPostEffect()`<br>• `public static GlitchPostEffect getGlitchPostEffect()`<br>• `public static void createPostEffects()`<br>• `public static void runBloomDraws(Matrix4fc mvMat)`<br>• `public static void close()` | Gets, executes, or closes the global bloom and glitch post-effect instances and their render buffers. |
| `ALROptimizations` | • `public static OcclusionCuller getOcclusionCuller()`<br>• `public static void create()` | Gets the active global occlusion culler singleton (auto-selects `HierarchicalZOcclusionCuller`, `GpuQueryOcclusionCuller`, or `NoOp` per GPU capability). |
| `ALRDebugEntries` | `on(RegisterDebugEntriesEvent event)` | Registers the `anvillib_rendering:occlusion_culling` debug entry line on Minecraft 26.3's F3 debug screen. |
| `ALRSharedMath` | • `public static final PoseStack.Pose IDENTITY_POSE_3D`<br>• `public static final float SQRT_2 = 1.4142135f` | Shared identity matrix `Pose` and $\sqrt{2}$ constant. |
| `MainTargetResizeEvent` | `public int getNewWidth()` / `public int getNewHeight()` | Implements `IModBusEvent`. Fired when `Minecraft#getMainRenderTarget()` changes dimensions. |
| `RegisterComputePipelinesEvent` | `public void registerPipeline(ALRComputePipeline pipeline)`<br>`public List<ALRComputePipeline> getPipelines()` | Implements `IModBusEvent`. Fired during `ALRComputeShaderManager` initialization/reload to register custom `ALRComputePipeline`s. |
