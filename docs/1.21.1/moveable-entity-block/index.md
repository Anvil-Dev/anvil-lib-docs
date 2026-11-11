# Moveable Entity Block 可移动方块实体 (`module.moveable-entity-block`)

<BranchContextCard branch="1.21.1" />

`module.moveable-entity-block`（构件名 `anvillib-moveable-entity-block-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.piston`）通过 Mixin 与接口注入，打破了原版 Minecraft **“任何带有 `BlockEntity`（方块实体）的方块一律无法被活塞推动”** 的硬编码限制。

在原版 `PistonBaseBlock#isPushable` 中，只要 `state.hasBlockEntity()` 为 `true`，活塞就会直接拒绝推动。而在引入本模块后，**只需让你的方块类实现 `IMoveableEntityBlock` 接口（替代普通的 `EntityBlock`）**，活塞和黏性活塞即可推动或拉动该方块，并在推动全过程中：
1. **自动保存与迁移 `BlockEntity` 数据**：起推瞬间将原位置的 `BlockEntity`（含完整库存、机器能量与自定义 NBT）挂载到移动中的 `PistonMovingBlockEntity` 内并同步给客户端；
2. **移动过程平滑渲染**：`PistonHeadRendererMixin` 在活塞伸出/缩回动画期间，除了渲染方块模型外，如果该 `BlockEntity` 注册了对应的 `BlockEntityRenderer`（BER），还会随着活塞位移实时平滑渲染移动中的方块实体！
3. **落位回调与异常掉落保护**：到位落定后自动还原 NBT 并触发 `notifyMoved`；若移动中途因异常原因无法放置而破碎，自动调用 `dropMovingContents` 安全释放内部容器物品，杜绝吞物品 Bug。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `moveable-entity-block` 模块：

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.1:$anvillibVersion")
    // 如需在代码中直接调用 PistonMovingBlockEntity 上的注入方法，可声明：
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.1:$anvillibVersion")
}
```

---

## 二、 完整代码示例：实现一个可被活塞推动的机器方块

```java
package com.example.mymod.block;

import com.example.mymod.block.entity.PortableGeneratorBlockEntity;
import dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.world.Containers;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.PushReaction;
import org.jetbrains.annotations.Nullable;

// 实现 IMoveableEntityBlock（它本身已继承 EntityBlock）
public class PortableGeneratorBlock extends Block implements IMoveableEntityBlock {
    public PortableGeneratorBlock(Properties properties) {
        // 注意：不要将 pushReaction 设为 PushReaction.BLOCK，保持默认的 NORMAL 即可
        super(properties.pushReaction(PushReaction.NORMAL));
    }

    @Override
    public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new PortableGeneratorBlockEntity(pos, state);
    }

    /**
     * 可选重写：当活塞推动完成、方块实体在新坐标 (pos) 重新就位并恢复完所有 NBT 后触发
     */
    @Override
    public void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (!level.isClientSide && be instanceof PortableGeneratorBlockEntity generator) {
            // 例如：通知机器在新位置重新扫描周围电网连接或唤醒邻居
            generator.onRelocated(level, pos);
        }
    }

    /**
     * 可选重写：当移动中的方块无法在目标位置安置而被迫破坏掉落时触发
     * 默认实现会自动掉落实现了 net.minecraft.world.Container 的容器物品；
     * 若你的 BlockEntity 使用 NeoForge 的 ItemStackHandler 存储物品，可在此重写掉落逻辑：
     */
    @Override
    public void dropMovingContents(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (!level.isClientSide && be instanceof PortableGeneratorBlockEntity generator) {
            for (int i = 0; i < generator.getInventory().getSlots(); i++) {
                Containers.dropItemStack(
                    level,
                    pos.getX(),
                    pos.getY(),
                    pos.getZ(),
                    generator.getInventory().getStackInSlot(i)
                );
            }
        }
    }
}
```

---

## 三、 生命周期与常见坑点说明

### 1. 活塞推动 `IMoveableEntityBlock` 的完整时序

1. **判定阶段 (`PistonBaseBlockMixin`)**：
   在 `PistonBaseBlock.isPushable` 中，若 `state.getBlock() instanceof IMoveableEntityBlock`，则放行 `state.hasBlockEntity()` 检查，继续执行原版硬度（`getDestroySpeed != -1.0F`）与 `PushReaction` 判断（因此如果你希望某个状态暂时不可推动，只需重写 `getPistonPushReaction` 返回 `PushReaction.BLOCK` 即可！）。
2. **起推阶段 (`PistonBaseBlock.moveBlocks`)**：
   在原坐标方块被替换为 `Blocks.MOVING_PISTON` 前，捕获原坐标的 `BlockEntity`，清空原槽位上的旧引用以避免移除时触发原版容器掉落，并将其通过 `anvillib$setBlockEntity` 塞入新建的 `PistonMovingBlockEntity` 中。
3. **移动 Tick 与网络同步 (`PistonMovingBlockEntityMixin`)**：
   - 在 `saveAdditional` / `getUpdateTag` 时将被推动的 `BlockEntity` 的完整 NBT 保存在 `"MoveableBlockEntityData"` 子标签中下发给客户端；
   - 客户端收到后通过 `BlockEntity.loadStatic` 还原内存中的 `BlockEntity` 实例，供 `PistonHeadRendererMixin` 在每帧渲染移动动画。
4. **到位落定阶段 (`PistonMovingBlockEntity#finalTick` / `tick`)**：
   当活塞移动进度达到 `1.0F` 放置目标方块后，将被携带的 `BlockEntity` 通过 `saveCustomOnly` + `loadCustomOnly` 完整迁移到新坐标的 `BlockEntity` 上，调用 `setChanged()`，并回调 **`IMoveableEntityBlock#notifyMoved(level, pos, state, be)`**。

### 2. 常见坑点

- **不要在 `onRemove` 中无条件掉落物品而不检查是否正被活塞移动**：
  当活塞起推时，框架会先将原位置的 `BlockEntity` 从区块中卸载（`removeBlockEntity`）并转移给 `PistonMovingBlockEntity`。只要你在原版规范的 `Block#onRemove` 中通过 `level.getBlockEntity(pos)` 获取方块实体，此时由于方块实体已被提前转移清空，`level.getBlockEntity(pos)` 会返回 `null`，从而天然不会引发双倍掉落！
- **在 `dropMovingContents` 中禁止查询世界目标坐标的 `BlockEntity`**：
  当 `dropMovingContents(level, pos, state, be)` 被调用时，移动中的方块因受阻未能安置到世界中，请直接操作参数传入的 `be` 实例释放库存，不要调用 `level.getBlockEntity(pos)`。

---

## 四、 公开接口 API 详解

### 1. `IMoveableEntityBlock`（`dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock`）

继承自 `net.minecraft.world.level.block.EntityBlock`。

| 方法签名 | 默认实现 | 说明 |
| :--- | :--- | :--- |
| `default void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be)` | 空实现 | 当可移动方块实体在目标坐标 `pos` 落定并恢复完所有 NBT 数据后在双端触发。 |
| `default void dropMovingContents(Level level, BlockPos pos, BlockState state, BlockEntity be)` | 若 `!level.isClientSide && be instanceof Container container && !(state.getBlock() instanceof ShulkerBoxBlock)`，则调用 `Containers.dropContents(level, pos, container)` | 当移动中的方块因目标位置不可放置而被迫破坏为掉落物时在服务端触发，用于释放 `be` 内部持有的物品。 |

### 2. `IPistonMovingBlockEntityExtension`（注入到 `PistonMovingBlockEntity` 的内部扩展接口）

位于 `dev.anvilcraft.lib.v2.piston.injection.IPistonMovingBlockEntityExtension`（方法均标记为 `@ApiStatus.Internal`）：

| 方法签名 | 说明 |
| :--- | :--- |
| `default @Nullable BlockEntity anvillib$getBlockEntity()` | 获取当前 `PistonMovingBlockEntity` 正在携带移动的方块实体。 |
| `default void anvillib$setBlockEntity(@Nullable BlockEntity blockEntity)` | 设置正在携带移动的方块实体并关联当前 `level`。 |
| `default @Nullable BlockEntity anvillib$clearBlockEntity()` | 取出并清空当前携带的方块实体引用。 |
