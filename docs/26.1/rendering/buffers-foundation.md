# 缓冲布局、UBO/SSBO 对象与资源池 (`dev.anvilcraft.lib.v2.rendering.foundation`)

<BranchContextCard branch="26.1" />

在向着色器上传 Uniform Buffer Object (`UBO`) 或 Shader Storage Buffer Object (`SSBO`) 时，最容易出错的环节就是 GLSL 的 **`std140`** 与 **`std430`** 内存对齐规则（例如 `vec3` 必须按 16 字节对齐、`std140` 下数组元素与结构体基对齐强制向上取整到 16 字节）。手动计算字节偏移与填充字节（Padding）极易引发隐蔽的显存错位 Bug。

`dev.anvilcraft.lib.v2.rendering.foundation` 包提供了**声明式 `BufferObject` 布局定义系统**（自动按 `BufferLayout.STD140` 或 `BufferLayout.STD430` 计算字节大小并按对齐边界写入 `ByteBuffer`），同时提供了持久映射 Staging 缓冲、离线批量缓冲收集器、GPU 资源复用池、复合提交节点存储以及基数排序网格排序器。

---

## 一、 声明式 UBO / SSBO 结构体定义 (`BufferObject`)

### 1. 要解决什么问题 / 怎么用

只需继承 `BufferObject<T>`，并使用 `BufferObjectLayoutDefinition.create(...)` 按 GLSL 块中的字段顺序声明 `BufferObjectLayoutEntry`，即可：
- 调用 `DEFINITION.size(BufferLayout.STD140)` 自动算出包含所有对齐填充后的精确字节大小（用于 `device.createBuffer`）；
- 调用 `myUbo.upload(commandEncoder, gpuBuffer.slice())` 在 `MemoryStack` 栈内存上自动按对齐规则序列化并写入 GPU 缓冲区；
- 支持嵌套结构体（`BufferObjectLayoutEntryType.createStruct`）与定长/变长结构体数组（`createStructArray`）。

### 2. 完整代码示例：定义并上传自定义 `std140` UBO 与 `std430` SSBO

```java
package com.example.mymod.client.render.buffer;

import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.systems.CommandEncoder;
import com.mojang.blaze3d.systems.RenderSystem;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.layout.BufferLayout;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObject;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObjectLayoutDefinition;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObjectLayoutEntry;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.ShaderBufferObjectUsage;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * 对应 GLSL:
 * layout(std140) uniform BeamUniforms {
 *     mat4 uViewProj;
 *     vec3 uBeamOrigin;
 *     float uBeamRadius;
 *     int uPulseTick;
 * };
 */
public final class BeamUniformsUbo extends BufferObject<BeamUniformsUbo> {
    public static final BufferObjectLayoutDefinition<BeamUniformsUbo> DEFINITION =
        BufferObjectLayoutDefinition.create(
            BufferObjectLayoutEntry.<BeamUniformsUbo>ofMat4f().forGetter(BeamUniformsUbo::getViewProj).build(),
            BufferObjectLayoutEntry.<BeamUniformsUbo>ofVec3f().forGetter(BeamUniformsUbo::getBeamOrigin).build(),
            BufferObjectLayoutEntry.<BeamUniformsUbo>ofFloat().forGetter(BeamUniformsUbo::getBeamRadius).build(),
            BufferObjectLayoutEntry.<BeamUniformsUbo>ofInt().forGetter(BeamUniformsUbo::getPulseTick).build()
        );

    // 自动按 std140 规则计算总字节大小 (64 + 12 + 4 + 4 -> 向上对齐到 16 的倍数 = 96 字节)
    public static final int BYTE_SIZE = DEFINITION.size(BufferLayout.STD140);

    private final Matrix4f viewProj = new Matrix4f();
    private final Vector3f beamOrigin = new Vector3f();
    private float beamRadius = 1.0f;
    private int pulseTick = 0;

    public BeamUniformsUbo() {
        super(BufferLayout.STD140, ShaderBufferObjectUsage.UBO);
    }

    public Matrix4f getViewProj() {
        return this.viewProj;
    }

    public Vector3f getBeamOrigin() {
        return this.beamOrigin;
    }

    public float getBeamRadius() {
        return this.beamRadius;
    }

    public void setBeamRadius(float beamRadius) {
        this.beamRadius = beamRadius;
    }

    public int getPulseTick() {
        return this.pulseTick;
    }

    public void setPulseTick(int pulseTick) {
        this.pulseTick = pulseTick;
    }

    @Override
    protected BufferObjectLayoutDefinition<BeamUniformsUbo> getDefinition() {
        return DEFINITION;
    }

    public static GpuBuffer createGpuBuffer() {
        return RenderSystem.getDevice().createBuffer(
            () -> "MyMod BeamUniforms UBO",
            GpuBuffer.USAGE_COPY_DST | GpuBuffer.USAGE_UNIFORM,
            BYTE_SIZE
        );
    }

    public void updateAndUpload(CommandEncoder encoder, GpuBuffer targetBuffer) {
        this.upload(encoder, targetBuffer.slice());
    }
}
```

---

## 二、 缓冲布局与对象系统 API 详解 (`foundation.buffers`)

### 1. `BufferLayout`、`BufferSizeCalculator` 与 `BufferWriter`

| 接口 / 常量 | 关键方法签名 | 说明 |
| :--- | :--- | :--- |
| `BufferLayout` | • `BufferLayout.STD140`<br>• `BufferLayout.STD430`<br>• `BufferSizeCalculator createSizeCalculator()`<br>• `BufferWriter createWriter(ByteBuffer buffer)` | 内存对齐策略接口。`STD140` 遵循 OpenGL Uniform Block 规范（结构体与数组元素基对齐至少为 16 字节）；`STD430` 遵循 Shader Storage Block 紧凑对齐规范。 |
| `BufferSizeCalculator` | `putFloat()`、`putVec2()`、`putVec3()`、`putVec4()`、`putVec2Array(int size)`、`putInt()`、`putIVec2()`、`putIVec3()`、`putIVec4()`、`putMat4f()`、`putIVec2Array(int size)`、`putStructArray(definition, int size)`、`int get()` | 模拟字段压入过程并自动插入对齐 Padding，最终通过 `get()` 返回对齐后的总字节数。 |
| `BufferWriter` | `putMat4f(Matrix4f)`、`putIVec4(Vector4i)`、`putIVec3(Vector3i)`、`putIVec2(Vector2i)`、`putInt(int)`、`putVec4(Vector4f)`、`putVec3(Vector3f)`、`putVec2(Vector2f)`、`putVec2Array(int, Vector2f[])`、`putIVec2Array(int, Vector2i[])`、`putFloat(float)`、`putStructArray(...)`、`ByteBuffer intoBuffer(boolean flip)` | 按当前 `BufferLayout` 的对齐偏移将数值写入底层 `ByteBuffer`。 |

### 2. `BufferObject`、`BufferObjectLayoutDefinition` 与 `BufferObjectLayoutEntry`

| 类 / 接口名 | 关键方法签名 | 说明 |
| :--- | :--- | :--- |
| `BufferObject<T>` | • `protected BufferObject(BufferLayout layout, ShaderBufferObjectUsage usage)`<br>• `protected abstract BufferObjectLayoutDefinition<T> getDefinition()`<br>• `public void upload(CommandEncoder commandEncoder, GpuBufferSlice dest)`<br>• `public void write(ByteBuffer buffer)` | UBO / SSBO 抽象基类（实现 `DynamicUniformStorage.DynamicUniform`）。`ShaderBufferObjectUsage` 枚举值为 `UBO` 与 `SSBO`。 |
| `BufferObjectLayoutDefinition<T>` | • `public static <T> BufferObjectLayoutDefinition<T> create(BufferObjectLayoutEntry<?, T>... entries)`<br>• `public int size(BufferLayout layout)`<br>• `public int alignment(BufferLayout layout)`<br>• `public ByteBuffer write(ByteBuffer buffer, T object, BufferLayout layout)`<br>• `public void writeInto(BufferWriter writer, T object)` | 结构体字段序列布局定义。 |
| `BufferObjectLayoutEntry<T, I>` | • 快捷构建器工厂：`ofInt()`、`ofFloat()`、`ofVec2f()`、`ofVec3f()`、`ofVec4f()`、`ofVec2i()`、`ofVec3i()`、`ofVec4i()`、`ofMat4f()`、`builder(BufferObjectLayoutEntryType<T>)`<br>• `Builder#forGetter(Function<I, T>)` / `build()` | 单个字段的布局条目。 |
| `BufferObjectLayoutEntryType<T>` | • 标量/向量/矩阵常量：`FLOAT`、`VEC2`、`VEC3`、`VEC4`、`INT`、`IVEC2`、`IVEC3`、`IVEC4`、`MAT4`<br>• 数组/嵌套结构体工厂：`createVec2Array(int size)`、`createIVec2Array(int size)`、`createStruct(definition)`、`createStructArray(definition, int size)`（返回的 `Array<T>` 支持运行期调用 `size(int newValue)` 动态调整有效数组长度） | 字段类型描述符。 |
| `FullTransformsUbo` / `IntSizeUbo` | • `FullTransformsUbo`：含 `projMat`、`cameraViewMat`、`modelViewMat` 三个 `Matrix4f`<br>• `IntSizeUbo`：含 `height`、`width` 两个 `int` | 内置常用 UBO 实现类。 |

### 3. 缓冲辅助类：`StagingSupport`、`FullyBufferedBufferSource` 等

| 类 / 接口名 | 说明 |
| :--- | :--- |
| `StagingSupport` | 自动根据硬件能力（`ALRHICapabilities#persistentMappedBuffer` 且非 GL-on-DX12 环境）选择 **`GpuStagingSupport`**（映射持久 GPU 缓冲区并走 `copyToBuffer` DMA 拷贝）或 **`CpuStagingSupport`**（Direct `ByteBuffer` + `writeToBuffer`）。 |
| `FullyBufferedBufferSource` & `VertexBufferHost` | 离线多渲染类型顶点缓冲收集器：在后台或预处理阶段收集各 `RenderType` 的顶点，对半透明层执行 `sortQuads`，并通过 `VertexBufferHost` 批量上传至各自的 `GpuBuffer`。 |
| `TransformingVertexConsumerWrapper` | 包装 `VertexConsumer`，在写入顶点坐标与法线时自动左乘给定的 `PoseStack.Pose` 矩阵。 |
| `EmptyBufferSource` / `EmptyOutlineBufferSource` / `EmptyVertexConsumer` | 空操作（No-op）顶点消费者与缓冲源单例，用于丢弃不需要渲染的通道输出。 |

---

## 三、 网格排序、复合节点存储与资源池 (`foundation`)

| 类 / 接口名 | 核心方法签名 | 说明 |
| :--- | :--- | :--- |
| `ALRMeshSorting` | • `public static VertexSorting byDistance(Vector3f point)`<br>• `public static int floatToSortableInt(float f)` | 高性能半透明网格距离排序器：将 IEEE-754 `float` 距离平方通过位运算转换为保持全序关系的 `int` 键；当顶点数 `<= 128` 时使用 `IntArrays.quickSortIndirect`，当顶点数 `> 128` 时自动切换为 $O(N)$ 的基数排序 `IntArrays.radixSortIndirect`！ |
| `CompoundSubmitNodeStorage` | `public CompoundSubmitNodeStorage(SubmitNodeCollector a, SubmitNodeCollector b, @Nullable DirtyTracked tracker)` | 复合提交节点存储：继承自 `SubmitNodeStorage`，向它提交的任何模型、方块、文本或自定义几何体都会**同时双写转发**给 `a` 和 `b` 两个底层 `SubmitNodeCollector`，并在有数据提交时自动触发 `tracker.markDirty()`（广泛用于将发光物体同时提交给正常世界渲染器与 `BloomPostEffect`）。 |
| `BloomSubmitNodeStorage` | `public static BloomSubmitNodeStorage wrap(SubmitNodeCollector delegate)` | 包装 `SubmitNodeCollector`，在提交模型、方块模型和自定义几何体时自动调用 `ALRRenderTypeExtension.copyWithBloom(renderType)` 将渲染类型重定向到泛光帧缓冲。 |
| `SimpleResetPool<T, C>` / `LoopResetPool<T, C>` / `GpuReusableResourcePool<T, C>` | `acquire()`、`acquire(boolean createInstanceIfAllAcquired)`、`releaseAll()`、`destroyAll()` | 面向 `GpuReusableResource`（如硬件遮挡查询对象 `GpuQueryObject`）的自动翻倍扩容（`size * 2`）对象池。 |
