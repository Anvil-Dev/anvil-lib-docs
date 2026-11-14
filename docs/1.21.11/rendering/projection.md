# 结构投影渲染系统 (Projection)

在世界内渲染多方块结构蓝图或可移动结构预览时，模组常面临三个典型难题：

1. 直接对每个方块调用 `BlockRenderDispatcher` 的性能开销过大且半透明混合容易互相遮挡；
2. 多个结构并排或重叠预览时，后渲染的半透明幽灵方块会穿透先渲染的结构或产生排序伪影；
3. 需要把蓝图中的每个方块与真实世界逐一比对，用半透明色块标出「方块类型不符（红色）」或「方块状态不符（黄色）」。

`dev.anvilcraft.lib.v2.rendering.projection` 套件专门解决了上述问题：它提供离线化的只读结构视图 `ProjectionScene`、网格烘焙与批量多结构深度预绘制引擎 `ProjectionRenderer`、方块实体/实体幽灵包装器 `ProjectionFeatures`，以及配套管道 `ProjectionRenderTypes`。

---

## 核心渲染流程

```
构建 ProjectionScene ──► ProjectionRenderer.rebuild(scene, alpha)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       单结构绘制 (render)            多结构批处理 (prepare + renderAll)
  1. 深度预写 PASS（只写深度）      1. 跨所有 Prepared 统一深度预写 PASS
  2. 半透明颜色 PASS                2. 跨所有 Prepared 统一半透明颜色 PASS
  3. 实体/方块实体幽灵与校验覆盖层  3. 逐个绘制校验覆盖层与实体幽灵
```

> [!IMPORTANT]
> 请务必在世界几何体渲染完成后的阶段调用 `ProjectionRenderer.render(...)` 或 `ProjectionRenderer.renderAll(...)`（例如 NeoForge 的 `RenderLevelStageEvent.AfterLevel` 或同类后置世界渲染阶段），同时确保摄像机平移偏移已应用到传入的 `PoseStack`。

---

## 完整示例：世界内多方块蓝图批量投影

下面的客户端渲染器展示如何缓存多个蓝图投影、响应模型重载清理并按统一深度通道绘制到当前世界：

```java
package com.example.mymod.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class BlueprintProjectionOverlay {
    private static final List<Placement> ACTIVE_PLACEMENTS = new ArrayList<>();

    public record Placement(BlockPos origin, Map<BlockPos, BlockState> pattern, ProjectionRenderer renderer) {}

    public static void addPlacement(Level level, BlockPos origin, Map<BlockPos, BlockState> relativeBlocks) {
        ProjectionRenderer renderer = new ProjectionRenderer();
        ProjectionScene scene = new ProjectionScene(level, origin);
        relativeBlocks.forEach((relPos, state) -> {
            BlockEntity be = state.hasBlockEntity() ? null : null;
            scene.put(relPos, state, be);
        });
        // 半透明幽灵透明度（0~255），140 约为 55% 不透明度
        renderer.rebuild(scene, 140);
        ACTIVE_PLACEMENTS.add(new Placement(origin, relativeBlocks, renderer));
    }

    public static void clearAll() {
        for (Placement placement : ACTIVE_PLACEMENTS) {
            placement.renderer().close();
        }
        ACTIVE_PLACEMENTS.clear();
    }

    public static void onRenderLevelStage(RenderLevelStageEvent.AfterLevel event) {
        if (ACTIVE_PLACEMENTS.isEmpty()) {
            return;
        }
        Minecraft mc = Minecraft.getInstance();
        Level level = mc.level;
        if (level == null) {
            return;
        }

        CameraRenderState camera = event.getLevelRenderState().cameraRenderState;
        Vec3 cameraPos = camera.pos;
        PoseStack poseStack = event.getPoseStack();
        List<ProjectionRenderer.Prepared> preparedList = new ArrayList<>(ACTIVE_PLACEMENTS.size());

        for (Placement placement : ACTIVE_PLACEMENTS) {
            if (!placement.renderer().isValid()) {
                // 模型资源重载后（ModelEvent.BakingCompleted）需要重新烘焙网格
                ProjectionScene rebuiltScene = new ProjectionScene(level, placement.origin());
                placement.pattern().forEach((pos, state) -> rebuiltScene.put(pos, state, null));
                placement.renderer().rebuild(rebuiltScene, 140);
            }

            poseStack.pushPose();
            poseStack.translate(
                placement.origin().getX() - cameraPos.x,
                placement.origin().getY() - cameraPos.y,
                placement.origin().getZ() - cameraPos.z
            );
            ProjectionRenderer.Prepared prepared = placement.renderer().prepare(poseStack, camera, level, placement.origin());
            if (prepared != null) {
                preparedList.add(prepared);
            }
            poseStack.popPose();
        }

        // 所有结构共享深度预写，彻底消除互相穿透与重复透明叠色
        ProjectionRenderer.renderAll(preparedList);
    }
}
```

---

## API 参考

### `ProjectionScene`

实现 `net.minecraft.world.level.BlockAndTintGetter`，为离线方块模型、流体和生物群系染色提供独立的世界快照视图。

#### 构造方法与修改方法

| 签名 | 说明 |
| :--- | :--- |
| `public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos)` | 使用参考世界的 `getBlockTint` 在 `pos.offset(tintPos)` 处采样草叶/水流等生物群系颜色 |
| `public ProjectionScene(BlockAndTintGetter level, BlockPos tintPos, ToIntBiFunction<BlockPos, ColorResolver> tint)` | 使用自定义染色函数构建结构视图 |
| `public void put(BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity)` | 向场景相对坐标 `pos` 写入方块状态与可选的方块实体，同时动态扩展场景垂直范围 (`minY` / `maxY`) |
| `public void addEntity(Entity entity)` | 添加需要在投影中以幽灵状态渲染的普通实体 |
| `public BlockAndTintGetter shifted(BlockPos origin)` | 返回以 `origin` 为局部原点偏移的只读视图（用于局部坐标绘制流体等需要从 `(0,0,0)` 查询邻接方块的场景） |

#### 查询特性与光照约定

- `getBlockState(BlockPos)`：若该坐标未写入且 `level` 提供状态则返回空气 `Blocks.AIR.defaultBlockState()`；空气不阻塞邻接方块的空气判断。
- `getBrightness(LightLayer, BlockPos)` 与 `getRawBrightness(BlockPos, int)`：固定返回最大亮度 `15`，保证蓝图投影不受真实世界洞穴阴影干扰。
- `getModelData(BlockPos)`：若对应位置存在已注入的 `BlockEntity`，委托返回 `blockEntity.getModelData()`；否则返回 `ModelData.EMPTY`。

---

### `ProjectionRenderer`

结构投影的核心控制与生命周期管理类，实现 `AutoCloseable`。内部自动维护方块网格 `ProjectionMesh`、错误状态/错误方块覆盖层 `ProjectionOverlay` 及方块实体/实体绘制器 `ProjectionFeatures`。

| 方法签名 | 说明 |
| :--- | :--- |
| `public boolean isValid()` | 检查已烘焙的网格是否仍然有效；资源包重载触发 `ModelEvent.BakingCompleted` 时会自动失效 |
| `public void rebuild(ProjectionScene view, int alpha)` | 根据 `view` 重新采集静态方块模型与流体网格，按指定透明度 `alpha`（`0..255`）上传至 GPU 顶点缓冲；并记录场景内的方块实体和实体引用 |
| `public void render(PoseStack pose, CameraRenderState camera)` | 直接完整绘制场景中的所有方块与实体，不与真实世界对比、不绘制校验高亮覆盖层 |
| `public void render(PoseStack pose, CameraRenderState camera, BlockGetter level, BlockPos origin)` | 等价于单结构执行 `prepare(pose, camera, level, origin)` 后立刻渲染；会隐藏已在真实世界完全匹配的方块 |
| `public @Nullable Prepared prepare(PoseStack pose, CameraRenderState camera, BlockGetter level, BlockPos origin)` | 对比场景中的每个位置与真实世界 `level.getBlockState(origin.offset(pos))`：已完全匹配的方块会被剔除可见位图；真实位置为非空气且方块类型不同标记为「错误方块（红 `0x70FF3333`）」；同种方块但属性不同标记为「错误状态（黄 `0x70FFCC00`）」。若网格未准备就绪或既无缺失方块也无实体时返回 `null` |
| `public static void renderAll(List<Prepared> projections)` | 批量绘制多个已准备的投影实例：先集中执行所有投影的仅深度预写，再统一渲染半透明颜色网格、方块实体/实体幽灵，最后绘制红黄校验覆盖框 |
| `public void close()` | 释放持有的 GPU 顶点/索引缓冲和实体缓冲内存；使用完毕或界面销毁时必须调用 |

#### 内部批处理凭证：`ProjectionRenderer.Prepared`

由 `prepare(...)` 返回的不可变记录凭证，持有对应 `ProjectionRenderer` 的渲染快照信息（`PoseStack pose`、`CameraRenderState camera`、可见方块实体列表、`missing` 可见方块 `BitSet`、`wrongStates` 黄色标注 `BitSet`、`wrongBlocks` 红色标注 `BitSet`），交由 `ProjectionRenderer.renderAll(...)` 统一消费。

---

### `ProjectionFeatures`

实现 `AutoCloseable`，基于 `SubmitNodeStorage` 与 `FeatureRenderDispatcher` 在投影内部绘制方块实体 (`BlockEntity`) 与常规实体 (`Entity`)，并支持随投影一起做半透明着色与纯深度预写。

| 方法签名 | 说明 |
| :--- | :--- |
| `public ProjectionFeatures()` | 创建内置 `SubmitNodeStorage` 与 `FeatureRenderDispatcher` 的实体渲染分发器 |
| `public void render(List<BlockEntity> blockEntities, List<Entity> entities, PoseStack pose, CameraRenderState camera, int alpha)` | 以全亮光照 (`LightTexture.FULL_BRIGHT`)、指定相机状态与透明度 `alpha`（`0..255`）渲染给定方块实体与实体列表。当 `alpha == 255` 且非纯深度通道时走原始 `RenderType`；否则自动把原本渲染管线复制切换为半透明/仅深度幽灵管线 |
| `public void clear()` | 清空内部缓存的 `BlockEntityRenderState` 与实体临时渲染类型映射表 |
| `public void close()` | 关闭 `FeatureRenderDispatcher` 并销毁内部幽灵缓冲内存 |

---

### `ProjectionRenderTypes`

向外部提供结构投影所用的 `RenderType` 及管线适配支持（包内亦提供 `ghost` 等底层变体转换）：

| 公开方法 / 字段 | 返回类型 | 说明 |
| :--- | :--- | :--- |
| `ProjectionRenderTypes.blocks()` | `RenderType` | 返回基于 `RenderSetup.builder(BLOCK_PIPELINE)` 构建的 `anvillib_rendering:structure_projection` 渲染类型（绑定 `Sheets.BLOCKS_MAPPER.sheet()` 与光照图、开启透明排序与 `BlendFunction.TRANSLUCENT`、关闭深度写入） |

---

### `ProjectionRenderEvents`

客户端总线监听器（`@EventBusSubscriber(modid = AnvilLibRendering.MODID, value = Dist.CLIENT)`）：

| 方法签名 | 监听事件 | 职责 |
| :--- | :--- | :--- |
| `public static void pipelines(RegisterRenderPipelinesEvent event)` | `RegisterRenderPipelinesEvent` | 注册结构投影颜色管线 (`structure_projection`) 与深度预写管线 (`structure_projection_depth`) |
| `public static void reload(ModelEvent.BakingCompleted event)` | `ModelEvent.BakingCompleted` | 模型烘焙完成或资源重载时使全部 `ProjectionRenderer` 的缓存资源失效并清空管线变体缓存，促使后续帧自动重新构建 |

> [!TIP]
> `ProjectionRenderer` 内部通过弱引用集合跟踪活跃实例：当 `close()` 被调用或对象被 GC 回收时不会造成内存泄漏；在 `ModelEvent.BakingCompleted` 发生后，调用 `isValid()` 会立即返回 `false`，提醒调用方重建网格。
