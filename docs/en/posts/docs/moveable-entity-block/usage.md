---
title: Moveable Entity Block Usage Guide
prev: false
next: false
---

# Mixin and Usage Guide <Badge type="info" text="1.21.1 API" />

::: warning Migration to 26.1
This document describes the 1.21.1 API (`clearData`/`setData` + `CompoundTag`). Version 26.1 uses the new `storeData`/`loadData` + `ValueInput`/`ValueOutput` API. See the [core interfaces documentation](./api) for the migration guide.
:::

## Applicable Versions

| Content                       | Applicable Versions                                                         |
|-------------------------------|-----------------------------------------------------------------------------|
| Mixin modification points     | 1.21.1 / 26.1 (Mixin structure is the same, internal implementation differs) |
| Usage steps and code examples | 1.21.1 (`clearData`/`setData`)                                              |
| 26.1 New API                  | See [Core Interfaces § 26.1 API](./api#261-api-storedataloaddata)           |

## Mixin Modification Points

### PistonBaseBlockMixin

- **`isPushable` condition extension**: When checking whether a block has a block entity, additionally excludes blocks that implement `IMoveableEntityBlock`
  (because they handle their own data and should not be blocked by vanilla's entity check)
- **`moveBlocks` injection**: Before replacing the original block with `MovingPistonBlock`, calls `IMoveableEntityBlock.clearData` to obtain data and stores it in
  the `anvillib$nbt` temporary field. When creating the `MovingBlockEntity`, passes the data through `IPistonMovingBlockEntityExtension.setData`

### PistonMovingBlockEntityMixin

- Makes `PistonMovingBlockEntity` implement `IPistonMovingBlockEntityExtension` and internally maintains a `CompoundTag`
- In the `tick` method (piston normal operation ends) and `finalTick` (piston destroyed), calls `anvillib$clearData` to retrieve the data
- If the destination block implements `IMoveableEntityBlock`, calls its `setData` to complete the data restoration

**All operations are performed server-side** (checked via `level.isClientSide()`).

## Usage Steps

### Step 1: Make Your Block Implement IMoveableEntityBlock

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

### Step 2: Ensure Mixin Configuration is Correct

This module's Mixins are already included in AnvilLib; mods that depend on AnvilLib automatically gain the functionality.

### Step 3: Implement the Block Entity Normally

Implement the block entity as usual, with no extra steps required. When `setData` is called, the block entity may have just been created, so data should be properly loaded via `loadAdditional`.

## Complete Example: A Counter-Preserving Block

```java
// Block
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

// Block Entity
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

## Notes

- **Data safety**: `clearData` should return a subset of custom data to avoid conflicts with vanilla save logic
- **Compatibility**: `IMoveableEntityBlock` extends `EntityBlock`; if your block is already a `BaseEntityBlock` subclass, you only need to additionally implement this interface
- **Performance**: Only triggered during piston movement, no impact on normal game performance
- **Client rendering**: All data transfer occurs server-side; the client does not retain additional data. Rendering or client-side caching must be handled separately
- **Mixin priority**: `priority = 943`; can be adjusted if conflicting with other piston-modifying mods
