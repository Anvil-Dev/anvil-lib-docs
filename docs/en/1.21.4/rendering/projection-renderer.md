# Projection Renderer & Overlay (`ProjectionRenderer` / `Overlay`)

`ProjectionRenderer` is the execution core of in-world structure ghost previews: it bakes `ProjectionScene`s into GPU vertex buffers, filters out already-built blocks against the real world in real time, and marks "wrong blocks" and "wrong block states" with translucent overlays.

## Render Pipeline Features

1. **Two-Pass Depth-Then-Color (`ProjectionRenderer.renderAll`)**: Runs `depthOnly = true` depth prepass across all placements first, then `depthOnly = false` color blending—completely eliminating internal translucent overlap and inter-structure sorting artifacts.
2. **Independent of Shader Stages**: Recommended to hook into `RenderLevelStageEvent.Stage.AFTER_LEVEL`, after main-world post-processing completes, avoiding conflicts with third-party shader packs.
3. **Built-in Diagnostic Overlay (`ProjectionOverlay`)**: Highlights `actual != expected` positions with boxes slightly inflated by `0.05F`:
   - **Same block, mismatched state** (e.g., facing or waterlogged): amber translucent overlay (`0x70FFCC00`);
   - **Completely wrong block type**: red translucent overlay (`0x70FF3333`).

## `ProjectionRenderer` Full API

`ProjectionRenderer` implements `AutoCloseable`; always call `close()` to free off-heap memory and VRAM `VertexBuffer`s when destroyed or replaced.

| Method Signature | Return Type | Description & Threading Requirements |
| --- | --- | --- |
| `isValid()` | `boolean` | Checks whether the baked mesh's `generation` still matches `ProjectionShaders` (becomes `false` after resource reload) |
| `rebuild(ProjectionScene view, int alpha)` | `void` | Must be called on the render thread (`RenderSystem.assertOnRenderThread()`); `alpha` is overall opacity in `0..255`. Bakes all static block models and fluids and collects non-null `BlockEntity` and `Entity` lists |
| `render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers)` | `void` | Renders the entire projection scene unconditionally without comparing against the real world (ideal for standalone prototypes or pure holograms) |
| `render(PoseStack pose, Matrix4f projectionMatrix, MultiBufferSource.BufferSource buffers, BlockGetter level, BlockPos origin)` | `void` | Compares build progress against real `level` starting at `origin` for a single instance, displaying wrong-state/wrong-block highlight boxes |
| `prepare(PoseStack pose, Matrix4f projectionMatrix, BlockGetter level, BlockPos origin)` | `@Nullable Prepared` | Collects `missing`, `wrongStates`, and `wrongBlocks` bitsets for this placement and returns a batchable handle; must be consumed in the same frame before the next `rebuild` |
| `ProjectionRenderer.renderAll(List<Prepared> projections)` | `static void` | Runs depth-only prepass across all `Prepared` instances first, then translucent color and entity feature passes, and finally diagnostic overlays |
| `close()` | `void` | Frees local off-heap vertex buffers, GL `VertexBuffer`s, `ProjectionOverlay`, and `ProjectionBuffers` |

> [!CAUTION]
> When passing a rotated or mirrored `PoseStack` (3x3 `determinant3x3() < 0`), `ProjectionRenderer.Prepared` automatically flips front-face winding via `GL11.glFrontFace(...)` and restores it afterward so mirrored blueprints are not backface-culled. Custom transform matrices work directly with `ProjectionRenderer`.

## Full Example: Multi-Placement In-World Projection & Build Diff Checking

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
