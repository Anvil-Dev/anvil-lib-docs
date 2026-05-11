---
title: Registrum Data Generation
prev: false
next: false
---

# Data Generation

Registrum deeply integrates with NeoForge's data generation system, managing various data generators through `GeneratorType` and `ProviderType`.

## ProviderType (Built-in Types)

`ProviderType<T>` is the module's built-in registry of data generator types, with each instance defining the corresponding generator factory.

### Server-Side Data Generators

| Type                                                 | Generator                                             | Description                                           |
|------------------------------------------------------|-------------------------------------------------------|-------------------------------------------------------|
| `DYNAMIC`                                            | `RegistrumDatapackProvider`                           | Dynamic datapack registration (`DatapackBuiltinEntriesProvider`) |
| `DATA_MAP`                                           | `RegistrumDataMapProvider`                            | DataMap (fuel, compost, etc. data attachments)        |
| `RECIPE_RUNNER`                                      | `RegistrumRecipeRunner`                               | Recipe runner (`RecipeProvider.Runner`)               |
| `ADVANCEMENT`                                        | `RegistrumAdvancementProvider`                        | Advancement JSON                                      |
| `LOOT`                                               | `RegistrumLootTableProvider`                          | Loot tables                                           |
| `BLOCK_TAGS`                                         | `RegistrumTagsProvider.IntrinsicImpl<Block>`          | Block tags                                            |
| `ENCHANTMENT_TAGS` <Badge type="tip" text="26.1" />  | `RegistrumTagsProvider.Impl<Enchantment>`             | Enchantment tags                                      |
| `DAMAGE_TYPE_TAGS` <Badge type="tip" text="26.1" />  | `RegistrumTagsProvider.Impl<DamageType>`              | Damage type tags                                      |
| `ITEM_TAGS`                                          | `RegistrumItemTagsProvider`                           | Item tags                                             |
| `FLUID_TAGS` <Badge type="tip" text="26.1" />        | `RegistrumTagsProvider.IntrinsicImpl<Fluid>`          | Fluid tags                                            |
| `ENTITY_TAGS` <Badge type="tip" text="26.1" />       | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>`  | Entity tags                                           |
| `GENERIC_SERVER`                                     | `RegistrumGenericProvider`                            | Generic server data                                   |

### Client-Side Data Generators

| Type                                    | Generator                     | Description                                |
|-----------------------------------------|-------------------------------|--------------------------------------------|
| `MODEL` <Badge type="tip" text="26.1" />| `RegistrumModelProvider`      | Unified model entry (`ModelProvider`)      |
| `LANG`                                  | `RegistrumLangProvider`       | Language file (`en_us.json`)               |
| `GENERIC_CLIENT`                        | `RegistrumGenericProvider`    | Generic client data                        |

### GeneratorType Combinations

The following types are derived from `ProviderType` via the `createGenerator()` method:

| GeneratorType                                 | Derived From                                | Generator                       |
|-----------------------------------------------|---------------------------------------------|---------------------------------|
| `RECIPE`                                      | `RECIPE_RUNNER.createGenerator("recipe")`   | `RegistrumRecipeProvider`      |
| `BLOCKSTATE` <Badge type="tip" text="26.1" /> | `MODEL.createGenerator("blockstate")`       | `RegistrumBlockModelGenerator` |
| `ITEM_MODEL` <Badge type="tip" text="26.1" /> | `MODEL.createGenerator("item_model")`       | `RegistrumItemModelGenerator`  |

## 1.21.1 to 26.1 Migration

### Core Changes

| Aspect       | 1.21.1                                                                         | 26.1                                                                          |
|--------------|--------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| Model framework | `BlockStateProvider` / `ItemModelProvider`                                    | `ModelProvider` + `BlockModelGenerators` / `ItemModelGenerators`              |
| Block model class | `RegistrumBlockstateProvider`                                                 | `RegistrumBlockModelGenerator`                                                |
| Item model class  | `RegistrumItemModelProvider`                                                  | `RegistrumItemModelGenerator`                                                 |
| Recipe class | `RegistrumRecipeProvider` (extends RecipeProvider)                             | `RegistrumRecipeProvider` (extends RecipeProvider + implements RecipeOutput)  |
| Recipe entry point | Directly via `ProviderType.RECIPE`                                        | Via `RECIPE_RUNNER` -> `ProviderType.RECIPE.createGenerator("recipe")`        |
| Tag types    | BLOCK_TAGS / ITEM_TAGS                                                         | + ENCHANTMENT_TAGS / DAMAGE_TYPE_TAGS / FLUID_TAGS / ENTITY_TAGS              |
| Context      | `Context` contains `ExistingFileHelper`                                         | `Context` does not contain `ExistingFileHelper`; uses `PackOutput` directly   |
| Extension point | `SimpleServerDataFactory.create(parent, output, provider, existingFileHelper)` | `SimpleServerDataFactory.create(parent, output, provider)`                    |

### Migration Example

```java
// 1.21.1: Block models
builder.blockstate(() -> (ctx, gen) -> {
    gen.simpleBlock(ctx.getEntry().get());
});

// 26.1: API call unchanged (AbstractRegistrum internally adapted)
builder.blockstate(() -> (ctx, gen) -> {
    // ctx: DataGenContext<Block, T>
    // gen: RegistrumBlockModelGenerator
    gen.create(ctx.getEntry().get(), TexturedModel.CUBE);
});
```

### Compatibility Notes

- The **Builder API** (`blockstate()`, `model()`, `recipe()`) has **unchanged calling conventions** across both versions
- The internal `GeneratorType`/`ProviderType` implementations are **incompatible** (code that directly references the old `RegistrumBlockstateProvider` will fail to compile)
- If your mod directly references `RegistrumBlockstateProvider`, `RegistrumItemModelProvider`, or similar classes in data generation, you need to migrate to the new
  `RegistrumBlockModelGenerator`, `RegistrumItemModelGenerator`

## GeneratorType

<Badge type="tip" text="26.1" />

`GeneratorType<T>` is a marker interface with no method definitions. It serves as a type key for data generator callbacks:

```java
public interface GeneratorType<T> { }
```

`ProviderType<T>` implements this interface. You can create standalone generator types via `createGenerator()`:

```java
// Create a GeneratorType on a ProviderType
GeneratorType<RegistrumRecipeProvider> RECIPE =
    ProviderType.RECIPE_RUNNER.createGenerator("recipe");
GeneratorType<RegistrumBlockModelGenerator> BLOCKSTATE =
    ProviderType.MODEL.createGenerator("blockstate");
```

### Registering Custom Generators

```java
// Create a custom generator type
ProviderType<MyGenerator> MY_GEN_TYPE = ProviderType.registerProvider(
    "my_gen",
    ProviderType.GENERIC_SERVER  // Reuse existing creation pattern
);

GeneratorType<MyGenerator> MY_GEN = MY_GEN_TYPE.createGenerator("gen_id");
```

## DataGenContext

Data generation context, providing entry references.

```java
@Value
public class DataGenContext<R, E extends R> implements NonNullSupplier<E> {
    NonNullSupplier<E> entry; // Entry supplier (@Delegate delegation)
    String name;              // Entry registry name
    Identifier id;            // Full entry Identifier (modid:name)

    // Create from a Builder
    public static <R, E extends R> DataGenContext<R, E> from(Builder<R, E, ?, ?> builder);
}
```

Via the `@Delegate` annotation, `DataGenContext` directly exposes `entry.get()` as `getEntry()`.

## Model Generation

### RegistrumBlockModelGenerator

```java
// Simple block model
gen.create(block, modLoc("block/my_texture"));
gen.create(block, TexturedModel.CUBE);

// Advanced customization using the Legacy Builder
RegistrumLegacyBlockModelBuilder leg = gen.withBuilder(
    new ModelTemplates().cubeBottomTop(), textureMapping
);
leg.texture(TextureSlot.SIDE, modLoc("block/my_side"), false);
leg.build(block);

// Legacy Builder chain methods
leg.parent(modelTemplate)           // Set parent model
   .suffix("_on")                   // Add suffix
   .ambientOcclusion(false)         // Disable ambient occlusion
   .guiLight(GuiLight.FRONT)        // GUI light direction
   .rootTransforms(transforms);     // Root transforms
```

### RegistrumItemModelGenerator

```java
// Use an existing model
gen.createWithExistingModel(item, modLoc("item/my_item"));

// Item with tinted model
gen.generateTintedModel(item, modLoc("item/my_item"), tintSource);
```

## Recipe Generation

`RegistrumRecipeProvider` provides a recipe API consistent with vanilla Minecraft while delegating to `RecipeOutput` via `@Delegate`:

```java
builder.recipe((ctx, gen) -> {
    // Standard building recipes
    gen.stairs(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.slab(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.fence(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.fenceGate(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.wall(ctx.getEntry(), DataIngredient.items(Items.STONE_BRICKS));
    gen.door(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
    gen.trapDoor(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));

    // Smelting
    gen.smeltingAndBlasting(DataIngredient.items(Items.IRON_ORE),
        ctx.getEntry());

    // Stonecutting
    gen.stonecutting(ctx.getEntry(),
        DataIngredient.items(Items.STONE));

    // Single item recipe
    gen.singleItem(ctx.getEntry(),
        DataIngredient.items(Items.IRON_INGOT, Items.GOLD_INGOT));

    // Compression and decompression
    gen.storage(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
    gen.planks(DataIngredient.items(Items.OAK_LOG), ctx.getEntry());

    // Food
    gen.food(ctx.getEntry(), DataIngredient.items(Items.WHEAT, Items.SUGAR));

    // Square crafting (2x2)
    gen.square(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
});
```

### DataIngredient

Recipe input helper class, recording the ingredient's registry name and criterion factory:

```java
// Create from items
DataIngredient.items(Items.OAK_PLANKS, Items.BIRCH_PLANKS);
DataIngredient.items(MY_ITEM_ENTRY);

// Create from a Tag
DataIngredient.tag(ItemTags.PLANKS);

// Create from a generic Ingredient + criterion
DataIngredient.ingredient(
    Ingredient.of(Items.DIAMOND),
    Identifier.fromNamespaceAndPath("mymod", "has_diamond"),
    ItemPredicate.Builder.item().of(Items.DIAMOND).build()
);
```

::: tip Note
`DataIngredient` is only intended for data generation; attempting to serialize it over the network will throw an exception.
:::

## Tag Generation

Tags added via `AbstractBuilder.tag()` are automatically applied during data generation:

```java
// Block tags
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL);

// Item tags
builder.tag(ItemTags.SWORDS, ItemTags.CREEPER_DROP_MUSIC_DISCS);

// Entity tags
builder.tag(EntityTypeTags.SKELETONS, EntityTypeTags.FREEZE_IMMUNE_ENTITY_TYPES);

// Fluid tags
builder.tag(FluidTags.WATER);

// Enchantment tags <Badge type="tip" text="26.1" />
builder.tag(EnchantmentTags.IN_ENCHANTING_TABLE);

// Damage type tags <Badge type="tip" text="26.1" />
builder.tag(DamageTypeTags.BYPASSES_ARMOR);
```

### Tag Deduplication

- `tag()` uses the `asTag()` method to produce `TagEntry.element(id, false)`
- The `asOptional()` method marks a tag as optional, producing `TagEntry.optionalElement(id)`
- `removeTag()` removes a previously added tag

```java
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE)
       .asOptional()  // This BlockTag may not exist in other mods
       .removeTag(BlockTags.NEEDS_DIAMOND_TOOL);  // Remove a previously added tag
```

## Loot Tables

### Block Loot

```java
builder.loot((tables, block) -> {
    tables.dropSelf(block);                             // Drop self
    tables.add(block, tables.createSingleItemTable(     // Fixed drop
        Items.DIAMOND));
    tables.createOreDrop(block, Items.RAW_IRON);        // Ore drop (with Fortune)
    tables.createSilkTouchDispatchTable(block,          // Silk Touch dispatch
        tables.createSingleItemTable(block.asItem()));
    tables.dropOther(block, Items.STICK);               // Drop other item
    tables.dropWhenSilkTouch(block);                    // Drop only with Silk Touch
    tables.createCropDrops(block, Items.WHEAT,          // Crop drops
        Items.WHEAT_SEEDS, builder);
    tables.createSlabItemTable(block);                  // Slab drop
    tables.createDoorTable(block);                      // Door drop
    tables.createLeavesDrops(block, Blocks.OAK_SAPLING, // Leaves drop
        NORMAL_LEAVES_SAPLING_CHANCES);
});
```

### Entity Loot

```java
builder.loot((tables, type) -> {
    tables.add(type, LootTable.lootTable()
        .withPool(LootPool.lootPool()
            .setRolls(ConstantValue.exactly(1))
            .add(LootItem.lootTableItem(Items.BONE)
                .apply(SetItemCountFunction.setCount(
                    UniformGenerator.between(0, 2)))
                .apply(LootingEnchantFunction.lootingMultiplier(
                    UniformGenerator.between(0, 1))))
        ));
});
```

## Custom Data Generation

### Using addDataGenerator

```java
// Use ProviderType's createGenerator to create a custom generator type
GeneratorType<MyGenerator> MY_GEN = ProviderType.RECIPE.createGenerator("my_gen");

// Add non-associated data generation (appends, does not replace existing)
registrum.addDataGenerator(MY_GEN, gen -> {
    // Custom data generation logic
    gen.generate();
});
```

### Using setDataGenerator

```java
// Set data generation for a specific entry (replaces existing)
builder.setData(MY_GEN, (ctx, gen) -> {
    // ctx: DataGenContext providing the entry's name/id
    // gen: your generator instance
    gen.generateFor(ctx.getEntry().get());
});
```

### addMiscData vs setData

| Method                                    | Behavior              | Use Case                                   |
|-------------------------------------------|-----------------------|--------------------------------------------|
| `builder.setData(type, cons)`             | Replaces existing     | Generate specific data for a specific entry |
| `builder.addMiscData(type, cons)`         | Appends, no replace   | General data generation, not tied to an entry |
| `registrum.addDataGenerator(type, cons)`  | Registry-level append | Global data generation logic               |

## DataProviderInitializer

Manages datapack registries and provider dependencies:

```java
DataProviderInitializer init = registrum.getDataGenInitializer();

// Add a datapack registry entry
init.add(registryKey, bootstrap);

// Add a provider dependency
init.addDependency(ProviderType.ITEM_TAGS, ProviderType.BLOCK_TAGS);

// Default dependency: ITEM_TAGS -> BLOCK_TAGS (automatically set)
```

`getSortedProviders()` uses topological sorting to resolve the dependency chain, ensuring data generators execute in the correct order.
