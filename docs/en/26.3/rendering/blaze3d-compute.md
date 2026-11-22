# Blaze3D Extensions, Compute Shaders & Bindless Textures (`dev.anvilcraft.lib.v2.rendering.extension.blaze3d`)

<BranchContextCard branch="26.3" />

Minecraft 26.3 introduces a new Blaze3D abstraction layer (`GpuDevice`, `CommandEncoder`, `RenderPipeline`, `RenderPass`), but vanilla's abstraction only covers rasterization pipelines and standard 8-bit texture formats—omitting Compute Shaders, floating-point HDR / single-channel `R32F` depth textures, ARB Bindless Textures, and hardware Occlusion Queries.

`module.rendering` mixes **`ALRGpuDeviceExtension`** and **`ALRCommandEncoderExtension`** into vanilla `GpuDevice` and `CommandEncoder`, enabling developers to write **`ALRComputePass`** compute passes in the exact same `try-with-resources` style as vanilla Blaze3D `RenderPass`.

---

## 1. Core Workflow & Full Code Example

### 1. Step 1: Declare & Register `ALRComputePipeline`

Place your GLSL compute shader file (`.csh`, `.compute`, or `.glsl`, supporting `#moj_import`) under `assets/<namespace>/shaders/compute/<name>.csh`, declare its resource binding layout via `ALRComputePipeline.builder()`, and register it in `RegisterComputePipelinesEvent`.

### 2. Step 2: Open `ALRComputePass` & Dispatch Workgroups in a Frame

```java
package com.example.mymod.client.render;

import com.mojang.renderpearl.api.buffers.GpuBufferSlice;
import com.mojang.renderpearl.api.commands.CommandEncoder;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.textures.GpuTexture;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.ALRCommandEncoderExtension;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.ALRGpuDeviceExtension;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.ExtendedTextureFormat;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.MemoryBarrierFlag;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.compute.ALRComputeCapabilities;
import dev.anvilcraft.lib.v2.rendering.extension.blaze3d.compute.pipeline.ALRComputePass;

public final class ComputePassExample {
    private ComputePassExample() {
    }

    /**
     * Create a 512x512, single-channel 32-bit float (GL_R32F) extended GpuTexture
     */
    public static GpuTexture createHeightmapTexture() {
        ALRGpuDeviceExtension deviceExt = (ALRGpuDeviceExtension) RenderSystem.getDevice();
        return deviceExt.alrCreateExtendedTexture(
            "MyMod Heightmap R32F",
            GpuTexture.USAGE_TEXTURE_BINDING | GpuTexture.USAGE_COPY_DST,
            ExtendedTextureFormat.R32F,
            512,
            512,
            1,
            1
        );
    }

    /**
     * Run a Compute Shader pass and insert an SSBO memory barrier
     */
    public static void dispatchSimulation(GpuBufferSlice paramsUbo, GpuBufferSlice particleSsbo, int particleCount) {
        if (!ALRComputeCapabilities.isComputeSupported()) {
            return;
        }

        CommandEncoder encoder = RenderSystem.getDevice().createCommandEncoder();
        ALRCommandEncoderExtension encoderExt = ALRCommandEncoderExtension.of(encoder);

        try (ALRComputePass pass = encoderExt.alrCreateComputePass()) {
            pass.setPipeline(ModRenderPipelines.PARTICLE_SIM_PIPELINE);
            // Bind UBO to slot 0 and SSBO to slot 0
            pass.bindUniformBlock(0, paramsUbo);
            pass.bindShaderStorage(0, particleSsbo);

            // Dispatch workgroups at 64 threads per group
            int groupsX = (particleCount + 63) / 64;
            pass.dispatchWorkgroups(groupsX, 1, 1);

            // Insert memory barrier so subsequent vertex/fragment shaders see Compute's writes
            pass.memoryBarrier(
                MemoryBarrierFlag.SHADER_STORAGE_BARRIER,
                MemoryBarrierFlag.VERTEX_ATTRIB_ARRAY_BARRIER
            );
        }
    }
}
```

---

## 2. Blaze3D Extension Interfaces API Reference

### 1. `ALRGpuDeviceExtension` & `ALRCommandEncoderExtension`

| Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| `ALRGpuDeviceExtension`<br>(cast `(ALRGpuDeviceExtension) RenderSystem.getDevice()`) | • `GpuTexture alrCreateExtendedTexture(@Nullable String label, @GpuTexture.Usage int usage, ExtendedTextureFormat format, int width, int height, int depthOrLayers, int mipLevels)`<br>• `GpuQueryObject alrCreateSamplesQuery()`<br>• `BindlessTexturingSupport alrGetBindlessTexturingSupport()`<br>• `void alrPushDebugGroup(Supplier<String> message)` / `void alrPopDebugGroup()`<br>• `ALRHICapabilities alrhiCreateCapabilities()` / `ALRHIHeuristics alrhiCreateHeuristics()`<br>• `ALRComputeProgramInstance alrCompileComputePipeline(ALRComputePipeline, ALRComputeProgramInstanceKey)`<br>• `void alrDestroyComputeShader(ALRComputeProgramInstance)`<br>• `int alrGetUniformLocation(ALRComputeProgramInstance, ALRComputePipeline, String)` | Extends vanilla `GpuDevice` with extended float texture creation, hardware sample occlusion query creation, bindless texturing support, and RenderDoc debug group markers. |
| `ALRCommandEncoderExtension`<br>(call `ALRCommandEncoderExtension.of(encoder)`) | • `ALRComputePass alrCreateComputePass()`<br>• `void alrDispatchWorkgroups(int groupCountX, int groupCountY, int groupCountZ)`<br>• `void alrDispatchWorkgroupsIndirect(GpuBufferSlice parameters)`<br>• `void alrMemoryBarrier(MemoryBarrierFlag... flags)` | Extends vanilla `CommandEncoder` to open `ALRComputePass`, dispatch direct/indirect compute workgroups, and insert `glMemoryBarrier`. |

### 2. Hardware Capability Detection: `ALRHICapabilities`, `ALRComputeCapabilities` & `ALRHIHeuristics`

| Class / Record | Field / Method Signatures | Description |
| :--- | :--- | :--- |
| `ALRHICapabilities` | `public record ALRHICapabilities(boolean compute, boolean bindlessTexturing, boolean persistentMappedBuffer, boolean shaderSubgroup, int maxImageUnit, int[] maxComputeWorkgroup)`<br>`public static ALRHICapabilities getInstance()` | Detects whether the current OpenGL context supports compute shaders (GL 4.3 / `ARB_compute_shader`), bindless textures (`ARB_bindless_texture`), persistent mapped buffers (GL 4.4 / `ARB_buffer_storage`), shader subgroups (`KHR_shader_subgroup`), max image units, and max compute workgroup sizes. |
| `ALRComputeCapabilities` | `public static boolean isComputeSupported()` | Returns whether the current device supports Compute Shaders. |
| `ALRHIHeuristics` | `public record ALRHIHeuristics(boolean isWindowsIntelGraphics)` | Identifies driver-specific heuristics (e.g., Windows Intel integrated GPU compatibility detection). |

---

## 3. Compute Shader Pipeline & Binding Layout (`ALRComputePipeline` / `ALRComputePass`)

### 1. `ALRComputePipeline` & `ALRComputePipeline.Builder`

| `Builder` Method Signature | Binding Type (`ComputeBindingLayout<T>`) | Description |
| :--- | :--- | :--- |
| `withName(Identifier name)` | — | Sets the unique name of the compute pipeline (required). |
| `withShader(Identifier shaderLocation)` / `withShaderLocation(Identifier)` | — | Sets the shader path relative to `shaders/` (e.g., `anvillib_rendering:compute/depth_convert.csh`, required). |
| `withDefines(ShaderDefines defines)` | — | Sets compile-time `ShaderDefines` macros. |
| `withPipeline(ALRComputePipeline template)` | — | Copies bindings, shader location, and defines from an existing pipeline template (does not copy `name`). |
| `withTexture(String name)` | `TextureBinding` (`SamplerAndTexture`) | Adds a sampler texture binding (`ShaderResourceType.TEXTURE_OR_IMAGE`). |
| `withImage(String name, boolean read, boolean write)`<br>`withReadOnlyImage(String name)`<br>`withWriteOnlyImage(String name)`<br>`withReadWriteImage(String name)` | `ImageBinding` (`GpuTexture`) | Adds a single `image2D` image unit binding (`read` and `write` cannot both be `false`, else throws `IllegalArgumentException`). |
| `withArrayOfImage(String name, boolean read, boolean write, int size)` | `ImageArrayBinding` (`List<GpuTexture>`) | Adds an `image2D[]` array binding of length `size` (occupies consecutive image binding points, ideal for mipmap chain passes). |
| `withBindlessArrayOfImage(String name, boolean read, boolean write, int size)` | `BindlessImageArrayBinding` (`List<GpuTexture>`) | Adds a bindless `image2D[]` using `ARB_bindless_texture` image handle arrays (not constrained by the traditional 8 Image Unit slot cap). |
| `withUniformBlock(String name)` | `UniformBlockBinding` (`GpuBufferSlice`) | Adds a Uniform Buffer Object (`UBO`) binding. |
| `withShaderStorage(String name)` | `ShaderStorageBinding` (`GpuBufferSlice`) | Adds a Shader Storage Buffer Object (`SSBO`) binding. |
| `withAtomicCounter(String name)` | `AtomicCounterBinding` (`GpuBufferSlice`) | Adds an Atomic Counter Buffer binding. |
| `build()` | `ALRComputePipeline` | Builds the immutable compute pipeline. |

### 2. `ALRComputePass` Methods

Implements `AutoCloseable`; must be used in `try (ALRComputePass pass = ...)` to ensure `close()` releases state and restores resident scopes:

| Method Signature | Description |
| :--- | :--- |
| `setPipeline(ALRComputePipeline pipeline)` | Binds and activates the compiled shader program for the target compute pipeline. |
| `<T> int bind(int bindingPointStart, ComputeBindingLayout<T> layout, T resource)` | Binds `resource` at `bindingPointStart` per `ComputeBindingLayout`, returning the slot increment used. |
| `bindTexture(int bindingPoint, TextureBinding.SamplerAndTexture resource)` | Binds a texture and sampler to `bindingPoint`. |
| `bindImage(int bindingPoint, GpuTexture resource, boolean read, boolean write)` | Binds a single texture as `image2D` to `bindingPoint`. |
| `bindArrayOfTexture(int bindingPoint, List<GpuTexture> resource, boolean read, boolean write)` | Binds a list of textures to consecutive slots. |
| `bindBindlessImageArray(BindlessImageArrayBinding binding, List<GpuTexture> textures)` / `bindBindlessImageArray(String name, List<GpuTexture> textures)` | Binds a bindless image handle array to the corresponding Uniform variable name. |
| `bindUniformBlock(int bindingPoint, GpuBufferSlice resource)` | Binds a UBO slice to `bindingPoint`. |
| `bindShaderStorage(int bindingPoint, GpuBufferSlice resource)` | Binds an SSBO slice to `bindingPoint`. |
| `bindAtomicCounter(int bindingPoint, GpuBufferSlice resource)` | Binds an atomic counter buffer slice to `bindingPoint`. |
| `dispatchWorkgroups(int groupCountX, int groupCountY, int groupCountZ)` | Directly dispatches `(X, Y, Z)` compute workgroups (automatically wrapped in a debug group). |
| `dispatchWorkgroupsIndirect(GpuBufferSlice buffer)` | Indirectly dispatches compute workgroups from a GPU buffer slice (`glDispatchComputeIndirect`). |
| `memoryBarrier(MemoryBarrierFlag... flags)` | Inserts one or more `MemoryBarrierFlag` barriers. |
| `pushDebugGroup(Supplier<String> name)` / `popDebugGroup()` / `close()` | Pushes/pops a debug group or closes this compute pass. |

---

## 4. Extended Texture Formats, Bindless Textures & GPU Query Objects

| Type / Interface | Key Enum Values / Method Signatures | Description |
| :--- | :--- | :--- |
| `ExtendedTextureFormat` | • `R32F(4)` (`GL_R32F`, single-channel 32-bit float, for depth/Hi-Z pyramids)<br>• `RGBA16F(8)` (`GL_RGBA16F`, 4-channel half float, HDR color targets)<br>• `RGBA32F(16)` (`GL_RGBA32F`, 4-channel full float)<br>• `RGB10_A2(4)` (`GL_RGB10_A2`)<br>• `public int pixelSize()` | Extended pixel format enum. Textures created by `alrCreateExtendedTexture` also implement `ExtendedGpuTexture` (providing `getActualFormat()`). |
| `MemoryBarrierFlag` | `VERTEX_ATTRIB_ARRAY_BARRIER`, `ELEMENT_ARRAY_BARRIER`, `UNIFORM_BARRIER`, `TEXTURE_FETCH_BARRIER`, `SHADER_IMAGE_ACCESS_BARRIER`, `COMMAND_BARRIER`, `PIXEL_BUFFER_BARRIER`, `TEXTURE_UPDATE_BARRIER`, `BUFFER_UPDATE_BARRIER`, `FRAMEBUFFER_BARRIER`, `TRANSFORM_FEEDBACK_BARRIER`, `ATOMIC_COUNTER_BARRIER`, `SHADER_STORAGE_BARRIER`, `ALL_BARRIER`; static `compound(MemoryBarrierFlag...)` | Corresponds to OpenGL `GL42` / `GL43` memory barrier bitflags. |
| `BindlessTexturingSupport` | • `TextureHandle alrCreateTextureHandle(GpuTexture texture, GpuSampler sampler)`<br>• `TextureHandle alrCreateImageHandle(GpuTexture texture, int level, boolean layered, int layer)`<br>• `TextureResidentScope alrTextureHandleCreateResidentScope(TextureHandle handle, boolean write, boolean read)`<br>• `void alrTextureHandleMakeResident(TextureHandle handle, boolean write, boolean read)` / `alrTextureHandleDeleteResident(TextureHandle)`<br>• `void alrBindTextureHandle(NamedUniformAccess, String name, TextureHandle)`<br>• `void alrBindTextureHandleMultiple(NamedUniformAccess, String name, List<TextureHandle>)` | ARB bindless texture and image handle manager. `TextureResidentScope` implements `AutoCloseable`, allowing `try-with-resources` management of VRAM residency. |
| `GpuQueryObject` | `void begin()` / `void end()` / `long getValue()` / `void close()` | Extends `GpuReusableResource`. Wraps `GL_ANY_SAMPLES_PASSED_CONSERVATIVE` hardware occlusion query objects. |
