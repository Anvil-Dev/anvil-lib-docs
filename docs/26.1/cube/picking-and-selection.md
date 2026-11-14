# 精确拾取与动态部件提供器 (`CubePicking` / `BlockSelectionProvider` / `SelectionPart`)

<BranchContextCard branch="26.1" />

除了静态 JSON 方块模型外，许多机械或魔法模组的方块还带有由 `BlockEntityRenderer` (BER) 动态渲染的活动部件（例如旋转的齿轮轴、伸缩的机械臂、悬浮摆动的晶体）。`module.cube` 提供了 `BlockSelectionProvider` 与 `SelectionPart` 接口，允许方块实体在不修改服务端碰撞箱的前提下，让客户端准星拾取和斜棱线描边实时贴合旋转/平移中的动态部件。

---

## 一、 要解决什么问题 / 怎么用

1. **静态模型与动态 BER 部件结合**：
   通过 `CubeSelection.registerDynamic(block, maximumBounds, includeStaticModel, provider)`，你可以为某个方块注册一个每帧按 `partialTick` 计算部件矩阵的 `BlockSelectionProvider`。
   - 若 `includeStaticModel = true`，底座的静态 JSON 模型会自动保留，并与 `provider` 返回的活动部件合并为同一个拾取/高亮目标；
   - 若活动部件本身的几何也来自某个方块状态的静态 JSON 模型，可在 `provider` 中调用 `CubeSelection.modelParts(state, pos)` 获取静态部件的 `SelectionGeometry`，再为其套上当前帧的旋转/平移 `Matrix4f` 构造新的 `SelectionPart`。
2. **越界部件（Overhang）跨格拾取**：
   当机械臂或大型斜梁伸出 `[0, 1]^3` 方块格（在 `[-2, 3]` 范围内）时，即使玩家准星没有指在锚点方块原本的 `1×1×1` 体素格上，`CubePicking.pick` 也会在射线沿途周围 `searchRadius()`（最多 2 格）范围内自动检索越界方块，精准选中伸出格外的部件。

---

## 二、 完整代码示例

下面演示如何为一个带有“静态底座 + 随时间旋转的顶部转子”的机器方块注册动态精确拾取与斜棱线高亮：

```java
package com.example.mymod.client;

import com.example.mymod.block.entity.RotorBlockEntity;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import dev.anvilcraft.lib.v2.cube.client.SelectionPart;
import dev.anvilcraft.lib.v2.cube.geometry.ConvexShape;
import dev.anvilcraft.lib.v2.cube.geometry.SelectionGeometry;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.AABB;
import org.joml.Matrix4f;

import java.util.List;

public final class RotorCubeSelection {
    // 1. 预先构建转子叶片的不可变局部几何（跨帧复用！切勿每帧 new SelectionGeometry）
    //    重要：几何必须跨帧复用，否则 OutlineCache 会把每一帧当成新几何重复排队计算轮廓！
    private static final SelectionGeometry BLADE_GEOMETRY = new SelectionGeometry(List.of(
        ConvexShape.box(new AABB(2.0 / 16.0, 10.0 / 16.0, 6.0 / 16.0, 14.0 / 16.0, 14.0 / 16.0, 10.0 / 16.0)),
        ConvexShape.box(new AABB(6.0 / 16.0, 10.0 / 16.0, 2.0 / 16.0, 10.0 / 16.0, 14.0 / 16.0, 14.0 / 16.0))
    ));

    // 2. 声明旋转后可能达到的最大包围盒（必须在 [-2, 3] 范围内）
    private static final AABB MAX_ROTOR_BOUNDS = new AABB(-0.25, 0.0, -0.25, 1.25, 1.25, 1.25);

    private RotorCubeSelection() {
    }

    public static void register() {
        CubeSelection.registerDynamic(
            ModBlocks.ROTOR_BLOCK.get(),
            MAX_ROTOR_BOUNDS,
            true, // 同时保留底座的静态 JSON 模型
            (level, pos, state, partialTick) -> {
                if (!(level.getBlockEntity(pos) instanceof RotorBlockEntity rotor)) {
                    return List.of();
                }
                // 计算与 BlockEntityRenderer 完全一致的插值角度
                float angleRad = Mth.lerp(partialTick, rotor.prevAngle, rotor.currentAngle) * Mth.DEG_TO_RAD;

                // 构造绕方块中心 (0.5, 0.5, 0.5) Y 轴旋转的仿射变换矩阵
                Matrix4f localToBlock = new Matrix4f()
                    .translate(0.5F, 0.5F, 0.5F)
                    .rotateY(angleRad)
                    .translate(-0.5F, -0.5F, -0.5F);

                // 复用 BLADE_GEOMETRY，仅更新本帧的变换矩阵
                return List.of(new SelectionPart(BLADE_GEOMETRY, localToBlock));
            }
        );
    }
}
```

---

## 三、 公开类与接口 API 详解

### 1. `BlockSelectionProvider`（动态部件提供器接口）

```java
@FunctionalInterface
public interface BlockSelectionProvider {
    List<SelectionPart> parts(ClientLevel level, BlockPos pos, BlockState state, float partialTick);
}
```

| 参数 / 返回值 | 说明与注意事项 |
| :--- | :--- |
| `level`, `pos`, `state`, `partialTick` | 当前客户端世界、方块坐标（不可变副本）、方块状态与帧插值系数。 |
| 返回值 `List<SelectionPart>` | 返回当前帧该方块的所有动态部件列表。<br>**核心性能准则**：`SelectionPart` 内部的 `SelectionGeometry` **必须作为静态常量或缓存实例跨帧复用**，每帧只应新建 `Matrix4f` 和 `SelectionPart(geometry, matrix)` 包装器。因为 `OutlineCache` 以 `SelectionGeometry` 为键缓存后台计算出的外轮廓，若每帧新建 `SelectionGeometry` 会导致轮廓缓存无法命中。 |

### 2. `SelectionPart`（带局部变换的选择部件）

位于 `dev.anvilcraft.lib.v2.cube.client.SelectionPart`，将一个可复用的 `SelectionGeometry` 与一个从局部坐标到方块坐标的可逆仿射矩阵 `localToBlock` 绑定。

| 构造器 / 方法签名 | 返回值 | 参数、数学语义与边界条件 |
| :--- | :--- | :--- |
| `public SelectionPart(SelectionGeometry geometry)` | — | 构造恒等变换（无旋转/平移/缩放）的部件，`bounds` 直接等于 `geometry.bounds()`。 |
| `public SelectionPart(SelectionGeometry geometry, Matrix4fc localToBlock)` | — | 构造带仿射变换的部件。<br>• **校验条件**：`localToBlock` 必须满足 `isFinite()`、`isAffine()` 且行列式绝对值 `Math.abs(determinant()) >= 1.0E-9`（可逆），否则抛出 `IllegalArgumentException("Expected an invertible affine transform")`。构造时自动使用 `invertAffine` 预计算逆矩阵并变换 local AABB 的 8 个顶点求出方块空间下的 `bounds`。 |
| `public SelectionGeometry geometry()` | `SelectionGeometry` | 获取底层不可变几何对象。 |
| `public AABB bounds()` | `AABB` | 获取变换到方块空间（Block Space）后的轴对齐包围盒。 |
| `public Vec3 localPosition(Vec3 blockPosition)` | `Vec3` | 使用预计算的逆矩阵将方块空间坐标（如局部相机位置）反变换回部件的局部几何空间。 |
| `public List<ConvexShape> blockSpaceShapes()` | `List<ConvexShape>` | 将底层所有 `ConvexShape` 实际乘上 `transform` 矩阵，生成方块空间下的凸多面体列表。**仅用于资源烘焙阶段合并静态 multipart 模型**；动态动画每帧切勿调用此方法。 |
| `public void apply(PoseStack stack)` | `void` | 若存在变换矩阵，调用 `stack.mulPose(this.transform)` 将变换压入渲染矩阵栈。 |
| `public SelectionGeometry.@Nullable RayHit clip(Vec3 start, Vec3 end)` | `SelectionGeometry.RayHit` | 将方块空间的射线起点 `start` 与终点 `end` 通过逆矩阵变换到局部空间执行 `geometry.clip(...)`；命中后使用**逆转置矩阵（Inverse Transpose）**将命中面法线变换回方块空间并归一化，确保在非均匀缩放或镜像变换下交互面（`Direction`）依然准确。 |

### 3. `CubeSelection` 中的动态注册与目标查询 API

| 方法 / 记录签名 | 返回值 | 说明与边界条件 |
| :--- | :--- | :--- |
| `public static void registerDynamic(Block block, AABB maximumBounds, boolean includeStaticModel, BlockSelectionProvider provider)` | `void` | 为 `block` 注册动态部件提供器。<br>• `maximumBounds`：所有动态部件在运动过程中可能达到的最大方块空间包围盒（若方块带 `hasOffsetFunction()` 则膨胀 `0.5` 后校验），必须位于 `[-2, 3]` 内，否则抛出 `IllegalArgumentException`。<br>• 运行时若 `provider` 返回的任意 `SelectionPart.bounds()` 超出了 `maximumBounds.inflate(1.0E-5)`，`target(...)` 会判定越界并返回 `null`（安全回退原版）。 |
| `public static @Nullable List<SelectionPart> modelParts(BlockState state, BlockPos pos)` | `@Nullable List<SelectionPart>` | 按照原版位置随机种子 `state.getSeed(pos)` 收集 `state` 静态烘焙模型的 `SelectionPart` 列表（不可变），供自定义 `BlockSelectionProvider` 复用。若该方块被永久排除、无模型或部件数 `> 32` 则返回 `null`。 |
| `public static @Nullable Target target(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable CubeSelection.Target` | 获取**精确模型拾取**目标：仅当方块的生效规则为 `MODEL` 时委托调用 `outlineTarget(...)`，若处于 `OUTLINE` 或 `VANILLA` 模式则返回 `null`（保留原版射线选取）。 |
| `public static @Nullable Target outlineTarget(ClientLevel level, BlockPos pos, BlockState state, float fraction)` | `@Nullable CubeSelection.Target` | 获取**描边与预览共用的几何目标**（同时响应 `MODEL` 与 `OUTLINE` 模式，单帧最多缓存 256 个位置）。若命中排除规则、无模型且无动态提供器、部件总数 `> 32` 或总凸多面体数 `> SelectionGeometry.MAX_SHAPES (1024)`，返回 `null`。 |
| `public record Target(BlockState state, List<SelectionPart> parts, Vec3 offset, @Nullable AABB bounds)` | `record` | 表示单个方块在当前帧的组合选择目标。提供 `public @Nullable BlockHitResult clip(BlockPos pos, Vec3 start, Vec3 end)` 方法，对所有 `parts` 求最小正交点 `fraction`，并通过 `Direction.getApproximateNearest` 生成原版 `BlockHitResult`。 |

### 4. `CubePicking`（准星射线拾取入口）

位于 `dev.anvilcraft.lib.v2.cube.client.CubePicking`，通过 Mixin 挂载在本地玩家准星拾取路径上。

| 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final double MAX_RANGE = 64` | `double` | 启用精确模型拾取的最大射线距离（64 格）；超出此距离直接委托原版 `entity.pick`。 |
| `public static HitResult pick(Entity entity, double range, float partialTick, boolean fluids)` | `HitResult` | 客户端准星射线拾取主入口。<br>1. 通过 `ThreadLocal<Context>` 保证重入安全，先开启当前帧 `CubeSelection.beginFrame`（确保仅描边 `OUTLINE` 模式的动态几何也能逐帧刷新）。<br>2. 检查 `!CubeSelection.active() || range > MAX_RANGE`，若未启用精确拾取或超出距离限制则直接回退原版 `entity.pick`。<br>3. 先调用 `entity.pick(range, partialTick, fluids)`（在 `BlockGetterMixin` 配合下对沿途单格方块执行 `Target.clip`）。<br>4. 若 `CubeSelection.searchRadius() > 0`，再使用 `BlockGetter.traverseBlocks` 沿视线扫描每个体素周围 `[-radius, radius]^3` 内的越界方块（`CubeSelection.extendsBlock(state)`），用 `LongOpenHashSet visited` 去重，取距离眼睛最近的命中结果。 |
| `public static CubeSelection.@Nullable Target target(BlockGetter getter, BlockPos pos, BlockState state)` | `CubeSelection.Target` | 供 `BlockGetterMixin` 在准星射线遍历期间查询当前线程上下文下的 `Target`。非准星拾取调用（如普通物理碰撞、投射物或服务端射线）因 `context.level == null` 会立即返回 `null`，绝不干扰物理逻辑。 |

### 5. `OutlineRenderer`（轮廓线批量绘制器）

位于 `dev.anvilcraft.lib.v2.cube.client.OutlineRenderer`，供方块描边与自定义实体/调试轮廓共用。

| 方法签名 | 返回值 | 参数与说明 |
| :--- | :--- | :--- |
| `public static void render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha)` | `void` | 使用默认最大线段数 `SelectionGeometry.MAX_OUTLINE_SEGMENTS (4096)` 与默认线宽 `2.5F` 绘制轮廓。 |
| `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments)` | `int` | 使用指定最大线段数 `maximumSegments` 与默认线宽 `2.5F` 绘制轮廓，返回实际提交的线段数。 |
| `public static int render(PoseStack poses, VertexConsumer consumer, PackedOutline outline, float red, float green, float blue, float alpha, int maximumSegments, float lineWidth)` | `int` | 完整参数绘制方法。对每条线段使用 `pose.pose().transformDirection(...)` 变换切向方向向量（而非表面法线的逆转置矩阵，保证非均匀缩放下线条屏幕宽度正确），并向 `consumer` 写入两个端点、颜色、切线法向量与 `lineWidth`。返回实际绘制的线段数。 |
