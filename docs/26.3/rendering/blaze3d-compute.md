# Blaze3D 扩展、计算着色器与无绑定纹理 (`dev.anvilcraft.lib.v2.rendering.extension.blaze3d`)

<BranchContextCard branch="26.3" />

Minecraft 26.3 引入了全新的 Blaze3D 抽象层（`GpuDevice`、`CommandEncoder`、`RenderPipeline`、`RenderPass`），但原版抽象仅涵盖光栅化图形管线与 8-bit 常规纹理格式，不提供 Compute Shader（计算着色器）、浮点 HDR / 单通道 `R32F` 深度纹理、ARB 无绑定纹理（Bindless Texture）或硬件遮挡查询（Occlusion Query）。

`module.rendering` 通过 Mixin 向原版 `GpuDevice` 与 `CommandEncoder` 注入了 **`ALRGpuDeviceExtension`** 与 **`ALRCommandEncoderExtension`** 接口，使开发者能够以与原生 Blaze3D `RenderPass` 完全一致的 `try-with-resources` 风格编写 **`ALRComputePass`** 计算通道。

---

## 一、 核心使用流程与完整代码示例

### 1. 第一步：声明并注册 `ALRComputePipeline`

将你的 GLSL 计算着色器文件（支持 `.csh`、`.compute` 或 `.glsl` 后缀，支持 `#moj_import` 预处理指令）放置在资源包 `assets/<namespace>/shaders/compute/<name>.csh` 下，通过 `ALRComputePipeline.builder()` 声明其资源绑定布局，并在 `RegisterComputePipelinesEvent` 中注册。

### 2. 第二步：在渲染帧中开启 `ALRComputePass` 并派发工作组

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
     * 创建一张 512x512、单通道 32 位浮点 (GL_R32F) 的扩展 GpuTexture
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
     * 执行一次 Compute Shader 通道并插入 SSBO 内存屏障
     */
    public static void dispatchSimulation(GpuBufferSlice paramsUbo, GpuBufferSlice particleSsbo, int particleCount) {
        if (!ALRComputeCapabilities.isComputeSupported()) {
            return;
        }

        CommandEncoder encoder = RenderSystem.getDevice().createCommandEncoder();
        ALRCommandEncoderExtension encoderExt = ALRCommandEncoderExtension.of(encoder);

        try (ALRComputePass pass = encoderExt.alrCreateComputePass()) {
            pass.setPipeline(ModRenderPipelines.PARTICLE_SIM_PIPELINE);
            // 绑定 UBO 到槽位 0，绑定 SSBO 到槽位 0
            pass.bindUniformBlock(0, paramsUbo);
            pass.bindShaderStorage(0, particleSsbo);

            // 按每组 64 线程派发工作组
            int groupsX = (particleCount + 63) / 64;
            pass.dispatchWorkgroups(groupsX, 1, 1);

            // 插入内存屏障，确保后续顶点/着色器读取能看到 Compute 写入的最新结果
            pass.memoryBarrier(
                MemoryBarrierFlag.SHADER_STORAGE_BARRIER,
                MemoryBarrierFlag.VERTEX_ATTRIB_ARRAY_BARRIER
            );
        }
    }
}
```

---

## 二、 Blaze3D 扩展接口 API 详解

### 1. `ALRGpuDeviceExtension` 与 `ALRCommandEncoderExtension`

| 接口名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `ALRGpuDeviceExtension`<br>（强转 `(ALRGpuDeviceExtension) RenderSystem.getDevice()`） | • `GpuTexture alrCreateExtendedTexture(@Nullable String label, @GpuTexture.Usage int usage, ExtendedTextureFormat format, int width, int height, int depthOrLayers, int mipLevels)`<br>• `GpuQueryObject alrCreateSamplesQuery()`<br>• `BindlessTexturingSupport alrGetBindlessTexturingSupport()`<br>• `void alrPushDebugGroup(Supplier<String> message)` / `void alrPopDebugGroup()`<br>• `ALRHICapabilities alrhiCreateCapabilities()` / `ALRHIHeuristics alrhiCreateHeuristics()`<br>• `ALRComputeProgramInstance alrCompileComputePipeline(ALRComputePipeline, ALRComputeProgramInstanceKey)`<br>• `void alrDestroyComputeShader(ALRComputeProgramInstance)`<br>• `int alrGetUniformLocation(ALRComputeProgramInstance, ALRComputePipeline, String)` | 扩展原版 `GpuDevice`，提供扩展浮点纹理创建、硬件采样遮挡查询对象创建、无绑定纹理支持访问及 RenderDoc 调试分组标记。 |
| `ALRCommandEncoderExtension`<br>（调用 `ALRCommandEncoderExtension.of(encoder)`） | • `ALRComputePass alrCreateComputePass()`<br>• `void alrDispatchWorkgroups(int groupCountX, int groupCountY, int groupCountZ)`<br>• `void alrDispatchWorkgroupsIndirect(GpuBufferSlice parameters)`<br>• `void alrMemoryBarrier(MemoryBarrierFlag... flags)` | 扩展原版 `CommandEncoder`，用于开启 `ALRComputePass`、派发直接/间接计算工作组以及插入 `glMemoryBarrier`。 |

### 2. 硬件能力检测：`ALRHICapabilities`、`ALRComputeCapabilities` 与 `ALRHIHeuristics`

| 类 / 记录 | 字段 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `ALRHICapabilities` | `public record ALRHICapabilities(boolean compute, boolean bindlessTexturing, boolean persistentMappedBuffer, boolean shaderSubgroup, int maxImageUnit, int[] maxComputeWorkgroup)`<br>`public static ALRHICapabilities getInstance()` | 检测当前 OpenGL 上下文是否支持计算着色器（GL 4.3 / `ARB_compute_shader`）、无绑定纹理（`ARB_bindless_texture`）、持久映射缓冲（GL 4.4 / `ARB_buffer_storage`）、子群指令（`KHR_shader_subgroup`）、最大图像单元数与最大计算工作组尺寸。 |
| `ALRComputeCapabilities` | `public static boolean isComputeSupported()` | 返回当前设备是否支持 Compute Shader。 |
| `ALRHIHeuristics` | `public record ALRHIHeuristics(boolean isWindowsIntelGraphics)` | 识别特定驱动启发式特征（如 Windows Intel 核显驱动兼容性检测）。 |

---

## 三、 计算着色器管线与绑定布局 (`ALRComputePipeline` / `ALRComputePass`)

### 1. `ALRComputePipeline` 与 `ALRComputePipeline.Builder`

| `Builder` 方法签名 | 绑定类型 (`ComputeBindingLayout<T>`) | 说明 |
| :--- | :--- | :--- |
| `withName(Identifier name)` | — | 设置计算管线唯一名称（必填）。 |
| `withShader(Identifier shaderLocation)` / `withShaderLocation(Identifier)` | — | 设置相对于 `shaders/` 目录的着色器路径（如 `anvillib_rendering:compute/depth_convert.csh`，必填）。 |
| `withDefines(ShaderDefines defines)` | — | 设置编译期宏定义 `ShaderDefines`。 |
| `withPipeline(ALRComputePipeline template)` | — | 从已有管线模板复制绑定列表、着色器路径与宏定义（不复制 `name`）。 |
| `withTexture(String name)` | `TextureBinding` (`SamplerAndTexture`) | 添加采样器纹理绑定（`ShaderResourceType.TEXTURE_OR_IMAGE`）。 |
| `withImage(String name, boolean read, boolean write)`<br>`withReadOnlyImage(String name)`<br>`withWriteOnlyImage(String name)`<br>`withReadWriteImage(String name)` | `ImageBinding` (`GpuTexture`) | 添加单个 `image2D` 图像单元绑定（`read` 与 `write` 不能同时为 `false`，否则抛出 `IllegalArgumentException`）。 |
| `withArrayOfImage(String name, boolean read, boolean write, int size)` | `ImageArrayBinding` (`List<GpuTexture>`) | 添加长度为 `size` 的 `image2D[]` 数组绑定（占用连续多个图像绑定点，适合 Mipmap 链逐层读写）。 |
| `withBindlessArrayOfImage(String name, boolean read, boolean write, int size)` | `BindlessImageArrayBinding` (`List<GpuTexture>`) | 添加基于 `ARB_bindless_texture` 图像句柄数组的无绑定 `image2D[]`（不受传统 8 个 Image Unit 槽位上限限制）。 |
| `withUniformBlock(String name)` | `UniformBlockBinding` (`GpuBufferSlice`) | 添加 Uniform Buffer Object (`UBO`) 绑定。 |
| `withShaderStorage(String name)` | `ShaderStorageBinding` (`GpuBufferSlice`) | 添加 Shader Storage Buffer Object (`SSBO`) 绑定。 |
| `withAtomicCounter(String name)` | `AtomicCounterBinding` (`GpuBufferSlice`) | 添加 Atomic Counter Buffer 绑定。 |
| `build()` | `ALRComputePipeline` | 构建不可变的计算管线。 |

### 2. `ALRComputePass` 方法一览

实现 `AutoCloseable`，必须在 `try (ALRComputePass pass = ...)` 中使用以确保 `close()` 释放状态并恢复驻留作用域：

| 方法签名 | 说明 |
| :--- | :--- |
| `setPipeline(ALRComputePipeline pipeline)` | 绑定并激活目标计算管线对应的已编译着色器程序。 |
| `<T> int bind(int bindingPointStart, ComputeBindingLayout<T> layout, T resource)` | 按给定 `ComputeBindingLayout` 将资源绑定到 `bindingPointStart`，返回占用的槽位增量。 |
| `bindTexture(int bindingPoint, TextureBinding.SamplerAndTexture resource)` | 绑定纹理与采样器到 `bindingPoint`。 |
| `bindImage(int bindingPoint, GpuTexture resource, boolean read, boolean write)` | 绑定单张纹理作为 `image2D` 到 `bindingPoint`。 |
| `bindArrayOfTexture(int bindingPoint, List<GpuTexture> resource, boolean read, boolean write)` | 绑定一组纹理到连续槽位。 |
| `bindBindlessImageArray(BindlessImageArrayBinding binding, List<GpuTexture> textures)` / `bindBindlessImageArray(String name, List<GpuTexture> textures)` | 绑定无绑定图像句柄数组到对应的 Uniform 变量名。 |
| `bindUniformBlock(int bindingPoint, GpuBufferSlice resource)` | 绑定 UBO 切片到 `bindingPoint`。 |
| `bindShaderStorage(int bindingPoint, GpuBufferSlice resource)` | 绑定 SSBO 切片到 `bindingPoint`。 |
| `bindAtomicCounter(int bindingPoint, GpuBufferSlice resource)` | 绑定原子计数器缓冲切片到 `bindingPoint`。 |
| `dispatchWorkgroups(int groupCountX, int groupCountY, int groupCountZ)` | 直接派发 `(X, Y, Z)` 维度的计算工作组（自动包裹在调试分组标签中）。 |
| `dispatchWorkgroupsIndirect(GpuBufferSlice buffer)` | 从 GPU 缓冲切片间接派发计算工作组（`glDispatchComputeIndirect`）。 |
| `memoryBarrier(MemoryBarrierFlag... flags)` | 插入一个或多个 `MemoryBarrierFlag` 屏障。 |
| `pushDebugGroup(Supplier<String> name)` / `popDebugGroup()` / `close()` | 压入/弹出调试分组，或关闭当前计算通道。 |

---

## 四、 扩展纹理格式、无绑定纹理与 GPU 查询对象

| 类型 / 接口名 | 关键枚举值 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `ExtendedTextureFormat` | • `R32F(4)`（`GL_R32F`，单通道 32-bit 浮点，用于深度/Hi-Z 金字塔）<br>• `RGBA16F(8)`（`GL_RGBA16F`，四通道半精度浮点，HDR 颜色目标）<br>• `RGBA32F(16)`（`GL_RGBA32F`，四通道全精度浮点）<br>• `RGB10_A2(4)`（`GL_RGB10_A2`）<br>• `public int pixelSize()` | 扩展像素格式枚举。由 `alrCreateExtendedTexture` 创建的纹理同时实现 `ExtendedGpuTexture` 接口（提供 `getActualFormat()`）。 |
| `MemoryBarrierFlag` | `VERTEX_ATTRIB_ARRAY_BARRIER`、`ELEMENT_ARRAY_BARRIER`、`UNIFORM_BARRIER`、`TEXTURE_FETCH_BARRIER`、`SHADER_IMAGE_ACCESS_BARRIER`、`COMMAND_BARRIER`、`PIXEL_BUFFER_BARRIER`、`TEXTURE_UPDATE_BARRIER`、`BUFFER_UPDATE_BARRIER`、`FRAMEBUFFER_BARRIER`、`TRANSFORM_FEEDBACK_BARRIER`、`ATOMIC_COUNTER_BARRIER`、`SHADER_STORAGE_BARRIER`、`ALL_BARRIER`；静态方法 `compound(MemoryBarrierFlag...)` | 对应 OpenGL `GL42` / `GL43` 的内存屏障位标志。 |
| `BindlessTexturingSupport` | • `TextureHandle alrCreateTextureHandle(GpuTexture texture, GpuSampler sampler)`<br>• `TextureHandle alrCreateImageHandle(GpuTexture texture, int level, boolean layered, int layer)`<br>• `TextureResidentScope alrTextureHandleCreateResidentScope(TextureHandle handle, boolean write, boolean read)`<br>• `void alrTextureHandleMakeResident(TextureHandle handle, boolean write, boolean read)` / `alrTextureHandleDeleteResident(TextureHandle)`<br>• `void alrBindTextureHandle(NamedUniformAccess, String name, TextureHandle)`<br>• `void alrBindTextureHandleMultiple(NamedUniformAccess, String name, List<TextureHandle>)` | ARB 无绑定纹理与图像句柄管理器。`TextureResidentScope` 实现 `AutoCloseable`，支持用 `try-with-resources` 自动管理句柄在显存中的 Resident 驻留期。 |
| `GpuQueryObject` | `void begin()` / `void end()` / `long getValue()` / `void close()` | 继承自 `GpuReusableResource`。封装 `GL_ANY_SAMPLES_PASSED_CONSERVATIVE` 硬件遮挡查询对象。 |
