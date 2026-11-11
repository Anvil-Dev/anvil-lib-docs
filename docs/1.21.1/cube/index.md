# Cube 斜棱线与精确拾取：概述与快速接入 (`module.cube`)

<BranchContextCard branch="1.21.1" />

`module.cube`（构件名 `anvillib-cube-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.cube`）是一个专为客户端设计的**方块模型精确射线拾取（Ray Picking）与 3D 模型斜棱线高亮（Outline Highlight）引擎**。

在原版 Minecraft 中，无论你的方块 JSON 模型（BlockModel）设计得多么精细——例如带有 22.5° / 45° 旋转的斜撑杆、斜面机械外壳、或者由 `BlockEntityRenderer`（BER）驱动的越界摆动机械臂——玩家准星指向该方块时，原版永远只按粗糙的轴对齐 `VoxelShape` 判定拾取并绘制呆板的矩形黑框。

引入 `module.cube` 后，**只需在客户端初始化时调用一行 `CubeSelection.enableNamespace(MOD_ID)`**：
1. **自动解码烘焙模型**：在资源包模型烘焙阶段，自动捕获该命名空间下所有方块的 JSON 模型元素（包括带任意轴向旋转的 `BlockElement`、加权随机模型 `WeightedBakedModel` 与多部件拼接模型 `MultiPartBakedModel`），将其转化为闭凸多面体集合 `SelectionGeometry`；
2. **准星精确射线拾取**：玩家准星视线自动与模型的真实三维凸多面体表面（含斜角面与越出 `1×1×1` 格的悬挑结构）求交，不修改服务端碰撞箱与实体物理；
3. **共面消隐与视线剪影棱线高亮**：后台线程自动对模型内部重叠面、共面内缝与微小错位接缝进行布尔裁剪与透视剪影消隐，在准星指向方块时绘制严丝合缝的模型真实轮廓线！

本模块按功能拆分为 3 篇子文档：
- **本篇（概述與快速接入）**：讲解 `CubeSelection` 的静态命名空间启用、方块排除、运行时条件排除与动态 BER 部件注册。
- **[精确拾取与高亮渲染管线](./picking-and-selection)**：详解 `CubeSelection`、`SelectionPart`、`BlockSelectionProvider`、`CubePicking`、`OutlineRenderer` 与客户端事件流程。
- **[模型解码与凸体几何构建](./model-and-geometry)**：详解 `CubeModelDecoder`、`ModelSelections`、`ConvexShape`、`SelectionGeometry`、`OutlineBuilder`、`OutlineVisibility`、`PackedOutline` 与 `OutlineCache`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `cube` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-cube-neoforge-1.21.1:2.0.0")
}
```

---

## 二、 完整代码示例：一键启用命名空间、配置排除规则与注册动态 BER 部件

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

@EventBusSubscriber(modid = MyMod.MOD_ID, bus = EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
public final class MyModCubeClientSetup {
    // 预先构建机械臂活动杆的局部不可变几何体（只需构建一次，可跨帧复用）
    private static final SelectionGeometry ARM_BOOM_GEOMETRY = new SelectionGeometry(List.of(
        ConvexShape.box(new AABB(6 / 16.0, 4 / 16.0, -12 / 16.0, 10 / 16.0, 8 / 16.0, 14 / 16.0))
    ));

    private MyModCubeClientSetup() {
    }

    @SubscribeEvent
    public static void onClientSetup(FMLClientSetupEvent event) {
        // 1. 为整个模组命名空间启用模型精确拾取与斜棱线高亮
        // 注意：必须在首次模型烘焙完成前（如客户端主类构造器或 FMLClientSetupEvent）调用
        CubeSelection.enableNamespace(MyMod.MOD_ID);

        // 2. 永久排除不需要模型级高亮的特定方块（如纯流体容器或全透明触发器方块）
        CubeSelection.exclude(ModBlocks.INVISIBLE_LIGHT_BLOCK.get());

        // 3. 注册运行时动态排除规则（例如：当玩家在模组配置中关闭了高精度高亮时，回退原版黑框）
        // 在 1.21.1 中使用 ResourceLocation
        CubeSelection.registerTargetExclusion(
            ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "disable_in_low_quality"),
            state -> !MyMod.CONFIG.enableHighPrecisionOutline
        );

        // 4. 为包含 BlockEntityRenderer 动态旋转部件的方块注册实时拾取与高亮几何
        // 参数：目标方块、包含所有运动姿态的最大局部包围盒（必须在 [-2, 3] 范围内）、是否同时保留静态 JSON 模型部分、动态部件提供器
        CubeSelection.registerDynamic(
            ModBlocks.ROBOTIC_ARM.get(),
            new AABB(-1.0, 0.0, -1.0, 2.0, 2.0, 2.0),
            true,
            (level, pos, state, partialTick) -> {
                if (!(level.getBlockEntity(pos) instanceof RoboticArmBlockEntity arm)) {
                    return List.of();
                }
                float angleDeg = Mth.lerp(partialTick, arm.prevYaw, arm.currentYaw);
                // 构造与 BlockEntityRenderer 完全一致的局部变换矩阵（围绕方块中心 (0.5, 0.5, 0.5) 旋转）
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

## 三、 设计边界与常见坑点

1. **`enableNamespace` 的调用时机**：
   `CubeModelEvents` 在客户端资源加载烘焙模型（`ModelEvent.ModifyBakingResult` 与 `ModelEvent.BakingCompleted`）时只会捕获并烘焙 `CubeSelection.isEnabled(block)` 为 `true` 的方块。因此 `CubeSelection.enableNamespace(MOD_ID)` **必须在客户端初始化阶段（`@Mod(value = MOD_ID, dist = Dist.CLIENT)` 构造器或 `FMLClientSetupEvent`）调用**。
2. **模型几何边界限制 `[-2, 3]`**：
   无论是静态 JSON 模型还是 `registerDynamic` 注册的 `maximumBounds`（若方块带有原版随机水平/垂直偏移 `hasOffsetFunction()`，还会自动外扩 `0.5` 格），其局部坐标范围都必须落在 **`[-2, 3]`** 闭区间内（即最多向四周超出当前方块格 2 格距离，`CubeSelection.supportedBounds`），超出此范围的模型会被标记为 `unsupportedStates` 并回退为原版 `VoxelShape` 行为。
3. **平面/零厚度模型元素的自动跳过**：
   JSON 模型中常见的十字交叉草、零厚度贴花平面（某轴长度为 0）不构成三维闭凸体，`CubeModelDecoder` 会忽略这类 0 厚度平面元素；若整个模型全部由平面元素组成，该方块状态会自动保留原版选择框。
4. **仅影响客户端准星交互**：
   `CubePicking` 仅注入在 `GameRenderer#pick` 准星射线阶段，**绝不会修改服务端方块碰撞箱、实体寻路、红石视线或弓箭弹道判定**，因此不会引发任何服务端反作弊或客户端-服务端物理不同步问题。
