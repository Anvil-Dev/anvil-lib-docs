---
title: Moveable Entity Block 可推动方块实体
prev: false
next: false
---

# 可推动方块实体

包 `dev.anvilcraft.lib.v2.piston` 解决了原版活塞无法推动带方块实体的方块的问题。通过一组 Mixin 和接口，允许方块在移动过程中携带自定义
NBT 数据，并在活塞停止或退出时将数据写回目标位置的方块实体。

## 1. 概述

在原版中，当活塞推动一个带有方块实体的方块（如箱子、熔炉）时，该行为不会产生任何效果。本模块通过注入活塞的移动逻辑，让实现了
`IMoveableEntityBlock` 的方块能够：

- **在移动前** 提取方块实体数据（`clearData`）
- **在移动过程中** 将数据暂存于 `PistonMovingBlockEntity`
- **在移动结束/最终移除时** 将数据写回新位置的方块实体（`setData`）

整个过程对服务端透明，无需修改原版活塞的核心逻辑。

## 2. 核心接口

### `IMoveableEntityBlock`

```java
public interface IMoveableEntityBlock extends EntityBlock {
    /**
     * 当方块被推动时调用，返回需要传递给移动状态的方块实体数据。
     * @param level 世界
     * @param pos   当前方块位置（移动前）
     * @return 需要保留的 NBT 数据，默认返回空 CompoundTag
     */
    default CompoundTag clearData(Level level, BlockPos pos) {
        return new CompoundTag();
    }

    /**
     * 当移动结束或方块实体被最终放置时调用，将之前提取的数据写入目标位置的方块实体。
     * @param level 世界
     * @param pos   目标位置
     * @param nbt   clearData 返回的数据
     */
    default void setData(Level level, BlockPos pos, CompoundTag nbt) {
    }
}
```

**要求**：方块类必须实现该接口（或通过方块实体实现），且由于扩展了 `EntityBlock`，还需要提供 `newBlockEntity` 方法。

### `IPistonMovingBlockEntityExtension`

```java
public interface IPistonMovingBlockEntityExtension {
    // 清空暂存的数据并返回，供移动结束后使用
    @Nullable CompoundTag anvillib$clearData();
    // 设置暂存的数据（通常在移动开始时调用）
    void anvillib$setData(@Nullable CompoundTag nbt);
    // 获取当前存储的移动状态（用于判断方块类型）
    @Nullable BlockState anvillib$getMoveState();
}
```

该接口由 Mixin 动态注入到 `PistonMovingBlockEntity` 中，作为数据的中转站。

## 3. Mixin 修改点

### `PistonBaseBlockMixin`

- **`isPushable` 条件扩展**：在检测方块是否有方块实体时，额外排除实现了 `IMoveableEntityBlock`
  的方块（因为它们会自行处理数据，不应被原版的实体检查拦截）。
- **`moveBlocks` 注入**：在即将用 `MovingPistonBlock` 替换原始方块时，调用 `IMoveableEntityBlock.clearData` 获取数据，并存入
  `anvillib$nbt` 临时字段。之后在创建 `MovingBlockEntity` 时，通过 `IPistonMovingBlockEntityExtension.setData` 将数据传入。

### `PistonMovingBlockEntityMixin`

- 让 `PistonMovingBlockEntity` 实现 `IPistonMovingBlockEntityExtension`，并在内部维护一个 `CompoundTag`。
- 在 `tick` 方法（活塞正常工作结束）和 `finalTick`（活塞被破坏）时，调用 `anvillib$clearData` 取出数据，若移动到的目标方块实现了
  `IMoveableEntityBlock`，则调用其 `setData` 完成数据恢复。

**所有操作均在服务端执行**，通过 `level.isClientSide()` 判断避免客户端副作用。

## 4. 使用步骤

1. **让方块类实现 `IMoveableEntityBlock`**
   ```java
   public class MyBlock extends BaseEntityBlock implements IMoveableEntityBlock {
       // 实现 EntityBlock 的 newBlockEntity 方法
       
       @Override
       public CompoundTag clearData(Level level, BlockPos pos) {
           BlockEntity be = level.getBlockEntity(pos);
           if (be instanceof MyBlockEntity myBE) {
               CompoundTag tag = new CompoundTag();
               myBE.saveAdditional(tag, level.registryAccess()); // 保存额外数据
               return tag;
           }
           return new CompoundTag();
       }
       
       @Override
       public void setData(Level level, BlockPos pos, CompoundTag nbt) {
           BlockEntity be = level.getBlockEntity(pos);
           if (be instanceof MyBlockEntity myBE) {
               myBE.loadAdditional(nbt, level.registryAccess()); // 恢复数据
           }
       }
   }
   ```

2. **方块实体按常规方式实现**，无需额外操作。  
   但需注意 `setData` 调用时，方块实体可能刚被创建，应通过 `loadAdditional` 合理加载。

3. **确保 Mixin 配置正确**：本模块的 Mixin 已包含在 AnvilLib 中，模组依赖 AnvilLib 即可获得功能。

## 5. 注意事项

- **仅支持服务端逻辑**：所有数据传递均在服务端进行，客户端不会保留额外数据（因此渲染或客户端缓存需另行处理）。
- **数据安全**：`clearData` 应返回方块实体中需要保留的自定义数据，而不是将整个方块实体序列化，避免与原版保存逻辑冲突。
- **兼容性**：`IMoveableEntityBlock` 继承自 `EntityBlock`，若你的方块已经是一个 `EntityBlock` 的子类（如 `BaseEntityBlock`
  ），只需额外实现该接口即可。
- **性能**：仅在活塞移动时触发，对常规游戏性能无影响。
- **Mixin 优先级**：`PistonBaseBlockMixin` 设置 `priority = 943`，若与其他修改活塞行为的模组冲突，可根据需要调整。

## 6. 示例

以下是一个简单的示例方块，它在被活塞推动时会保留内部计数器。

```java
public class CounterBlock extends BaseEntityBlock implements IMoveableEntityBlock {
    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new CounterBlockEntity(pos, state);
    }

    @Override
    public CompoundTag clearData(Level level, BlockPos pos) {
        CounterBlockEntity be = (CounterBlockEntity) level.getBlockEntity(pos);
        CompoundTag tag = new CompoundTag();
        if (be != null) {
            tag.putInt("counter", be.counter);
        }
        return tag;
    }

    @Override
    public void setData(Level level, BlockPos pos, CompoundTag nbt) {
        CounterBlockEntity be = (CounterBlockEntity) level.getBlockEntity(pos);
        if (be != null) {
            be.counter = nbt.getInt("counter");
            be.setChanged();
        }
    }
}
```