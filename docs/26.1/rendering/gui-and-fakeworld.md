# GUI 画中画 (PiP) 与假世界访问 (`gui` / `state` / `fakeworld`)

<BranchContextCard branch="26.1" />

在 Minecraft 26.1 中，原版 GUI 渲染全面转向了基于 `GuiGraphicsExtractor`、`GuiElementRenderState` 与 `PictureInPictureRenderState`（画中画离屏渲染状态）的延迟提交架构。

`module.rendering` 围绕这一新架构提供了一整套高阶 GUI 渲染辅助工具（`GuiRenderExtras`、`GuiGraphicsExtractorExtension`、`LibGuiElementRenderState`）以及客户端假世界视图（`FakeDisplayLevel`），使开发者只需一行代码即可在 GUI 界面、JEI 配方页面或指导手册中：
- 绘制带任意透明度的物品图标（`itemWithTransparency`）；
- 绘制动态 `GpuTextureView` 帧缓冲纹理（`blitDynamicTexture`）；
- 以 3D 画中画（PiP）方式旋转渲染任意单个方块/方块实体（`tessellateBlock`）或整座多方块结构（`submitStructure`，甚至支持一键开启 `glitched = true` 故障艺术特效）！

---

## 一、 完整代码示例：在 GUI 界面中渲染半透明物品、3D 旋转方块与假世界结构预览

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
            // 在假世界中布置一个 3x2x3 的结构（含流体与方块状态）
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
        // 1. 绘制 50% 不透明度的幽灵物品提示
        GuiRenderExtras.itemWithTransparency(
            graphics,
            new ItemStack(Items.DIAMOND_PICKAXE),
            guiLeft + 16,
            guiTop + 16,
            0.5f
        );

        // 2. 构造随时间自动旋转的 3D 变换矩阵
        PoseStack pose3D = new PoseStack();
        float angle = (System.currentTimeMillis() % 10000L) / 10000.0f * 360.0f;
        pose3D.mulPose(Axis.XP.rotationDegrees(-30.0f));
        pose3D.mulPose(Axis.YP.rotationDegrees(angle));

        // 3. 在 GUI (guiLeft + 48, guiTop + 16) 处以 32x32 尺寸绘制点燃的 3D 熔炉方块
        GuiRenderExtras.tessellateBlock(
            graphics,
            Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.LIT, true),
            guiLeft + 48,
            guiTop + 16,
            true,
            pose3D
        );

        // 4. 在 GUI 右侧区域 (120x120) 以画中画渲染整个 FakeDisplayLevel 结构
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
                16.0f, // 缩放系数
                true,  // 启用环境光遮蔽 (AO)
                false, // 是否应用 GlitchPostEffect 故障特效
                pose3D,
                (collector, stack) -> {
                    // 可选附加回调：在结构中额外提交自定义几何体或高亮指示器
                }
            );
        }
    }
}
```

---

## 二、 `GuiRenderExtras` 与 `GuiGraphicsExtractorExtension` API 详解

### 1. `GuiRenderExtras`（`dev.anvilcraft.lib.v2.rendering.gui.GuiRenderExtras`）

| 方法分类 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **半透明物品** | `public static void itemWithTransparency(GuiGraphicsExtractor extractor, ItemStack stack, int x, int y, float alpha)` | 在 `(x, y)` 处以不透明度 `alpha`（`0.0f ~ 1.0f`）渲染物品图标。内部通过 `GuiGraphicsExtractorExtension.of(extractor).translucentItem(...)` 实现。 |
| **动态纹理绘制** | `public static void blitDynamicTexture(GuiGraphicsExtractor extractor, Supplier<GpuTextureView> texture, GpuSampler sampler, int x0, int y0, int x1, int y1, float u0, float v0, float u1, float v1)` | 提交 `DynamicTextureBlitRenderState`，在 GUI 渲染通道中将动态生成的 `GpuTextureView`（如离屏帧缓冲或模糊纹理）绘制到矩形 `(x0, y0) -> (x1, y1)`。 |
| **单方块 3D 画中画** | • `tessellateBlock(extractor, blockState, @Nullable level, @Nullable blockPos, float x0, float y0, float x1, float y1, int color, boolean ambientOcclusion, PoseStack.Pose / PoseStack pose3D)`<br>• 以及省略 `color`、省略 `x1/y1`（指定 `width` 或默认 `32x32`）、省略 `level/blockPos`、省略 `pose3D`（使用单位矩阵 `IDENTITY_POSE_3D`）的共 **8 个重载** | 提交 `BlockStatePipRenderingState`，由 `BlockStatePipRenderer` 离屏渲染单个方块；若传入的 `level` 与 `blockPos` 处存在 `BlockEntity` 且有对应的 `BlockEntityRenderer`，还会自动一并渲染该方块实体！ |
| **多方块结构 3D 画中画** | • `submitStructure(extractor, BlockAndTintGetter structureAccess, BlockPos startPos, BlockPos endPos, float x0, float y0, float x1, float y1, float scale, boolean ambientOcclusion, boolean glitched, PoseStack / PoseStack.Pose pose3D, [BiConsumer<SubmitNodeCollector, PoseStack> drawAdditionalCallback])`<br>• 以及默认 `scale = 32.0f, ambientOcclusion = false, glitched = false` 的共 **6 个重载** | 提交 `StructurePipRenderingState`，由 `StructurePipRenderer` 离屏渲染 `BlockPos.betweenClosed(startPos, endPos)` 范围内的所有方块、流体、方块实体及 `drawAdditionalCallback` 附加内容。若 `glitched = true`，会在渲染完成后自动套用 `GlitchPostEffect` 故障艺术滤镜。 |

### 2. `GuiGraphicsExtractorExtension`（`GuiGraphicsExtractor` 注入扩展接口）

| 方法签名 | 说明 |
| :--- | :--- |
| `static GuiGraphicsExtractorExtension of(GuiGraphicsExtractor thiz)` | 将原版 `GuiGraphicsExtractor` 强转为扩展接口。 |
| `default void translucentItem(ItemStack stack, int x, int y, float alpha)`<br>`void translucentItem(@Nullable LivingEntity owner, @Nullable Level level, ItemStack stack, int x, int y, float alpha, int seed)` | 渲染带 `alpha` 透明度的物品模型。 |

---

## 三、 自定义 GUI 渲染状态接口 (`LibGuiElementRenderState` / `LibQuadGuiElementRenderState`)

位于 `dev.anvilcraft.lib.v2.rendering.state`。在 Minecraft 26.1 中，原版 `GuiElementRenderState` 不支持在 GUI `RenderPass` 绘制前绑定自定义 Uniform Buffer (`UBO`)。`module.rendering` 通过 `GuiRendererMixin` 识别实现了 `LibGuiElementRenderState` 的状态对象并在绘制时自动执行钩子：

| 接口名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `LibGuiElementRenderState` | • `default Map<String, GpuBufferSlice> bufferSlices()`（默认返回空 Map）<br>• `default void executeDrawBeforeSetPipeline(RenderPass renderPass)`（默认将 `bufferSlices()` 逐一通过 `renderPass.setUniform` 绑定）<br>• `default void executeDrawAfterSetPipeline(RenderPass renderPass)`<br>• `static @Nullable ScreenRectangle getBounds(Matrix3x2f pose, float x0, float y0, float x1, float y1, @Nullable ScreenRectangle scissorArea)` | 继承自原版 `GuiElementRenderState`。任何需要在 GUI 中使用自定义着色器与 UBO 的渲染状态（如 `SdfGraphics`、字体渲染）均可实现此接口。 |
| `LibQuadGuiElementRenderState` | `Matrix3x2f pose()`、`float x0()`、`float y0()`、`float x1()`、`float y1()`、`int color()`；默认实现 `buildVertices(VertexConsumer)` 与 `textureSetup()` | 继承自 `LibGuiElementRenderState`，为无纹理纯色/着色器矩形元素提供默认的 4 顶点组装实现。 |

---

## 四、 假世界访问与渲染辅助工具 (`fakeworld` / `util`)

位于 `dev.anvilcraft.lib.v2.rendering.foundation.fakeworld` 与 `dev.anvilcraft.lib.v2.rendering.util`。

| 类名 | 关键构造器 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`FakeDisplayLevel`** | • `public FakeDisplayLevel(ClientLevel delegate)`<br>• `public boolean setBlock(BlockPos pos, BlockState state, int flags, int limit)`<br>• `public void setFluidState(BlockPos pos, FluidState fluidState)`<br>• `public void setBlockEntity(BlockEntity be)` / `setBlockEntity(BlockPos pos, @Nullable BlockEntity be)`<br>• `public boolean addFreshEntity(Entity entity)` | 继承自 `net.minecraft.world.level.Level` 并实现 `BlockAndTintGetter`。底层将注册表、时钟、特征标志、世界边界等只读属性委托给真实的 `ClientLevel`，而在独立的内存 `HashMap` 中存储方块、流体、方块实体与实体（生物群系染色默认使用平原 `Biomes.PLAINS`），非常适合作为 `StructurePipRenderer` 或自定义预览的虚拟世界。 |
| `SimpleTintedEmptyLevelAccess` | `public SimpleTintedEmptyLevelAccess()` | 实现 `BlockAndTintGetter` 的空世界视图（所有位置返回空气与空流体，生物群系染色取平原 `Biomes.PLAINS`）。 |
| `SimpleDelegatingTintAccess` | `public SimpleDelegatingTintAccess(BlockAndTintGetter level)` | 将方块/流体/方块实体查询委托给 `level`，但将 `cardinalLighting` 固定为 `DEFAULT`、将生物群系染色固定为平原 `Biomes.PLAINS`。 |
| `SimpleOffsetBlockAccess` | `public SimpleOffsetBlockAccess(BlockAndTintGetter level, BlockPos offset)` | 继承自 `SimpleDelegatingTintAccess`，在查询 `getBlockState(pos)` 时自动加上偏移量 `pos.offset(offset)`。 |
| `Timer` | `public static final int ONE_DAY_TICKS = 1728000`<br>`public static float getPartialTick()` | 获取当前客户端帧的 `GameTimeDeltaPartialTick`（对一天 Tick 数取模）。 |
| `ALRRenderTypeExtension` | `static RenderType copyWithBloom(RenderType that)`<br>`static void setRenderingBloomed(RenderType thiz, boolean value)`<br>`static boolean isRenderingBloomed(RenderType thiz)` | 标记或克隆开启了泛光（Bloom）双写渲染的 `RenderType`。 |
