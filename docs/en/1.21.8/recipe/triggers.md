# Triggers System (`dev.anvilcraft.lib.v2.recipe.trigger`)

<BranchContextCard branch="1.21.8" />

In `module.recipe`, a **Trigger (`IRecipeTrigger`)** determines "when to look up and execute a class of in-world recipes".

`InWorldRecipeManager` internally groups all `InWorldRecipe`s by `IRecipeTrigger` and builds an independent block pruning graph (`PrunePlan`) per trigger. When a world action occurs (item falling into a cauldron, anvil smash, multiblock pulse, or player right-clicking with a wand), simply construct an `InWorldRecipeContext` and call `inWorldRecipeManager.trigger(myTrigger, ctx)` to evaluate only recipes bound to that trigger.

---

## 1. Built-in Trigger & How It Works

### 1. `LibRecipeTriggers.ITEM_INTO_BLOCK` (`anvillib_recipe:item_into_block`)

`module.recipe` provides one general built-in trigger, **`LibRecipeTriggers.ITEM_INTO_BLOCK`**:
- **Trigger mechanism**: At the end of each `ItemEntity#tick` (`@At("RETURN")`), `ItemEntityMixin` checks if `BlockPos.containing(this.position())` differs from the previous tick's `anvillib$blockPos`; if the item entered a new block cell, it posts `ItemEntityEvent.InToBlock(level, entity, blockPos, pos, motion)` on `NeoForge.EVENT_BUS`;
- **Built-in listener**: `ItemEntityEventListener#onItemEntityInToBlock` listens to that event on `ServerLevel`, creates an `InWorldRecipeContext` with `event.getPos()` (exact floating-point coords of `ItemEntity`) and `event.getEntity()`, triggers `LibRecipeTriggers.ITEM_INTO_BLOCK` via `serverLevel.recipeAccess().anvillib$getInWorldRecipeManager()`, and calls `context.accept()` to commit changes.

### 2. Config (`AnvilLibRecipeConfig`)

`AnvilLibRecipe.CONFIG` (config name `anvillib_recipe`, group `anvillib`) provides one global option:

| Field | Type | Default | Range | Description |
| :--- | :--- | :---: | :---: | :--- |
| `AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency` | `int` | `64` | `[1, 128]` | Global cap on max consecutive batches a single recipe can run per trigger (effective cap is `Math.min(recipe.maxEfficiency(), AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency)`). |

---

## 2. Full Code Example: Registering a Custom Trigger & Firing Recipes from Blocks/Events

When implementing custom recipes like "anvil smash", "lightning strike on rod", or "hammer forging", register your own `IRecipeTrigger` to **`LibRegistries.TRIGGER_KEY` (`anvillib:trigger`)**:

```java
package com.example.mymod.recipe;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.init.LibRegistries;
import dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeContext;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeManager;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;
import org.jetbrains.annotations.Nullable;

public final class ModRecipeTriggers {
    // 1. Create a DeferredRegister targeting LibRegistries.TRIGGER_KEY (anvillib:trigger)
    public static final DeferredRegister<IRecipeTrigger> TRIGGERS =
        DeferredRegister.create(LibRegistries.TRIGGER_KEY, MyMod.MOD_ID);

    // 2. Register a custom trigger (or pass IRecipeTrigger.Impl::new for default priority)
    public static final DeferredHolder<IRecipeTrigger, IRecipeTrigger> ON_HAMMER_SMASH =
        TRIGGERS.register("on_hammer_smash", id -> new IRecipeTrigger() {
            @Override
            public int priority() {
                return 10;
            }
        });

    private ModRecipeTriggers() {
    }

    public static void register(IEventBus modEventBus) {
        TRIGGERS.register(modEventBus);
    }

    /**
     * 3. Fire the in-world recipe in your block interaction, entity landing, or event handler:
     */
    public static void triggerHammerSmash(ServerLevel level, BlockPos targetPos, @Nullable Entity sourceEntity) {
        // Create recipe context centered at Vec3.atCenterOf(targetPos) as (0, 0, 0)
        InWorldRecipeContext ctx = new InWorldRecipeContext(level, Vec3.atCenterOf(targetPos), sourceEntity);

        // Get the injected InWorldRecipeManager from ServerLevel#recipeAccess() and trigger
        InWorldRecipeManager manager = level.recipeAccess().anvillib$getInWorldRecipeManager();
        manager.trigger(ON_HAMMER_SMASH.get(), ctx);

        // 4. Critical step: call ctx.accept() to commit all cached item/block/entity changes to the world!
        ctx.accept();
    }
}
```

> **Important Reminder: Don't forget `ctx.accept()`!**
> While `manager.trigger(trigger, ctx)` runs, all predicate consumptions and outcome spawns are only recorded in `InWorldRecipeContext`'s caches (`ItemCache`, `BlockCache`, `EntityCache`) and commit queues (`acceptors` / `afterCommit`). **You must call `ctx.accept()` after `trigger(...)` returns** for world changes to take effect in order.

---

## 3. Trigger Public API Reference

### 1. `IRecipeTrigger` & `IRecipeTrigger.Impl`

Located in `dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger`, extending `IPrioritized`.

| Method / Class Signature | Default Return Value | Description |
| :--- | :--- | :--- |
| `Codec<IRecipeTrigger> CODEC` | `LibRegistries.TRIGGER_REGISTRY.byNameCodec()` | Serialization codec based on custom trigger registry `anvillib:trigger`. |
| `default @Nullable ResourceLocation getId()` | `LibRegistries.TRIGGER_REGISTRY.getKey(this)` | Gets this trigger's registry ID in `LibRegistries.TRIGGER_REGISTRY`. |
| `default int priority()` | `1` | Base priority contributed by the trigger (summed in `InWorldRecipe.calcPriority`). |
| `record IRecipeTrigger.Impl(ResourceLocation id) implements IRecipeTrigger` | `getId()` returns `id` | Default stateless trigger implementation; pass `IRecipeTrigger.Impl::new` directly to `DeferredRegister#register(String, Function<ResourceLocation, ...>)`. |

### 2. `LibRecipeTriggers` & Custom Trigger Registry

| Symbol | Registry / ID | Description |
| :--- | :--- | :--- |
| `LibRegistries.TRIGGER_KEY` | `anvillib:trigger` | Trigger registry `ResourceKey<Registry<IRecipeTrigger>>` with `.sync(true)` and `maxId(512)`. |
| `LibRegistries.TRIGGER_REGISTRY` | `Registry<IRecipeTrigger>` | Static trigger registry instance. |
| `LibRecipeTriggers.ITEM_INTO_BLOCK` | `anvillib_recipe:item_into_block` | Automatically fired by `ItemEntityEventListener` when an `ItemEntity` enters a new block cell. |
