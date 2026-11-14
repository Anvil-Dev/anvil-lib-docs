# 高斯模糊与 UBO 缓冲布局 (Blur & Buffers)

在 `1.21.8` 的 `RenderPipeline` 架构下，所有 Uniform 缓冲均通过 Blaze3D `GpuBuffer`、`GpuBufferSlice` 与 `CommandEncoder` 进行底层传递。手工计算 GLSL 的 `std140` / `std430` 对齐偏移极易出错（例如 `vec3` 对齐 16 字节、`std140` 数组按 16 字节对齐等）。

`module.rendering` 在 `foundation.buffers` 包下提供了一套声明式结构缓冲描述系统 (`BufferObject` / `BufferObjectLayoutDefinition` / `BufferLayout`)，并在 `blur` 与 `bloom` 包中直接基于它实现了 `GaussianBlur`（毛玻璃/后处理模糊管线）及常用 UBO 结构。

---

## 高斯模糊 (`GaussianBlur` & `BlurParametersUbo` & `TransformsUbo`)

### 设计与原理

`GaussianBlur`（包 `dev.anvilcraft.lib.v2.rendering.blur`）实现 `AutoCloseable`，它封装了一个 **4-Pass（两轮横纵交替分离模糊）** 的双纹理 ping-pong 离屏后处理流程：

1. 自动随输入分辨率重建一对全尺寸 `RGBA8` `GpuTexture`（`inputTarget` 与 `tempTarget`）及正交矩阵 `TransformsUbo`；
2. 第一轮依次执行水平方向 `BlurParametersUbo(sampleStepLength, 1.0f, new Vector2f(1, 0))` 与垂直方向 `(0, 1)`，借助线性采样双倍步长快速扩散模糊；
3. 第二轮再次执行水平 `(1, 0)` 与垂直 `(0, 1)` 采样，最终Pass 将颜色乘数 `colorMultiplier` 应用并输出到返回的 `GpuTexture`；
4. 整个过程复用 `ALRPipelines.BLUR` 管线与内置全屏矩形 Vertex/Index 缓冲，零额外模型加载开销。

### 完整示例：对 UI 背景执行高斯模糊

```java
package com.example.mymod.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTexture;
import dev.anvilcraft.lib.v2.rendering.blur.GaussianBlur;
import net.minecraft.client.Minecraft;

public final class FrostedPanelBlur implements AutoCloseable {
    private final GaussianBlur blur = new GaussianBlur(2.0f, 0.92f);

    public GpuTexture blurMainColorTarget() {
        Minecraft mc = Minecraft.getInstance();
        GpuTexture mainColor = mc.getMainRenderTarget().getColorTexture();
        if (mainColor == null) {
            throw new IllegalStateException("Main render target color texture is null");
        }
        // 尺寸变化时 GaussianBlur.process() 内部也会自动检查并调整离屏纹理大小
        return this.blur.process(mainColor);
    }

    public void onWindowResized(int width, int height) {
        this.blur.resize(width, height);
    }

    @Override
    public void close() {
        // 界面关闭或模组卸载时释放两张内部离屏 GpuTexture、GPU 顶点缓冲与 UBO
        this.blur.close();
    }
}
```

### Blur / Bloom 公开 API 表

| 类名 | 成员签名 | 说明 |
| :--- | :--- | :--- |
| `GaussianBlur` | `public GaussianBlur(float sampleStepLength, float colorMultiplier)` | 构造高斯模糊器：`sampleStepLength` 控制采样偏移像素步长，`colorMultiplier` 控制最终亮度乘数（仅在最后一轮垂直 Pass 生效，前三次为 `1.0f`） |
| `GaussianBlur` | `public GpuTexture process(GpuTexture input)` | 对输入纹理执行 4 轮分离高斯模糊并返回结果 `GpuTexture`（内部自动检测尺寸并重建目标纹理；当 `input` 为空或已被关闭时跳过并直接返回） |
| `GaussianBlur` | `public void resize(int width, int height)` | 手动调整并重建内部双缓冲离屏 `GpuTexture` 及正交 `TransformsUbo` |
| `GaussianBlur` | `public void close()` | 关闭所有内部 GPU 纹理、纹理视图、全屏四边形缓冲与 UBO 存储 |
| `BlurParametersUbo` | `public static final BufferObjectLayoutDefinition<BlurParametersUbo> DEFINITION` | 包含 `direction (VEC2)`、`sampleStepLength (FLOAT)`、`colorMultiplier (FLOAT)` |
| `BlurParametersUbo` | `public BlurParametersUbo(float sampleStepLength, float colorMultiplier, Vector2f direction)` | 构造模糊参数 UBO 实例（`BufferLayout.STD140` / `ShaderBufferObjectUsage.UBO`） |
| `TransformsUbo` | `public static final BufferObjectLayoutDefinition<TransformsUbo> DEFINITION` | 包含单个 `projMat (MAT4)` |
| `TransformsUbo` | `public TransformsUbo(Matrix4f projMat)` | 构造后处理全屏变换 UBO 实例（`BufferLayout.STD140` / `ShaderBufferObjectUsage.UBO`） |

---

## 声明式 UBO / SSBO 缓冲布局体系 (`foundation.buffers`)

当编写自定义 `RenderPipeline` 并需要上传结构化 Uniform（`STD140`）或 Shader Storage Buffer（`STD430`）时，可通过继承 `BufferObject<T>` 一次性获得对齐计算、内存写入、原生 `DynamicUniformStorage` 兼容与直传上传能力。

### 完整示例：定义自定义 UBO 并上传至 GPU

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.foundation.buffers.layout.BufferLayout;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObject;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObjectLayoutDefinition;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObjectLayoutEntry;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.ShaderBufferObjectUsage;
import net.minecraft.client.renderer.DynamicUniformStorage;
import org.joml.Vector2f;
import org.joml.Vector4f;

public final class GlowFrameUbo extends BufferObject<GlowFrameUbo> {
    public static final BufferObjectLayoutDefinition<GlowFrameUbo> DEFINITION =
        BufferObjectLayoutDefinition.create(
            BufferObjectLayoutEntry.<GlowFrameUbo>ofVec4f().forGetter(u -> u.tintColor).build(),
            BufferObjectLayoutEntry.<GlowFrameUbo>ofVec2f().forGetter(u -> u.resolution).build(),
            BufferObjectLayoutEntry.<GlowFrameUbo>ofFloat().forGetter(u -> u.intensity).build(),
            BufferObjectLayoutEntry.<GlowFrameUbo>ofInt().forGetter(u -> u.mode).build()
        );

    private final Vector4f tintColor;
    private final Vector2f resolution;
    private final float intensity;
    private final int mode;

    public GlowFrameUbo(Vector4f tintColor, Vector2f resolution, float intensity, int mode) {
        super(BufferLayout.STD140, ShaderBufferObjectUsage.UBO);
        this.tintColor = tintColor;
        this.resolution = resolution;
        this.intensity = intensity;
        this.mode = mode;
    }

    @Override
    protected BufferObjectLayoutDefinition<GlowFrameUbo> getDefinition() {
        return DEFINITION;
    }

    public static DynamicUniformStorage<GlowFrameUbo> createStorage() {
        return new GlowFrameUbo(new Vector4f(), new Vector2f(), 1.0f, 0)
            .createDynamicStorage("mymod_glow_frame");
    }
}
```

### 核心布局与对象类参考

#### `BufferObject<T extends BufferObject<T>>`

实现原版 `DynamicUniformStorage.DynamicUniform`。

| 成员签名 | 说明 |
| :--- | :--- |
| `protected BufferObject(BufferLayout layout, ShaderBufferObjectUsage usage)` | 指定布局规则（`STD140` / `STD430`）与用途（`UBO` / `SSBO`） |
| `protected abstract BufferObjectLayoutDefinition<T> getDefinition()` | 返回该类型的静态布局定义 |
| `public void upload(CommandEncoder commandEncoder, GpuBufferSlice dest)` | 通过 LWJGL `MemoryStack` 临时分配精确字节数，写入后直接调用 `commandEncoder.writeToBuffer(dest, buf)` 上传至目标 GPU 切片 |
| `public void write(@NonNull ByteBuffer buffer)` | 实现 `DynamicUniform`，供原生 `DynamicUniformStorage` 自动序列化写入 |
| `public DynamicUniformStorage<T> createDynamicStorage(String label)` | 快速创建匹配当前布局总字节大小的 `DynamicUniformStorage<T>`（带 `USAGE_UNIFORM \| USAGE_COPY_DST`） |

#### `BufferObjectLayoutDefinition<T>`

| 成员签名 | 说明 |
| :--- | :--- |
| `@SafeVarargs public static <T> BufferObjectLayoutDefinition<T> create(BufferObjectLayoutEntry<?, T>... entries)` | 顺序组装所有结构体字段条目 |
| `public ByteBuffer write(ByteBuffer buffer, T object, BufferLayout layout)` | 使用对应布局的 `BufferWriter` 序列化整个对象并返回可读（flipped）缓冲 |
| `public void writeInto(BufferWriter writer, T object)` | 向已存在的外部 `BufferWriter`（如父结构嵌套数组）追加写入 |
| `public int size(BufferLayout layout)` | 按 `STD140` 或 `STD430` 计算严格对齐并填充尾部结构体对齐后的总字节大小 |
| `public int alignment(BufferLayout layout)` | 返回该结构体的基对齐（`STD140` 下最小为 `16` 字节） |

#### `BufferObjectLayoutEntry<T, I>` 与 `BufferObjectLayoutEntryType<T>`

| 工厂方法 (`BufferObjectLayoutEntry`) | 对应 GLSL 类型 | 支持字段类型 | STD140 对齐（字节） |
| :--- | :--- | :--- | :---: |
| `ofFloat()` | `float` | `Float` | 4 |
| `ofInt()` | `int` | `Integer` | 4 |
| `ofVec2f()` / `ofVec2i()` | `vec2` / `ivec2` | `Vector2f` / `Vector2i` | 8 |
| `ofVec3f()` / `ofVec3i()` | `vec3` / `ivec3` | `Vector3f` / `Vector3i` | 16 |
| `ofVec4f()` / `ofVec4i()` | `vec4` / `ivec4` | `Vector4f` / `Vector4i` | 16 |
| `ofMat4f()` | `mat4` | `Matrix4f` | 16 |
| `builder(BufferObjectLayoutEntryType<T>)` | 自定义扩展条目类型 | `T` | 由实现类指定 |

> [!TIP]
> `BufferObjectLayoutEntryType` 除提供上述 `FLOAT`/`INT`/`VEC2`~`VEC4`/`IVEC2`~`IVEC4`/`MAT4` 内置常量外，其 `acceptSizeCalculator`、`acceptWriter`、`alignment(BufferLayout)` 均允许模组自定义嵌套结构或数组字段条目。

#### `BufferLayout`、`BufferSizeCalculator`、`BufferWriter` 与具体实现类

| 类 / 枚举 | 公开接口与方法 |
| :--- | :--- |
| `BufferLayout` | 枚举值：`STD140`、`STD430`；方法：`createSizeCalculator() -> BufferSizeCalculator`、`createWriter(ByteBuffer) -> BufferWriter` |
| `ShaderBufferObjectUsage` | 枚举值：`UBO`、`SSBO` |
| `BufferSizeCalculator` | `putFloat()`、`putVec2()`、`putVec3()`、`putVec4()`、`putInt()`、`putIVec2()`、`putIVec3()`、`putIVec4()`、`putMat4f()`、`putStructArray(BufferObjectLayoutDefinition<?>, int size)`、`get() -> int` |
| `BufferWriter` | 对应类型写入方法 `putFloat`/`putInt`/`putVec2..4`/`putIVec2..4`/`putMat4f`、`putStructArray(int index, E, definition)`、默认重载 `putStructArray(E[], definition)` 及 `intoBuffer() -> ByteBuffer` |
| `Std140SizeCalculator` / `Std140Writer` | 位于 `foundation.buffers.layout.std140`，严格实现 OpenGL `std140` 布局（包含 `std140` 下结构体/数组最小 16 字节对齐规则与末位填充） |
| `Std430SizeCalculator` / `Std430Writer` | 位于 `foundation.buffers.layout.std430`，实现更紧凑的 `std430` 布局，适合 SSBO 与计算着色器数据打包 |

---

## 缓冲辅助工具集 (`foundation.buffers`)

| 类 / 接口名 | 公开成员 | 核心用途 |
| :--- | :--- | :--- |
| `GpuBufferConstants` | `USAGE_SHADER_STORAGE = 512`<br>`USAGE_ATOMIC_COUNTER = 1024` | 补充原生 `GpuBuffer` 缺失的 OpenGL 着色器存储缓冲与原子计数器用途标志位 |
| `TransformingVertexConsumerWrapper` | `new TransformingVertexConsumerWrapper(PoseStack.Pose pose, VertexConsumer delegate)` | 在提交顶点前实时应用 `pose.pose()` 位置变换和 `pose` 法线变换，避免手动乘矩阵 |
| `VertexBufferHost` | `getVertexBuffer(RenderType, long size)`<br>`getSortingByteBufferBuilder(RenderType)`<br>`acceptUploadAction(Runnable)` | 顶点缓冲池宿主抽象接口，便于按 `RenderType` 统一复用持久 GPU 缓冲并收集异步上传任务 |
| `EmptyVertexConsumer` | `EmptyVertexConsumer.INSTANCE` | 零分配黑洞 `VertexConsumer`，丢弃所有写入的顶点/颜色/UV/法线，用于过滤特定通道 |
| `EmptyBufferSource` | `EmptyBufferSource.INSTANCE` | 继承 `MultiBufferSource.BufferSource`，任意 `RenderType` 均返回 `EmptyVertexConsumer.INSTANCE` 且 `endBatch()` 为空操作 |
| `EmptyOutlineBufferSource` | `EmptyOutlineBufferSource.INSTANCE` | 继承 `OutlineBufferSource` 的空轮廓缓冲源，用于跳过描边轮廓采集 |
