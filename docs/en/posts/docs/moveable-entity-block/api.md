---
title: Moveable Entity Block Core Interfaces
prev: false
next: false
---

# Core Interfaces <Badge type="tip" text=">=1.21.1" /> <Badge type="danger" text="API changed in 26.1" />

> **Breaking Change**: In version 26.1, the `IMoveableEntityBlock` API has been completely redesigned from NBT-based `clearData`/`setData` to data-driven
> `storeData`/`loadData`. Choose the appropriate API based on your target version.

---

## Version Selection

| Minecraft | API                      | Data Carrier                   | Documentation Section                                                          |
|-----------|--------------------------|--------------------------------|--------------------------------------------------------------------------------|
| 1.21.1    | `clearData` / `setData`  | `CompoundTag`                  | [1.21.1 API](#1211-api-cleardatasetdata)                                       |
| 26.1      | `storeData` / `loadData` | `ValueInput` / `ValueOutput`   | [26.1 API](#261-api-storedataloaddata) <Badge type="tip" text="current" />    |

---

## 1.21.1 API: clearData / setData

<Badge type="info" text="1.21.1" />

### IMoveableEntityBlock (1.21.1)

Interface that blocks must implement, extending `EntityBlock`.

```java
public interface IMoveableEntityBlock extends EntityBlock {
    /**
     * Called when the block is about to be pushed. Returns the block entity data
     * that needs to be passed to the movement state.
     * @param level The world
     * @param pos   The current block position (before movement)
     * @return The NBT data to preserve; returns an empty CompoundTag by default
     */
    default CompoundTag clearData(Level level, BlockPos pos) {
        return new CompoundTag();
    }

    /**
     * Called when movement ends or the block entity is finally placed, writing
     * the previously extracted data to the destination position.
     * @param level The world
     * @param pos   The destination position
     * @param nbt   The data returned by clearData
     */
    default void setData(Level level, BlockPos pos, CompoundTag nbt) {
    }
}
```

#### clearData Implementation

Called when the block is about to be pushed by a piston. Should extract only the custom data from the block entity that needs to be preserved (rather than serializing the entire block entity), returning the NBT to be transferred:

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

#### setData Implementation

Called when movement ends and the block entity is created at the new position:

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

### Data Flow (1.21.1)

```
Movement start:
  BlockEntity (source position)
    → IMoveableEntityBlock.clearData() → CompoundTag
    → PistonBaseBlockMixin stores into anvillib$nbt (CompoundTag)
    → IPistonMovingBlockEntityExtension.setData(tag)
    → Temporarily stored in PistonMovingBlockEntity

Movement end:
  PistonMovingBlockEntity
    → IPistonMovingBlockEntityExtension.clearData() → CompoundTag
    → IMoveableEntityBlock.setData(pos, tag)
    → Written to the BlockEntity at the destination
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

In version 26.1, the API has migrated from manual NBT operations to NeoForge's native `ValueInput`/`ValueOutput` data-driven system.

### IMoveableEntityBlock (26.1)

```java
public interface IMoveableEntityBlock extends EntityBlock {
    /**
     * Called when the block is about to be pushed. Writes the block entity data
     * that needs to be preserved to the ValueOutput.
     * @param level   The world
     * @param pos     The current block position (before movement)
     * @param output  Data output (write data via ValueOutput instead of returning CompoundTag)
     */
    default void storeData(Level level, BlockPos pos, ValueOutput output) {
    }

    /**
     * Called when movement ends or the block entity is finally placed. Reads
     * previously saved data from the ValueInput.
     * @param level The world
     * @param pos   The destination position
     * @param input Data input (read data via ValueInput instead of receiving CompoundTag)
     */
    default void loadData(Level level, BlockPos pos, ValueInput input) {
    }
}
```

#### storeData Implementation

```java
@Override
public void storeData(Level level, BlockPos pos, ValueOutput output) {
    BlockEntity be = level.getBlockEntity(pos);
    if (be instanceof MyBlockEntity myBE) {
        // Write data through ValueOutput acceptor methods
        // The specific implementation depends on NeoForge 26.1's ValueOutput API
    }
}
```

#### loadData Implementation

```java
@Override
public void loadData(Level level, BlockPos pos, ValueInput input) {
    BlockEntity be = level.getBlockEntity(pos);
    if (be instanceof MyBlockEntity myBE) {
        // Read data via ValueInput and restore to the block entity
    }
}
```

### Data Flow (26.1)

```
Movement start:
  BlockEntity (source position)
    → IMoveableEntityBlock.storeData(level, pos, output)
    → output writes to TagValueOutput
    → PistonBaseBlockMixin calls anvillib$nbt.buildResult()
    → Temporarily stored in PistonMovingBlockEntity

Movement end:
  PistonMovingBlockEntity
    → IPistonMovingBlockEntityExtension.clearData()
    → IMoveableEntityBlock.loadData(level, pos, input)
    → input reads data from TagValueInput
    → Restores the BlockEntity at the destination
```

### Key Differences

| Aspect               | 1.21.1                                  | 26.1                                             |
|----------------------|-----------------------------------------|--------------------------------------------------|
| Data carrier         | `CompoundTag` (manual NBT)              | `ValueInput` / `ValueOutput` (data-driven)       |
| Return style         | `clearData() → CompoundTag`             | `storeData(..., ValueOutput)` (write via output parameter) |
| Mixin temp field     | `CompoundTag anvillib$nbt`              | `TagValueOutput anvillib$nbt`                    |
| Error handling       | No specific error reporting             | Uses `ProblemReporter.ScopedCollector`           |
| Save completeness    | Must manually select fields to save     | Can auto-serialize via `saveWithFullMetadata`    |

### IPistonMovingBlockEntityExtension (26.1)

The interface signature is consistent with 1.21.1 (`clearData`/`setData` method names are preserved), but internal data types have changed from `CompoundTag` to the data-driven `TagValueOutput`:

```java
public interface IPistonMovingBlockEntityExtension {
    // Method names unchanged; internal implementation uses TagValueOutput
    @Nullable TagValueOutput anvillib$clearData();
    void anvillib$setData(@Nullable TagValueOutput nbt);
    @Nullable BlockState anvillib$getMoveState();
}
```

Mod developers do not need to use this interface directly -- the Mixin layer handles data injection and extraction automatically.

### AnvilLibMoveableEntityBlock

<Badge type="tip" text="26.1" />

New helper class added in 26.1:

```java
public class AnvilLibMoveableEntityBlock {
    public static final Logger LOGGER = ...;
}
```

Used by `PistonBaseBlockMixin` to provide unified logging.

### Migration Checklist (1.21.1 → 26.1)

1. Replace `clearData(Level, BlockPos) → CompoundTag` with `storeData(Level, BlockPos, ValueOutput)`
2. Replace `setData(Level, BlockPos, CompoundTag)` with `loadData(Level, BlockPos, ValueInput)`
3. Remove manual NBT operations (`CompoundTag.putInt()`, etc.) and use the data-driven `ValueOutput`/`ValueInput` API instead
4. Check for compilation errors: `CompoundTag` is no longer used as a return/parameter type
5. If custom Mixins reference the `anvillib$nbt` field, update the field type
