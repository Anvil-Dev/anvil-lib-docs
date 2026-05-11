---
title: Moveable Entity Block 核心接口
prev: false
next: false
---

# 核心接口 <Badge type="tip" text=">=1.21.1" /> <Badge type="danger" text="API changed in 26.1" />

::: danger BREAKING
26.1 版本中 `IMoveableEntityBlock` 的 API 已从 NBT 基础的 `clearData`/`setData` 完全重设计为数据驱动的 `storeData`/`loadData`。请根据你的目标版本选择对应的 API。
:::

---

## 版本选择

| Minecraft | API                      | 数据载体                         | 文档章节                                                                       |
|-----------|--------------------------|------------------------------|----------------------------------------------------------------------------|
| 1.21.1    | `clearData` / `setData`  | `CompoundTag`                | [1.21.1 API](#1211-api-cleardatasetdata)                                   |
| 26.1      | `storeData` / `loadData` | `ValueInput` / `ValueOutput` | [26.1 API](#261-api-storedataloaddata) <Badge type="tip" text="current" /> |

---

## 1.21.1 API: clearData / setData

<Badge type="info" text="1.21.1" />

### IMoveableEntityBlock (1.21.1)

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

#### clearData 实现

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

#### setData 实现

在移动结束、方块实体在新位置被创建时调用：

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

### 数据流 (1.21.1)

```
移动开始:
  BlockEntity (源位置)
    → IMoveableEntityBlock.clearData() → CompoundTag
    → PistonBaseBlockMixin 存入 anvillib$nbt (CompoundTag)
    → IPistonMovingBlockEntityExtension.setData(tag)
    → 暂存在 PistonMovingBlockEntity 中

移动结束:
  PistonMovingBlockEntity
    → IPistonMovingBlockEntityExtension.clearData() → CompoundTag
    → IMoveableEntityBlock.setData(pos, tag)
    → 写入目标位置的 BlockEntity
```

### IPistonMovingBlockEntityExtension (1.21.1)

```java
public interface IPistonMovingBlockEntityExtension {
    @Nullable CompoundTag anvillib$clearData();
    void anvillib$setData(@Nullable CompoundTag nbt);
    @Nullable BlockState anvillib$getMoveState();
}
```

---

## 26.1 API: storeData / loadData

<Badge type="tip" text="26.1" />

在 26.1 版本中，API 从手动 NBT 操作迁移为 NeoForge 原生的 `ValueInput`/`ValueOutput` 数据驱动系统。

### IMoveableEntityBlock (26.1)

```java
public interface IMoveableEntityBlock extends EntityBlock {
    /**
     * 当方块被推动时调用，将需要保留的方块实体数据写入 ValueOutput。
     * @param level  世界
     * @param pos    当前方块位置（移动前）
     * @param output 数据输出（通过 ValueOutput 写入数据，而非返回 CompoundTag）
     */
    default void storeData(Level level, BlockPos pos, ValueOutput output) {
    }

    /**
     * 当移动结束或方块实体被最终放置时调用，从 ValueInput 读取之前保存的数据。
     * @param level 世界
     * @param pos   目标位置
     * @param input 数据输入（通过 ValueInput 读取数据，而非接收 CompoundTag）
     */
    default void loadData(Level level, BlockPos pos, ValueInput input) {
    }
}
```

#### storeData 实现

```java
@Override
public void storeData(Level level, BlockPos pos, ValueOutput output) {
    BlockEntity be = level.getBlockEntity(pos);
    if (be instanceof MyBlockEntity myBE) {
        // 通过 ValueOutput 的接受器方法写入数据
        // 具体实现取决于 NeoForge 26.1 的 ValueOutput API
    }
}
```

#### loadData 实现

```java
@Override
public void loadData(Level level, BlockPos pos, ValueInput input) {
    BlockEntity be = level.getBlockEntity(pos);
    if (be instanceof MyBlockEntity myBE) {
        // 通过 ValueInput 读取数据并恢复到方块实体
    }
}
```

### 数据流 (26.1)

```
移动开始:
  BlockEntity (源位置)
    → IMoveableEntityBlock.storeData(level, pos, output)
    → output 写入 TagValueOutput
    → PistonBaseBlockMixin 调用 anvillib$nbt.buildResult()
    → 暂存在 PistonMovingBlockEntity 中

移动结束:
  PistonMovingBlockEntity
    → IPistonMovingBlockEntityExtension.clearData()
    → IMoveableEntityBlock.loadData(level, pos, input)
    → input 从 TagValueInput 读取数据
    → 恢复目标位置的 BlockEntity
```

### 关键差异

| 方面         | 1.21.1                      | 26.1                                    |
|------------|-----------------------------|-----------------------------------------|
| 数据载体       | `CompoundTag`（手动 NBT）       | `ValueInput` / `ValueOutput`（数据驱动）      |
| 返回方式       | `clearData() → CompoundTag` | `storeData(..., ValueOutput)`（通过输出参数写入） |
| Mixin 临时字段 | `CompoundTag anvillib$nbt`  | `TagValueOutput anvillib$nbt`           |
| 错误处理       | 无特定错误报告                     | 使用 `ProblemReporter.ScopedCollector`    |
| 保存完整度      | 需手动选择要保存的字段                 | 可通过 `saveWithFullMetadata` 自动序列化        |

### IPistonMovingBlockEntityExtension (26.1)

接口签名与 1.21.1 一致（`clearData`/`setData` 方法名保留），但内部数据类型从 `CompoundTag` 变为数据驱动的 `TagValueOutput`：

```java
public interface IPistonMovingBlockEntityExtension {
    // 方法名不变，内部实现使用 TagValueOutput
    @Nullable TagValueOutput anvillib$clearData();
    void anvillib$setData(@Nullable TagValueOutput nbt);
    @Nullable BlockState anvillib$getMoveState();
}
```

模组开发者无需直接使用此接口 — Mixin 层自动处理数据的注入和提取。

### AnvilLibMoveableEntityBlock

<Badge type="tip" text="26.1" />

26.1 新增的辅助类：

```java
public class AnvilLibMoveableEntityBlock {
    public static final Logger LOGGER = ...;
}
```

由 `PistonBaseBlockMixin` 使用，提供统一的日志记录。

### 迁移清单 (1.21.1 → 26.1)

1. 将 `clearData(Level, BlockPos) → CompoundTag` 替换为 `storeData(Level, BlockPos, ValueOutput)`
2. 将 `setData(Level, BlockPos, CompoundTag)` 替换为 `loadData(Level, BlockPos, ValueInput)`
3. 移除手动 NBT 操作（`CompoundTag.putInt()` 等），改用 `ValueOutput`/`ValueInput` 的数据驱动 API
4. 检查编译错误：`CompoundTag` 不再作为返回值/参数类型
5. 如有自定义 Mixin 引用 `anvillib$nbt` 字段，更新字段类型
