# Rendering 渲染扩展系统：核心入口与全局配置 (`module.rendering`)

<BranchContextCard branch="26.1" />

`module.rendering`（构件名 `anvillib-rendering-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.rendering`）在 `dev/26.1` 分支中提供了一套基于 Minecraft 26.1 全新 Blaze3D `GpuDevice` / `CommandEncoder` 渲染管线的高性能图形扩展库。它向 Blaze3D 注入了 **Compute Shader（计算着色器）管线**、**Bindless Texture（ARB 无绑定纹理与图像）** 与 **GPU Occlusion Query（遮挡查询）** 能力，并在此之上构建了**缓存方块实体渲染（CachedBER）**、**Hi-Z 金字塔遮挡剔除（Hierarchical-Z Occlusion Culling，含 AMD FidelityFX SPD 单通道下采样）**、**泛光/高斯模糊/故障后处理（Bloom / Blur / Glitch）**、**结构全息投影（Projection）**、**2D SDF 矢量图形** 以及 **GUI 画中画（PiP）方块/结构渲染**。

由于该模块体量庞大，按功能子域拆分为 9 篇独立子文档：
- **本篇（核心入口与全局配置）**：详解 `AnvilLibRendering`、`ALROptions`、`ALRPipelines`、`ALRComputePipelines`、`ALRPostEffects`、`ALROptimizations`、`ALRDebugEntries`、`ALRSharedMath`、`MainTargetResizeEvent` 与 `RegisterComputePipelinesEvent`。
- **[Blaze3D 扩展、计算着色器与无绑定纹理](./blaze3d-compute)**：详解 `ALRGpuDeviceExtension`、`ALRCommandEncoderExtension`、`ALRHICapabilities`、`ALRComputePipeline`、`ALRComputePass`、`ComputeBindingLayout`、`ALRComputeShaderManager`、`ExtendedGpuTexture`、`BindlessTexturingSupport` 与 `GpuQueryObject`。
- **[缓冲布局、UBO/SSBO 对象与资源池](./buffers-foundation)**：详解 `BufferLayout`（`Std140` / `Std430`）、`BufferObject`、`FullTransformsUbo` / `IntSizeUbo`、`StagingSupport`、`FullyBufferedBufferSource`、`VertexBufferHost`、`GpuReusableResourcePool`、`CompoundSubmitNodeStorage` 与 `ALRMeshSorting`。
- **[后处理管线：泛光 (Bloom)、高斯模糊与故障特效](./post-effects)**：详解 `BloomPostEffect`、`BloomRenderCallback`、`BloomSubmitNodeStorage`、`GaussianBlur` 与 `GlitchPostEffect`。
- **[缓存方块实体渲染 (CachedBER)](./cached-ber)**：详解 `CachedBlockEntityRenderer`、`CachedBlockEntityRenderState`、`CachedBlockEntityRenderDispatcher`、`CachedBlockEntityRenderingPipeline` 与 `IrisSupport`。
- **[遮挡剔除系统：Hi-Z 与 GPU Query](./occlusion-culling)**：详解 `OcclusionCuller`、`HierarchicalZOcclusionCuller`、`GpuQueryOcclusionCuller`、`OcclusionKey`、`OcclusionFeatureRendererHelper`、`CullingStatistics` 与 F3 调试项。
- **[结构投影渲染 (Projection)](./projection)**：详解 `ProjectionScene`、`ProjectionMesh`、`ProjectionRenderer`、`ProjectionOverlay`、`ProjectionRenderTypes` 与 `ProjectionRenderEvents`。
- **[2D SDF 矢量图形渲染](./sdf)**：详解 `Sdf2d`、`SdfGraphics`、`SdfParameters`、`SdfPassType` 与 `SdfRenderType`。
- **[GUI 画中画 (PiP) 与假世界访问](./gui-and-fakeworld)**：详解 `GuiRenderExtras`、`GuiGraphicsExtractorExtension`、`BlockStatePipRenderer`、`StructurePipRenderer`、`DynamicTextureBlitRenderState`、`FakeDisplayLevel` 等。

---

## 一、 接入配置与客户端限制

> **重要物理端提示**：`module.rendering` 的主类 `@Mod(value = "anvillib_rendering", dist = Dist.CLIENT)` 仅在物理客户端加载，且模块中绝大部分类直接引用 `com.mojang.blaze3d.*` 与 `net.minecraft.client.*`。在双端共用代码中请务必做好物理端隔离，切勿在服务端类加载路径中直接引用本模块的类。

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-rendering-neoforge-26.1:2.0.0")
}
```

---

## 二、 帧渲染管线挂载时序

`AnvilLibRendering` 在客户端每帧按以下事件时序驱动各子系统：

1. **`RenderFrameEvent.Pre`（帧开始前）**：
   - 推进 `CachedBlockEntityRenderingPipeline.getInstance().runTasks()` 处理已完成的区块网格重建任务并上传 VBO；
   - 调用 `ALRPostEffects.getBloomPostEffect().beginFrame()` 重置泛光提交节点存储；
   - 调用 `ALROptimizations.getOcclusionCuller().beginRenderingFrame()` 轮转并读取上一帧的异步遮挡剔除结果。
2. **`SubmitCustomGeometryEvent`（最低优先级 `EventPriority.LOWEST`）**：
   - 调用 `ALROptimizations.getOcclusionCuller().processFeatures(cameraRenderState)` 过滤已提交的受遮挡测试保护的自定义几何体。
3. **`RenderLevelStageEvent.AfterOpaqueBlocks`（不透明方块渲染后）**：
   - 调用 `CachedBlockEntityRenderingPipeline#render(frustum, false)` 批量渲染所有不透明缓存方块实体网格。
4. **`RenderLevelStageEvent.AfterTranslucentFeatures`（半透明特性渲染后）**：
   - 调用 `CachedBlockEntityRenderingPipeline#render(frustum, true)` 批量渲染所有半透明缓存方块实体网格。
5. **`RenderLevelStageEvent.AfterTranslucentParticles`（半透明粒子渲染后）**：
   - 调用 `ALRPostEffects.runBloomDraws(modelViewMatrix)` 将发光几何体绘制到独立的泛光帧缓冲 `bloomTarget` 中。
6. **`RenderLevelStageEvent.AfterLevel`（世界渲染完成后）**：
   - 调用 `ALRPostEffects.getBloomPostEffect().process()` 执行 Dual Kawase 降采样/升采样模糊并将泛光叠加回主渲染目标 `mainRenderTarget`。

---

## 三、 完整代码示例：注册自定义计算着色器管线与监听主窗口尺寸变化

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
    // 定义一个包含 UBO、输入纹理与只写输出图像的 Compute Shader 管线
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
        MyMod.LOGGER.debug("主渲染目标尺寸已调整为: {}x{}", width, height);
    }
}
```

---

## 四、 顶层公开类、JVM 参数与事件 API 详解

### 1. `ALROptions`（JVM 启动参数调试开关）

位于 `dev.anvilcraft.lib.v2.rendering.ALROptions`。可通过 JVM 启动参数 `-D<key>=<value>` 控制底层图形特性降级与调试行为：

| 静态常量名 | JVM 系统属性名 (`-D...`) | 默认值 | 作用说明 |
| :--- | :--- | :---: | :--- |
| `AnvilLibRendering.DEBUG` | `anvillib.rendering.debugMode` | `false`（存在即 `true`） | 开启渲染调试模式。 |
| `SPD_OPTION_WAVE_INTEROP_LDS` | `alrSpdOptionUseWaveInteropLds` | `true`（非 `"false"` 即 `true`） | 控制 FidelityFX SPD 下采样着色器是否使用 Wave Interop + LDS 共享内存路径。 |
| `OCCLUSION_QUERY_USE_FRUSTUM_PRE_PASS` | `alrOcclusionQueryUseFrustumPrePass` | `false` | 控制 `GpuQueryOcclusionCuller` 在提交硬件遮挡查询盒前是否先在 CPU 端做视锥体裁剪。 |
| `OCCLUSION_CULLING_FORCE_IMPL` | `alrOcclusionCullingForceImplementation` | `null` | 强制指定遮挡剔除实现：可选 `"hiz"`（强制 Hi-Z）、`"gpu_query"`（强制硬件查询）或 `"no_op"`（禁用剔除）。默认自动按显卡能力择优选择。 |
| `TEXTURE_DEBUG_CLEAR` | `alrTextureDebugClear` | `false` | 创建纹理时是否清零像素数据以方便 RenderDoc 抓帧调试。 |
| `DEBUG_CONTEXT` | `alrEnableDebugContext` | `false` | 是否启用 OpenGL Debug Context。 |

### 2. `ALRPipelines` 与 `ALRComputePipelines`（内置渲染与计算管线常量）

| 类名 | 常量名 | Location (`anvillib_rendering:*`) | 用途说明 |
| :--- | :--- | :--- | :--- |
| `ALRPipelines` | `POST_PASS` (`RenderPipeline.Snippet`) | — | 全屏后处理四边形基础管线片段（顶点着色器 `core/blit`，包含 `Transforms` UBO 与 `DiffuseSampler`）。 |
| `ALRPipelines` | `GLITCH` / `BLUR` / `APPLY_BLOOM` / `DOWNSAMPLE` / `UPSAMPLE` | `glitch` / `blur` / `apply_bloom` / `down_sample` / `up_sample` | 故障特效、高斯模糊、泛光合成与 Dual Kawase 降/升采样图形管线。 |
| `ALRPipelines` | `SDF_GRAPHICS_FORMAT` / `SDF_GRAPHICS` | `sdf_graphics` | 2D SDF 矢量图形渲染管线及其顶点格式（`Position + Color + UV0 + UV1`）。 |
| `ALRPipelines` | `OCCLUSION_QUERY` | `occlusion_query` | 硬件遮挡查询深度测试管线（`WRITE_NONE` 禁止颜色写入，`LESS_THAN_OR_EQUAL` 只测试深度不写深度）。 |
| `ALRComputePipelines` | `FFX_SPD_DOWNSAMPLE_PASS`（含 `_BINDLESS`、`_NO_LDS`、`_BINDLESS_NO_LDS` 共 4 个变体） | `ffx_spd_downsample_pass*` | AMD FidelityFX Single Pass Downsampler (SPD) 深度金字塔单通道最大值下采样计算管线。 |
| `ALRComputePipelines` | `DEPTH_CONVERT` | `depth_convert` | 将主深度缓冲转换为 Hi-Z Mip 0 `R32F` 图像的拷贝计算管线。 |
| `ALRComputePipelines` | `HIZ_OCCLUSION_TEST` / `HIZ_OCCLUSION_TEST_BINDLESS` | `hiz_occlusion_test*` | 批量计算包围盒在屏幕空间投影并采样对应 Hi-Z Mip 层级判定可见性的计算管线。 |

### 3. `ALRPostEffects`、`ALROptimizations`、`ALRDebugEntries`、`ALRSharedMath` 与事件

| 类名 | 方法 / 字段签名 | 说明 |
| :--- | :--- | :--- |
| `ALRPostEffects` | • `public static BloomPostEffect getBloomPostEffect()`<br>• `public static GlitchPostEffect getGlitchPostEffect()`<br>• `public static void createPostEffects()`<br>• `public static void runBloomDraws(Matrix4fc mvMat)` | 获取全局泛光与故障后处理实例。 |
| `ALROptimizations` | • `public static OcclusionCuller getOcclusionCuller()`<br>• `public static void create()` | 获取当前激活的全局遮挡剔除器单例（按显卡硬件能力自动选择 `HierarchicalZOcclusionCuller`、`GpuQueryOcclusionCuller` 或 `NoOp`）。 |
| `ALRDebugEntries` | `on(RegisterDebugEntriesEvent event)` | 向 Minecraft 26.1 的 F3 调试屏幕注册 `anvillib_rendering:occlusion_culling` 调试信息行。 |
| `ALRSharedMath` | • `public static final PoseStack.Pose IDENTITY_POSE_3D`<br>• `public static final float SQRT_2 = 1.4142135f` | 共享单位矩阵 `Pose` 与 $\sqrt{2}$ 常量。 |
| `MainTargetResizeEvent` | `public int getNewWidth()` / `public int getNewHeight()` | 实现 `IModBusEvent`。当主渲染目标 `Minecraft#getMainRenderTarget()` 尺寸改变时触发。 |
| `RegisterComputePipelinesEvent` | `public void registerPipeline(ALRComputePipeline pipeline)`<br>`public List<ALRComputePipeline> getPipelines()` | 实现 `IModBusEvent`。在 `ALRComputeShaderManager` 初始化/重载时触发，用于注册自定义 `ALRComputePipeline`。 |
