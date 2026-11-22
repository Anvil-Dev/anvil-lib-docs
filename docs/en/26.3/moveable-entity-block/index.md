# Moveable Entity Block (`module.moveable-entity-block`)

<BranchContextCard branch="26.3" />

`module.moveable-entity-block` (artifact `anvillib-moveable-entity-block-neoforge-26.3`, package `dev.anvilcraft.lib.v2.piston`) lifts vanilla Minecraft's hardcoded restriction that blocks with a `BlockEntity` cannot be pushed by pistons, **preserving the original `BlockEntity` instance, NBT data components (`ValueInput` / `ValueOutput`), and client `BlockEntityRenderer` dynamic rendering during movement**.

---

## 1. Setup (Including Interface Injection)

If you already depend on the aggregate artifact `anvillib-neoforge-26.3`, the runtime code is included automatically. To depend on it standalone or call extension methods injected onto `PistonMovingBlockEntity` / `PistonHeadRenderState` directly, configure `build.gradle.kts`:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.3:2.0.0")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.3:2.0.0")
}
```

---

## 2. Core Mechanics & Lifecycle

This module does not require manually overriding `clearData` / `setData` NBT serialization; instead, Mixins migrate the `BlockEntity` instance directly in memory and save sub-tags using 26.3's `ValueOutput` / `ValueInput` during chunk saving/sync:

1. **Allowing piston pushability check (`PistonBaseBlockMixin#isPushable`)**:
   When vanilla `PistonBaseBlock.isPushable` checks `state.hasBlockEntity()`, if `state.getBlock() instanceof IMoveableEntityBlock`, it returns `false` (telling the vanilla piston the block has no immovable block entity), allowing push/pull (provided the block's own `PushReaction` is not `BLOCK` and hardness is not `-1`).
2. **Extracting and transferring the instance on push start (`PistonBaseBlockMixin#moveBlocks`)**:
   Before vanilla pistons replace the source block with `MovingPistonBlock`, the Mixin retrieves the existing `BlockEntity` from `level.getBlockEntity(relative)`, unbinds it via `level.removeBlockEntity(relative)`, and attaches it to the newly created `PistonMovingBlockEntity` via `IPistonMovingBlockEntityExtension#anvillib$setBlockEntity`.
3. **Client BER rendering in transit (`PistonHeadRendererMixin`)**:
   During the 2-tick piston animation, `PistonHeadRenderer` extracts the carried `BlockEntity` from `PistonMovingBlockEntity` in `extractRenderState`, delegates to its `BlockEntityRenderer` to extract `BlockEntityRenderState`, stores it in `PistonHeadRenderState#anvillib$setExtraState`, and submits it at the interpolated piston offset `(xOffset, yOffset, zOffset)` in `submit`—so chests, custom machine rotors, and other BER models do not vanish or degrade while moving.
4. **Persistence while in transit (`PistonMovingBlockEntityMixin#saveAdditional` / `loadAdditional`)**:
   If a chunk unloads or the world saves mid-push, the carried `BlockEntity` is saved via `output.child("anvillib:moveable_block_entity")` calling `saveWithFullMetadata(child)`; on reload, it reconstructs the `BlockEntity` from `"id"` and calls `loadWithComponents(valueInput)`.
5. **Restoring on arrival & callback (`PistonMovingBlockEntityMixin#tick` / `finalTick`)**:
   When the piston finishes moving and places `newState` on the server, the Mixin retrieves the `BlockEntity`, updates its `worldPosition` to the new coordinates, calls `clearRemoved()` and `level.setBlockEntity(blockEntity)`, and finally invokes `IMoveableEntityBlock#notifyMoved(level, pos, newState, blockEntity)`.

---

## 3. Full Code Example

The example below shows how to write a custom machine block with inventory and working state that can be pushed/pulled by regular and sticky pistons and refreshes its network or neighbor state upon arrival:

```java
package com.example.mymod.block;

import com.example.mymod.block.entity.PortableGeneratorBlockEntity;
import com.mojang.serialization.MapCodec;
import dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.PushReaction;
import org.jetbrains.annotations.Nullable;

// Simply implement IMoveableEntityBlock (which extends EntityBlock)
public class PortableGeneratorBlock extends BaseEntityBlock implements IMoveableEntityBlock {
    public static final MapCodec<PortableGeneratorBlock> CODEC = simpleCodec(PortableGeneratorBlock::new);

    public PortableGeneratorBlock(BlockBehaviour.Properties properties) {
        // Ensure pushReaction is NORMAL (default), not PushReaction.BLOCK
        super(properties.pushReaction(PushReaction.NORMAL));
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    public RenderShape getRenderShape(BlockState state) {
        return RenderShape.MODEL;
    }

    @Override
    public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new PortableGeneratorBlockEntity(pos, state);
    }

    /**
     * Optional override: triggered on the server after the piston finishes moving this block entity to its new position
     */
    @Override
    public void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be) {
        if (be instanceof PortableGeneratorBlockEntity generator) {
            // e.g., notify the block entity of updated coordinates, reconnect power grid, or call setChanged()
            generator.onRelocated(pos);
            generator.setChanged();
        }
    }
}
```

---

## 4. Public Interfaces & Extension APIs

### 1. `IMoveableEntityBlock` (Core Interface)

Located in `dev.anvilcraft.lib.v2.piston.IMoveableEntityBlock`, extending vanilla `net.minecraft.world.level.block.EntityBlock`.

| Method Signature | Default Implementation | Timing & Parameters |
| :--- | :--- | :--- |
| `default void notifyMoved(Level level, BlockPos pos, BlockState state, BlockEntity be)` | Empty `{}` | Called **on the server only** immediately after `PistonMovingBlockEntity` finishes moving (`tick` or `finalTick`), places the target block at `pos`, and re-attaches `be` via `level.setBlockEntity(be)`.<br>• `level`: current server level<br>• `pos`: new block position after moving (`be.getBlockPos()` is already updated to `pos`)<br>• `state`: block state after moving<br>• `be`: the migrated original `BlockEntity` instance |

### 2. Interface Injection Extensions: `IPistonMovingBlockEntityExtension` & `IPistonHeadRenderStateExtension`

Both interfaces are injected onto vanilla `PistonMovingBlockEntity` and `PistonHeadRenderState` via NeoForge Interface Injection (methods marked `@ApiStatus.Internal`):

| Target Class | Injected Interface | Method Signature | Description |
| :--- | :--- | :--- | :--- |
| `PistonMovingBlockEntity` | `IPistonMovingBlockEntityExtension` | `@Nullable BlockEntity anvillib$getBlockEntity()` | Returns the `BlockEntity` currently carried by the moving piston (without clearing the reference). |
| `PistonMovingBlockEntity` | `IPistonMovingBlockEntityExtension` | `void anvillib$setBlockEntity(@Nullable BlockEntity blockEntity)` | Sets the `BlockEntity` carried by the moving piston. |
| `PistonMovingBlockEntity` | `IPistonMovingBlockEntityExtension` | `@Nullable BlockEntity anvillib$clearBlockEntity()` | Retrieves and clears the `BlockEntity` carried by the moving piston (called when the piston settles). |
| `PistonHeadRenderState` | `IPistonHeadRenderStateExtension` | `void anvillib$setExtraState(@Nullable BlockEntityRenderState state)` | Stores the pushed `BlockEntity`'s `BlockEntityRenderState` during client render-state extraction. |
| `PistonHeadRenderState` | `IPistonHeadRenderStateExtension` | `@Nullable BlockEntityRenderState anvillib$getExtraState()` | Reads the pushed `BlockEntity`'s render state during `PistonHeadRenderer#submit` on the client. |

---

## 5. Common Pitfalls & Notes

1. **Do not set `PushReaction.BLOCK` or unbreakable hardness (`-1.0f`) in `BlockBehaviour.Properties`**: `PistonBaseBlockMixin` only bypasses the `state.hasBlockEntity()` check; vanilla piston checks for `state.getPistonPushReaction() == PushReaction.BLOCK`, obsidian, bedrock, and the 12-block push limit still apply.
2. **Cached position references inside `BlockEntity`**: Because `module.moveable-entity-block` reuses the existing `BlockEntity` Java object and updates its `worldPosition`, if your `BlockEntity` caches old `BlockPos` values in extra fields (such as power grid node coords or multiblock bindings), be sure to update them in `IMoveableEntityBlock#notifyMoved`.
