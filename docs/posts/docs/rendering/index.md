---
title: Rendering 渲染
prev: false
next: false
---

# 渲染模块 (Rendering Module)

包 `dev.anvilcraft.lib.v2.rendering` 提供了泛光（Bloom）后处理效果以及一套通用的 UBO（Uniform Buffer Object）布局定义框架，并通过
Mixin 集成到 Minecraft 的 GUI 渲染和主渲染流程中。

---

## 1. 模块概述

- **主类**：`ALRendering` – 模组入口，负责创建管线、注册事件。
- **后处理效果**：`BloomPostEffect` – 实现泛光效果的完整多 Pass 处理链。
- **UBO 框架**：位于 `foundation.ubo` 包，提供类型安全的 ST140 布局定义。
- **着色器**：位于资源目录，包括 `blit.vsh`（顶点）、`blur.fsh`、`apply_bloom.fsh`、`down_sample.fsh`、`up_sample.fsh` 及辅助
  `util.glsl`。
- **Mixin**：`GuiRendererMixin` 和 `MinecraftMixin` 用于在渲染流程中嵌入泛光处理，并支持 GUI 元素的额外 UBO 绑定。
- **测试/调试**：`ALRTest` 提供示例（如渲染带泛光的物品），通过系统属性开启。

---

## 2. UBO 基础框架

UBO 系统用于在代码中声明 GLSL Uniform Block 的内存布局，并自动计算 STD140 大小和填充数据。

### 2.1 UboObject

所有自定义 UBO 的抽象基类。

- **`getDefinition()`**：子类必须实现，返回对应类型的 `UboLayoutDefinition`。
- **`upload(CommandEncoder, GpuBufferSlice)`**：将当前对象数据通过布局写入显存 Buffer 切片。

### 2.2 UboLayoutDefinition

泛型 `T` 布局定义，保存一组 `UboLayoutEntry`。

- **`create(UboLayoutEntry...)`**：静态工厂，接受任意数量的条目。
- **`write(ByteBuffer, T)`**：按布局将对象字段写入 ByteBuffer。
- **`size()`**：返回整个 UBO 在 STD140 下的字节大小。

### 2.3 UboLayoutEntry

记录条目 `(UboLayoutEntryType<T>, Function<I, T>)`，连接字段类型与 getter 方法。

- **静态工厂**：`ofInt()`、`ofFloat()`、`ofVec2f()`、`ofVec3f()`、`ofVec4f()`、`ofMat4f()` 创建对应类型的 Builder。
- **`Builder<T,I>`**：链式调用 `.forGetter(Function<I,T>)` → `.build()` 生成条目。

### 2.4 UboLayoutEntryType

定义具体的 STD140 数据类型（FLOAT, VEC2, VEC3, VEC4, INT, MAT4），内部实现 `acceptSizeCalculator` 和 `acceptWriter`
，分别用于大小计算和写入。

---

## 3. 泛光后处理实现

### 3.1 BloomPostEffect

核心类，管理泛光输入、下采样、上采样、模糊及混合的全过程。

#### 初始化

- 构造函数可自定义泛光参数（强度、阈值、灵敏度等），内部创建 `BloomParametersUbo`、`BlurParametersUbo`、
  `BloomPipelineParametersUbo` 和对应的 GPU Buffer。
- 根据窗口大小初始化 `downsampleTargets[]` 和 `upsampleTargets[]` 目标纹理。

#### 主要方法

- **`beginFrame()`**：每帧开始时清理临时纹理和脏标记。
- **`drawBloomed(BloomRenderCallback)`**：注册需要在泛光输入纹理上额外绘制的物体。
- **`process(modelViewMatrix, featureRenderDispatcher)`**：
    1. 执行所有 `BloomRenderCallback`（`runBloomDraws`），将其渲染到 `bloomInputTarget`。
    2. 下采样（`doDownSample`）—— 逐步缩小泛光纹理。
    3. 上采样（`doUpSample`）—— 逐步放大并与上层混合。
    4. 将最终泛光结果混合回主渲染目标（`applyBloom`）。
- **`resize(width, height)`**：窗口大小变化时重新调整所有目标纹理和全屏四边形顶点缓冲。

#### 内部 Pass

- **DownSample**：每次将纹理缩小一半，使用 `DOWNSAMPLE` 管线。
- **UpSample**：采用高斯模糊（5×5 核），结合当前层和前一层纹理，使用 `UPSAMPLE` 管线。
- **ApplyBloom**：将泛光纹理与游戏主渲染纹理混合，公式 `color + bloom * pow(threshold, luminance * sensitivity)`，使用
  `APPLY_BLOOM` 管线。

#### 回调接口

**`BloomRenderCallback`**：函数式接口，`void render(SubmitNodeCollector, PoseStack)`，用于向泛光输入提交模型。

### 3.2 UBO 实现

- **`BloomParametersUbo`**：`bloomIntensity` / `bloomBlendThreshold` / `luminanceSensitivity`
- **`BlurParametersUbo`**：`direction` / `sampleStepLength` / `colorMultiplier`
- **`BloomPipelineParametersUbo`**：`resolution` / `frameIndex`
- **`TransformsUbo`**：`projMat`（正交投影矩阵）

所有 UBO 继承自 `UboObject`，通过 `DEFINITION` 静态常量声明布局。

---

## 4. 着色器与管线

### 4.1 着色器

| 文件                | 类型 | 作用                                               |
|-------------------|----|--------------------------------------------------|
| `blit.vsh`        | 顶点 | 简单的全屏四边形变换，输出 UV                                 |
| `blur.fsh`        | 片段 | 7 权重的高斯模糊（结合方向 `BlurDir` 与步长 `SampleStepLength`） |
| `apply_bloom.fsh` | 片段 | 将泛光纹理按强度混合到游戏画面                                  |
| `down_sample.fsh` | 片段 | 4 像素取平均进行下采样                                     |
| `up_sample.fsh`   | 片段 | 5×5 高斯核上采样，与前一帧混合                                |
| `util.glsl`       | 工具 | `saturate()`、`toneMap()` 辅助函数                    |

### 4.2 管线注册

`ALRPipelines` 类使用 `@EventBusSubscriber` 自动注册。定义了 4 个管线（基于 `POST_PASS` 片段）：

- `BLUR` – 模糊
- `APPLY_BLOOM` – 最终混合
- `DOWNSAMPLE` – 下采样
- `UPSAMPLE` – 上采样

基础片段 `POST_PASS` 使用 `blit.vsh`，绑定 `Transforms` UBO 和 `DiffuseSampler`，禁用面剔除。

---

## 5. 集成到 Minecraft 渲染

### 5.1 事件与入口

`ALRendering`（通过 `@Mod` 和 `@EventBusSubscriber`）：

- 在 `RenderFrameEvent.Pre` 调用 `bloomPostEffect.beginFrame()`。
- 在 `RenderLevelStageEvent.AfterLevel` 调用 `bloomPostEffect.process(…)`，并创建 `FeatureRenderDispatcher`
  以支持在泛光输入中提交模型。
- 在 `RegisterPipelineModifiersEvent` 注册 `REDIRECT_TO_BLOOM` 修饰符。

### 5.2 Mixin

- **`MinecraftMixin`**：
    - 构造结束时调用 `ALRendering.createPipelines()` 初始化泛光实例。
    - 窗口大小改变时恢复泛光纹理大小。
- **`GuiRendererMixin`**：
    - 追踪每个 GUI 绘制元素对应的 `GuiElementRenderState`。
    - 当元素实现 `LibGuiElementRenderState` 时，在绘制前将其 `bufferSlices()` 返回的 UBO 切片绑定到 RenderPass。

### 5.3 状态接口

- **`LibGuiElementRenderState`**：扩展 `GuiElementRenderState`，提供 `Map<String, GpuBufferSlice> bufferSlices()`，允许 GUI
  元素注入自定义 Uniform。
- **`LibQuadGuiElementRenderState`**：进一步为四边形元素提供便捷的视口计算 (`getBounds`) 和顶点构建方法 (
  `buildVertices`)。

---

## 6. 测试与调试

`ALRTest` 提供了简单示例：

- `renderCarrotBloomed()`：渲染一个发光的胡萝卜，先绘制物品，再将其注册为 `BloomRenderCallback` 以产生泛光。
- **开启调试**：添加 JVM 属性 `-Danvillib.rendering.debugMode` 即可启用测试渲染（需在屏幕或世界中调用）。

---

## 7. 使用指南摘要

1. **获取泛光实例**：`ALRendering.getBloomPostEffect()`。
2. **添加泛光物体**：
   ```java
   bloomPostEffect.drawBloomed((nodeCollector, poseStack) -> {
       // 提交渲染到 nodeCollector
   });
   ```
3. **标记脏状态**：每帧在 `beginFrame()` 后默认非脏，调用 `drawBloomed` 会自动标记脏，也可手动 `markDirty()`。
4. **自定义 UBO**：继承 `UboObject<T>`，使用 `UboLayoutDefinition.create(...)` 定义字段布局，配合 `upload` 上传。
5. **GUI 元素注入 UBO**：实现 `LibGuiElementRenderState`，在 `bufferSlices()` 中返回需要绑定的缓冲切片。

---

## 注意事项

- 泛光效果依赖大量 RenderTarget 创建，请确保在客户端环境使用（模组限定 `dist = Dist.CLIENT`）。
- 所有 GPU 资源（Buffer, Sampler, Texture）由 `GpuDevice` 创建，生命周期跟随 `BloomPostEffect` 实例，通常在模组生命周期内保持。
- 目前泛光参数硬编码在 `BloomPostEffect` 中（如采样步长、混合阈值等），后续可通过配置屏幕调整。
- Mixin 修改了 `GuiRenderer` 内部行为，与其它渲染修改模组可能产生兼容性冲突，需注意。
