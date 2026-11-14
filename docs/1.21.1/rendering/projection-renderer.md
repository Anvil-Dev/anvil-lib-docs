# 投影渲染器与覆盖层 (ProjectionRenderer)

构建好 `ProjectionScene` 后，真正负责将结构预烘焙进显存、与现实世界逐格比对以及按正确透明度顺序输出到屏幕的，是 `ProjectionRenderer`。

## 要解决的核心渲染难题

半透明全息建筑投影在 Minecraft 渲染管线中常见三个痛点：

1. **性能与烘焙分离**：不能每帧重新对结构内所有方块执行模型烘焙，只需在结构或透明度变化时 `rebuild(...)` 一次，每帧仅提交 GPU 静态 VBO + 动态方块实体/实体。
2. **内部重叠面穿帮（Overdraw）**：半透明投影若直接带混合绘制，玩家透过前排半透明玻璃或台阶看后排方块时，会导致颜色多次叠加变浑浊。`ProjectionRenderer` 采用 **仅写深度（Depth-Only）预通道 + 深度相等着色通道** 消除同一投影内部的半透明重影。
3. **多投影并存排序**：如果场景中同时激活多个蓝图投影，逐个渲染会导致后画的投影被先画的投影深度错误遮挡。通过 `prepare(...)` + `ProjectionRenderer.renderAll(...)`，可以把多个 `Prepared` 快照的“深度通道”、“颜色通道”和“校验覆盖层通道”分别合批执行。

## 使用模式选择

| 使用方式 | 适用场景 | 校验高亮（红/黄框） |
| --- | --- | --- |
| `render(pose, projectionMatrix, buffers)` | 在纯展示界面或世界固定预览中，无条件绘制全部结构方块与实体 | 不启用 |
| `render(pose, projectionMatrix, buffers, level, origin)` | 单个世界放置引导，需要自动隐藏已建好的正确方块并标记错误格 | 启用 |
| `prepare(...)` + `ProjectionRenderer.renderAll(list)` | 世界中同时存在**多个**蓝图投影，需要统一深度/颜色/覆盖层合批 | 启用 |

## 校验差异判定规则（红/黄高亮与隐藏策略）

当传入真实世界 `level` 与锚点 `origin` 时，渲染器会遍历 `ProjectionScene` 中的每一个预期坐标 `localPos`，比对真实世界 `level.getBlockState(origin.offset(localPos))`：

1. **世界该位置为空气 (`worldState.isAir()`)**：说明尚未建造 -> 标记为 `missing`，渲染**半透明幽灵方块**及对应方块实体。
2. **世界已有同种方块但状态不一致 (`worldState.is(expected.getBlock())` 且 `!worldState.equals(expected)`)**：例如楼梯朝向或半砖上下半错了 -> 不画幽灵方块，标记为 `wrongStates`，在对应位置外扩 `0.05F` 渲染**黄色高亮提示盒 (`0x70FFCC00`)**。
3. **世界已有完全不同的非空气方块**：说明放错了方块类型 -> 不画幽灵方块，标记为 `wrongBlocks`，在对应位置渲染**红色高亮提示盒 (`0x70FF3333`)**。
4. **世界状态与预期完全一致**：既不画幽灵方块，也不画提示盒，表示该格已建造完成。

## 完整代码示例：世界多投影渲染与热重载处理

下面演示在 `RenderLevelStageEvent` 中维护多个结构投影的生命周期，包含着色器热重载检测、多投影 `prepare` + `renderAll` 合批，以及镜像矩阵支持：

```java
package com.example.examplemod.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionRenderer;
import dev.anvilcraft.lib.v2.rendering.projection.ProjectionScene;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;

import java.util.ArrayList;
import java.util.List;

public final class WorldProjectionManager {
    private static final List<ActiveProjection> ACTIVE = new ArrayList<>();

    public record ActiveProjection(
        BlockPos origin,
        ProjectionScene scene,
        ProjectionRenderer renderer,
        int alpha
    ) {
        public void ensureBaked() {
            // 检测是否尚未烘焙或因 F3+T 导致核心着色器代际失效
            if (!this.renderer.isValid()) {
                this.renderer.rebuild(this.scene, this.alpha);
            }
        }
    }

    public static void addProjection(ClientLevel level, BlockPos origin, ProjectionScene scene) {
        ProjectionRenderer renderer = new ProjectionRenderer();
        renderer.rebuild(scene, 150);
        ACTIVE.add(new ActiveProjection(origin, scene, renderer, 150));
    }

    public static void clearAll() {
        for (ActiveProjection entry : ACTIVE) {
            // 必须显式 close() 以释放 VertexBuffer 和堆外内存
            entry.renderer().close();
        }
        ACTIVE.clear();
    }

    public static void onRenderLevelStage(RenderLevelStageEvent event) {
        if (event.getStage() != RenderLevelStageEvent.Stage.AFTER_TRANSLUCENT_BLOCKS || ACTIVE.isEmpty()) {
            return;
        }
        Minecraft mc = Minecraft.getInstance();
        ClientLevel level = mc.level;
        if (level == null) {
            return;
        }

        Vec3 camPos = event.getCamera().getPosition();
        PoseStack poseStack = event.getPoseStack();
        List<ProjectionRenderer.Prepared> preparedList = new ArrayList<>(ACTIVE.size());

        for (ActiveProjection entry : ACTIVE) {
            entry.ensureBaked();

            poseStack.pushPose();
            poseStack.translate(
                entry.origin().getX() - camPos.x,
                entry.origin().getY() - camPos.y,
                entry.origin().getZ() - camPos.z
            );
            ProjectionRenderer.Prepared prepared = entry.renderer().prepare(
                poseStack,
                event.getProjectionMatrix(),
                level,
                entry.origin()
            );
            poseStack.popPose();

            if (prepared != null) {
                preparedList.add(prepared);
            }
        }

        if (!preparedList.isEmpty()) {
            // 先刷新主缓冲池，防止外部半透明绘制留在当前批里干扰 GL 状态
            mc.renderBuffers().bufferSource().endBatch();
            // 统一按 1.全投影写深度 -> 2.全投影绘制着色/实体 -> 3.全投影绘制红黄差异盒 的顺序执行
            ProjectionRenderer.renderAll(preparedList);
        }
    }
}
```

::: warning 关键使用与坑点提示
1. **调用前必须保证缓冲区整洁**：当你使用 `prepare(...)` + `ProjectionRenderer.renderAll(...)` 时，不会帮你自动刷新外部 `MultiBufferSource.BufferSource`；务必在调用 `renderAll` 前手动执行 `bufferSource.endBatch()`（而直接调用 `renderer.render(...)` 重载方法时，内部已自动为你刷新传入的 `buffers`）。
2. **`alpha` 范围严格校验**：`rebuild(scene, alpha)` 的 `alpha` 必须处于 `[0, 255]` 闭区间内，越界将立即抛出 `IllegalArgumentException`。
3. **仅限渲染线程**：`rebuild`、`render`、`prepare`、`renderAll` 与 `close` 均会操作 OpenGL 缓冲区与纹理状态，**严禁**在后台工作线程或逻辑 Tick 线程调用。
4. **镜像变换兼容**：如果结构发生镜像翻转导致 `pose.last().pose().determinant3x3() < 0`，`ProjectionRenderer` 会自动临时切换 OpenGL 正面朝向（`GL_FRONT_FACE`）并在绘制后恢复，无需手动翻转绕序。
:::

## 公开 API 签名与参数细节

### `ProjectionRenderer`

包名：`dev.anvilcraft.lib.v2.rendering.projection` · 实现：`java.lang.AutoCloseable`

| 方法签名 | 参数 / 返回值 | 说明 |
| --- | --- | --- |
| `ProjectionRenderer()` | 无参构造器 | 创建一个未烘焙的空渲染器实例，此时 `isValid()` 为 `false` |
| `boolean isValid()` | 返回当前显存网格是否可用 | 判断当前渲染器代际是否与 `ProjectionShaders` 最新代数一致；在首次 `rebuild` 前或 `F3+T` 重载后返回 `false` |
| `void rebuild(ProjectionScene view, int alpha)` | `view`: 结构场景；`alpha`: 透明度 `[0, 255]` | 烘焙场景中的方块网格（`renderBatched`）、流体网格（`renderLiquid`）并收集方块实体与实体引用；若当前 `alpha` 非法会抛出 `IllegalArgumentException` |
| `void render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers)` | `pose`: 模型视图矩阵栈；`projectionMatrix`: 投影矩阵；`buffers`: 待刷新的缓冲源 | 刷新 `buffers` 并无条件绘制场景内所有方块、方块实体与实体 |
| `void render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers, BlockGetter level, BlockPos origin)` | 额外传入 `level` 与放置锚点 `origin` | 等价于构造 `prepare(...)`，刷新 `buffers`，再调用 `renderAll(List.of(prepared))` |
| `@Nullable Prepared prepare(PoseStack pose, Matrix4f projectionMatrix, BlockGetter level, BlockPos origin)` | 返回不可变渲染快照 `Prepared`；若渲染器尚未有效烘焙或无内容可绘则返回 `null` | 复制当前矩阵并将场景局部坐标与真实世界 `level` 从 `origin` 开始逐一比对，生成缺失/错位差异掩码 |
| `static void renderAll(List<Prepared> projections)` | `projections`: 本帧待绘制的 `Prepared` 列表 | 对所有投影统一依次执行：Depth-Only 通道、Ghost 颜色及实体通道、错误状态叠加盒通道 |
| `void close()` | 无 | 释放内部 `ProjectionMesh`、`ProjectionBuffers` 与 `ProjectionOverlay` 占用的原生内存和 GL 对象，并将内部状态重置为未烘焙 |

### `ProjectionRenderer.Prepared`

由 `ProjectionRenderer.prepare(...)` 创建的**单帧渲染快照**（`public final class Prepared`），保存了矩阵副本与逐方块差异 bitset，仅用于当帧立即传递给 `ProjectionRenderer.renderAll(...)`，不应跨帧持久化保存。
