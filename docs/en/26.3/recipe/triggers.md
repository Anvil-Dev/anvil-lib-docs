# Recipe Triggers (`IRecipeTrigger` / `LibRecipeTriggers`)

<BranchContextCard branch="26.3" />

In `module.recipe`, a **Trigger (`IRecipeTrigger`)** is the index key linking a world event (such as an item falling into a block, anvil smash, redstone pulse, or multiblock activation) to its associated `InWorldRecipe`s. When loading datapack recipes, `InWorldRecipeManager` groups and priority-sorts all `InWorldRecipe`s by `IRecipeTrigger`, so when an event fires it only evaluates recipes under that trigger rather than scanning all recipes.

---

## 1. Problem & Usage

1. **Using the Built-in Trigger (`LibRecipeTriggers.ITEM_INTO_BLOCK`)**:
   `module.recipe` provides `anvillib_recipe:item_into_block`, and `ItemEntityEventListener` automatically listens for `ItemEntity` movement/entry into blocks. If your recipe triggers when tossing items into a block (e.g., cauldron, fire, machine block), use `LibRecipeTriggers.ITEM_INTO_BLOCK.get()` directly with no event listener code needed.
2. **Registering & Firing a Custom `IRecipeTrigger`**:
   If your mod has custom world interactions (e.g., hammering a block, lightning striking a rod, multiblock ticking), register your own `IRecipeTrigger` to `LibRegistries.TRIGGER_REGISTRY`, construct an `InWorldRecipeContext`, and call `InWorldRecipeManager#trigger(myTrigger, ctx)`.

---

## 2. Full Code Example: Registering & Firing a Custom Trigger

### 1. Registering a Custom `IRecipeTrigger`

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.init.LibRegistries;
import dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

public final class ModRecipeTriggers {
    public static final DeferredRegister<IRecipeTrigger> TRIGGERS =
        DeferredRegister.create(LibRegistries.TRIGGER_REGISTRY, MyMod.MOD_ID);

    // Approach A: Use IRecipeTrigger.Impl::new directly (default priority 0)
    public static final DeferredHolder<IRecipeTrigger, IRecipeTrigger> HAMMER_SMASH =
        TRIGGERS.register("hammer_smash", IRecipeTrigger.Impl::new);

    // Approach B: Custom implementation to specify a higher base priority
    public static final DeferredHolder<IRecipeTrigger, IRecipeTrigger> LIGHTNING_STRIKE =
        TRIGGERS.register("lightning_strike", () -> new IRecipeTrigger() {
            @Override
            public int priority() {
                return 100;
            }
        });

    public static void register(IEventBus modEventBus) {
        TRIGGERS.register(modEventBus);
    }
}
```

### 2. Firing the Trigger on World Interaction

```java
package com.example.mymod.event;

import com.example.mymod.init.ModRecipeTriggers;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeContext;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeManager;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

public final class HammerSmashHandler {
    private HammerSmashHandler() {
    }

    public static void onPlayerSmashBlock(ServerLevel level, BlockPos hitPos, Player player) {
        // 1. Obtain the InWorldRecipeManager attached to the ServerLevel's RecipeManager
        InWorldRecipeManager manager = level.recipeAccess().anvillib$getInWorldRecipeManager();

        // 2. Construct InWorldRecipeContext at the bottom center or center of the struck block
        Vec3 origin = Vec3.atCenterOf(hitPos);
        InWorldRecipeContext context = new InWorldRecipeContext(level, origin, player);

        // 3. Fire the custom trigger and commit cached block/item/entity changes to the real world
        manager.trigger(ModRecipeTriggers.HAMMER_SMASH.get(), context);
        context.accept();
    }
}
```

---

## 3. Public Interface & Built-in Trigger API Reference

### 1. `IRecipeTrigger` (`dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger`)

Extends `dev.anvilcraft.lib.v2.recipe.util.IPrioritized` (default `priority() == 1`).

| Constant / Method / Inner Record Signature | Return Type | Description |
| :--- | :--- | :--- |
| `Codec<IRecipeTrigger> CODEC` | `Codec<IRecipeTrigger>` | `LibRegistries.TRIGGER_REGISTRY.byNameCodec()`, serializing triggers by registry name. |
| `default @Nullable Identifier getId()` | `@Nullable Identifier` | Queries the trigger's registry ID in `LibRegistries.TRIGGER_REGISTRY`. |
| `default int priority()` | `int` | Inherited from `IPrioritized`, returning `1` by default. Participates in `InWorldRecipe.calcPriority` automatic priority summation. |
| `record Impl(Identifier id) implements IRecipeTrigger` | `record` | Default immutable implementation record; pass `IRecipeTrigger.Impl::new` directly as the factory method reference to `DeferredRegister#register(String, Function<Identifier, ? extends I>)`. |

### 2. `LibRecipeTriggers` (Built-in Trigger Registry)

Located in `dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers`.

| Constant | Registry ID | Auto-Trigger Mechanism |
| :--- | :--- | :--- |
| `LibRecipeTriggers.TRIGGER` | — | `DeferredRegister<IRecipeTrigger>` for mod `anvillib_recipe`. |
| `LibRecipeTriggers.ITEM_INTO_BLOCK` | `anvillib_recipe:item_into_block` | When an `ItemEntity` changes position or enters a block, `ItemEntityEventListener` automatically constructs `InWorldRecipeContext(level, pos, itemEntity)` at the item's coordinates and calls `manager.trigger(ITEM_INTO_BLOCK.get(), ctx)` and `ctx.accept()`. |
