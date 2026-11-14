# Moveable Entity Block 可移动方块实体 (`module.moveable-entity-block`)

<BranchContextCard branch="1.21.8" />

`module.moveable-entity-block`（构件名 `anvillib-moveable-entity-block-neoforge-1.21.8`，包名 `dev.anvilcraft.lib.v2.piston`）通过 Mixin 与接口注入，打破了原版 Minecraft **“任何带有 `BlockEntity`（方块实体）的方块一律无法被活塞推动”** 的硬编码限制。

在原版 `PistonBaseBlock#isPushable` 中，只要 `state.hasBlockEntity()` 为 `true`，活塞就会直接拒绝推动。而在引入本模块后，**只需让你的方块类实现 `IMoveableEntityBlock` 接口（继承自 `EntityBlock`）**，活塞和黏性活塞即可推动或拉动该方块，并在推动全过程中：
1. **自动保存与迁移 `BlockEntity` 数据**：起推瞬间将原位置的 `BlockEntity` 引用直接剥离并挂载到移动中的 `PistonMovingBlockEntity` 内（通过 1.21.8 `ValueInput` / `ValueOutput` 存取子对象 `"anvillib:moveable_block_entity"`）并同步给客户端；
2. **移动过程平滑渲染**：`PistonHeadRendererMixin` 在活塞伸出/缩回动画期间，除了渲染方块模型外，如果该 `BlockEntity` 注册了对应的 `BlockEntityRenderer`（BER），还会随着活塞位移实时平滑渲染移动中的方块实体；
3. **到位落位回调**：到位落定后自动重设 `worldPosition`、清除移除标记（`clearRemoved()`）、绑定到新坐标并回调 `notifyMoved`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.8`，则已自动包含本模块；若仅需单独引入 `moveable-entity-block` 模块：

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.8:$anvillibVersion")
    // 如需在代码中直接调用 PistonMovingBlockEntity 上的注入方法，可声明：
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.8:$anvillibVersion")
}
```

---

## 二、 完整代码示例：实现一个可被活塞推动的机器方块

```java
package com.example.mymod.block;

import com.example.mymod.block.entity.PortableGeneratorBlockEntity;
import dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.PushReaction;
import org.jspecify.annotations.Nullable;

// 实现 IMoveableEntityBlock（它本身已继承 EntityBlock）
public class PortableGeneratorBlock extends Block implements IMoveableEntityBlock {
    public PortableGeneratorBlock(Properties properties) {
        // 注意：不要将 pushReaction 设为 PushReaction.BLOCK，保持 NORMAL 或 DESTROY 等可推动策略
        super(properties.pushReaction(PushReaction.NORMAL));
    }

    @Override
    public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new PortableGeneratorBlockEntity(pos, state);
    }

    /**
     * 可选重写：当活塞推动完成、方块实体在新坐标 (pos) 重新就位后触发
     */
    @Override
    public void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (!level.isClientSide() && be instanceof PortableGeneratorBlockEntity generator) {
            // 通知机器在新位置重新扫描周围电网连接或唤醒邻居
            generator.onRelocated(level, pos);
        }
    }
}
```

---

## 三、 生命周期与常见坑点说明

### 1. 活塞推动 `IMoveableEntityBlock` 的完整时序

1. **判定阶段 (`PistonBaseBlockMixin#isPushable`)**：
   在 `PistonBaseBlock.isPushable` 中，若 `state.getBlock() instanceof IMoveableEntityBlock`，则跳过原版的 `state.hasBlockEntity()` 拒绝判定，继续执行硬度（`getDestroySpeed != -1.0F`）与 `PushReaction` 检查。若你希望某个状态暂时不可推动，只需让 `getPistonPushReaction` 返回 `PushReaction.BLOCK`。
2. **起推阶段 (`PistonBaseBlockMixin#setBlock` / `newMovingBlockEntity`)**：
   在原坐标方块被替换为 `Blocks.MOVING_PISTON` 前，先获取原坐标的 `BlockEntity` 并调用 `level.removeBlockEntity(relative)` 提前移除其世界引用，再在创建 `PistonMovingBlockEntity` 后通过 `anvillib$setBlockEntity(...)` 写入其扩展字段。
3. **存盘与移动渲染 (`PistonMovingBlockEntityMixin` / `PistonHeadRendererMixin`)**：
   - `saveAdditional(ValueOutput)` 将被携带的 `BlockEntity` 通过 `saveWithFullMetadata(ValueOutput)` 写入 `output.child("anvillib:moveable_block_entity")`；`loadAdditional(ValueInput)` 读取子 `ValueInput` 并通过 `BuiltInRegistries.BLOCK_ENTITY_TYPE.byNameCodec()` 解码 `BlockEntityType<?>` 后重建实体并调用 `loadWithComponents(valueInput)`；
   - 客户端 `PistonHeadRendererMixin` 在渲染活塞移动头之后读取 `anvillib$getBlockEntity()` 并平移 `(getXOff, getYOff, getZOff)` 后调用对应的 `BlockEntityRenderer`。
4. **到位落定阶段 (`PistonMovingBlockEntityMixin#tick` / `finalTick`)**：
   在服务端（`!level.isClientSide()`），待目标方块的 `BlockState` 放置完成后，从 `PistonMovingBlockEntity` 中调用 `anvillib$clearBlockEntity()` 取出 `BlockEntity`，将其 `worldPosition` 更新为新坐标 `pos`，调用 `be.clearRemoved()`、`level.removeBlockEntity(pos)` 与 `level.setBlockEntity(be)` 安装到位，最后触发 **`IMoveableEntityBlock#notifyMoved(level, pos, state, be)`**。

### 2. 常见坑点

- **不要依赖方块移除钩子读取 `level.getBlockEntity(pos)`**：
  起推阶段在 `setBlock` 替换方块之前就已经调用 `level.removeBlockEntity(relative)` 剥离了 `BlockEntity`，因此在方块移除钩子内无法也不应再从世界读取旧 `BlockEntity`（这恰好天然避免了在开始推动时误触发容器物品掉落）。
- **检查方块朝向与 `BlockEntity` 状态一致性**：
  活塞移动不会修改方块的 `BlockState` 朝向属性，但如果 `BlockEntity` 内缓存了坐标相关的数据（如邻接方块缓存、多方块控制器偏移），务必在重写的 `notifyMoved` 中刷新。

---

## 四、 公开接口 API 详解

### 1. `IMoveableEntityBlock`（`dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock`）

继承自 `net.minecraft.world.level.block.EntityBlock`。

| 方法签名 | 默认实现 | 说明 |
| :--- | :--- | :--- |
| `default void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be)` | 空实现 | 当可移动方块实体在目标坐标 `pos` 就位并重新挂入 `Level` 后在服务端（`!level.isClientSide()`）触发。 |

### 2. `IPistonMovingBlockEntityExtension`（注入到 `PistonMovingBlockEntity` 的内部扩展接口）

位于 `dev.anvilcraft.lib.v2.piston.injection.IPistonMovingBlockEntityExtension`（方法均标记为 `@ApiStatus.Internal`）：

| 方法签名 | 说明 |
| :--- | :--- |
| `default @Nullable BlockEntity anvillib$getBlockEntity()` | 获取当前 `PistonMovingBlockEntity` 正在携带移动的方块实体。 |
| `default void anvillib$setBlockEntity(@Nullable BlockEntity blockEntity)` | 设置正在携带移动的方块实体。 |
| `default @Nullable BlockEntity anvillib$clearBlockEntity()` | 取出并清空当前携带的方块实体引用。 |
