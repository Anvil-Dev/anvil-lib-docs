# Occlusion Culling System: Hi-Z & GPU Query (`dev.anvilcraft.lib.v2.rendering.optimization.occlusion`)

<BranchContextCard branch="26.1" />

For complex block entities or custom world effects that change every frame (and thus cannot use static `CachedBER` baking), submitting vertices and shading them when completely hidden behind walls, terrain, or machine casings wastes significant GPU overdraw and CPU submission time.

`dev.anvilcraft.lib.v2.rendering.optimization.occlusion` provides a **hardware-adaptive, one-frame-latency occlusion culling framework (`OcclusionCuller`)** supporting two hardware-accelerated backends selected automatically at startup:
1. **`HierarchicalZOcclusionCuller` (Hi-Z Pyramid, Preferred)**:
   Enabled when the GPU supports Compute Shaders. Uses `DepthTexConverter` to convert the main framebuffer depth to `R32F` Mip 0, generates up to 12 levels of a Max-Z Pyramid in a single dispatch via the **AMD FidelityFX SPD (Single Pass Downsampler)** compute shader (with `ARB_bindless_texture` acceleration), and then runs `hiz_occlusion_test` to project all `AABB`s to screen space and sample the appropriate Hi-Z mip level to determine visibility in one batch.
2. **`GpuQueryOcclusionCuller` (Hardware Conservative Occlusion Query, Fallback)**:
   Enabled automatically when the GPU does not support Hi-Z Compute. After opaque terrain draws, draws each `OcclusionKey`'s bounding box with `ALRPipelines.OCCLUSION_QUERY` (color and depth writes disabled) and checks `GL_ANY_SAMPLES_PASSED_CONSERVATIVE` hardware queries (immediately marking visible if the camera is inside the box).
3. **`NoOpOcclusionCuller` (Fallback No-Op)**: `shouldDraw` always returns `true`.

---

## 1. Core Usage: Integrating Occlusion Culling for Block Entities or Custom Rendering

Integrating occlusion culling takes just two steps:
1. **Persist one `OcclusionKey` instance per logical render target**:
   **Crucial**: `OcclusionKey`'s `equals` and `hashCode` are based on **object reference identity (`this == obj` / `System.identityHashCode`)**, not bounding box coordinates! Therefore **never `new OcclusionKey(...)` every frame**—store the `OcclusionKey` on the `BlockEntity` or persistent state object and call `occlusionKey.setBoundingBox(newAabb)` in place when bounds change.
2. **Wrap submission with `culler.wrapSubmitNodeStorage(collector)`**:
   Between `storage.beginOcclusionRecord(key)` and `storage.endOcclusionRecord()`, submit models, block models, items, text, or custom geometry to `storage`. If the previous frame's occlusion test determined `key` was fully occluded, `FeatureRenderer`s hooked by Mixin automatically skip occluded items via `OcclusionFeatureRendererHelper.filterVisibleFeatures` before drawing! You can also call `culler.shouldDraw(...)` during extraction to skip expensive animation math early.

---

## 2. Full Code Example: Integrating `OcclusionCuller` in a BlockEntityRenderer

```java
package com.example.mymod.client.renderer;

import com.example.mymod.block.entity.KineticTurbineBlockEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.ALROptimizations;
import dev.anvilcraft.lib.v2.rendering.optimization.occlusion.OcclusionCuller;
import dev.anvilcraft.lib.v2.rendering.optimization.occlusion.OcclusionKey;
import dev.anvilcraft.lib.v2.rendering.optimization.occlusion.OcclusionSubmitNodeStorage;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

public class KineticTurbineRenderer implements BlockEntityRenderer<KineticTurbineBlockEntity, KineticTurbineRenderer.TurbineRenderState> {

    public static class TurbineRenderState extends BlockEntityRenderState {
        // Reference the same persistent OcclusionKey instance held by the BlockEntity
        public OcclusionKey occlusionKey;
        public float bladeAngle;
    }

    public KineticTurbineRenderer(BlockEntityRendererProvider.Context context) {
    }

    @Override
    public TurbineRenderState createRenderState() {
        return new TurbineRenderState();
    }

    @Override
    public void extractRenderState(
        KineticTurbineBlockEntity be,
        TurbineRenderState state,
        float partialTick,
        Vec3 cameraPos,
        ModelFeatureRenderer.@Nullable CrumblingOverlay breakProgress
    ) {
        BlockEntityRenderer.super.extractRenderState(be, state, partialTick, cameraPos, breakProgress);
        // Reuse the persistent OcclusionKey on the BlockEntity (never new OcclusionKey every frame!)
        OcclusionKey key = be.getOrCreateOcclusionKey();
        key.setBoundingBox(new AABB(be.getBlockPos()).inflate(1.0));
        state.occlusionKey = key;
        state.bladeAngle = be.getInterpolatedAngle(partialTick);
    }

    @Override
    public void submit(
        TurbineRenderState state,
        PoseStack poseStack,
        SubmitNodeCollector collector,
        CameraRenderState camera
    ) {
        OcclusionCuller culler = ALROptimizations.getOcclusionCuller();
        // 1. Wrap SubmitNodeCollector
        OcclusionSubmitNodeStorage storage = culler.wrapSubmitNodeStorage(collector);

        // 2. Begin occlusion recording for this OcclusionKey
        storage.beginOcclusionRecord(state.occlusionKey);
        try {
            // All models, parts, text, or custom geometry submitted to storage here are controlled by this occlusionKey
            submitTurbineBlades(state, poseStack, storage);
        } finally {
            // 3. End recording and associate collected render items with occlusionKey
            storage.endOcclusionRecord();
        }
    }

    private void submitTurbineBlades(
        TurbineRenderState state,
        PoseStack poseStack,
        SubmitNodeCollector storage
    ) {
        // Submit models or custom geometry...
    }
}
```

---

## 3. Public Classes & Interfaces API Reference

### 1. `OcclusionKey` (Cross-Frame Stable Occlusion Test Handle)

Located in `dev.anvilcraft.lib.v2.rendering.optimization.occlusion.OcclusionKey`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public OcclusionKey(AABB boundingBox)`<br>`public OcclusionKey(Supplier<String> name, AABB boundingBox)` | — | Creates an occlusion test handle. **Must be persisted and reused across frames for the lifetime of the tested object**. |
| `public AABB getBoundingBox()` / `public void setBoundingBox(AABB boundingBox)` | `AABB` / `void` | Gets or updates in place the world-space bounding box (`AABB`) of this render feature. |
| `public Supplier<String> getName()` | `Supplier<String>` | Returns the name supplier used for debug labels. |
| `equals(Object)` / `hashCode()` | `boolean` / `int` | `final` methods strictly using reference equality (`this == obj`) and `System.identityHashCode(this)`. |

### 2. `OcclusionCuller` & `OcclusionSubmitNodeStorage`

| Class / Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| `OcclusionCuller` | • `default OcclusionSubmitNodeStorage wrapSubmitNodeStorage(SubmitNodeCollector original)`<br>• `boolean shouldDraw(Object feature)`<br>• `boolean isEmpty()`<br>• `@Nullable CullingStatistics collectStatistics()`<br>• `static OcclusionCuller createInstance(GpuDevice device)`<br>• Lifecycle (auto-driven): `onResize(int, int)`, `beforeExtract()`, `beginRenderingFrame()`, `submitFeatureKey(OcclusionKey, List<Object>)`, `processFeatures(CameraRenderState)` | Core occlusion culler interface. Obtain the global instance via `ALROptimizations.getOcclusionCuller()`. |
| `OcclusionSubmitNodeStorage` | • `public void beginOcclusionRecord(OcclusionKey occlusionKey)`<br>• `public void beginOcclusionRecord(OcclusionKey occlusionKey, int order)`<br>• `public void endOcclusionRecord()`<br>• `public void endOcclusionRecord(int order)` | Extends `SubmitNodeStorage`. Intercepts all submitted renderables between `beginOcclusionRecord` and `endOcclusionRecord` (shadows, flames, text, leashes, moving blocks, block models, items, particle groups, name tags, solid/translucent models & parts, custom geometry), forwarding to `original` while registering with `OcclusionCuller`. Note: calling `beginOcclusionRecord` again before `endOcclusionRecord` throws `IllegalStateException`. |
| `OcclusionSubmitNodeCollection` | • `public void beginOcclusionRecord(OcclusionKey occlusionKey)`<br>• `public void endOcclusionRecord()` | Extends `SubmitNodeCollection`; manages per-`order` subcollections for `OcclusionSubmitNodeStorage`, aggregating entity and block-model features recorded in the same layer under `OcclusionKey`. |

### 3. `HierarchicalZOcclusionCuller`, `GpuQueryOcclusionCuller` & F3 Debug Statistics

| Class | Key Methods / Fields | Description |
| :--- | :--- | :--- |
| `HierarchicalZOcclusionCuller` | `public int getMipmapUpdateInterval()` / `public void setMipmapUpdateInterval(int interval)` | Hi-Z depth pyramid occlusion culler. `mipmapUpdateInterval` defaults to `0` (updates Hi-Z pyramid every frame); setting a positive integer `N` updates every `N + 1` frames. |
| `GpuQueryOcclusionCuller` | `acquireQuery()` / `releaseQuery(GpuQueryObject)` / `acquireInstance()` / `releaseInstance(QueryInstance)` | Occlusion culler backed by OpenGL hardware conservative sample queries and object pools. |
| `CullingStatistics` & `OcclusionCullingDebugEntry` | `record CullingStatistics(int total, int frustumPrePass, int cameraInside, int culled, int rendered, int features, List<String> message)` | When pressing `F3` in-game, `OcclusionCullingDebugEntry` (`anvillib_rendering:occlusion_culling`) displays the active culler type, `Total` boxes tested, `Culled`, `Rendered`, and total controlled `Features`. |
