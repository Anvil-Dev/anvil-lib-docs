# 结构投影场景与网格 (`ProjectionScene` / `ProjectionMesh`)

`ProjectionScene` 是完全脱离真实世界 Tick 的局部静态方块与实体容器，专门为 `ProjectionRenderer` 烘焙幽灵建筑网格提供周围邻居方块遮挡、流体与生物群系染色查询上下文。

## `ProjectionScene` 详解

`ProjectionScene` 实现原版 `BlockAndTintGetter`，可在不向主世界实际放置方块的前提下，支持所有原版和第三方模组方块模型（包含 CTM、连通纹理、水流体表面剔除及红stone/草方块生态染色）的正确烘焙。

### 构造与数据填充 API

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `new ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)` | `ProjectionScene` | 以真实世界（如客户端 `ClientLevel`）和基准坐标 `tintPos` 初始化，默认直接使用 `level::getBlockTint` 计算群系染色 |
| `new ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | `ProjectionScene` | 允许覆盖自定义的坐标-颜色解析回调；`tint` 接收**世界坐标**，而场景内部结构使用以 `(0,0,0)` 为起点的**局部坐标** |
| `put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | `void` | 向局部坐标写入方块状态与可选的静态 `BlockEntity`（传入 `null` 会移除该位置已有方块实体）；同时动态扩展 `minY`/`maxY` |
| `addEntity(Entity entity)` | `void` | 向投影场景追加虚拟实体列表（仅在幽灵投影特性通道中渲染，不会加入或 Tick 真实世界） |
| `getBlockState(BlockPos pos)` / `getFluidState(BlockPos pos)` / `getBlockEntity(BlockPos pos)` | 对应对象 | 实现 `BlockAndTintGetter` 查询；未填充坐标返回 `Blocks.AIR.defaultBlockState()` |
| `getMinY()` / `getHeight()` / `isOutsideBuildHeight(int y)` | `int` / `boolean` | 提供与当前场景跨度对齐的高度范围信息 |
| `getShade(...)` / `getLightEngine()` / `getBrightness(...)` / `getRawBrightness(...)` / `getModelData(...)` | 光照与模型数据 | 透传底层 `level` 光照与 `ModelData`（若位置带有 `BlockEntity` 则优先读取 `blockEntity.getModelData()`） |

> [!TIP]
> 在调用 `ProjectionRenderer.rebuild(scene, alpha)` 之前，请把结构内的**全部方块及其必要邻居**先通过 `put(...)` 写入 `ProjectionScene`。因为在网格烘焙阶段就需要做邻面剔除（face culling），若边角方块分批写入会导致相邻面错误剔除。

### 使用示例：从 `StructureTemplate` 构建 `ProjectionScene`

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

import java.util.Map;

public final class BlueprintSceneFactory {
    public static ProjectionScene fromBlocks(
        BlockAndTintGetter world,
        BlockPos placementOrigin,
        Map<BlockPos, BlockState> localBlocks,
        Map<BlockPos, BlockEntity> localBlockEntities
    ) {
        ProjectionScene scene = new ProjectionScene(world, placementOrigin);
        localBlocks.forEach((localPos, state) -> {
            BlockEntity be = localBlockEntities.get(localPos);
            scene.put(localPos, state, be);
        });
        return scene;
    }
}
```

## 内部网格、剔除机制与 `GhostConsumer`

理解底层网格构造方式有助于定位复杂投影中的性能瓶颈和视觉细节：

1. **按序位置顶点切片 (`ProjectionMesh`)**：在 `ProjectionRenderer.rebuild(...)` 阶段，所有局部坐标方块（连同非空 `FluidState`）被一次性渲染进一块直接内存缓冲区（`ByteBuffer`），同时记录每个局部坐标在缓冲区中对应的顶点切片起止边界 `vertexEnds[]`。
2. **动态可见性位图 (`BitSet visible`)**：实际帧渲染时，不再按单个方块重新绘制模型，而是利用 `visible` 位图决定哪些方块已被玩家建造完成（缺口方才需要渲染幽灵预览）。仅当 `visible` 状态相比上一帧发生变化时，才把可见方块的顶点片段从内存拼接上传到 `VertexBuffer`。
3. **透明与位置偏移拦截 (`GhostConsumer`)**：包装 `VertexConsumer`，在方块网格烘焙期间按 `opacity` 覆写颜色 Alpha 通道，并在绘制流体时配合 `ProjectionScene.shifted(pos)` 修正局部原点的顶点偏移。
