# 遮挡剔除系统：Hi-Z 与 GPU Query (`dev.anvilcraft.lib.v2.rendering.optimization.occlusion`)

<BranchContextCard branch="26.1" />

对于需要每帧动态变化的复杂方块实体或自定义世界特效（无法使用静态 `CachedBER` 烘焙），当它们被墙壁、山体或机器外壳完全挡在后面时，如果仍然每帧执行顶点提交与着色，会造成严重的 GPU Overdraw 和 CPU 提交开销。

`dev.anvilcraft.lib.v2.rendering.optimization.occlusion` 提供了一套**硬件自适应的一帧延迟（One-Frame Latency）遮挡剔除框架（`OcclusionCuller`）**，支持两种硬件加速后端并在启动时自动择优：
1. **`HierarchicalZOcclusionCuller`（Hi-Z 层次深度金字塔，首选）**：
   当显卡支持 Compute Shader 时启用。利用 `DepthTexConverter` 将主帧缓冲深度图转换为 `R32F` Mip 0，再通过 **AMD FidelityFX SPD（Single Pass Downsampler）** 计算着色器在单次 Dispatch 内生成最多 12 层最大值深度金字塔（Max-Z Pyramid，支持 `ARB_bindless_texture` 加速），最后在 `hiz_occlusion_test` 计算着色器中批量计算所有包围盒（`AABB`）的屏幕空间投影矩形并采样对应层级的 Hi-Z 深度，一次性判定所有物体的可见性。
2. **`GpuQueryOcclusionCuller`（硬件保守遮挡查询，备选降级）**：
   当显卡不支持 Hi-Z Compute 时自动启用。在不透明地形绘制完成后，使用 `ALRPipelines.OCCLUSION_QUERY`（禁写颜色与深度）绘制每个 `OcclusionKey` 的包围盒，并通过 `GL_ANY_SAMPLES_PASSED_CONSERVATIVE` 硬件查询统计是否有任何像素通过深度测试（若相机位于包围盒内部则直接判为可见）。
3. **`NoOpOcclusionCuller`（兜底无操作实现）**：所有 `shouldDraw` 恒返回 `true`。

---

## 一、 核心用法：如何为方块实体或自定义渲染接入遮挡剔除？

接入遮挡剔除只需两步：
1. **为每个逻辑渲染目标持久保存一个 `OcclusionKey` 实例**：
   **极其重要**：`OcclusionKey` 的 `equals` 与 `hashCode` 基于**对象引用身份（`this == obj` / `System.identityHashCode`）**而非包围盒数值！因此**严禁每帧 `new OcclusionKey(...)`**——必须将 `OcclusionKey` 保存在 `BlockEntity` 或持久状态对象上跨帧复用，当包围盒随位置或状态变化时调用 `occlusionKey.setBoundingBox(newAabb)` 原地更新。
2. **使用 `culler.wrapSubmitNodeStorage(collector)` 包裹提交过程**：
   在 `storage.beginOcclusionRecord(key)` 与 `storage.endOcclusionRecord()` 之间向 `storage` 提交模型、方块模型、物品、文本或自定义几何体。若上一帧遮挡测试判定该 `key` 被完全遮挡，`Mixin` 注入的各 `FeatureRenderer` 会在真正执行绘制前通过 `OcclusionFeatureRendererHelper.filterVisibleFeatures` 自动剔除被遮挡的绘制项！你也可以在提取阶段主动调用 `culler.shouldDraw(...)` 提前跳过昂贵的动画计算。

---

## 二、 完整代码示例：在方块实体渲染器中接入 `OcclusionCuller`

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
        // 引用方块实体上持久持有的同一个 OcclusionKey 实例
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
        // 复用方块实体上持久保存的 OcclusionKey（切勿每帧 new OcclusionKey!）
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
        // 1. 包装 SubmitNodeCollector
        OcclusionSubmitNodeStorage storage = culler.wrapSubmitNodeStorage(collector);

        // 2. 开启当前 OcclusionKey 的遮挡记录
        storage.beginOcclusionRecord(state.occlusionKey);
        try {
            // 在此期间向 storage 提交的所有模型、部件、文本或自定义几何体都将受该 occlusionKey 遮挡剔除控制
            submitTurbineBlades(state, poseStack, storage);
        } finally {
            // 3. 结束记录并将收集到的渲染项关联到 occlusionKey
            storage.endOcclusionRecord();
        }
    }

    private void submitTurbineBlades(
        TurbineRenderState state,
        PoseStack poseStack,
        SubmitNodeCollector storage
    ) {
        // 提交模型或自定义几何体...
    }
}
```

---

## 三、 公开类与接口 API 详解

### 1. `OcclusionKey`（跨帧稳定遮挡测试句柄）

位于 `dev.anvilcraft.lib.v2.rendering.optimization.occlusion.OcclusionKey`。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public OcclusionKey(AABB boundingBox)`<br>`public OcclusionKey(Supplier<String> name, AABB boundingBox)` | — | 创建一个遮挡测试句柄。**必须在被测试对象的生命周期内持久保存并跨帧复用同一实例**。 |
| `public AABB getBoundingBox()` / `public void setBoundingBox(AABB boundingBox)` | `AABB` / `void` | 获取或原地更新该渲染特性的世界空间包围盒（`AABB`）。 |
| `public Supplier<String> getName()` | `Supplier<String>` | 获取用于调试标记的名称提供器。 |
| `equals(Object)` / `hashCode()` | `boolean` / `int` | `final` 方法，严格基于对象引用相等（`this == obj`）与 `System.identityHashCode(this)`。 |

### 2. `OcclusionCuller` 与 `OcclusionSubmitNodeStorage`

| 类 / 接口名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `OcclusionCuller` | • `default OcclusionSubmitNodeStorage wrapSubmitNodeStorage(SubmitNodeCollector original)`<br>• `boolean shouldDraw(Object feature)`<br>• `boolean isEmpty()`<br>• `@Nullable CullingStatistics collectStatistics()`<br>• `static OcclusionCuller createInstance(GpuDevice device)`<br>• 生命周期（内部自动驱动）：`onResize(int, int)`、`beforeExtract()`、`beginRenderingFrame()`、`submitFeatureKey(OcclusionKey, List<Object>)`、`processFeatures(CameraRenderState)` | 遮挡剔除器核心接口。可通过 `ALROptimizations.getOcclusionCuller()` 获取全局实例。 |
| `OcclusionSubmitNodeStorage` | • `public void beginOcclusionRecord(OcclusionKey occlusionKey)`<br>• `public void beginOcclusionRecord(OcclusionKey occlusionKey, int order)`<br>• `public void endOcclusionRecord()`<br>• `public void endOcclusionRecord(int order)` | 继承自 `SubmitNodeStorage`。在 `beginOcclusionRecord` 与 `endOcclusionRecord` 之间拦截所有提交的渲染对象（支持阴影、火焰、文本、拴绳、移动方块、方块模型、物品、粒子组、名称标签、实心/半透明模型与模型部件、自定义几何体），在转发给底层 `original` 收集器的同时将其注册到 `OcclusionCuller`。注意：若未调用 `endOcclusionRecord` 就再次调用 `beginOcclusionRecord`，会抛出 `IllegalStateException`。 |

### 3. `HierarchicalZOcclusionCuller`、`GpuQueryOcclusionCuller` 与 F3 调试统计

| 类名 | 关键方法 / 字段 | 说明 |
| :--- | :--- | :--- |
| `HierarchicalZOcclusionCuller` | `public int getMipmapUpdateInterval()` / `public void setMipmapUpdateInterval(int interval)` | Hi-Z 深度金字塔遮挡剔除器。`mipmapUpdateInterval` 默认为 `0`（每帧更新 Hi-Z 金字塔）；若设为正整数 `N`，则每 `N + 1` 帧更新一次深度金字塔。 |
| `GpuQueryOcclusionCuller` | `acquireQuery()` / `releaseQuery(GpuQueryObject)` / `acquireInstance()` / `releaseInstance(QueryInstance)` | 基于 OpenGL 硬件保守采样查询与对象池的遮挡剔除器。 |
| `CullingStatistics` & `OcclusionCullingDebugEntry` | `record CullingStatistics(int total, int frustumPrePass, int cameraInside, int culled, int rendered, int features, List<String> message)` | 在游戏内按下 `F3` 打开调试屏幕时，`OcclusionCullingDebugEntry`（`anvillib_rendering:occlusion_culling`）会实时显示当前激活的剔除器类型、总测试包围盒数（`Total`）、被剔除数（`Culled`）、实际渲染数（`Rendered`）及受控特性总数（`Features`）。 |
