# 结构投影渲染 (`ProjectionScene` / `ProjectionRenderer` / `ProjectionFeatures`)

<BranchContextCard branch="26.3" />

在多方块结构建造指引、蓝图预览或机器工作范围可视化中，常需要在真实世界中渲染一套半透明的**全息结构投影（Ghost / Structure Projection）**，支持渲染静态方块、流体、方块实体（`BlockEntity`）与实体（`Entity`），并自动将投影与真实世界对应坐标的方块状态进行比对：
- **已正确放置的方块**：自动隐藏投影；
- **空气位置（尚未放置）**：正常显示半透明结构投影；
- **方块类型正确但状态属性错误（如朝向放反）**：自动叠加**琥珀色半透明高亮框**（`0x70FFCC00`）；
- **放置了错误的方块**：自动叠加**红色半透明高亮框**（`0x70FF3333`）。

`dev.anvilcraft.lib.v2.rendering.projection` 包通过 **`ProjectionScene`**、**`ProjectionRenderer`** 与 **`ProjectionFeatures`** 完整实现了这一能力，且采用**深度预通道（Depth Prepass）+ 颜色混合通道**两阶段渲染，彻底解决了半透明投影内部各面片互相穿透导致的杂乱重影问题。

---

## 一、 核心设计机制

1. **离线场景构建 (`ProjectionScene`)**：
   实现 `BlockAndTintGetter`，完全独立于真实世界。调用 `scene.put(localPos, blockState, optionalBlockEntity)` 与 `scene.addEntity(entity)` 填充局部坐标下的结构（方块实体和实体仅用于提取渲染状态，绝不会加入真实世界或执行 Tick）。
2. **网格烘焙与资源重载感知 (`ProjectionRenderer#rebuild`)**：
   调用 `renderer.rebuild(scene, alpha)`（`alpha` 范围 `0..255`）会将所有静态方块与流体烘焙进单个 `ProjectionMesh` GPU 顶点缓冲，并记录每个局部坐标在顶点缓冲中的起止偏移 `vertexEnds`。当客户端重新加载资源包触发 `ModelEvent.BakingCompleted` 时，内置的 `ProjectionRenderEvents` 会递增全局代数 `generation`，使 `renderer.isValid()` 自动变为 `false`，提示调用方重建。
3. **世界比对、负行列式镜像绕序修正与共享深度预通道 (`prepare` + `renderAll`)**：
   - 当调用 `renderer.render(poseStack, cameraState, level, worldOrigin)`（或多投影批量调用 `prepare` + `ProjectionRenderer.renderAll(preparedList)`）时，会逐格比对真实世界 `origin + localPos` 处的方块状态，生成 `missing`、`wrongStates`、`wrongBlocks` 三个 `BitSet`；
   - 若 `poseStack` 包含镜像变换（`pose.determinant3x3() < 0`），`ProjectionMesh` 与 `ProjectionFeatures` 会自动翻转四边形顶点绕序（`reverseWinding`），防止背面剔除导致镜像结构隐形；
   - `renderAll` 先对所有投影执行 `depthOnly = true`（只写深度缓冲不写颜色），再执行 `depthOnly = false`（基于 `LESS_THAN_OR_EQUAL` 深度测试混合半透明颜色），最后渲染 `ProjectionOverlay` 状态错误/方块错误提示框。

---

## 二、 完整代码示例：构建并在世界中渲染带状态校验的多方块全息投影

```java
package com.example.mymod.client.render;

import com.example.mymod.MyMod;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;
import net.minecraft.world.phys.Vec3;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;

@EventBusSubscriber(modid = MyMod.MOD_ID, value = Dist.CLIENT)
public final class KilnProjectionPreview {
    private static final ProjectionRenderer RENDERER = new ProjectionRenderer();
    private static BlockPos previewAnchor = new BlockPos(0, 64, 0);
    private static boolean active = false;

    private KilnProjectionPreview() {
    }

    public static void enablePreviewAt(BlockPos anchor) {
        previewAnchor = anchor.immutable();
        active = true;
        rebuildScene();
    }

    public static void disablePreview() {
        active = false;
        RENDERER.close();
    }

    private static void rebuildScene() {
        ClientLevel level = Minecraft.getInstance().level;
        if (level == null) return;

        // 1. 创建以 previewAnchor 为生物群系着色基准点的 ProjectionScene
        ProjectionScene scene = new ProjectionScene(level, previewAnchor);

        // 2. 填充局部坐标方块 (例如 3x1x3 底座 + 中心熔炉)
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                scene.put(new BlockPos(dx, 0, dz), Blocks.STONE_BRICKS.defaultBlockState(), null);
            }
        }
        scene.put(
            new BlockPos(0, 1, 0),
            Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.LIT, true),
            null
        );

        // 3. 以 160 (约 63% 不透明度) 烘焙网格
        RENDERER.rebuild(scene, 160);
    }

    /**
     * 在 RenderLevelStageEvent.AfterLevel 阶段渲染，可避免光影包后处理改变全息投影颜色
     */
    @SubscribeEvent
    public static void onRenderAfterLevel(RenderLevelStageEvent.AfterLevel event) {
        if (!active) return;
        ClientLevel level = Minecraft.getInstance().level;
        if (level == null) return;

        // 若资源包重载导致烘焙失效，自动重建
        if (!RENDERER.isValid()) {
            rebuildScene();
        }

        CameraRenderState camera = event.getLevelRenderState().cameraRenderState;
        Vec3 camPos = camera.pos;

        PoseStack poseStack = new PoseStack();
        // 平移到相机相对空间下的 previewAnchor 原点
        poseStack.translate(
            previewAnchor.getX() - camPos.x,
            previewAnchor.getY() - camPos.y,
            previewAnchor.getZ() - camPos.z
        );

        // 渲染并实时对比 level 中 previewAnchor 处的真实方块状态
        RENDERER.render(poseStack, camera, level, previewAnchor);
    }
}
```

---

## 三、 公开类与方法 API 详解

### 1. `ProjectionScene`（投影局部场景视图）

实现 `net.minecraft.client.renderer.block.BlockAndTintGetter`。光照亮度方法（`getBrightness` / `getRawBrightness`）恒返回满亮度 `15`。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)`<br>`public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | — | 构造投影场景。`tintPos` 为世界基准坐标，用于计算草方块、树叶和水的生物群系颜色（`pos.offset(tintPos)`）。 |
| `public void put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | `void` | 在局部坐标 `pos` 处设置方块状态及可选的方块实体（传 `null` 会移除该位置此前的方块实体）。**注意**：请在调用 `rebuild` 前填好所有相邻方块，以便流体和玻璃连接面正确剔除内部邻面。 |
| `public void addEntity(Entity entity)` | `void` | 向投影场景添加需要一并预览的实体。 |
| `public BlockAndTintGetter shifted(BlockPos origin)` | `BlockAndTintGetter` | 返回将查询原点平移至 `origin` 的局部视图（供流体渲染器使用）。 |
| `getBlockState(BlockPos)` / `getFluidState(BlockPos)` / `getBlockEntity(BlockPos)` / `getModelData(BlockPos)` | 对应类型 | 实现 `BlockAndTintGetter` 的访问方法（未放置方块的位置返回 `Blocks.AIR.defaultBlockState()`）。 |

### 2. `ProjectionRenderer` 与 `ProjectionRenderer.Prepared`

实现 `AutoCloseable`。

| 方法签名 | 返回值 | 说明与边界条件 |
| :--- | :--- | :--- |
| `public boolean isValid()` | `boolean` | 检查当前渲染器是否已构建（`built`）且自上次构建以来客户端模型未发生重载（`bakedGeneration == generation`）。 |
| `public void rebuild(ProjectionScene view, int alpha)` | `void` | 释放旧 GPU 缓冲并以不透明度 `alpha`（`0..255`，超出范围抛出 `IllegalArgumentException`）重新烘焙场景中的方块、流体、方块实体与实体。 |
| `public void render(PoseStack pose, CameraRenderState camera)` | `void` | 在相机相对空间下直接渲染完整投影（不做真实世界方块比对，全部显示）。 |
| `public void render(PoseStack pose, CameraRenderState camera, BlockGetter level, BlockPos origin)` | `void` | 将局部场景与 `level` 中以 `origin` 为原点的真实方块逐格比对后渲染（自动隐藏已对齐方块，并对错误状态/错误方块绘制高亮框）。 |
| `public @Nullable Prepared prepare(PoseStack pose, CameraRenderState camera, BlockGetter level, BlockPos origin)` | `@Nullable Prepared` | 捕获一次放置位置的比对结果与矩阵快照，供 `renderAll` 批量合批深度预通道使用。 |
| `public static void renderAll(List<Prepared> projections)` | `void` | 先统一执行所有 `Prepared` 投影的深度写入通道，再统一执行半透明颜色通道，最后统一绘制错误提示框，确保多个重叠投影之间遮挡关系完全正确。 |
| `public void close()` | `void` | 释放内部 `ProjectionMesh`、`ProjectionFeatures` 与 `ProjectionOverlay` 占用的所有 GPU 缓冲区。 |

### 3. `ProjectionFeatures` 与 `ProjectionRenderTypes`

| 类名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| `ProjectionFeatures` | • `public ProjectionFeatures()`<br>• `public void render(List<BlockEntity> blockEntities, List<Entity> entities, PoseStack pose, CameraRenderState camera, int alpha)`<br>• `public void clear()` / `public void close()` | 复用原版 `FeatureRenderDispatcher` 渲染方块实体与实体列表，当 `alpha < 255` 时自动将所有 `RenderType` 转换为半透明 Ghost 渲染管线。该类同时也被 GUI 画中画渲染器 `BlockStatePipRenderer` 与 `StructurePipRenderer` 复用。 |
| `ProjectionRenderTypes` | `public static RenderType blocks()` | 获取静态方块与流体的半透明投影渲染类型 `BLOCK_GHOST`（`anvillib_rendering:structure_projection`）。 |
