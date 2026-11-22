# Cube Sloped Edges & Precise Picking: Overview & Quick Setup (`module.cube`)

<BranchContextCard branch="1.21.4" />

`module.cube` (artifact `anvillib-cube-neoforge-1.21.4`, package `dev.anvilcraft.lib.v2.cube`) is a client-only **precise block model ray-picking and 3D sloped-edge outline highlighting engine**.

In vanilla Minecraft, no matter how detailed your block JSON model (`BlockModel`) is—e.g., 22.5° / 45° diagonal struts, sloped machine housings, or overhanging rotating arms driven by a `BlockEntityRenderer` (BER)—vanilla always picks and draws outlines using coarse axis-aligned `VoxelShape` boxes.

With `module.cube`, **a single call to `CubeSelection.enableNamespace(MOD_ID)` during client init**:
1. **Automatically decodes baked models**: During resource-pack model baking, captures all block JSON model elements in your namespace (including rotated `BlockElement`s, `WeightedBakedModel`, and `MultiPartBakedModel`) into closed convex polyhedra (`SelectionGeometry`);
2. **Precise crosshair ray picking**: Player crosshair raycasting automatically intersects the model's real 3D convex polyhedral surfaces (including sloped faces and overhangs extending outside `1×1×1`) without modifying server collision boxes or entity physics;
3. **Coplanar seam culling & view-silhouette edge highlighting**: Background threads perform boolean clipping of internal overlaps, coplanar seams, and tiny offset seams with silhouette culling, drawing crisp true model outlines when pointing at blocks; also supports resource-pack overrides via `anvillib/cube_selection.json` (`model`, `outline`, or `vanilla`).

This module is split into 3 sub-documents by functionality:
- **This page (Overview & Quick Setup)**: Covers `CubeSelection` namespace opt-in, block exclusions, runtime conditional exclusions, dynamic BER parts, and resource-pack rules.
- **[Precise Picking & Outline Render Pipeline](./picking-and-selection)**: Covers `CubeSelection`, `SelectionPart`, `BlockSelectionProvider`, `CubePicking`, `OutlineRenderer`, and client events.
- **[Model Decoding & Convex Geometry](./model-and-geometry)**: Covers `CubeModelDecoder`, `ModelCapture`, `ModelSelection`, `ModelSelections`, `ConvexShape`, `SelectionGeometry`, `OutlineBuilder`, `PackedOutline`, and `OutlineCache`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.4`, this module is included automatically. To depend on `cube` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-cube-neoforge-1.21.4:2.0.0")
}
```

---

## 2. Full Code Example: Enabling Namespace, Exclusions & Dynamic BER Parts

```java
package com.example.mymod.client;

import com.example.mymod.MyMod;
import com.example.mymod.block.entity.RoboticArmBlockEntity;
import com.example.mymod.init.ModBlocks;
import com.mojang.math.Axis;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.SelectionPart;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.AABB;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import org.joml.Matrix4f;

import java.util.List;

@EventBusSubscriber(modid = MyMod.MOD_ID, value = Dist.CLIENT)
public final class MyModCubeClientSetup {
    // Pre-build immutable local geometry for the moving arm (build once, reuse across frames)
    private static final SelectionGeometry ARM_BOOM_GEOMETRY = new SelectionGeometry(List.of(
        ConvexShape.box(new AABB(6 / 16.0, 4 / 16.0, -12 / 16.0, 10 / 16.0, 8 / 16.0, 14 / 16.0))
    ));

    private MyModCubeClientSetup() {
    }

    @SubscribeEvent
    public static void onClientSetup(FMLClientSetupEvent event) {
        // 1. Enable precise model picking and sloped outline highlighting for the entire mod namespace
        // Note: must be called before initial model baking completes (e.g., client mod constructor or FMLClientSetupEvent)
        CubeSelection.enableNamespace(MyMod.MOD_ID);

        // 2. Permanently exclude specific blocks that don't need model outlines (e.g., fluid tanks or invisible trigger blocks)
        CubeSelection.exclude(ModBlocks.INVISIBLE_LIGHT_BLOCK.get());

        // 3. Register runtime dynamic exclusion rule (e.g., fall back to vanilla outlines when disabled in client config)
        CubeSelection.registerTargetExclusion(
            ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "disable_in_low_quality"),
            state -> !MyMod.CONFIG.enableHighPrecisionOutline
        );

        // 4. Register real-time picking and outline geometry for blocks with dynamic BlockEntityRenderer parts
        // Args: target block, max local bounds across all motion (within [-2, 3]), include static JSON model, dynamic part provider
        CubeSelection.registerDynamic(
            ModBlocks.ROBOTIC_ARM.get(),
            new AABB(-1.0, 0.0, -1.0, 2.0, 2.0, 2.0),
            true,
            (level, pos, state, partialTick) -> {
                if (!(level.getBlockEntity(pos) instanceof RoboticArmBlockEntity arm)) {
                    return List.of();
                }
                float angleDeg = Mth.lerp(partialTick, arm.prevYaw, arm.currentYaw);
                // Build local transform matrix matching BlockEntityRenderer exactly (rotating around block center (0.5, 0.5, 0.5))
                Matrix4f pose = new Matrix4f()
                    .translate(0.5F, 0.5F, 0.5F)
                    .rotate(Axis.YP.rotationDegrees(angleDeg))
                    .translate(-0.5F, -0.5F, -0.5F);

                return List.of(new SelectionPart(ARM_BOOM_GEOMETRY, pose));
            }
        );
    }
}
```

---

## 3. Resource Pack Rule Overrides (`anvillib/cube_selection.json`)

Resource pack authors can place `assets/<namespace>/anvillib/cube_selection.json` under any namespace to override default modes on every resource reload (merged in resource pack priority order):

```json
{
  "namespaces": {
    "my_mod": "model"
  },
  "blocks": {
    "my_mod:decorative_truss": "outline",
    "my_mod:legacy_machine": "vanilla"
  }
}
```

- `"model"`: enables model-level precise ray picking and sloped outline highlighting;
- `"outline"`: still bakes model geometry for outlines and `CubeSelection.outlineTarget`, but keeps vanilla `VoxelShape` ray picking (`CubeSelection.target` returns `null`);
- `"vanilla"`: skips model capture and falls back completely to vanilla.

---

## 4. Design Boundaries & Common Pitfalls

1. **When to call `enableNamespace`**:
   `CubeModelEvents` only captures and bakes blocks where `CubeSelection.isEnabled(block)` is `true` during client model baking (`ModelEvent.ModifyBakingResult` / `ModelEvent.BakingCompleted`). Therefore `CubeSelection.enableNamespace(MOD_ID)` **must be called during client initialization (`@Mod(value = MOD_ID, dist = Dist.CLIENT)` constructor or `FMLClientSetupEvent`)**.
2. **Model geometry bounds limit `[-2, 3]`**:
   Both static JSON models and `maximumBounds` in `registerDynamic` (expanded by `0.5` if `hasOffsetFunction()` is present) must have all local coordinates within **`[-2, 3]`** (extending at most 2 blocks outside the unit block, checked by `CubeSelection.supportedBounds`); models exceeding this are counted in `unsupportedStates` and fall back to vanilla `VoxelShape`.
3. **Flat / zero-thickness elements are skipped automatically**:
   Crossed grass or zero-thickness decal planes (zero extent on an axis) do not form 3D closed convex solids; `CubeModelDecoder` skips 0-thickness elements, and if a model consists solely of flat planes, that block state keeps its vanilla selection box.
4. **Affects client crosshair interaction only**:
   `CubePicking` only hooks `GameRenderer#pick` crosshair raycasting and **never modifies server-side block collision boxes, entity pathfinding, redstone sightlines, or projectile trajectories**, preventing anti-cheat or physics desync issues.
