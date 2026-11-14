# 投影渲染器与覆盖层 (`ProjectionRenderer` / `Overlay`)

`ProjectionRenderer` 是世界内结构幽灵预览的执行核心：负责把 `ProjectionScene` 烘焙到 GPU 顶点缓冲，结合真实世界状态实时过滤出尚未建造的位置，并用半透明叠层标出“错误方块”与“错误方块状态”。

## 渲染管线特点

1. **双通道先深度后染色 (`ProjectionRenderer.renderAll`)**：多个放置点位之间统一先跑完 `depthOnly = true` 深度预写入，再跑 `depthOnly = false` 颜色混合，从而彻底消除单个建筑内部半透明叠加或相邻结构体交错时的深度错乱。
2. **不直接依赖当前光影阶段**：建议挂载到 `RenderLevelStageEvent.Stage.AFTER_LEVEL`，此时游戏主世界后处理已完成，可避免与第三方 Shader Pack 冲突。
3. **内置诊断覆盖层 (`ProjectionOverlay`)**：将 `actual != expected` 的位置分为两类高亮盒（比方框略微外扩 `0.05F`）：
   - **同方块但状态不匹配**（如朝向、含水状态不一致）：琥珀色半透明覆盖（`0x70FFCC00`）；
   - **完全放置了错误种类的方块**：红色半透明覆盖（`0x70FF3333`）。

## `ProjectionRenderer` 全量 API

`ProjectionRenderer` 实现 `AutoCloseable`，当持有者被销毁或结构更换时务必调用 `close()` 释放堆外内存与显存 `VertexBuffer`。

| 方法签名 | 返回类型 | 说明与线程要求 |
| --- | --- | --- |
| `isValid()` | `boolean` | 检查当前烘焙网格的 `generation` 是否仍与 `ProjectionShaders` 一致（资源包重载后会变为 `false`） |
| `rebuild(ProjectionScene view, int alpha)` | `void` | 必须在渲染线程（`RenderSystem.assertOnRenderThread()`）调用；`alpha` 为 0~255 闭区间整体不透明度。烘焙全部静态方块、流体并采集非空 `BlockEntity` 与 `Entity` 列表 |
| `render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers)` | `void` | 不做真实世界状态比对，直接无条件全量渲染整个投影场景（适合预览独立样机或纯全息投影） |
| `render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers, BlockGetter level, BlockPos origin)` | `void` | 比对真实 `level` 从 `origin` 开始的建造进度后单实例绘制，并显示状态/种类错误高亮框 |
| `prepare(PoseStack pose, Matrix4f projectionMatrix, BlockGetter level, BlockPos origin)` | `@Nullable Prepared` | 采集当前放置点位的待建造缺失列表（`missing`）、错误状态列表（`wrongStates`）和错误方块列表（`wrongBlocks`），生成供批量合并绘制的句柄；注意必须在同一帧被消费且在下次 `rebuild` 前使用 |
| `ProjectionRenderer.renderAll(List<Prepared> projections)` | `static void` | 先遍历所有 `Prepared` 执行纯深度预通道，再绘制半透明颜色与实体特征通道，最后渲染差异提示覆盖层 |
| `close()` | `void` | 释放本地堆外顶点缓冲、GL `VertexBuffer`、`ProjectionOverlay` 与 `ProjectionBuffers` |

> [!CAUTION]
> 当传入旋转或镜像的 `PoseStack`（其 3x3 行列式 `determinant3x3() < 0`）时，`ProjectionRenderer.Prepared` 会自动通过 `GL11.glFrontFace(...)` 翻转正面绕序并在退出后还原，防止镜像蓝图背面剔除出错。因此自定义变换矩阵可以直接配合 `ProjectionRenderer` 使用。

## 完整示例：在世界中多点位投影并检查建造差异

```java
package com.example.mymod.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;

import java.util.ArrayList;
import java.util.List;

public final class ActiveBlueprintManager {
    private static final ProjectionRenderer RENDERER = new ProjectionRenderer();
    private static ProjectionScene cachedScene;

    public static void onRenderLevelStage(RenderLevelStageEvent event) {
        if (event.getStage() != RenderLevelStageEvent.Stage.AFTER_LEVEL) return;
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || cachedScene == null) return;

        if (!RENDERER.isValid()) {
            RENDERER.rebuild(cachedScene, 140);
        }

        Vec3 camera = event.getCamera().getPosition();
        List<BlockPos> targets = List.of(new BlockPos(0, 70, 0), new BlockPos(12, 70, 0));
        List<ProjectionRenderer.Prepared> batch = new ArrayList<>();

        for (BlockPos origin : targets) {
            PoseStack pose = new PoseStack();
            pose.mulPose(event.getModelViewMatrix());
            pose.translate(origin.getX() - camera.x, origin.getY() - camera.y, origin.getZ() - camera.z);
            ProjectionRenderer.Prepared prepared = RENDERER.prepare(
                pose,
                event.getProjectionMatrix(),
                mc.level,
                origin
            );
            if (prepared != null) {
                batch.add(prepared);
            }
        }

        if (!batch.isEmpty()) {
            mc.renderBuffers().bufferSource().endBatch();
            ProjectionRenderer.renderAll(batch);
        }
    }
}
```
