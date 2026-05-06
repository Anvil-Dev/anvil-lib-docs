---
title: Moveable Entity Block 使用指南
prev: false
next: false
---

# Mixin 与使用指南 <Badge type="info" text="1.21.1 API" />

> **26.1 迁移提示**: 本文档描述 1.21.1 版本的 API（`clearData`/`setData` + `CompoundTag`）。26.1 版本使用全新的
`storeData`/`loadData` + `ValueInput`/`ValueOutput` API。迁移指南请参考[核心接口文档](./api)。

## 适用版本

| 内容          | 适用版本                                                 |
|-------------|------------------------------------------------------|
| Mixin 修改点说明 | 1.21.1 / 26.1（Mixin 结构一致，内部实现不同）                     |
| 使用步骤与代码示例   | 1.21.1（`clearData`/`setData`）                        |
| 26.1 新 API  | 参见[核心接口 § 26.1 API](./api#261-api-storedataloaddata) |

## Mixin 修改点

### PistonBaseBlockMixin

- **`isPushable` 条件扩展**：在检测方块是否有方块实体时，额外排除实现了 `IMoveableEntityBlock`
  的方块（因为它们会自行处理数据，不应被原版的实体检查拦截）
- **`moveBlocks` 注入**：在即将用 `MovingPistonBlock` 替换原始方块时，调用 `IMoveableEntityBlock.clearData` 获取数据，并存入
  `anvillib$nbt` 临时字段。创建 `MovingBlockEntity` 时通过 `IPistonMovingBlockEntityExtension.setData` 将数据传入

### PistonMovingBlockEntityMixin

- 让 `PistonMovingBlockEntity` 实现 `IPistonMovingBlockEntityExtension`，并在内部维护一个 `CompoundTag`
- 在 `tick` 方法（活塞正常工作结束）和 `finalTick`（活塞被破坏）时，调用 `anvillib$clearData` 取出数据
- 若移动到的目标方块实现了 `IMoveableEntityBlock`，则调用其 `setData` 完成数据恢复

**所有操作均在服务端执行**（通过 `level.isClientSide()` 判断）。

## 使用步骤

### 步骤 1：让方块实现 IMoveableEntityBlock

```java
public class MyBlock extends BaseEntityBlock implements IMoveableEntityBlock {
    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new MyBlockEntity(pos, state);
    }

    @Override
    public CompoundTag clearData(Level level, BlockPos pos) {
        BlockEntity be = level.getBlockEntity(pos);
        if (be instanceof MyBlockEntity myBE) {
            CompoundTag tag = new CompoundTag();
            myBE.saveAdditional(tag, level.registryAccess());
            return tag;
        }
        return new CompoundTag();
    }

    @Override
    public void setData(Level level, BlockPos pos, CompoundTag nbt) {
        BlockEntity be = level.getBlockEntity(pos);
        if (be instanceof MyBlockEntity myBE) {
            myBE.loadAdditional(nbt, level.registryAccess());
            myBE.setChanged();
        }
    }
}
```

### 步骤 2：确保 Mixin 配置正确

本模块的 Mixin 已包含在 AnvilLib 中，模组依赖 AnvilLib 即可获得功能。

### 步骤 3：方块实体按常规实现

方块实体按常规方式实现即可，无需额外操作。`setData` 调用时，方块实体可能刚被创建，应通过 `loadAdditional` 合理加载。

## 完整示例：保留计数器的方块

```java
// 方块
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

// 方块实体
public class CounterBlockEntity extends BlockEntity {
    public int counter = 0;

    public CounterBlockEntity(BlockPos pos, BlockState state) {
        super(MyBlockEntities.COUNTER, pos, state);
    }

    @Override
    protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.saveAdditional(tag, registries);
        tag.putInt("counter", counter);
    }

    @Override
    protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.loadAdditional(tag, registries);
        counter = tag.getInt("counter");
    }
}
```

## 注意事项

- **数据安全**：`clearData` 应返回自定义数据子集，避免与原版保存逻辑冲突
- **兼容性**：`IMoveableEntityBlock` 继承 `EntityBlock`，若你的方块已经是 `BaseEntityBlock` 子类，只需额外实现该接口
- **性能**：仅在活塞移动时触发，对常规游戏性能无影响
- **客户端渲染**：所有数据传递在服务端执行，客户端不会保留额外数据。渲染或客户端缓存需另行处理
- **Mixin 优先级**：`priority = 943`，若与其他修改活塞行为的模组冲突可调整
