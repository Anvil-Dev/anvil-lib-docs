# Projection Renderer & Overlay (`ProjectionRenderer`)

After building a `ProjectionScene`, **`ProjectionRenderer`** is responsible for pre-baking the structure into VRAM, comparing block-by-block against the real world, and outputting to the screen in proper translucency order.

## Core Rendering Challenges Solved

Translucent holographic building projections in Minecraft's render pipeline typically face three pain points:

1. **Separating baking from rendering**: You cannot re-bake every block model in a structure every frame; instead, call `rebuild(...)` once when the structure or alpha changes, and submit only GPU static VBOs + dynamic BE/entities each frame.
2. **Internal face overdraw**: Drawing translucent projections with simple blending causes messy, muddy double-blending when looking through front glass/slabs at rear blocks. `ProjectionRenderer` uses a **Depth-Only Prepass + Depth-Equal Color Pass** to eliminate internal ghosting.
3. **Multi-projection sorting**: When multiple blueprint projections are active in a scene, rendering them one by one causes later projections to be wrongly occluded by earlier ones' depth. `prepare(...)` + `ProjectionRenderer.renderAll(...)` batches the depth pass, color pass, and validation overlay pass across all `Prepared` snapshots.

## Choosing a Render Mode

| Mode | Use Case | Validation Highlights (Red/Yellow Boxes) |
| --- | --- | --- |
| `render(pose, projectionMatrix, buffers)` | Unconditionally draws all structure blocks and entities in display UIs or fixed world previews | Disabled |
| `render(pose, projectionMatrix, buffers, level, origin)` | Single world placement guide; auto-hides correctly built blocks and marks errors | Enabled |
| `prepare(...)` + `ProjectionRenderer.renderAll(list)` | **Multiple** blueprint projections in the world needing unified depth/color/overlay batching | Enabled |

## Validation Diff Rules (Red/Yellow Highlights & Hiding)

When real `level` and anchor `origin` are passed, the renderer checks every expected `localPos` in `ProjectionScene` against `level.getBlockState(origin.offset(localPos))`:

1. **World is air (`worldState.isAir()`)**: Not yet built -> marked `missing`, renders **translucent ghost block** and its block entity.
2. **World has the same block with mismatched state (`worldState.is(expected.getBlock()) && !worldState.equals(expected)`)**: e.g., wrong stair facing or slab half -> hides ghost block, marks `wrongStates`, and renders an **amber highlight box (`0x70FFCC00`)** inflated by `0.05F`.
3. **World has a completely different non-air block**: Wrong block type -> hides ghost block, marks `wrongBlocks`, and renders a **red highlight box (`0x70FF3333`)**.
4. **World state matches expected completely**: Neither ghost block nor highlight box is drawn (complete).

## Full Code Example: Multi-Projection World Rendering & Hot-Reload Handling

The example below manages multiple structure projections in `RenderLevelStageEvent`, including shader hot-reload checks, `prepare` + `renderAll` batching, and mirror matrix support:

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
            // Check if not yet baked or if F3+T invalidated core shader generation
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
            // Must call close() explicitly to free VertexBuffer and off-heap memory
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
            // Flush main buffer pool first so external translucent draws don't interfere with GL state
            mc.renderBuffers().bufferSource().endBatch();
            // Execute in order: 1. all depths -> 2. all color/entities -> 3. all red/yellow diff boxes
            ProjectionRenderer.renderAll(preparedList);
        }
    }
}
```

::: warning Critical Usage & Pitfall Notes
1. **Ensure clean buffers before calling**: When using `prepare(...)` + `ProjectionRenderer.renderAll(...)`, external `MultiBufferSource.BufferSource` is not flushed automatically; call `bufferSource.endBatch()` before `renderAll` (direct `renderer.render(...)` overloads flush `buffers` automatically).
2. **Strict `alpha` bounds**: `alpha` in `rebuild(scene, alpha)` must be in `[0, 255]`, else `IllegalArgumentException` is thrown immediately.
3. **Render thread only**: `rebuild`, `render`, `prepare`, `renderAll`, and `close` manipulate OpenGL buffers and texture state—**never** call them on background or logic tick threads.
4. **Mirror transform compatibility**: If a mirror transform makes `pose.last().pose().determinant3x3() < 0`, `ProjectionRenderer` automatically flips `GL_FRONT_FACE` temporarily and restores it afterward—no manual winding reversal needed.
:::

## Public API Signatures & Parameter Details

### `ProjectionRenderer`

Package: `dev.anvilcraft.lib.v2.rendering.projection` · Implements: `java.lang.AutoCloseable`

| Method Signature | Parameters / Return | Description |
| --- | --- | --- |
| `ProjectionRenderer()` | No-arg constructor | Creates an unbaked empty renderer (`isValid()` is `false`) |
| `boolean isValid()` | Returns whether the VRAM mesh is usable | Checks if this renderer's generation matches `ProjectionShaders`'s latest generation; returns `false` before first `rebuild` or after `F3+T` reload |
| `void rebuild(ProjectionScene view, int alpha)` | `view`: structure scene; `alpha`: opacity `[0, 255]` | Bakes block (`renderBatched`) and fluid (`renderLiquid`) meshes and collects BE/entity references; throws `IllegalArgumentException` if `alpha` is invalid |
| `void render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers)` | `pose`: model-view stack; `projectionMatrix`: projection matrix; `buffers`: buffer source to flush | Flushes `buffers` and unconditionally renders all blocks, block entities, and entities in the scene |
| `void render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers, BlockGetter level, BlockPos origin)` | Also takes `level` and placement anchor `origin` | Equivalent to `prepare(...)`, flushing `buffers`, and calling `renderAll(List.of(prepared))` |
| `@Nullable Prepared prepare(PoseStack pose, Matrix4f projectionMatrix, BlockGetter level, BlockPos origin)` | Returns immutable `Prepared` snapshot, or `null` if unbaked/empty | Copies matrices and diffs local scene coords against `level` at `origin` to build missing/mismatch masks |
| `static void renderAll(List<Prepared> projections)` | `projections`: `Prepared` list for this frame | Sequentially runs across all projections: Depth-Only pass, Ghost color & entity pass, and error overlay boxes |
| `void close()` | `void` | Frees native memory and GL objects held by `ProjectionMesh`, `ProjectionBuffers`, and `ProjectionOverlay`, resetting to unbaked |

### `ProjectionRenderer.Prepared`

Single-frame render snapshot (`public final class Prepared`) created by `ProjectionRenderer.prepare(...)`, holding matrix copies and per-block diff bitsets for immediate consumption by `ProjectionRenderer.renderAll(...)`—do not persist across frames.
