# Moveable Entity Block 活塞移动方块实体 (`module.moveable-entity-block`)

<BranchContextCard branch="26.3" />

`module.moveable-entity-block`（构件名 `anvillib-moveable-entity-block-neoforge-26.3`，包名 `dev.anvilcraft.lib.v2.piston`）解除了 Minecraft 原版“凡是带有 `BlockEntity`（方块实体）的方块一律不能被活塞推动”的硬编码限制，并在推动过程中**完整保留原 `BlockEntity` 实例、NBT 数据组件（`ValueInput` / `ValueOutput`）以及客户端 `BlockEntityRenderer` 动态渲染效果**。

---

## 一、 接入配置（含接口注入）

若已引入聚合包 `anvillib-neoforge-26.3`，则已包含本模块运行时代码；若需要单独引入，或需要在代码中直接调用注入到 `PistonMovingBlockEntity` / `PistonHeadRenderState` 上的扩展方法，请在 `build.gradle.kts` 中配置：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.3:2.0.0")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.3:2.0.0")
}
```

---

## 二、 核心机制与生命周期

本模块无需开发者手动重写 `clearData` / `setData` 序列化 NBT，而是通过 Mixin 直接在内存中迁移 `BlockEntity` 实例，并在区块存盘/同步时自动使用 26.3 的 `ValueOutput` / `ValueInput` 保存子标签：

1. **放行活塞可推动性检查（`PistonBaseBlockMixin#isPushable`）**：
   当原版 `PistonBaseBlock.isPushable` 检查 `state.hasBlockEntity()` 时，若 `state.getBlock() instanceof IMoveableEntityBlock`，返回 `false`（欺骗原版活塞该方块没有不可移动的方块实体），从而允许活塞推拉（前提是方块自身的 `PushReaction` 不是 `BLOCK` 且硬度不为 `-1`）。
2. **起推瞬间提取并转移实例（`PistonBaseBlockMixin#moveBlocks`）**：
   在原版活塞将源位置的方块替换为 `MovingPistonBlock` 之前，Mixin 从旧位置 `level.getBlockEntity(relative)` 取出原有的 `BlockEntity` 实例，调用 `level.removeBlockEntity(relative)` 将其从原位置解绑，并通过 `IPistonMovingBlockEntityExtension#anvillib$setBlockEntity` 挂载到新创建的 `PistonMovingBlockEntity` 内部。
3. **推动途中的客户端 BER 渲染（`PistonHeadRendererMixin`）**：
   在活塞推动的 2 Tick 动画期间，`PistonHeadRenderer` 在 `extractRenderState` 阶段从 `PistonMovingBlockEntity` 取出被携带的 `BlockEntity`，委托其对应的 `BlockEntityRenderer` 提取 `BlockEntityRenderState` 并存入 `PistonHeadRenderState#anvillib$setExtraState`；在 `submit` 阶段按活塞插值偏移 `(xOffset, yOffset, zOffset)` 提交渲染，因此箱子、自定义机器转子等自定义 BER 模型在移动途中不会消失或退化。
4. **推动途中的存档持久化（`PistonMovingBlockEntityMixin#saveAdditional` / `loadAdditional`）**：
   如果在活塞移动中途卸载区块或退出存档，被携带的 `BlockEntity` 会通过 `output.child("anvillib:moveable_block_entity")` 调用 `saveWithFullMetadata(child)` 完整写入存档；重载时根据 `"id"` 重建 `BlockEntity` 并调用 `loadWithComponents(valueInput)`。
5. **落位恢复与回调通知（`PistonMovingBlockEntityMixin#tick` / `finalTick`）**：
   当活塞推动到位、在服务端将 `MovingPistonBlock` 还原为目标方块 `newState` 后，Mixin 自动取出 `BlockEntity`，将其 `worldPosition` 更新为新坐标，调用 `clearRemoved()` 与 `level.setBlockEntity(blockEntity)` 重新挂载到世界，最后回调 `IMoveableEntityBlock#notifyMoved(level, pos, newState, blockEntity)`。

---

## 三、 完整代码示例

下面演示如何编写一个带库存与工作状态的自定义机器方块，使其支持被普通活塞与粘性活塞推拉，并在移动到位后刷新自身网络或邻居状态：

```java
package com.example.mymod.block;

import com.example.mymod.block.entity.PortableGeneratorBlockEntity;
import com.mojang.serialization.MapCodec;
import dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.PushReaction;
import org.jetbrains.annotations.Nullable;

// 只需实现 IMoveableEntityBlock 接口（它继承自 EntityBlock）
public class PortableGeneratorBlock extends BaseEntityBlock implements IMoveableEntityBlock {
    public static final MapCodec<PortableGeneratorBlock> CODEC = simpleCodec(PortableGeneratorBlock::new);

    public PortableGeneratorBlock(BlockBehaviour.Properties properties) {
        // 确保 pushReaction 为 NORMAL（默认），不要设为PushReaction.BLOCK
        super(properties.pushReaction(PushReaction.NORMAL));
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    public RenderShape getRenderShape(BlockState state) {
        return RenderShape.MODEL;
    }

    @Override
    public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new PortableGeneratorBlockEntity(pos, state);
    }

    /**
     * 可选重写：当活塞将该方块实体推到新位置落位后，在服务端触发
     */
    @Override
    public void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (be instanceof PortableGeneratorBlockEntity generator) {
            // 例如：通知方块实体坐标已变更、重新连接电网或标记 setChanged()
            generator.onRelocated(pos);
            generator.setChanged();
        }
    }
}
```

---

## 四、 公开接口与扩展 API 详解

### 1. `IMoveableEntityBlock`（核心接口）

位于 `dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock`，继承自原版 `net.minecraft.world.level.block.EntityBlock`。

| 方法签名 | 默认实现 | 调用时机与参数说明 |
| :--- | :--- | :--- |
| `default void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be)` | 空方法 `{}` | **仅在服务端**当 `PistonMovingBlockEntity` 完成移动（`tick` 或 `finalTick`）、将目标方块放置到 `pos` 且已将原 `be` 重新挂载到 `level.setBlockEntity(be)` 之后立即调用。<br>• `level`：当前服务端世界<br>• `pos`：移动后的新方块坐标（此时 `be.getBlockPos()` 已更新为 `pos`）<br>• `state`：移动后的方块状态<br>• `be`：迁移过来的原 `BlockEntity` 实例 |

### 2. 接口注入扩展：`IPistonMovingBlockEntityExtension` 与 `IPistonHeadRenderStateExtension`

这两个接口通过 NeoForge Interface Injection 分别注入到原版的 `PistonMovingBlockEntity` 与 `PistonHeadRenderState` 上（方法均标记为 `@ApiStatus.Internal`）：

| 注入目标类 | 注入接口 | 方法签名 | 说明 |
| :--- | :--- | :--- | :--- |
| `PistonMovingBlockEntity` | `IPistonMovingBlockEntityExtension` | `@Nullable BlockEntity anvillib$getBlockEntity()` | 获取当前移动活塞正在携带的 `BlockEntity`（不清除引用）。 |
| `PistonMovingBlockEntity` | `IPistonMovingBlockEntityExtension` | `void anvillib$setBlockEntity(@Nullable BlockEntity blockEntity)` | 设置移动活塞携带的 `BlockEntity`。 |
| `PistonMovingBlockEntity` | `IPistonMovingBlockEntityExtension` | `@Nullable BlockEntity anvillib$clearBlockEntity()` | 取出并清空当前移动活塞携带的 `BlockEntity`（在活塞到位落定方块时调用）。 |
| `PistonHeadRenderState` | `IPistonHeadRenderStateExtension` | `void anvillib$setExtraState(@Nullable BlockEntityRenderState state)` | 在客户端渲染状态提取阶段保存被推动 `BlockEntity` 的 `BlockEntityRenderState`。 |
| `PistonHeadRenderState` | `IPistonHeadRenderStateExtension` | `@Nullable BlockEntityRenderState anvillib$getExtraState()` | 在客户端 `PistonHeadRenderer#submit` 阶段读取被推动 `BlockEntity` 的渲染状态。 |

---

## 五、 常见坑点与注意事项

1. **不要在 `BlockBehaviour.Properties` 中设置 `PushReaction.BLOCK` 或不可破坏硬度（`-1.0f`）**：`PistonBaseBlockMixin` 仅放行了 `state.hasBlockEntity()` 检查，原版活塞对 `state.getPistonPushReaction() == PushReaction.BLOCK`、黑曜石、基岩以及超出 12 格推力上限的检查仍然生效。
2. **方块实体内部缓存的坐标引用**：由于 `module.moveable-entity-block` 直接复用原有的 `BlockEntity` Java 对象并将其 `worldPosition` 修改为新坐标，如果你的 `BlockEntity` 内部在字段里额外缓存了旧的 `BlockPos`（如能量网络节点坐标、多方块绑定坐标），务必在 `IMoveableEntityBlock#notifyMoved` 中更新这些缓存字段。
