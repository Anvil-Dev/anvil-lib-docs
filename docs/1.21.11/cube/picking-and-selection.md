# 精确拾取与高亮渲染管线 (`dev.anvilcraft.lib.v2.cube.client`)

<BranchContextCard branch="1.21.11" />

本篇深入讲解 `module.cube` 在客户端运行时的核心状态中心 **`CubeSelection`**、可变换几何部件 **`SelectionPart`**、动态部件回调接口 **`BlockSelectionProvider`**、准星邻域射线拾取器 **`CubePicking`** 以及棱线渲染器 **`OutlineRenderer`**。

---

## 一、 核心公开类与接口 API 详解

### 1. `CubeSelection`（客户端选择与高亮注册中心）

位于 `dev.anvilcraft.lib.v2.cube.client.CubeSelection`。

| 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final int MAX_PARTS = 32` | `int` | 单个方块目标允许包含的最大 `SelectionPart` 部件数量（超出 32 个部件时回退原版）。 |
| `public static void enableNamespace(String namespace)` | `void` | 为指定模组命名空间下的所有方块开启模型精确拾取与斜棱线高亮（内部会通过 `Identifier.fromNamespaceAndPath` 校验命名空间合法性）。 |
| `public static void exclude(Block block)` | `void` | 永久排除指定方块，使其不使用模型几何拾取与高亮。 |
| `public static void registerTargetExclusion(Identifier id, Predicate<BlockState> exclusion)` | `void` | 注册带命名空间 `id` 的运行时动态排除规则。任意规则返回 `true` 时，`target` 与 `outlineTarget` 返回 `null`，精确拾取与默认模型高亮均回退原版。同一 `id` 重复注册会覆盖旧规则。 |
| `public static boolean unregisterTargetExclusion(Identifier id)` | `boolean` | 注销指定 `id` 的运行时排除规则，成功移除返回 `true`。 |
| `public static boolean isTargetExcluded(BlockState state)` | `boolean` | 检查给定 `BlockState` 是否被 `exclude(Block)` 或任一运行时规则排除。 |
| `public static void registerDynamic(Block block, AABB maximumBounds, boolean includeStaticModel, BlockSelectionProvider provider)` | `void` | 为动态渲染方块（如带 `BlockEntityRenderer` 的方块）注册实时部件提供器。<br>• `maximumBounds`：所有部件运动轨迹的最大包络包围盒（含 `hasOffsetFunction()` 扩展后必须满足 `supportedBounds`，否则抛 `IllegalArgumentException`）；<br>• `includeStaticModel`：是否同时合并该方块 JSON 模型的静态部件；<br>• `provider`：每帧提供动态 `List<SelectionPart>` 的回调。 |
| `public static boolean isEnabled(Block block)` | `boolean` | 检查当前规则下方块是否非 `VANILLA` 模式（含 `MODEL` 与仅描边的 `OUTLINE` 模式，均会参与模型几何烘焙）。 |
| `public static boolean supportedBounds(AABB bounds)` | `boolean` | 校验包围盒坐标是否有限且位于 `[-2, 3]` 闭区间内。 |
| `public static void install(ModelSelections.Snapshot snapshot)` | `void` | 安装新一轮烘焙好的模型选择快照并重建越界搜索半径缓存（同时清空上一轮轮廓缓存与帧缓存）。 |
| `public static void beginFrame(ClientLevel level, float fraction)` | `void` | 重置当前帧位置缓存并记录当前 `ClientLevel` 与 `partialTick`。 |
| `public static void clearWorld()` | `void` | 清空当前帧缓存、世界引用与后台轮廓缓存（通常在退出服务器时调用）。 |
| `public static @Nullable List<SelectionPart> modelParts(BlockState state, BlockPos pos)` | `@Nullable List<SelectionPart>` | 获取给定 `BlockState` 在坐标 `pos` 处（应用原版位置随机种子 `state.getSeed(pos)` 后）的静态模型部件列表，供自定义 BER 复用。 |
| `public static @Nullable Target target(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable Target` | 精确拾取入口：仅当方块处于 `MODEL` 模式时委托给 `outlineTarget(...)`，处于 `OUTLINE` 或 `VANILLA` 模式时直接返回 `null`。 |
| `public static @Nullable Target outlineTarget(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable Target` | 描边与预览共用的几何入口：解析并缓存（每帧最多缓存 256 个位置）指定方块位置的组合 `Target`。若触发排除规则、动态部件超出 `maximumBounds`、部件数 `> 32` 或总凸体数 `> 1024`，安全返回 `null`。 |
| `public static boolean extendsBlock(BlockState state)` | `boolean` | 判断处于 `MODEL` 模式的该方块状态其静态或动态几何是否超出了 `[0, 1]^3` 标准单格范围。 |
| `public static OutlineCache outlines()` | `OutlineCache` | 获取后台异步轮廓线构建缓存实例。 |
| `public static int searchRadius()` | `int` | 当前所有启用 `MODEL` 模式的静态与动态方块的最大越界格数半径（`0 ~ 2`）。 |
| `public static boolean active()` | `boolean` | 当前是否存在至少一个启用 `MODEL` 模式的已烘焙模型或动态方块。 |
| `public static Statistics statistics()` | `Statistics` | 获取当前已烘焙状态数、几何内存占用字节数、不支持状态数及轮廓缓存统计快照。 |

#### 内部记录类：`CubeSelection.Target` 与 `CubeSelection.Statistics`

| 记录类与方法 | 说明 |
| :--- | :--- |
| `record Target(BlockState state, List<SelectionPart> parts, Vec3 offset, @Nullable AABB bounds)`<br>• `public @Nullable BlockHitResult clip(BlockPos pos, Vec3 start, Vec3 end)` | 表示单个方块位置在当前帧的组合选择目标。`clip` 方法将世界射线 `[start, end]` 转换到减去 `pos + offset` 的方块局部空间，遍历所有 `SelectionPart` 求最近交点并构造带精确命中面朝向（`Direction.getApproximateNearest`）的 `BlockHitResult`。 |
| `record Statistics(int states, long geometryBytes, int unsupportedStates, OutlineCache.Statistics outlines)` | 诊断统计记录。 |

---

### 2. `SelectionPart` 与 `BlockSelectionProvider`

#### `BlockSelectionProvider`（函数式接口）

```java
@FunctionalInterface
public interface BlockSelectionProvider {
    List<SelectionPart> parts(ClientLevel level, BlockPos pos, BlockState state, float partialTick);
}
```

#### `SelectionPart`（带 4×4 刚体/仿射变换的几何部件）

位于 `dev.anvilcraft.lib.v2.cube.client.SelectionPart`。一个 `SelectionPart` 由一个不可变的局部 `SelectionGeometry` 和一个可选的 `Matrix4f` 变换矩阵组成（当矩阵为单位阵时自动走无矩阵快路径）：

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public SelectionPart(SelectionGeometry geometry)` | `SelectionPart` | 创建无额外变换（单位矩阵）的几何部件。 |
| `public SelectionPart(SelectionGeometry geometry, Matrix4f pose)` | `SelectionPart` | 创建带 `pose` 变换矩阵的几何部件。**注意**：`pose` 必须是可逆的有限矩阵（`|det| > 1e-12`），否则抛出 `IllegalArgumentException("SelectionPart pose must be finite and invertible")`。 |
| `public SelectionGeometry geometry()` | `SelectionGeometry` | 获取底层不可变几何体。 |
| `public AABB bounds()` | `AABB` | 获取经 `pose` 变换后的方块局部空间包围盒。 |
| `public boolean isIdentity()` | `boolean` | 判断变换矩阵是否为单位矩阵。 |
| `public @Nullable SelectionGeometry.RayHit clip(Vec3 start, Vec3 end)` | `@Nullable RayHit` | 将局部射线端点通过逆矩阵 `inverse` 变换到几何体内部空间求交，再将命中的表面法线通过转置逆矩阵 `(M^-1)^T` 变换回方块局部空间。 |
| `public Vec3 localPosition(Vec3 position)` | `Vec3` | 将方块局部空间坐标（如相机相对坐标）通过逆矩阵变换到该部件的几何体内部坐标系（用于计算视角相关的接缝消隐）。 |
| `public void apply(PoseStack stack)` | `void` | 若非单位矩阵，将 `pose` 乘入 `stack.last()`（同时更新顶点矩阵与法线矩阵）。 |
| `public List<ConvexShape> blockSpaceShapes()` | `List<ConvexShape>` | 将底层 `SelectionGeometry` 中的所有 `ConvexShape` 应用 `pose` 变换，返回方块空间下的凸多面体列表。 |

---

### 3. `OutlineRenderer`、`CubePicking` 与事件处理器

| 类名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| **`OutlineRenderer`** | • `public static void render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha)`<br>• `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments)`<br>• `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments, float lineWidth)` | 将 `PackedOutline` 中的三维线段写入 `VertexConsumer`（切向量方向使用 `pose.pose().transformDirection` 变换并归一化），返回实际绘制的线段数（默认 `maximumSegments = 4096`，`lineWidth = 2.5F`）。 |
| **`CubePicking`** | • `public static final double MAX_RANGE = 64`<br>• `public static HitResult pick(Entity entity, double range, float partialTick, boolean fluids)`<br>• `public static @Nullable CubeSelection.Target target(BlockGetter getter, BlockPos pos, BlockState state)` | 由 `LocalPlayerMixin` 在准星射线检测（`LocalPlayer#pick`）时调用。内部同时通过 `BlockGetterMixin` 拦截原版 `BlockGetter#clipWithInteractionOverride`，并在 `searchRadius() > 0` 时沿视线邻域补扫越界模型部件。 |
| **`CubeHighlightEvents`** | • `public static void highlight(ExtractBlockOutlineRenderStateEvent event)`<br>• `public static void disconnect(ClientPlayerNetworkEvent.LoggingOut event)` | 监听 `ExtractBlockOutlineRenderStateEvent`（`LOWEST` 优先级）：提取不可变轮廓几何与 `minecraft.getWindow().getAppropriateLineWidth()`，当 `CubeSelection.outlineTarget(...)` 非空时通过 `event.addCustomRenderer(...)` 在匹配的透明度阶段绘制模型斜棱线（支持无障碍“高对比度轮廓线”双 Pass `RenderTypes.secondaryBlockOutline()` + `RenderTypes.lines()`；若总线段数超过 `4096` 则自动回退使用 `Bounds` 外接框的 `fallbackOutline()`），替代原版块轮廓框。 |
| **`CubeModelEvents`** | • `public static void prepare(ModelEvent.ModifyBakingResult event)`<br>• `public static void apply(ModelEvent.BakingCompleted event)` | 在模型烘焙阶段读取资源包 `CubeSelectionRules`，调用 `ModelSelections.bake(event.getBakingResult().blockStateModels(), ...)` 并安装到 `CubeSelection`。 |

---

## 二、 代码示例：在自定义 BER 或世界渲染中复用 `OutlineRenderer`

```java
package com.example.mymod.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.OutlineRenderer;
import dev.anvilcraft.lib.v2.cube.client.SelectionPart;
import dev.anvilcraft.lib.v2.cube.geometry.PackedOutline;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

import java.util.List;

public final class CustomMachineOutlineRenderer {
    private CustomMachineOutlineRenderer() {
    }

    public static void renderCustomColorOutline(PoseStack poseStack, Vec3 camera, BlockPos pos, BlockState state) {
        List<SelectionPart> parts = CubeSelection.modelParts(state, pos);
        if (parts == null || parts.isEmpty()) return;

        Minecraft mc = Minecraft.getInstance();
        VertexConsumer lineBuffer = mc.renderBuffers().bufferSource().getBuffer(RenderTypes.lines());
        float lineWidth = mc.getWindow().getAppropriateLineWidth();

        poseStack.pushPose();
        poseStack.translate(pos.getX() - camera.x, pos.getY() - camera.y, pos.getZ() - camera.z);

        Vec3 localCamera = camera.subtract(pos.getX(), pos.getY(), pos.getZ());
        for (SelectionPart part : parts) {
            PackedOutline baseOutline = CubeSelection.outlines().get(part.geometry());
            PackedOutline viewOutline = baseOutline.forView(part.localPosition(localCamera));

            poseStack.pushPose();
            part.apply(poseStack);
            OutlineRenderer.render(
                poseStack,
                lineBuffer,
                viewOutline,
                0.0f,
                0.9f,
                1.0f,
                0.8f,
                SelectionGeometry.MAX_OUTLINE_SEGMENTS,
                lineWidth
            );
            poseStack.popPose();
        }
        poseStack.popPose();
    }
}
```
