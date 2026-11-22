# Moveable Entity Block (`module.moveable-entity-block`)

<BranchContextCard branch="1.21.4" />

`module.moveable-entity-block` (artifact `anvillib-moveable-entity-block-neoforge-1.21.4`, package `dev.anvilcraft.lib.v2.piston`) breaks vanilla Minecraft's hardcoded rule that blocks with a `BlockEntity` cannot be pushed by pistons via Mixins and interface injection.

In vanilla `PistonBaseBlock#isPushable`, whenever `state.hasBlockEntity()` is `true`, pistons refuse to push. With this module, **simply have your block class implement `IMoveableEntityBlock` (which extends `EntityBlock`)** so regular and sticky pistons can push or pull it while:
1. **Automatically saving & migrating `BlockEntity` data**: detaches the `BlockEntity` reference at push start and mounts it inside `PistonMovingBlockEntity` (saved under `"anvillib:moveable_block_entity"`) and syncs to clients;
2. **Smooth rendering in transit**: during the piston extend/retract animation, `PistonHeadRendererMixin` renders not only the block model, but also any registered `BlockEntityRenderer` (BER) smoothly moving with the piston;
3. **Arrival restoration callback**: upon settling, automatically updates `worldPosition`, calls `clearRemoved()`, binds to the new coordinates, and invokes `notifyMoved`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.4`, this module is included automatically. To depend on `moveable-entity-block` standalone:

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.4:$anvillibVersion")
    // If you need to call injected methods on PistonMovingBlockEntity directly in code, declare:
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.4:$anvillibVersion")
}
```

---

## 2. Full Code Example: Implementing a Piston-Pushable Machine Block

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
import org.jetbrains.annotations.Nullable;

// Implement IMoveableEntityBlock (already extends EntityBlock)
public class PortableGeneratorBlock extends Block implements IMoveableEntityBlock {
    public PortableGeneratorBlock(Properties properties) {
        // Note: do not set pushReaction to PushReaction.BLOCK; keep pushable reactions like NORMAL or DESTROY
        super(properties.pushReaction(PushReaction.NORMAL));
    }

    @Override
    public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new PortableGeneratorBlockEntity(pos, state);
    }

    /**
     * Optional override: fired after the piston finishes moving and the block entity is re-attached at new (pos)
     */
    @Override
    public void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (!level.isClientSide() && be instanceof PortableGeneratorBlockEntity generator) {
            // Notify the machine to rescan nearby power grid connections or wake neighbors at the new position
            generator.onRelocated(level, pos);
        }
    }
}
```

---

## 3. Lifecycle & Common Pitfalls

### 1. Full Timeline of Pushing an `IMoveableEntityBlock`

1. **Check phase (`PistonBaseBlockMixin#isPushable`)**:
   In `PistonBaseBlock.isPushable`, if `state.getBlock() instanceof IMoveableEntityBlock`, skips vanilla's `state.hasBlockEntity()` rejection and proceeds to hardness (`getDestroySpeed != -1.0F`) and `PushReaction` checks. To make a state temporarily unpushable, return `PushReaction.BLOCK` from `getPistonPushReaction`.
2. **Push-start phase (`PistonBaseBlockMixin#setBlock` / `newMovingBlockEntity`)**:
   Before the source block is replaced with `Blocks.MOVING_PISTON`, fetches its `BlockEntity`, calls `level.removeBlockEntity(relative)` to detach it from the world, and writes it to the new `PistonMovingBlockEntity` via `anvillib$setBlockEntity(...)`.
3. **Persistence & transit rendering (`PistonMovingBlockEntityMixin` / `PistonHeadRendererMixin`)**:
   - `saveAdditional` writes the carried `BlockEntity` via `saveWithFullMetadata` into `"anvillib:moveable_block_entity"`; `loadAdditional` decodes via `BuiltInRegistries.BLOCK_ENTITY_TYPE.byNameCodec()` and restores component data (`loadWithComponents`);
   - Client `PistonHeadRendererMixin` reads `anvillib$getBlockEntity()` after rendering the moving piston head, translates by `(getXOff, getYOff, getZOff)`, and invokes the corresponding `BlockEntityRenderer`.
4. **Arrival & settling phase (`PistonMovingBlockEntityMixin#tick` / `finalTick`)**:
   On the server (`!level.isClientSide()`), after placing the target `BlockState`, pops the `BlockEntity` via `anvillib$clearBlockEntity()`, updates `worldPosition` to `pos`, calls `be.clearRemoved()`, `level.removeBlockEntity(pos)`, and `level.setBlockEntity(be)`, and finally fires **`IMoveableEntityBlock#notifyMoved(level, pos, state, be)`**.

### 2. Common Pitfalls

- **Do not rely on `onRemove` to read `level.getBlockEntity(pos)`**:
  During push-start, `level.removeBlockEntity(relative)` detaches the `BlockEntity` before `setBlock` replaces the block, so `Block#onRemove` cannot and should not read the old `BlockEntity` from the world (which also naturally prevents accidental container item spills when pushing begins).
- **Keep block facing & `BlockEntity` state consistent**:
  Piston movement does not alter the block's `BlockState` facing property, but if your `BlockEntity` caches coordinate-dependent data (adjacent block caches, multiblock controller offsets), be sure to refresh them in `notifyMoved`.

---

## 4. Public Interface API Reference

### 1. `IMoveableEntityBlock` (`dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock`)

Extends `net.minecraft.world.level.block.EntityBlock`.

| Method Signature | Default | Description |
| :--- | :--- | :--- |
| `default void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be)` | Empty | Fired on the server (`!level.isClientSide()`) after the moveable block entity settles at `pos` and is re-attached to `Level`. |

### 2. `IPistonMovingBlockEntityExtension` (Internal Extension Injected onto `PistonMovingBlockEntity`)

Located in `dev.anvilcraft.lib.v2.piston.injection.IPistonMovingBlockEntityExtension` (all methods `@ApiStatus.Internal`):

| Method Signature | Description |
| :--- | :--- |
| `default @Nullable BlockEntity anvillib$getBlockEntity()` | Gets the block entity currently carried by this `PistonMovingBlockEntity`. |
| `default void anvillib$setBlockEntity(@Nullable BlockEntity blockEntity)` | Sets the block entity carried by this moving piston. |
| `default @Nullable BlockEntity anvillib$clearBlockEntity()` | Retrieves and clears the carried block entity reference. |
