# Gaussian Blur & UBO Buffer Layouts (Blur & Buffers)

Under `1.21.11`'s `RenderPipeline` architecture, all Uniform buffers are passed at a low level via Blaze3D `GpuBuffer`, `GpuBufferSlice`, and `CommandEncoder`. Manually computing GLSL `std140` / `std430` alignment offsets is error-prone (e.g., `vec3` aligns to 16 bytes, and `std140` arrays align elements to 16 bytes).

`module.rendering` provides a declarative struct buffer layout system (`BufferObject` / `BufferObjectLayoutDefinition` / `BufferLayout`) under `foundation.buffers`, and builds `GaussianBlur` (frosted-glass/post-processing blur pipeline) and common UBOs directly on top of it in `blur` and `bloom`.

---

## Gaussian Blur (`GaussianBlur`, `BlurParametersUbo` & `TransformsUbo`)

### Design & Mechanics

`GaussianBlur` (package `dev.anvilcraft.lib.v2.rendering.blur`) implements `AutoCloseable`, encapsulating a **4-pass (two alternating horizontal/vertical separable blur rounds)** dual-texture ping-pong offscreen post-processing flow:

1. Automatically recreates a pair of full-res `RGBA8` `GpuTexture`s (`inputTarget` and `tempTarget`) and orthographic `TransformsUbo` matching input dimensions;
2. Round 1 runs horizontal `BlurParametersUbo(sampleStepLength, 1.0f, new Vector2f(1, 0))` and vertical `(0, 1)` passes, using linear sampling with double step length to spread blur rapidly;
3. Round 2 runs horizontal `(1, 0)` and vertical `(0, 1)` again, with the final pass applying `colorMultiplier` and outputting to the returned `GpuTexture`;
4. Reuses `ALRPipelines.BLUR` and built-in fullscreen quad Vertex/Index buffers with zero extra model loading overhead.

### Full Example: Running Gaussian Blur on a UI Background

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
        // GaussianBlur.process() also automatically checks and resizes offscreen textures when dimensions change
        return this.blur.process(mainColor);
    }

    public void onWindowResized(int width, int height) {
        this.blur.resize(width, height);
    }

    @Override
    public void close() {
        // Free the two internal offscreen GpuTextures, GPU vertex buffers, and UBOs when screen closes or mod unloads
        this.blur.close();
    }
}
```

### Blur / Bloom Public API Table

| Class | Member Signatures | Description |
| :--- | :--- | :--- |
| `GaussianBlur` | `public GaussianBlur(float sampleStepLength, float colorMultiplier)` | Constructs a Gaussian blur processor: `sampleStepLength` controls pixel sampling step, `colorMultiplier` controls final brightness multiplier (applied only on the final vertical pass; `1.0f` for the first three); holds `MainTarget`, `TextureTarget`, and `GpuSampler` |
| `GaussianBlur` | `public GpuTexture process(GpuTexture input)` | Runs 4 separable Gaussian blur passes on `input` and returns the resulting `GpuTexture` (auto-resizes targets; skips and returns directly if `input` is null or closed) |
| `GaussianBlur` | `public void resize(int width, int height)` | Manually resizes and rebuilds internal ping-pong offscreen `RenderTarget`s and orthographic `TransformsUbo` |
| `GaussianBlur` | `public void close()` | Closes all internal GPU textures, `GpuSampler`, fullscreen quad buffers, and UBO storage |
| `BlurParametersUbo` | `public static final BufferObjectLayoutDefinition<BlurParametersUbo> DEFINITION` | Contains `direction (VEC2)`, `sampleStepLength (FLOAT)`, `colorMultiplier (FLOAT)` |
| `BlurParametersUbo` | `public BlurParametersUbo(float sampleStepLength, float colorMultiplier, Vector2f direction)` | Constructs a blur parameters UBO instance (`BufferLayout.STD140` / `ShaderBufferObjectUsage.UBO`) |
| `TransformsUbo` | `public static final BufferObjectLayoutDefinition<TransformsUbo> DEFINITION` | Contains a single `projMat (MAT4)` |
| `TransformsUbo` | `public TransformsUbo(Matrix4f projMat)` | Constructs a fullscreen post-processing transform UBO instance (`BufferLayout.STD140` / `ShaderBufferObjectUsage.UBO`) |

---

## Declarative UBO / SSBO Buffer Layout System (`foundation.buffers`)

When writing custom `RenderPipeline`s that upload structured Uniforms (`STD140`) or Shader Storage Buffers (`STD430`), extending `BufferObject<T>` gives you alignment calculation, buffer writing, `DynamicUniformStorage` compatibility, and direct upload in one place.

### Full Example: Defining a Custom UBO & Uploading to GPU

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

### Core Layout & Object Class Reference

#### `BufferObject<T extends BufferObject<T>>`

Implements vanilla `DynamicUniformStorage.DynamicUniform`.

| Member Signature | Description |
| :--- | :--- |
| `protected BufferObject(BufferLayout layout, ShaderBufferObjectUsage usage)` | Specifies layout rules (`STD140` / `STD430`) and usage (`UBO` / `SSBO`) |
| `protected abstract BufferObjectLayoutDefinition<T> getDefinition()` | Returns the static layout definition for this type |
| `public void upload(CommandEncoder commandEncoder, GpuBufferSlice dest)` | Allocates exact bytes on LWJGL `MemoryStack`, serializes, and uploads to the target GPU slice via `commandEncoder.writeToBuffer(dest, buf)` |
| `public void write(@NonNull ByteBuffer buffer)` | Implements `DynamicUniform` for automatic serialization by `DynamicUniformStorage` |
| `public DynamicUniformStorage<T> createDynamicStorage(String label)` | Quickly creates a `DynamicUniformStorage<T>` matching this layout's total byte size (with `USAGE_UNIFORM \| USAGE_COPY_DST`) |

#### `BufferObjectLayoutDefinition<T>`

| Member Signature | Description |
| :--- | :--- |
| `@SafeVarargs public static <T> BufferObjectLayoutDefinition<T> create(BufferObjectLayoutEntry<?, T>... entries)` | Assembles all struct field entries in order |
| `public ByteBuffer write(ByteBuffer buffer, T object, BufferLayout layout)` | Serializes the entire object using the matching `BufferWriter` and returns a flipped readable buffer |
| `public void writeInto(BufferWriter writer, T object)` | Appends into an existing external `BufferWriter` (e.g., nested arrays inside a parent struct) |
| `public int size(BufferLayout layout)` | Computes total byte size per `STD140` or `STD430` including alignment and trailing struct padding |
| `public int alignment(BufferLayout layout)` | Returns the base alignment of the struct (minimum `16` bytes under `STD140`) |

#### `BufferObjectLayoutEntry<T, I>` & `BufferObjectLayoutEntryType<T>`

| Factory Method (`BufferObjectLayoutEntry`) | GLSL Type | Supported Field Type | STD140 Alignment (Bytes) |
| :--- | :--- | :--- | :---: |
| `ofFloat()` | `float` | `Float` | 4 |
| `ofInt()` | `int` | `Integer` | 4 |
| `ofVec2f()` / `ofVec2i()` | `vec2` / `ivec2` | `Vector2f` / `Vector2i` | 8 |
| `ofVec3f()` / `ofVec3i()` | `vec3` / `ivec3` | `Vector3f` / `Vector3i` | 16 |
| `ofVec4f()` / `ofVec4i()` | `vec4` / `ivec4` | `Vector4f` / `Vector4i` | 16 |
| `ofMat4f()` | `mat4` | `Matrix4f` | 16 |
| `builder(BufferObjectLayoutEntryType<T>)` | Custom extension entry type | `T` | Specified by implementation |

> [!TIP]
> Beyond built-in `FLOAT`/`INT`/`VEC2`–`VEC4`/`IVEC2`–`IVEC4`/`MAT4` constants, `BufferObjectLayoutEntryType`'s `acceptSizeCalculator`, `acceptWriter`, and `alignment(BufferLayout)` allow mods to define custom nested struct or array field entries.

#### `BufferLayout`, `BufferSizeCalculator`, `BufferWriter` & Concrete Implementations

| Class / Enum | Public Interfaces & Methods |
| :--- | :--- |
| `BufferLayout` | Enum values: `STD140`, `STD430`; methods: `createSizeCalculator() -> BufferSizeCalculator`, `createWriter(ByteBuffer) -> BufferWriter` |
| `ShaderBufferObjectUsage` | Enum values: `UBO`, `SSBO` |
| `BufferSizeCalculator` | `putFloat()`, `putVec2()`, `putVec3()`, `putVec4()`, `putInt()`, `putIVec2()`, `putIVec3()`, `putIVec4()`, `putMat4f()`, `putStructArray(BufferObjectLayoutDefinition<?>, int size)`, `get() -> int` |
| `BufferWriter` | Matching write methods `putFloat`/`putInt`/`putVec2..4`/`putIVec2..4`/`putMat4f`, `putStructArray(int index, E, definition)`, default overload `putStructArray(E[], definition)`, and `intoBuffer() -> ByteBuffer` |
| `Std140SizeCalculator` / `Std140Writer` | In `foundation.buffers.layout.std140`; strictly implements OpenGL `std140` layout (including 16-byte min alignment for structs/arrays and trailing padding) |
| `Std430SizeCalculator` / `Std430Writer` | In `foundation.buffers.layout.std430`; implements compact `std430` layout for SSBOs and compute shader data packing |

---

## Buffer Helper Utilities (`foundation.buffers`)

| Class / Interface | Public Members | Core Purpose |
| :--- | :--- | :--- |
| `GpuBufferConstants` | `USAGE_SHADER_STORAGE = 512`<br>`USAGE_ATOMIC_COUNTER = 1024` | Adds OpenGL shader storage buffer and atomic counter usage flags missing from vanilla `GpuBuffer` |
| `TransformingVertexConsumerWrapper` | `new TransformingVertexConsumerWrapper(PoseStack.Pose pose, VertexConsumer delegate)` | Applies `pose.pose()` position transform and `pose` normal transform on the fly when submitting vertices |
| `VertexBufferHost` | `getVertexBuffer(RenderType, long size)`<br>`getSortingByteBufferBuilder(RenderType)`<br>`acceptUploadAction(Runnable)` | Host abstraction for vertex buffer pools, unifying persistent GPU buffer reuse per `RenderType` and async upload collection |
| `EmptyVertexConsumer` | `EmptyVertexConsumer.INSTANCE` | Zero-allocation no-op `VertexConsumer` discarding all vertices/colors/UVs/normals for filtering passes |
| `EmptyBufferSource` | `EmptyBufferSource.INSTANCE` | Extends `MultiBufferSource.BufferSource`; returns `EmptyVertexConsumer.INSTANCE` for any `RenderType` with no-op `endBatch()` |
| `EmptyOutlineBufferSource` | `EmptyOutlineBufferSource.INSTANCE` | Extends `OutlineBufferSource` as a no-op outline buffer source to skip outline capture |
