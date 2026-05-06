---
title: Moveable Entity Block 核心接口
prev: false
next: false
---

# 核心接口

## IMoveableEntityBlock

方块必须实现的接口，继承 `EntityBlock`。

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
     * 当移动结束或方块实体被最终放置时调用，将之前提取的数据写入目标位置。
     * @param level 世界
     * @param pos   目标位置
     * @param nbt   clearData 返回的数据
     */
    default void setData(Level level, BlockPos pos, CompoundTag nbt) {
    }
}
```

### clearData

在方块即将被活塞推动时调用。应提取方块实体中需要保留的自定义数据（而非将整个方块实体序列化），返回待传递的 NBT：

```java
@Override
public CompoundTag clearData(Level level, BlockPos pos) {
    BlockEntity be = level.getBlockEntity(pos);
    if (be instanceof MyBlockEntity myBE) {
        CompoundTag tag = new CompoundTag();
        tag.putInt("customValue", myBE.customValue);
        myBE.saveAdditional(tag, level.registryAccess());
        return tag;
    }
    return new CompoundTag();
}
```

### setData

在移动结束、方块实体在新位置被创建时调用。将 `clearData` 返回的 NBT 恢复：

```java
@Override
public void setData(Level level, BlockPos pos, CompoundTag nbt) {
    BlockEntity be = level.getBlockEntity(pos);
    if (be instanceof MyBlockEntity myBE) {
        myBE.customValue = nbt.getInt("customValue");
        myBE.loadAdditional(nbt, level.registryAccess());
        myBE.setChanged();
    }
}
```

## IPistonMovingBlockEntityExtension

由 Mixin 动态注入到 `PistonMovingBlockEntity` 中，作为数据中转站。

```java
public interface IPistonMovingBlockEntityExtension {
    // 清空暂存数据并返回（供移动结束后使用）
    @Nullable CompoundTag anvillib$clearData();

    // 设置暂存数据（通常在移动开始时调用）
    void anvillib$setData(@Nullable CompoundTag nbt);

    // 获取当前存储的移动状态（用于判断方块类型）
    @Nullable BlockState anvillib$getMoveState();
}
```

**模组开发者无需直接使用此接口** — Mixin 层自动处理数据的注入和提取。

## 数据流

```
移动开始:
  BlockEntity (源位置)
    → IMoveableEntityBlock.clearData() → CompoundTag
    → IPistonMovingBlockEntityExtension.setData(tag)
    → 暂存在 PistonMovingBlockEntity 中

移动结束:
  PistonMovingBlockEntity
    → IPistonMovingBlockEntityExtension.clearData() → CompoundTag
    → IMoveableEntityBlock.setData(pos, tag)
    → 写入目标位置的 BlockEntity
```
