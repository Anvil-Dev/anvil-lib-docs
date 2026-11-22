# GUI Picture-in-Picture (PiP) & Fake World Access (`gui` / `state` / `fakeworld`)

<BranchContextCard branch="26.2" />

In Minecraft 26.2, vanilla GUI rendering moved completely to a deferred submission architecture based on `GuiGraphicsExtractor`, `GuiElementRenderState`, and `PictureInPictureRenderState` (offscreen PiP rendering).

`module.rendering` builds a suite of high-level GUI rendering helpers (`GuiRenderExtras`, `GuiGraphicsExtractorExtension`, `LibGuiElementRenderState`) and a client-side fake level view (`FakeDisplayLevel`) around this architecture, allowing you to render in a single line inside GUIs, JEI recipe pages, or guidebooks:
- Item icons with arbitrary opacity (`itemWithTransparency`);
- Dynamic `GpuTextureView` framebuffer textures (`blitDynamicTexture`);
- 3D Picture-in-Picture (PiP) rotating renders of any single block/block entity (`tessellateBlock`) or entire multiblock structure (`submitStructure`, even supporting `glitched = true` glitch art post-processing)!

---

## 1. Full Code Example: Rendering Translucent Items, 3D Rotating Blocks & FakeWorld Structure Previews in GUI

```java
package com.example.mymod.client.gui;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.anvilcraft.lib.v2.rendering.foundation.fakeworld.FakeDisplayLevel;
import dev.anvilcraft.lib.v2.rendering.gui.GuiRenderExtras;
import dev.anvilcraft.lib.v2.rendering.util.Timer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;
import net.minecraft.world.level.material.Fluids;

public final class ManualStructureWidgetExample {
    private static FakeDisplayLevel cachedFakeLevel;

    private ManualStructureWidgetExample() {
    }

    public static FakeDisplayLevel getOrCreateFakeLevel() {
        ClientLevel clientLevel = Minecraft.getInstance().level;
        if (clientLevel == null) return null;
        if (cachedFakeLevel == null) {
            cachedFakeLevel = new FakeDisplayLevel(clientLevel);
            // Populate a 3x2x3 structure in the fake world (including fluids and block states)
            for (int x = -1; x <= 1; x++) {
                for (int z = -1; z <= 1; z++) {
                    cachedFakeLevel.setBlock(new BlockPos(x, 0, z), Blocks.STONE_BRICKS.defaultBlockState(), 0, 0);
                }
            }
            cachedFakeLevel.setFluidState(new BlockPos(0, 1, 0), Fluids.LAVA.defaultFluidState());
        }
        return cachedFakeLevel;
    }

    public static void renderManualPage(GuiGraphicsExtractor graphics, int guiLeft, int guiTop) {
        // 1. Draw a 50%-opacity ghost item hint
        GuiRenderExtras.itemWithTransparency(
            graphics,
            new ItemStack(Items.DIAMOND_PICKAXE),
            guiLeft + 16,
            guiTop + 16,
            0.5f
        );

        // 2. Build a time-rotating 3D transform matrix
        PoseStack pose3D = new PoseStack();
        float angle = (System.currentTimeMillis() % 10000L) / 10000.0f * 360.0f;
        pose3D.mulPose(Axis.XP.rotationDegrees(-30.0f));
        pose3D.mulPose(Axis.YP.rotationDegrees(angle));

        // 3. Draw a lit 3D furnace block at 32x32 size at (guiLeft + 48, guiTop + 16)
        GuiRenderExtras.tessellateBlock(
            graphics,
            Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.LIT, true),
            guiLeft + 48,
            guiTop + 16,
            true,
            pose3D
        );

        // 4. Render the entire FakeDisplayLevel structure as PiP in the right-hand GUI area (120x120)
        FakeDisplayLevel fakeLevel = getOrCreateFakeLevel();
        if (fakeLevel != null) {
            GuiRenderExtras.submitStructure(
                graphics,
                fakeLevel,
                new BlockPos(-1, 0, -1),
                new BlockPos(1, 1, 1),
                guiLeft + 100,
                guiTop + 16,
                guiLeft + 220,
                guiTop + 136,
                16.0f, // Scale factor
                true,  // Enable ambient occlusion (AO)
                false, // Whether to apply GlitchPostEffect
                pose3D,
                (collector, stack) -> {
                    // Optional callback: submit extra custom geometry or highlight indicators inside the structure
                }
            );
        }
    }
}
```

---

## 2. `GuiRenderExtras` & `GuiGraphicsExtractorExtension` API Reference

### 1. `GuiRenderExtras` (`dev.anvilcraft.lib.v2.rendering.gui.GuiRenderExtras`)

| Category | Method Signatures | Description |
| :--- | :--- | :--- |
| **Translucent Item** | `public static void itemWithTransparency(GuiGraphicsExtractor extractor, ItemStack stack, int x, int y, float alpha)` | Renders an item icon at `(x, y)` with opacity `alpha` (`0.0f–1.0f`). Internally implemented via `GuiGraphicsExtractorExtension.of(extractor).translucentItem(...)`. |
| **Dynamic Texture Blit** | `public static void blitDynamicTexture(GuiGraphicsExtractor extractor, Supplier<GpuTextureView> texture, GpuSampler sampler, int x0, int y0, int x1, int y1, float u0, float v0, float u1, float v1)` | Submits `DynamicTextureBlitRenderState` to draw a dynamically generated `GpuTextureView` (e.g., offscreen framebuffer or blur texture) into rectangle `(x0, y0) -> (x1, y1)` during the GUI pass. |
| **Single-Block 3D PiP** | • `tessellateBlock(extractor, blockState, @Nullable level, @Nullable blockPos, float x0, float y0, float x1, float y1, int color, boolean ambientOcclusion, PoseStack.Pose / PoseStack pose3D)`<br>• Plus overloads omitting `color`, `x1/y1` (specifying `width` or default `32x32`), `level/blockPos`, and `pose3D` (`IDENTITY_POSE_3D`), **8 overloads total** | Submits `BlockStatePipRenderingState` for offscreen rendering of a single block by `BlockStatePipRenderer`; if `level` and `blockPos` have a `BlockEntity` with a `BlockEntityRenderer`, it is automatically rendered too! |
| **Multiblock Structure 3D PiP** | • `submitStructure(extractor, BlockAndTintGetter structureAccess, BlockPos startPos, BlockPos endPos, float x0, float y0, float x1, float y1, float scale, boolean ambientOcclusion, boolean glitched, PoseStack / PoseStack.Pose pose3D, [BiConsumer<SubmitNodeCollector, PoseStack> drawAdditionalCallback])`<br>• Plus overloads with default `scale = 32.0f, ambientOcclusion = false, glitched = false`, **6 overloads total** | Submits `StructurePipRenderingState` for offscreen rendering of all blocks, fluids, block entities, and `drawAdditionalCallback` extras within `BlockPos.betweenClosed(startPos, endPos)` via `StructurePipRenderer`. If `glitched = true`, applies `GlitchPostEffect` after rendering. |

### 2. `GuiGraphicsExtractorExtension` (`GuiGraphicsExtractor` Injected Extension Interface)

| Method Signature | Description |
| :--- | :--- |
| `static GuiGraphicsExtractorExtension of(GuiGraphicsExtractor thiz)` | Casts a vanilla `GuiGraphicsExtractor` to the extension interface. |
| `default void translucentItem(ItemStack stack, int x, int y, float alpha)`<br>`void translucentItem(@Nullable LivingEntity owner, @Nullable Level level, ItemStack stack, int x, int y, float alpha, int seed)` | Renders an item model with `alpha` transparency. |

---

## 3. Custom GUI Render State Interfaces (`LibGuiElementRenderState` / `LibQuadGuiElementRenderState`)

Located in `dev.anvilcraft.lib.v2.rendering.state`. In Minecraft 26.2, vanilla `GuiElementRenderState` does not support binding custom Uniform Buffers (`UBO`) before drawing a GUI `RenderPass`. `module.rendering` detects `LibGuiElementRenderState` in `GuiRendererMixin` and runs its hooks automatically:

| Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| `LibGuiElementRenderState` | • `default Map<String, GpuBufferSlice> bufferSlices()` (returns empty Map by default)<br>• `default void executeDrawBeforeSetPipeline(RenderPass renderPass)` (binds `bufferSlices()` via `renderPass.setUniform` by default)<br>• `default void executeDrawAfterSetPipeline(RenderPass renderPass)`<br>• `static @Nullable ScreenRectangle getBounds(Matrix3x2f pose, float x0, float y0, float x1, float y1, @Nullable ScreenRectangle scissorArea)` | Extends vanilla `GuiElementRenderState`. Any render state needing custom shaders and UBOs in GUI (`SdfGraphics`, font rendering, etc.) can implement this interface. |
| `LibQuadGuiElementRenderState` | `Matrix3x2f pose()`, `float x0()`, `float y0()`, `float x1()`, `float y1()`, `int color()`; default implementations of `buildVertices(VertexConsumer)` and `textureSetup()` | Extends `LibGuiElementRenderState`, providing default 4-vertex quad assembly for untextured solid/shader rectangle elements. |

---

## 4. Fake World Access & Render Helpers (`fakeworld` / `util`)

Located in `dev.anvilcraft.lib.v2.rendering.foundation.fakeworld` and `dev.anvilcraft.lib.v2.rendering.util`.

| Class | Key Constructors / Method Signatures | Description |
| :--- | :--- | :--- |
| **`FakeDisplayLevel`** | • `public FakeDisplayLevel(ClientLevel delegate)`<br>• `public boolean setBlock(BlockPos pos, BlockState state, int flags, int limit)`<br>• `public void setFluidState(BlockPos pos, FluidState fluidState)`<br>• `public void setBlockEntity(BlockEntity be)` / `setBlockEntity(BlockPos pos, @Nullable BlockEntity be)`<br>• `public boolean addFreshEntity(Entity entity)` | Extends `net.minecraft.world.level.Level` and implements `BlockAndTintGetter`. Delegates read-only properties (registries, clock, feature flags, world border) to the real `ClientLevel` while storing blocks, fluids, block entities, and entities in isolated in-memory `HashMap`s (biome tint defaults to `Biomes.PLAINS`), ideal as a virtual level for `StructurePipRenderer` or custom previews. |
| `SimpleTintedEmptyLevelAccess` | `public SimpleTintedEmptyLevelAccess()` | Empty `BlockAndTintGetter` view (returns air and empty fluids everywhere, biome tint `Biomes.PLAINS`). |
| `SimpleDelegatingTintAccess` | `public SimpleDelegatingTintAccess(BlockAndTintGetter level)` | Delegates block/fluid/BE queries to `level`, but fixes `cardinalLighting` to `DEFAULT` and biome tint to `Biomes.PLAINS`. |
| `SimpleOffsetBlockAccess` | `public SimpleOffsetBlockAccess(BlockAndTintGetter level, BlockPos offset)` | Extends `SimpleDelegatingTintAccess`, automatically adding `pos.offset(offset)` when querying `getBlockState(pos)`. |
| `Timer` | `public static final int ONE_DAY_TICKS = 1728000`<br>`public static float getPartialTick()` | Returns the current client frame's `GameTimeDeltaPartialTick` (modulo ticks per day). |
| `ALRRenderTypeExtension` | `static RenderType copyWithBloom(RenderType that)`<br>`static void setRenderingBloomed(RenderType thiz, boolean value)`<br>`static boolean isRenderingBloomed(RenderType thiz)` | Marks or clones a `RenderType` with Bloom dual-write rendering enabled. |
