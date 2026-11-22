# Recipe In-World System Architecture & Builders (`module.recipe`)

<BranchContextCard branch="26.2" />

`module.recipe` (artifact `anvillib-recipe-neoforge-26.2`, package `dev.anvilcraft.lib.v2.recipe`) provides a complete data-driven **In-World Recipe** engine. Unlike vanilla recipes that must run inside a GUI container or crafting grid, in-world recipes detect and consume blocks, ground/container items, and entities around a 3D world position `pos`, then spawn output items, place/transform blocks, summon entities, or trigger explosions in the world.

This module is split into 6 sub-documents by functional domain:
- **This page (Architecture, InWorldRecipe & Builders)**: Covers core composition, `AnvilLibRecipe`, `AnvilLibRecipeConfig`, `InWorldRecipe`, `InWorldRecipeBuilder`, and the five registries (`LibRegistries` / `LibRecipeTypes`).
- **[Recipe Triggers (IRecipeTrigger)](./triggers)**: Covers `IRecipeTrigger`, `LibRecipeTriggers`, trigger priority, and custom trigger registration.
- **[Block, Item & Entity Predicates (IRecipePredicate)](./predicates)**: Covers `IRecipePredicate`, `HasBlock` / `HasBlockIngredient`, `HasItem` / `HasItemIngredient`, `HasEntity` / `HasEntityIngredient`, `SaveComponentToTag`, and logical data component predicates (`AndPredicate` / `OrPredicate` / `NotPredicate`).
- **[Outcomes, Property Mapping & BatchPlan](./outcomes)**: Covers `IRecipeOutcome`, `SpawnItem`, `SetBlock`, `BlockPropertyMapping`, `SpawnEntity`, `ProduceExplosion`, `ChooseOneOutcome`, `ApplyTagToComponent`, and the capacity-constrained `ItemBatchPlan`.
- **[World State Caches & Transaction Commit](./caches)**: Covers `BlockCache`, `ItemCache`, `ItemResourceHandlerCache`, `EntityCache`, `TagCache`, and cache slot operation stacks.
- **[Context, Priority, Events & Extensions](./context-and-events)**: Covers `InWorldRecipeContext`, `InWorldRecipeManager`, `ShapelessMatcher`, lifecycle events, and `RecipeManager` / `RecipeMap` interface injection extensions.

---

## 1. Setup (Including Interface Injection)

`module.recipe` injects `IRecipeManagerExtension` / `IRecipeMapExtension` into vanilla `RecipeManager` and `RecipeMap` (providing `anvillib$getInWorldRecipeManager()`). To call these extension methods directly in code, also configure `interfaceInjectionData` in `build.gradle.kts`:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.2:2.0.0")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.2:2.0.0")
}
```

---

## 2. Four Core Elements of an In-World Recipe

An `InWorldRecipe` instance consists of the following core parts:

1. **Trigger (`IRecipeTrigger`)**: Identifies what world action fires the recipe (e.g., built-in `anvillib_recipe:item_into_block`, or downstream mod triggers like anvil smash or multiblock activation).
2. **Non-Conflicting (`nonConflicting`) & Conflicting (`conflicting`) Predicate Lists**:
   - **Non-conflicting predicates** (`predicate.getType().conflict() == false`): read-only or fixed-offset checks, including `HasBlock`, `HasBlockIngredient`, `HasItem`, and `HasEntity`;
   - **Conflicting predicates** (`predicate.getType().conflict() == true`): conditions that compete for resources in the same pool, including `HasItemIngredient` (consumes items) and `HasEntityIngredient` (consumes entities).
   - **Compatible mode (`compatible = true`) vs Incompatible mode (`compatible = false`)**:
     - When `compatible = true`, `ShapelessMatcher.compatible` greedily matches conflicting predicates in declaration order;
     - When `compatible = false` (for cases where ingredient predicates overlap or subsume each other, e.g. `#c:ingots` and `minecraft:iron_ingot`), `ShapelessMatcher.incompatible` uses **backtracking search** with `snapshot` / `rollback` to try different matching orders so a broad predicate does not steal items needed by a specific one.
3. **Outcome List (`outcomes`)**: Once all predicates pass and ingredients are consumed in `assemble(context)`, the `IRecipeOutcome`s execute sequentially by their individual chances (e.g., `SpawnItem`, `SetBlock`, `SpawnEntity`, `ProduceExplosion`, `ChooseOneOutcome`).
4. **Priority (`priority`) & Max Batch Efficiency (`maxEfficiency`)**:
   - `InWorldRecipeManager` tries recipes under the same trigger in **descending** `priority` order; if `priority` is not explicitly set, `InWorldRecipe.calcPriority(...)` sums the priorities of the trigger, all predicates, and all outcomes;
   - `maxEfficiency` caps how many consecutive batches of the recipe can run per trigger (also bounded by `AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency`, default `64`).

---

## 3. Full Code Example: Generating Recipes with `InWorldRecipeBuilder`

The example below shows how to use `InWorldRecipeBuilder` in a NeoForge DataGen `RecipeProvider` to build an in-world recipe with block checks, item consumption, entity consumption, block state transformation, and item output:

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder;
import dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.data.recipes.RecipeOutput;
import net.minecraft.data.recipes.RecipeProvider;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

public class ModRecipeGenerator extends RecipeProvider {
    private static final Identifier SAVED_CUSTOM_NAME =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "saved_name");

    public ModRecipeGenerator(HolderLookup.Provider registries, RecipeOutput output) {
        super(registries, output);
    }

    @Override
    protected void buildRecipes() {
        // Build an incompatible (backtracking-enabled) in-world recipe
        InWorldRecipeBuilder.incompatible(LibRecipeTriggers.ITEM_INTO_BLOCK)
            .icon(new ItemStackTemplate(Items.AMETHYST_SHARD))
            .group("alchemical_infusion")
            // 1. Require a cauldron 1 block below (below()), read-only without consuming
            .below()
            .hasBlock(Blocks.CAULDRON)
            // 2. Reset offset to (0, 0, 0), consume 2 amethyst shards, and save CUSTOM_NAME to TagCache
            .offset(0, 0, 0)
            .hasItemIngredient(item -> item
                .of(Items.QUARTZ)
                .count(2)
                .saveComponent(DataComponents.CUSTOM_NAME, SAVED_CUSTOM_NAME)
            )
            // 3. Require 1 nether star as a catalyst (consume(false) reserves without consuming)
            .hasItemIngredient(catalyst -> catalyst
                .of(Items.NETHER_STAR)
                .count(1)
                .consume(false)
            )
            // 4. Transform the cauldron 1 block below into a full water cauldron
            .setBlock(0, -1, 0, Blocks.WATER_CAULDRON.defaultBlockState())
            // 5. Spawn 2 amethyst shards at (0, 0.5, 0) and restore the saved CUSTOM_NAME onto the output
            .spawnItem(out -> out
                .offset(0, 0.5, 0)
                .item(Items.AMETHYST_SHARD)
                .count(2.0f)
                .applyComponent(DataComponents.CUSTOM_NAME, SAVED_CUSTOM_NAME)
            )
            // 6. Execute at most 16 batches per trigger
            .maxEfficiency(16)
            .save(this.output, Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "quartz_to_amethyst"));
    }
}
```

---

## 4. Public Classes & API Reference

### 1. `InWorldRecipe` (In-World Recipe Class)

Implements `Recipe<InWorldRecipeContext>` and `IPrioritized`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public InWorldRecipe(ItemStackTemplate icon, IRecipeTrigger trigger, List<IRecipePredicate<?>> conflicting, List<IRecipePredicate<?>> nonConflicting, List<IRecipeOutcome<?>> outcomes, int priority, boolean compatible, int maxEfficiency)` | — | Full-argument constructor. Throws `IllegalArgumentException("maxEfficiency must be positive")` if `maxEfficiency < 1`. Also provides 4 overloads omitting `maxEfficiency` (defaults to `Integer.MAX_VALUE`) and/or `priority` (auto-computes `calcPriority`). |
| `public static int calcPriority(IRecipeTrigger trigger, List<IRecipePredicate<?>> conflicting, List<IRecipePredicate<?>> nonConflicting, List<IRecipeOutcome<?>> outcomes)` | `int` | Sums `priority()` across the trigger, all conflicting/non-conflicting predicates, and all outcomes. |
| `public boolean matches(InWorldRecipeContext context, Level level)` | `boolean` | During planning (`context.assertPlanning()`), matches `nonConflicting` with `ShapelessMatcher.compatible`, then matches `conflicting` with `compatible` or `incompatible` per `this.compatible`. Automatically rolls back all predicate snapshots pushed in this call if matching fails or throws. |
| `public ItemStack assemble(InWorldRecipeContext context)` | `ItemStack` | Executes a single recipe batch: calls `context.beginBatch()`, runs `accept(context)` on all matched predicates, runs `acceptWithChance(context)` on all `outcomes`, clears predicate stacks, and returns `icon.create()`. |
| `icon()` / `trigger()` / `conflicting()` / `nonConflicting()` / `outcomes()` / `priority()` / `compatible()` / `maxEfficiency()` | Corresponding field type | Accessors for the recipe's immutable properties. |
| `InWorldRecipe.Serializer.CODEC` / `STREAM_CODEC` | `MapCodec` / `StreamCodec` | JSON / NBT codec and network stream codec for in-world recipes. |

### 2. `InWorldRecipeBuilder<T>` (Fluent Recipe Builder)

Implements vanilla `net.minecraft.data.recipes.RecipeBuilder`. The builder maintains a **cursor `offset` (default `Vec3.ZERO`)**: calling `offset(...)`, `below(...)`, or `above(...)` updates this cursor, and subsequent no-offset `hasBlock`, `hasItem`, `spawnItem`, etc. inherit the current cursor `offset`.

| Category | Method Signatures | Description |
| :--- | :--- | :--- |
| **Static Factories** | `compatible(IRecipeTrigger)` / `compatible(Supplier<IRecipeTrigger>)` | Creates a builder with `compatible = true` (sequential greedy matching for conflicting predicates). |
| **Static Factories** | `incompatible(IRecipeTrigger)` / `incompatible(Supplier<IRecipeTrigger>)` | Creates a builder with `compatible = false` (backtracking permutation matching for conflicting predicates). |
| **Cursor Offset Control** | `offset(Vec3)` / `offset(double x, double y, double z)`<br>`below(double)` / `below()` (`(0, -1, 0)`)<br>`above(double)` / `above()` (`(0, 1, 0)`) | Updates the builder's current default offset cursor `this.offset`. |
| **Generic Add** | `with(IRecipePredicate<?> predicate)`<br>`out(IRecipeOutcome<?> outcome)` | Adds any predicate (auto-sorted into `conflicting` or `nonConflicting` by `predicate.getType().conflict()`) or any outcome. |
| **Block Predicates** | `hasBlock(Consumer<HasBlock.Builder>)` and overloads for `Block...`, `Collection<Block>`, `TagKey<Block>`, `BlockState` with/without offset (12 overloads) | Adds a read-only `HasBlock` check. |
| **Block Ingredient Predicates** | `hasBlockIngredient(Consumer<HasBlockIngredient.Builder>)` and 12 matching convenience overloads | Adds a `HasBlockIngredient` check that removes (consumes) the block. |
| **Item Predicates** | `hasItem(Consumer<HasItem.Builder>)` and overloads for `ItemLike...`, `TagKey<Item>` with/without offset (7 overloads) | Adds a read-only `HasItem` presence check. |
| **Item Ingredient Predicates** | `hasItemIngredient(Consumer<HasItemIngredient.Builder>)` and 7 matching convenience overloads | Adds a `HasItemIngredient` check that consumes (or reserves as catalyst) items. |
| **Entity Predicates & Outcomes** | `hasEntity(Consumer<HasEntity.Builder>)`<br>`hasEntityIngredient(Consumer<HasEntityIngredient.Builder>)`<br>`spawnEntity(Consumer<SpawnEntity.Builder>)` | Adds read-only entity check, entity consumption, and entity spawning (inherits current `this.offset` by default). |
| **Outcome Builders** | `chooseOne(Consumer<ChooseOneOutcome.Builder>)`<br>`spawnItem(Consumer<SpawnItem.Builder>)` and 5 overloads for `ItemStackTemplate` / `chance` / `offset`<br>`setBlock(Consumer<SetBlock.Builder>)` and 5 overloads for `BlockState` / `chance` / `offset` | Adds choose-one outcomes, item spawns, and block placements. |
| **Metadata & Saving** | `icon(ItemStackTemplate)`<br>`priority(Integer)`<br>`maxEfficiency(int)`<br>`group(@Nullable String)`<br>`unlockedBy(String, Criterion<?>)`<br>`build()`<br>`save(RecipeOutput, ResourceKey<Recipe<?>>)` / `save(RecipeOutput, Identifier)` | Configures icon, explicit priority, max batches per trigger, recipe group, and builds or saves to `RecipeOutput`. |

### 3. `AnvilLibRecipe`, `AnvilLibRecipeConfig` & Registry Classes

| Class | Key Constants / Fields | Description |
| :--- | :--- | :--- |
| `AnvilLibRecipe` | `MAIN_ID = "anvillib"`<br>`MOD_ID = "anvillib_recipe"`<br>`CONFIG` (`AnvilLibRecipeConfig`)<br>`of(String path)` | Module main class. `CONFIG.inWorldRecipeMaxEfficiency` (range `[1, 128]`, default `64`) caps max batches executed per trigger globally. |
| `LibRegistries` | `TRIGGER_REGISTRY` (`anvillib:trigger`)<br>`PREDICATE_TYPE_REGISTRY` (`anvillib:predicate`)<br>`PREDICATE_FUNCTION_TYPE_REGISTRY` (`anvillib:predicate_function`)<br>`OUTCOME_TYPE_REGISTRY` (`anvillib:outcome`)<br>`OUTCOM_FUNCTIONE_TYPE_REGISTRY` (`anvillib:outcome_function`) | Five synced custom registries for in-world recipes (max ID `512` each).<br>*Note: the outcome function registry field in source is spelled `OUTCOM_FUNCTIONE_TYPE_REGISTRY`; use that exact spelling when referencing it.* |
| `LibRecipeTypes` | `IN_WORLD_RECIPE` (`RecipeType<InWorldRecipe>`)<br>`IN_WORLD_RECIPE_SERIALIZER` (`RecipeSerializer<InWorldRecipe>`) | Vanilla `RecipeType` and `RecipeSerializer` registered under `anvillib_recipe:in_world_recipe`. |
| `LibBlockEntityTags` / `LibEntityTypeTags` | `LibBlockEntityTags.ITEM_CACHE` (`#anvillib:item_cache`)<br>`LibEntityTypeTags.ITEM_CACHE` (`#anvillib:item_cache`) | Marks which block entities or entities may be accessed as external item containers by `ItemResourceHandlerCache`. |
