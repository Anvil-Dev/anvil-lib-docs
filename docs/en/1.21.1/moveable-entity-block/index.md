# Moveable Entity Block (`module.moveable-entity-block`)

<BranchContextCard branch="1.21.1" />

`module.moveable-entity-block` (artifact `anvillib-moveable-entity-block-neoforge-1.21.1`, package `dev.anvilcraft.lib.v2.piston`) breaks vanilla Minecraft's hardcoded rule that blocks with a `BlockEntity` cannot be pushed by pistons via Mixins and interface injection.

In vanilla `PistonBaseBlock#isPushable`, whenever `state.hasBlockEntity()` is `true`, pistons refuse to push. With this module, **simply have your block class implement `IMoveableEntityBlock` (replacing plain `EntityBlock`)** so regular and sticky pistons can push or pull it while:
1. **Automatically saving & migrating `BlockEntity` data**: mounts the original `BlockEntity` (with full inventory, machine energy, and custom NBT) inside `PistonMovingBlockEntity` at push start and syncs to clients;
2. **Smooth rendering in transit**: during the piston extend/retract animation, `PistonHeadRendererMixin` renders not only the block model, but also any registered `BlockEntityRenderer` (BER) smoothly moving with the piston!
3. **Arrival callback & drop-protection**: upon settling, automatically restores NBT and triggers `notifyMoved`; if blocked from placing mid-move and broken, automatically calls `dropMovingContents` to safely release internal container items without voiding them.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.1`, this module is included automatically. To depend on `moveable-entity-block` standalone:

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.1:$anvillibVersion")
    // If you need to call injected methods on PistonMovingBlockEntity directly in code, declare:
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.1:$anvillibVersion")
}
```

---

## 2. Full Code Example: Implementing a Piston-Pushable Machine Block

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

// Implement IMoveableEntityBlock (already extends EntityBlock)
public class PortableGeneratorBlock extends Block implements IMoveableEntityBlock {
    public PortableGeneratorBlock(Properties properties) {
        // Note: do not set pushReaction to PushReaction.BLOCK; keep the default NORMAL
        super(properties.pushReaction(PushReaction.NORMAL));
    }

    @Override
    public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new PortableGeneratorBlockEntity(pos, state);
    }

    /**
     * Optional override: fired on both sides after the piston finishes moving and the block entity settles at (pos) with all NBT restored
     */
    @Override
    public void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (!level.isClientSide && be instanceof PortableGeneratorBlockEntity generator) {
            // e.g., notify the machine to rescan nearby power grid connections or wake neighbors at the new position
            generator.onRelocated(level, pos);
        }
    }

    /**
     * Optional override: fired when the moving block cannot be placed at the target position and must break into drops
     * Default implementation automatically drops items for net.minecraft.world.Container blocks;
     * If your BlockEntity uses NeoForge's ItemStackHandler, override drop logic here:
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

## 3. Lifecycle & Common Pitfalls

### 1. Full Timeline of Pushing an `IMoveableEntityBlock`

1. **Check phase (`PistonBaseBlockMixin`)**:
   In `PistonBaseBlock.isPushable`, if `state.getBlock() instanceof IMoveableEntityBlock`, bypasses vanilla's `state.hasBlockEntity()` check and proceeds to hardness (`getDestroySpeed != -1.0F`) and `PushReaction` checks (so to make a state temporarily unpushable, just return `PushReaction.BLOCK` from `getPistonPushReaction`!).
2. **Push-start phase (`PistonBaseBlock.moveBlocks`)**:
   Before the source block is replaced with `Blocks.MOVING_PISTON`, captures its `BlockEntity`, clears the old world slot reference so removal does not trigger vanilla container drops, and stores it in the new `PistonMovingBlockEntity` via `anvillib$setBlockEntity`.
3. **Transit ticking & network sync (`PistonMovingBlockEntityMixin`)**:
   - Saves the pushed `BlockEntity`'s full NBT into `"MoveableBlockEntityData"` in `saveAdditional` / `getUpdateTag` for client sync;
   - On the client, reconstructs the in-memory `BlockEntity` via `BlockEntity.loadStatic` so `PistonHeadRendererMixin` can render the moving animation each frame.
4. **Arrival & settling phase (`PistonMovingBlockEntity#finalTick` / `tick`)**:
   Once piston progress reaches `1.0F` and places the target block, migrates the carried `BlockEntity` to the new coordinate's `BlockEntity` via `saveCustomOnly` + `loadCustomOnly`, calls `setChanged()`, and invokes **`IMoveableEntityBlock#notifyMoved(level, pos, state, be)`**.

### 2. Common Pitfalls

- **Do not unconditionally drop items in `onRemove` without checking if pushed by a piston**:
  When a piston starts pushing, the framework unloads (`removeBlockEntity`) the original `BlockEntity` and transfers it to `PistonMovingBlockEntity`. As long as your standard `Block#onRemove` queries `level.getBlockEntity(pos)`, it will see `null` and naturally avoid double drops!
- **Do not query `level.getBlockEntity(pos)` inside `dropMovingContents`**:
  When `dropMovingContents(level, pos, state, be)` is called, the moving block failed to place into the world; release inventory directly from the passed `be` parameter instead of calling `level.getBlockEntity(pos)`.

---

## 4. Public Interface API Reference

### 1. `IMoveableEntityBlock` (`dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock`)

Extends `net.minecraft.world.level.block.EntityBlock`.

| Method Signature | Default | Description |
| :--- | :--- | :--- |
| `default void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be)` | Empty | Fired on both sides after the moveable block entity settles at `pos` with all NBT data restored. |
| `default void dropMovingContents(Level level, BlockPos pos, BlockState state, BlockEntity be)` | If `!level.isClientSide && be instanceof Container container && !(state.getBlock() instanceof ShulkerBoxBlock)`, calls `Containers.dropContents(level, pos, container)` | Fired on the server when a moving block cannot be placed at the target position and breaks as drops, releasing items held inside `be`. |

### 2. `IPistonMovingBlockEntityExtension` (Internal Extension Injected onto `PistonMovingBlockEntity`)

Located in `dev.anvilcraft.lib.v2.piston.injection.IPistonMovingBlockEntityExtension` (all methods `@ApiStatus.Internal`):

| Method Signature | Description |
| :--- | :--- |
| `default @Nullable BlockEntity anvillib$getBlockEntity()` | Gets the block entity currently carried by this `PistonMovingBlockEntity`. |
| `default void anvillib$setBlockEntity(@Nullable BlockEntity blockEntity)` | Sets the carried block entity and associates it with the current `level`. |
| `default @Nullable BlockEntity anvillib$clearBlockEntity()` | Retrieves and clears the carried block entity reference. |
