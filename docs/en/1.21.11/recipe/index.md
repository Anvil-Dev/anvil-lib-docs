# Recipe In-World System: Core Architecture & Builders (`module.recipe`)

<BranchContextCard branch="1.21.11" />

`module.recipe` (artifact `anvillib-recipe-neoforge-1.21.11`, package `dev.anvilcraft.lib.v2.recipe`) is one of AnvilLib's core business modules, providing a **complete data-driven In-World Recipe engine**.

Vanilla Minecraft's `Recipe` system is designed for GUI containers (crafting tables, furnaces); in contrast, crafting that happens directly in the world—such as **anvil smashing, tossing items into fluids/cauldrons, or multiblock altars sacrificing mobs and nearby chest/ground items to form new blocks or structures**—must simultaneously inspect and mutate **ground `ItemEntity`s, container `ResourceHandler<ItemResource>` slots, world `BlockState`s, nearby `Entity`s, and cross-stage temporary NBT tags (`TagCache`)**.

This module is split into 6 sub-documents by functional domain:
- **This page (Core Architecture, `InWorldRecipe` & `InWorldRecipeBuilder`)**: Covers in-world recipe structure, priority calculation, conflicting/non-conflicting matching algorithms, and the full DataGen builder API.
- **[Triggers System (Triggers)](./triggers)**: Covers `IRecipeTrigger`, built-in `ITEM_INTO_BLOCK`, custom trigger registration, and firing entry points.
- **[Condition Predicates & Predicate Functions (Predicates)](./predicates)**: Covers `IRecipePredicate`, `HasItem`, `HasItemIngredient`, `HasBlock`, `HasBlockIngredient`, `HasEntity`, `HasEntityIngredient`, `SaveComponentToTag`, and `AndPredicate` / `OrPredicate` / `NotPredicate`.
- **[Outcomes & Outcome Functions (Outcomes)](./outcomes)**: Covers `IRecipeOutcome`, `SpawnItem`, `SetBlock` (with property preservation & mapping), `SpawnEntity`, `ProduceExplosion`, `ChooseOneOutcome`, `ApplyTagToComponent`, and `ItemBatchPlan`.
- **[World State Caches & Batch Planning (Caches & BatchPlan)](./caches)**: Covers `ItemCache`, `BlockCache`, `EntityCache`, `TagCache`, `ItemResourceHandlerCache`, `ItemCacheSlotProvider`, and `EntityDropCapture`.
- **[Execution Context, Pruning Manager & Events (Context & Events)](./context-and-events)**: Covers `InWorldRecipeContext` two-phase commit, `InWorldRecipeManager` bipartite block pruning, and the 6 recipe events.

---

## 1. Setup (Including Interface Injection Declaration)

`module.recipe` injects `IRecipeManagerExtension` into vanilla `RecipeManager` and `IRecipeMapExtension` into `RecipeMap`. To call `recipeManager.anvillib$getInWorldRecipeManager()`, `recipeManager.anvillib$addRecipes(...)`, etc. directly in code, declare `interfaceInjectionData` in `build.gradle.kts`:

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-recipe-neoforge-1.21.11:$anvillibVersion")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-1.21.11:$anvillibVersion")
}
```

---

## 2. `InWorldRecipe` Core Model

An `InWorldRecipe` (implementing `Recipe<InWorldRecipeContext>` and `IPrioritized`) consists of 8 core properties:

| Property | Type | JSON Field | Description |
| :--- | :--- | :--- | :--- |
| `icon` | `ItemStack` | `"icon"` | Recipe icon (defaults to `new ItemStack(Items.ANVIL)`) displayed by recipe viewers. |
| `trigger` | `IRecipeTrigger` | `"trigger"` | Recipe trigger determining which world event indexes this recipe (e.g., `anvillib_recipe:item_into_block`). |
| `conflicting` | `List<IRecipePredicate<?>>` | `"conflicting"` | **Conflicting predicate list** (`predicate.getType().conflict() == true`, such as item-consuming `HasItemIngredient`, block-consuming `HasBlockIngredient`, entity-consuming `HasEntityIngredient`). |
| `nonConflicting` | `List<IRecipePredicate<?>>` | `"non_conflicting"` | **Non-conflicting predicate list** (read-only checks such as `HasItem`, `HasBlock`, `HasEntity`). |
| `outcomes` | `List<IRecipeOutcome<?>>` | `"outcomes"` | Outcomes executed after all predicates match (`SpawnItem`, `SetBlock`, `SpawnEntity`, `ProduceExplosion`, `ChooseOneOutcome`). |
| `priority` | `int` | `"priority"` | Recipe priority (**higher values match first**; defaults to `1` if omitted in JSON, or auto-summed via `InWorldRecipe.calcPriority` from trigger, predicates, and outcomes when omitted in builder). |
| `compatible` | `boolean` | `"compatible"` | **Conflicting predicate matching strategy**:<br>• `true` (`ShapelessMatcher.compatible`): greedily matches `conflicting` predicates in order;<br>• `false` (`ShapelessMatcher.incompatible`): runs fast `checkItemCapacity` check first, then uses permutation backtracking to find non-conflicting assignments when slots overlap. |
| `maxEfficiency` | `int` | `"max_efficiency"` | Max consecutive batches per trigger (`> 0`, default `Integer.MAX_VALUE`; capped at runtime by `Math.min(recipe.maxEfficiency(), AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency)`, default `64`). |

### Constructors & Lifecycle Methods

| Method / Constructor | Description |
| :--- | :--- |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible, maxEfficiency)` | Full constructor; throws `IllegalArgumentException` if `maxEfficiency <= 0`. |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible)` | Defaults `maxEfficiency = Integer.MAX_VALUE`. |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible, maxEfficiency)` | Auto-computes priority via `calcPriority(trigger, conflicting, nonConflicting, outcomes)`. |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible)` | Auto-computes priority with `maxEfficiency = Integer.MAX_VALUE`. |
| `static int calcPriority(trigger, conflicting, nonConflicting, outcomes)` | Sums `priority()` of `trigger` and all predicates and outcomes. |
| `boolean matches(InWorldRecipeContext context, Level level)` | Matches `nonConflicting` first, then `conflicting` per `compatible`; pops and rolls back pushed predicate snapshots on failure, or rolls back and calls `context.invalidate()` on exception. |
| `ItemStack assemble(InWorldRecipeContext context)`<br>`ItemStack assemble(InWorldRecipeContext context, HolderLookup.Provider registries)` | Calls `context.beginBatch()`, calls `accept(context)` on each stacked predicate, calls `acceptWithChance(context)` on each outcome, calls `clearStack(context)`, clears the stack, and returns `icon.copy()`. |
| `boolean showNotification()` / `String group()` | Returns `true` and `"in_world"` respectively. |
| `PlacementInfo placementInfo()` / `RecipeBookCategory recipeBookCategory()` | Returns `PlacementInfo.createFromOptionals(List.of())` and `RecipeBookCategories.CRAFTING_MISC` respectively. |

---

## 3. Full Code Example: Generating In-World Recipe JSON with `InWorldRecipeBuilder`

In DataGen `RecipeProvider` (with `RecipeProvider.Runner`), build recipes using `InWorldRecipeBuilder.compatible(trigger)` or `InWorldRecipeBuilder.incompatible(trigger)`:

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder;
import dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers;
import net.minecraft.core.HolderGetter;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.PackOutput;
import net.minecraft.data.recipes.RecipeOutput;
import net.minecraft.data.recipes.RecipeProvider;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;

import java.util.concurrent.CompletableFuture;

public class ModInWorldRecipeProvider extends RecipeProvider {
    protected ModInWorldRecipeProvider(HolderLookup.Provider registries, RecipeOutput output) {
        super(registries, output);
    }

    @Override
    protected void buildRecipes() {
        HolderGetter<Block> blocks = this.registries.lookupOrThrow(Registries.BLOCK);
        Identifier customNamePath = Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "saved_sword_name");

        // Example: when items fall into a full water cauldron:
        // 1. Require a full water cauldron at (0, 0, 0) and a campfire below at (0, -1, 0)
        // 2. Consume 1 iron sword (saving its custom name to temporary NBT path saved_sword_name) + 4 diamonds
        // 3. Require and sacrifice 1 Drowned within 3x3x3 around the cauldron
        // 4. Produce 1 diamond sword inheriting the iron sword's custom name, and empty the cauldron
        InWorldRecipeBuilder.compatible(LibRecipeTriggers.ITEM_INTO_BLOCK)
            .icon(new ItemStack(Items.DIAMOND_SWORD))
            .maxEfficiency(1)
            // Check current (0, 0, 0) is a level-3 full water cauldron
            .hasBlock(
                Blocks.WATER_CAULDRON.defaultBlockState()
                    .setValue(LayeredCauldronBlock.LEVEL, 3)
            )
            // Shift builder default offset 1 block down (0, -1, 0) to check for a campfire (non-consumed)
            .below()
            .hasBlock(blocks, BlockTags.CAMPFIRES)
            // Reset back to origin (0, 0, 0)
            .offset(0, 0, 0)
            // Consume 1 iron sword and extract its CUSTOM_NAME component into TagCache
            .hasItemIngredient(item -> item
                .of(Items.IRON_SWORD)
                .count(1)
                .saveComponent(DataComponents.CUSTOM_NAME, customNamePath)
            )
            // Consume 4 diamonds
            .hasItemIngredient(item -> item
                .of(Items.DIAMOND)
                .count(4)
            )
            // Consume 1 Drowned within 3x3x3
            .hasEntityIngredient(entity -> entity
                .of(EntityType.DROWNED)
                .range(3.0, 3.0, 3.0)
                .count(1)
            )
            // Spawn 1 diamond sword and restore the saved CUSTOM_NAME onto it
            .spawnItem(item -> item
                .item(Items.DIAMOND_SWORD)
                .applyComponent(DataComponents.CUSTOM_NAME, customNamePath)
            )
            // Replace the water cauldron at (0, 0, 0) with an empty cauldron
            .setBlock(Blocks.CAULDRON.defaultBlockState())
            .group("cauldron_forging")
            // Save to data/my_mod/recipe/cauldron_forging/drowned_diamond_sword.json
            .save(this.output, Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "drowned_diamond_sword"));
    }

    public static class Runner extends RecipeProvider.Runner {
        public Runner(PackOutput packOutput, CompletableFuture<HolderLookup.Provider> registries) {
            super(packOutput, registries);
        }

        @Override
        protected RecipeProvider createRecipeProvider(HolderLookup.Provider registries, RecipeOutput output) {
            return new ModInWorldRecipeProvider(registries, output);
        }

        @Override
        public String getName() {
            return "MyMod In-World Recipes";
        }
    }
}
```

---

## 4. `InWorldRecipeBuilder` Full Method Reference

Located in `dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder<T extends InWorldRecipeBuilder<T>>`, implementing vanilla `net.minecraft.data.recipes.RecipeBuilder`.

> **Stateful Offset Cursor & `group` Path Tips**:
> 1. `InWorldRecipeBuilder` maintains `protected Vec3 offset = Vec3.ZERO`. Calling `.offset(x, y, z)`, `.below()`, or `.above()` updates this cursor, and subsequent `.hasItem(...)`, `.hasBlock(...)`, `.spawnItem(...)`, `.setBlock(...)` calls without an explicit `offset` inherit it.
> 2. `save(RecipeOutput, ResourceKey<Recipe<?>>)` and `save(RecipeOutput, Identifier)` assemble the recipe ID as `<namespace>:<group>/<path>` (and advancement `recipes/<group>/<path>`), so **always call `.group(...)` explicitly** to avoid `"null/..."`.

| Category | Method Signatures | Description |
| :--- | :--- | :--- |
| **Static Factories** | • `compatible(IRecipeTrigger)` / `compatible(Supplier<IRecipeTrigger>)`<br>• `incompatible(IRecipeTrigger)` / `incompatible(Supplier<IRecipeTrigger>)` | Creates a builder in compatible (`compatible = true`) or incompatible backtracking (`compatible = false`) mode. |
| **Offset Cursor** | • `offset(Vec3 offset)` / `offset(double x, double y, double z)`<br>• `below()` (`(0, -1, 0)`) / `below(double below)`<br>• `above()` (`(0, 1, 0)`) / `above(double above)` | Sets the default relative offset for subsequent predicates and outcomes. |
| **Metadata** | • `icon(ItemStack icon)`<br>• `priority(Integer priority)`<br>• `maxEfficiency(int maxEfficiency)`<br>• `group(@Nullable String groupName)`<br>• `unlockedBy(String name, Criterion<?> criterion)`<br>• `ResourceKey<Recipe<?>> defaultId()`<br>• `Item getResult()` | Configures icon, explicit priority, max batches per trigger, recipe group path prefix, and unlock criterion. |
| **Generic Add** | • `with(IRecipePredicate<?> predicate)`<br>• `out(IRecipeOutcome<?> outcome)`<br>• `T self()` | Adds any custom predicate (auto-routed to `conflicting` or `nonConflicting` via `predicate.getType().conflict()`) or outcome. |
| **Item Predicates (Non-Consumed)** | • `hasItem(Consumer<HasItem.Builder> consumer)`<br>• `hasItem([Vec3 / x,y,z,] ItemLike... items)`<br>• `hasItem([Vec3 / x,y,z,] HolderGetter<Item> items, TagKey<Item> tag)` | Adds a non-conflicting `HasItem` check. |
| **Item Ingredients (Consumed / Catalyst)** | • `hasItemIngredient(Consumer<HasItemIngredient.Builder> consumer)`<br>• `hasItemIngredient([Vec3 / x,y,z,] ItemLike... items)`<br>• `hasItemIngredient([Vec3 / x,y,z,] HolderGetter<Item> items, TagKey<Item> tag)` | Adds a `HasItemIngredient` condition. |
| **Block Predicates (Non-Consumed)** | • `hasBlock(Consumer<HasBlock.Builder> consumer)`<br>• `hasBlock([Vec3 / x,y,z,] Block... / Collection<Block> / BlockState)`<br>• `hasBlock([Vec3 / x,y,z,] HolderGetter<Block> blocks, TagKey<Block> tag)` | Adds a `HasBlock` check; passing a `BlockState` compares against `defaultBlockState()` to extract all non-default properties. |
| **Block Ingredients (Consumed to Air)** | • `hasBlockIngredient(Consumer<HasBlockIngredient.Builder> consumer)`<br>• `hasBlockIngredient([Vec3 / x,y,z,] Block... / Collection<Block> / BlockState)`<br>• `hasBlockIngredient([Vec3 / x,y,z,] HolderGetter<Block> blocks, TagKey<Block> tag)` | Adds a `HasBlockIngredient` condition (sets block to air on commit). |
| **Entity Conditions & Ingredients** | • `hasEntity(Consumer<HasEntity.Builder> consumer)`<br>• `hasEntityIngredient(Consumer<HasEntityIngredient.Builder> consumer)` | Adds `HasEntity` (non-consuming) or `HasEntityIngredient` (reserves and removes entity). |
| **Outcomes** | • `spawnItem(Consumer<SpawnItem.Builder> consumer)`<br>• `spawnItem([Vec3 / x,y,z,] [double chance,] ItemStack stack)`<br>• `setBlock(Consumer<SetBlock.Builder> consumer)`<br>• `setBlock([Vec3 / x,y,z,] [double chance,] BlockState state)`<br>• `spawnEntity(Consumer<SpawnEntity.Builder> consumer)`<br>• `chooseOne(Consumer<ChooseOneOutcome.Builder> consumer)` | Adds item spawn, block set, entity spawn, or weighted choose-one outcomes. Note that `spawnItem(pos, chance, stack)` passes that float to `SpawnItem.Builder#count(float)`; use `Consumer<SpawnItem.Builder>` to set probability or random counts. |
| **Build & Save** | • `InWorldRecipe build()`<br>• `void save(RecipeOutput recipeOutput, Identifier id)`<br>• `void save(RecipeOutput recipeOutput, ResourceKey<Recipe<?>> key)` | Builds the `InWorldRecipe` instance or writes it with its unlock advancement to `RecipeOutput`. |
