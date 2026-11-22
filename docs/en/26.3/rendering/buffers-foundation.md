# Buffer Layouts, UBO/SSBO Objects & Resource Pools (`dev.anvilcraft.lib.v2.rendering.foundation`)

<BranchContextCard branch="26.3" />

When uploading Uniform Buffer Objects (`UBO`) or Shader Storage Buffer Objects (`SSBO`) to shaders, the most error-prone part is GLSL **`std140`** and **`std430`** memory alignment rules (e.g., `vec3` must be 16-byte aligned, and `std140` rounds array element and struct base alignments up to 16 bytes). Calculating byte offsets and padding manually easily causes subtle GPU memory corruption.

`dev.anvilcraft.lib.v2.rendering.foundation` provides a **declarative `BufferObject` layout system** (automatically computing byte sizes and writing to `ByteBuffer` per `BufferLayout.STD140` or `BufferLayout.STD430`), along with persistent-mapped staging buffers, offline multi-type buffer collectors, GPU resource pools, compound submit-node storage, and radix-sort mesh sorting.

---

## 1. Declarative UBO / SSBO Struct Definitions (`BufferObject`)

### 1. Problem & Usage

Simply extend `BufferObject<T>` and declare `BufferObjectLayoutEntry` fields in GLSL block order with `BufferObjectLayoutDefinition.create(...)` to:
- Automatically compute exact aligned byte size via `DEFINITION.size(BufferLayout.STD140)` (for `device.createBuffer`);
- Serialize and upload to a GPU buffer on `MemoryStack` with `myUbo.upload(commandEncoder, gpuBuffer.slice())`;
- Support nested structs (`BufferObjectLayoutEntryType.createStruct`) and fixed/variable-length struct arrays (`createStructArray`).

### 2. Full Code Example: Defining & Uploading Custom `std140` UBOs & `std430` SSBOs

```java
package com.example.mymod.client.render.buffer;

import com.mojang.renderpearl.api.buffers.GpuBuffer;
import com.mojang.renderpearl.api.commands.CommandEncoder;
import com.mojang.blaze3d.systems.RenderSystem;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.layout.BufferLayout;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObject;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObjectLayoutDefinition;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.BufferObjectLayoutEntry;
import dev.anvilcraft.lib.v2.rendering.foundation.buffers.object.ShaderBufferObjectUsage;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Corresponding GLSL:
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

    // Automatically computes total byte size per std140 (64 + 12 + 4 + 4 -> aligned up to multiple of 16 = 96 bytes)
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

## 2. Buffer Layout & Object System API Reference (`foundation.buffers`)

### 1. `BufferLayout`, `BufferSizeCalculator` & `BufferWriter`

| Interface / Constant | Key Method Signatures | Description |
| :--- | :--- | :--- |
| `BufferLayout` | • `BufferLayout.STD140`<br>• `BufferLayout.STD430`<br>• `BufferSizeCalculator createSizeCalculator()`<br>• `BufferWriter createWriter(ByteBuffer buffer)` | Memory alignment strategy interface. `STD140` follows OpenGL Uniform Block rules (struct/array element base alignment ≥ 16 bytes); `STD430` follows compact Shader Storage Block rules. |
| `BufferSizeCalculator` | `putFloat()`, `putVec2()`, `putVec3()`, `putVec4()`, `putVec2Array(int size)`, `putInt()`, `putIVec2()`, `putIVec3()`, `putIVec4()`, `putMat4f()`, `putIVec2Array(int size)`, `putStructArray(definition, int size)`, `int get()` | Simulates field pushes while inserting alignment padding, returning total aligned bytes via `get()`. |
| `BufferWriter` | `putMat4f(Matrix4f)`, `putIVec4(Vector4i)`, `putIVec3(Vector3i)`, `putIVec2(Vector2i)`, `putInt(int)`, `putVec4(Vector4f)`, `putVec3(Vector3f)`, `putVec2(Vector2f)`, `putVec2Array(int, Vector2f[])`, `putIVec2Array(int, Vector2i[])`, `putFloat(float)`, `putStructArray(...)`, `ByteBuffer intoBuffer(boolean flip)` | Writes values into the underlying `ByteBuffer` at offsets dictated by the active `BufferLayout`. |

### 2. `BufferObject`, `BufferObjectLayoutDefinition` & `BufferObjectLayoutEntry`

| Class / Interface | Key Method Signatures | Description |
| :--- | :--- | :--- |
| `BufferObject<T>` | • `protected BufferObject(BufferLayout layout, ShaderBufferObjectUsage usage)`<br>• `protected abstract BufferObjectLayoutDefinition<T> getDefinition()`<br>• `public void upload(CommandEncoder commandEncoder, GpuBufferSlice dest)`<br>• `public void write(ByteBuffer buffer)` | Abstract base class for UBO / SSBO (implements `DynamicUniformStorage.DynamicUniform`). `ShaderBufferObjectUsage` has `UBO` and `SSBO`. |
| `DynamicUniformStorage<T>` | • `public DynamicUniformStorage(String label, int size, int initialCapacity)`<br>• `public GpuBufferSlice writeUniform(T value)`<br>• `public GpuBufferSlice[] writeUniforms(T... values)`<br>• `public void endFrame()` | Per-frame dynamic Uniform uploader backed by RenderPearl fence-managed transient allocator (`commandEncoder.transientMemory().uploadGpu(...)`); `DynamicUniform` is a `@FunctionalInterface` (`void write(ByteBuffer data)`). |
| `BufferObjectLayoutDefinition<T>` | • `public static <T> BufferObjectLayoutDefinition<T> create(BufferObjectLayoutEntry<?, T>... entries)`<br>• `public int size(BufferLayout layout)`<br>• `public int alignment(BufferLayout layout)`<br>• `public ByteBuffer write(ByteBuffer buffer, T object, BufferLayout layout)`<br>• `public void writeInto(BufferWriter writer, T object)` | Struct field sequence layout definition. |
| `BufferObjectLayoutEntry<T, I>` | • Shortcut factories: `ofInt()`, `ofFloat()`, `ofVec2f()`, `ofVec3f()`, `ofVec4f()`, `ofVec2i()`, `ofVec3i()`, `ofVec4i()`, `ofMat4f()`, `builder(BufferObjectLayoutEntryType<T>)`<br>• `Builder#forGetter(Function<I, T>)` / `build()` | Layout entry for a single field. |
| `BufferObjectLayoutEntryType<T>` | • Scalar/vector/matrix constants: `FLOAT`, `VEC2`, `VEC3`, `VEC4`, `INT`, `IVEC2`, `IVEC3`, `IVEC4`, `MAT4`<br>• Array/nested struct factories: `createVec2Array(int size)`, `createIVec2Array(int size)`, `createStruct(definition)`, `createStructArray(definition, int size)` (returned `Array<T>` supports `size(int newValue)` to adjust active array length at runtime) | Field type descriptor. |
| `FullTransformsUbo` / `IntSizeUbo` | • `FullTransformsUbo`: `projMat`, `cameraViewMat`, `modelViewMat` (`Matrix4f`)<br>• `IntSizeUbo`: `height`, `width` (`int`) | Built-in common UBO implementations. |

### 3. Buffer Helpers: `StagingSupport`, `FullyBufferedBufferSource`, etc.

| Class / Interface | Description |
| :--- | :--- |
| `StagingSupport` | Checks `device.getDeviceInfo().hintsAndWorkarounds().writeToBufferIsSlow()` first (falls back to CPU path if `true`), otherwise selects **`GpuStagingSupport`** (persistent-mapped GPU buffer + `copyToBuffer` DMA) or **`CpuStagingSupport`** (Direct `ByteBuffer` + `writeToBuffer`) based on `ALRHICapabilities#persistentMappedBuffer`. |
| `FullyBufferedBufferSource` & `VertexBufferHost` | Offline multi-RenderType vertex buffer collector: collects vertices per `RenderType` in background/preprocess stages, runs `sortQuads` on translucent layers, and batch-uploads to `GpuBuffer`s via `VertexBufferHost`. |
| `TransformingVertexConsumerWrapper` | Wraps a `VertexConsumer`, automatically left-multiplying vertex positions and normals by a `PoseStack.Pose`. |
| `EmptyBufferSource` / `EmptyOutlineBufferSource` / `EmptyVertexConsumer` | No-op vertex consumer and buffer source singletons for discarding unwanted render pass output. |
| `GpuBufferConstants` | Exposes OpenGL shader storage and atomic counter usage flags: `USAGE_SHADER_STORAGE = 1024`, `USAGE_ATOMIC_COUNTER = 2048` (extending vanilla `GpuBuffer` usage flags). |
| `FeatureGeometry` / `FeatureGeometryCapture` / `FeatureRendering` / `ForwardingSubmitNodeCollection` | **Feature geometry & submission bridge suite**: `FeatureGeometry#submitQuad` snapshots baked quads with `QuadInstance`; `FeatureGeometryCapture` provides `ThreadLocal`-scoped capture; `FeatureRendering#dispatcher` / `#clear` / `#draw` manages `FeatureRenderDispatcher` frame submission; `ForwardingSubmitNodeCollection` provides a full-forwarding base class for `CompoundSubmitNodeCollection` and `OcclusionSubmitNodeCollection`. |

---

## 3. Mesh Sorting, Compound Node Storage & Resource Pools (`foundation`)

| Class / Interface | Core Method Signatures | Description |
| :--- | :--- | :--- |
| `ALRMeshSorting` | • `public static VertexSorting byDistance(Vector3f point)`<br>• `public static int floatToSortableInt(float f)` | High-performance translucent mesh distance sorter: bit-converts IEEE-754 `float` squared distance into an order-preserving `int` key; uses `IntArrays.quickSortIndirect` for `<= 128` vertices and automatically switches to $O(N)$ `IntArrays.radixSortIndirect` for `> 128` vertices! |
| `CompoundSubmitNodeStorage` | `public CompoundSubmitNodeStorage(SubmitNodeCollector a, SubmitNodeCollector b, @Nullable DirtyTracked tracker)` | Compound submit node storage: extends `SubmitNodeStorage`, **dual-writes** every submitted model, block, text, or custom geometry to both `a` and `b` `SubmitNodeCollector`s, and calls `tracker.markDirty()` when data is submitted (widely used to submit emissive objects to both the normal world renderer and `BloomPostEffect`). |
| `BloomSubmitNodeStorage` | `public static BloomSubmitNodeStorage wrap(SubmitNodeCollector delegate)` | Wraps `SubmitNodeCollector`, automatically calling `ALRRenderTypeExtension.copyWithBloom(renderType)` on models, block models, and custom geometry to redirect them to the bloom framebuffer. |
| `SimpleResetPool<T, C>` / `LoopResetPool<T, C>` / `GpuReusableResourcePool<T, C>` | `acquire()`, `acquire(boolean createInstanceIfAllAcquired)`, `releaseAll()`, `destroyAll()` | Auto-doubling (`size * 2`) object pools for `GpuReusableResource`s (such as hardware occlusion query objects `GpuQueryObject`). |
