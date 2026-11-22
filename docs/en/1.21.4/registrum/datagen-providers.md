# Datagen Integration: Models, Recipes, Loot Tables, Tags & Language

`module.registrum` is fully adapted to Minecraft 1.21.4 and NeoForge's new data generation pipeline: legacy `ExistingFileHelper`-based `BlockStateProvider` / `ItemModelProvider` are replaced by **`ProviderType.MODEL` (`RegistrumModelProvider`)** driving vanilla-style **`RegistrumBlockModelGenerator`** and **`RegistrumItemModelGenerator`**, while recipe generation is hosted by **`ProviderType.RECIPE_RUNNER` (`RegistrumRecipeRunner`)**.

## `ProviderType` & `GeneratorType` Dispatch System

Every datagen action uses `GeneratorType<D>` as a routing key. `ProviderType<T extends RegistrumProvider>` extends `GeneratorType<T>`, running either as a standalone `DataProvider` or splitting sub-generators via `createGenerator(String)`.

### Built-in Server / Client Generator Keys

| Type Key | Target Generator | Logical Side | Common Use Cases |
| --- | --- | --- | --- |
| `ProviderType.DYNAMIC` | `RegistrumDatapackProvider` | Server | Registers datapack registry entries (biomes, structures, dimension types, enchantments) |
| `ProviderType.DATA_MAP` | `RegistrumDataMapProvider` | Server | Generates NeoForge `DataMap` JSONs (fuel burn times, compost chances, custom data maps) |
| `ProviderType.RECIPE_RUNNER` | `RegistrumRecipeRunner` | Server | NeoForge `RecipeProvider.Runner` container |
| `ProviderType.RECIPE` (subkey) | `RegistrumRecipeProvider` | Server | Writes all crafting recipes in `buildRecipes()` with shortcut recipe helpers |
| `ProviderType.ADVANCEMENT` | `RegistrumAdvancementProvider` | Server | Generates advancement JSONs (supports `WithConditions` conditional advancements) |
| `ProviderType.LOOT` | `RegistrumLootTableProvider` | Server | Loot table hub (built-in `LootType.BLOCK` / `LootType.ENTITY` and arbitrary `ContextKeySet`s) |
| `ProviderType.BLOCK_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Block>` | Server | Block tags provider (`tags/block`) |
| `ProviderType.ITEM_TAGS` | `RegistrumItemTagsProvider` | Server | Item tags provider; auto-depends on `BLOCK_TAGS` and supports `copy(BlockTag, ItemTag)` |
| `ProviderType.ENCHANTMENT_TAGS` | `RegistrumTagsProvider.Impl<Enchantment>` | Server | Dynamic enchantment registry tags (`tags/enchantment`) |
| `ProviderType.FLUID_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Fluid>` | Server | Fluid tags provider (`tags/fluid`) |
| `ProviderType.ENTITY_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | Server | Entity type tags provider (`tags/entity`) |
| `ProviderType.GENERIC_SERVER` | `RegistrumGenericProvider` | Server | Appends any standard `DataProvider` (such as `sounds.json` or custom mod data) to general server data output |
| `ProviderType.MODEL` | `RegistrumModelProvider` | Client | Vanilla-style client model bundle container |
| `ProviderType.BLOCKSTATE` (subkey) | `RegistrumBlockModelGenerator` | Client | Writes blockstates (`blockstates/*.json`) and block/template models |
| `ProviderType.ITEM_MODEL` (subkey) | `RegistrumItemModelGenerator` | Client | Writes 1.21.4 item model definitions (`items/*.json`) and item models |
| `ProviderType.LANG` | `RegistrumLangProvider` | Client | Generates `en_us.json` and auto-flipped `en_ud.json` |
| `ProviderType.GENERIC_CLIENT` | `RegistrumGenericProvider` | Client | Mounts any custom client `DataProvider` |

### Registering Custom `ProviderType`s & Dependency Ordering (`DataProviderInitializer`)

Using `ProviderType` static factories and `AbstractRegistrum#getDataGenInitializer()`, you can register third-party custom providers and their topological upstream dependencies:

```java
ProviderType<MyCustomProvider> CUSTOM_DATA = ProviderType.registerServerData(
    "my_custom_data",
    (parent, packOutput, lookup) -> new MyCustomProvider(parent, packOutput, lookup)
);

// Declare dependency (e.g., custom provider must wait for BLOCK_TAGS to build its CompletableFuture)
MyMod.REGISTRUM.getDataGenInitializer().addDependency(CUSTOM_DATA, ProviderType.BLOCK_TAGS);

// Register dynamic Datapack registry (e.g., RegistrySetBuilder#add)
MyMod.REGISTRUM.getDataGenInitializer().add(Registries.CONFIGURED_FEATURE, bootstrap -> {
    // Populate dynamic feature registry entries
});
```

`ProviderType` static registration methods:
- `registerServerData(String name, SimpleServerDataFactory<T> factory)`
- `registerProvider(String name, ProviderType<T> type)`
- `registerClientProvider(String name, NonNullSupplier<ProviderType<T>> supplier)` (safely returns a no-op outside Datagen without loading client classes)
- `registerIntrinsicTag(String providerName, String typeName, ResourceKey<? extends Registry<T>> registry, Function<T, ResourceKey<T>> keyExtractor)`
- `registerDynamicTag(String providerName, String typeName, ResourceKey<Registry<T>> registry)`
- `registerTag(String name, ResourceKey<? extends Registry<T>> key, ProviderType<R> type)`

## Model Generation: `RegistrumBlockModelGenerator` & `RegistrumItemModelGenerator`

`RegistrumModelProvider` extends vanilla `ModelProvider`, injecting `RegistrumBlockModelGenerator` (extending `BlockModelGenerators`) into `ProviderType.BLOCKSTATE` and `RegistrumItemModelGenerator` (extending `ItemModelGenerators`) into `ProviderType.ITEM_MODEL`.

### BlockStates & Legacy-Compatible Model Builder (`RegistrumLegacyBlockModelBuilder`)

Beyond all vanilla `BlockModelGenerators` template methods (`createTrivialCube(block)`, `createNonTemplateModelBlock(block)`, `createRotatedPillarWithHorizontalVariant(...)`), `RegistrumBlockModelGenerator` provides helper APIs familiar to legacy `ModelBuilder` workflows:

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `family(Block block)` | `BlockModelGenerators.BlockFamilyProvider` | Reuses or creates a block family builder to generate stairs, slabs, fences, and related models |
| `create(Block block, ResourceLocation modelLocation)` | `BlockVariantGenerator` | Quickly creates a generic variant generator from an existing model ID |
| `create(Block block, TexturedModel.Provider provider)` | `ResourceLocation` | Generates a model from `TexturedModel.Provider` and returns its path |
| `mcLoc(String path)` / `modLoc(String path)` | `ResourceLocation` | Constructs `minecraft:<path>` and `<modid>:<path>` resource locations |
| `getBuilder()` / `withBuilder(Function<ResourceLocation, ResourceLocation> nameDecorator)` | `RegistrumLegacyBlockModelBuilder` | Enters the legacy-compatible block model template builder chain to freely configure texture slots, parents, render types, and display transforms |
| `withParent(ResourceLocation parent)` | `RegistrumLegacyBlockModelBuilder` | Creates a model builder inheriting from `parent` (e.g., `block/cube_all` or a custom template) |
| `withParent(String name, ResourceLocation parent)` | `RegistrumLegacyBlockModelBuilder` | Specifies a model output path name and inherits from `parent` |

Fluent methods supported by `RegistrumLegacyBlockModelBuilder`:
- `texture(TextureSlot slot, ResourceLocation texture)` (accumulates texture mappings across calls, automatically building the matching vanilla `TextureMapping` for bound slots)
- `parent(ResourceLocation parent)`, `suffix(String suffix)`, `transformTemplate(UnaryOperator<ModelTemplate>)`, `transformTexture(UnaryOperator<TextureMapping>)`
- `renderType(String renderType)` / `renderType(ResourceLocation renderType)` (writes `"render_type"` to extended models, e.g., `"cutout"`, `"translucent"`)
- `ambientOcclusion(boolean)`, `guiLight(UnbakedModel.GuiLight)`, `rootTransforms(Consumer<RootTransformsBuilder>)`, `transform(ItemDisplayContext, Consumer<TransformVecBuilder>)`, `customLoader(...)` (outputs extended attributes via NeoForge's `ExtendedModelTemplateBuilder`)
- **Terminal build methods**: `build(Block target)` (names and registers under target block) or `build(ResourceLocation modelId)` (returns the generated model `ResourceLocation` directly)

```java
// Use the legacy-compatible builder to generate a cube block with custom textures and cutout render layer
MyMod.REGISTRUM.block("copper_grate", Block::new)
    .blockstate(() -> (ctx, prov) -> {
        ResourceLocation model = prov.withParent(ctx.getName(), prov.mcLoc("block/cube_all"))
            .texture(TextureSlot.ALL, prov.modLoc("block/copper_grate"))
            .renderType("cutout")
            .build(ctx.getId());
        prov.blockStateOutput.accept(
            net.minecraft.client.data.models.BlockModelGenerators.createSimpleBlock(ctx.getEntry(), model)
        );
    })
    .simpleItem()
    .register();
```

### Item Models & Tinted Models: `RegistrumItemModelGenerator`

`RegistrumItemModelGenerator` extends vanilla `ItemModelGenerators` directly and adds convenient wrappers:

| Method | Description |
| --- | --- |
| `generateFlatItem(Item item, ModelTemplate template)` | Inherited vanilla method, typically used with `ModelTemplates.FLAT_ITEM` or `HANDHELD_ITEM` |
| `createWithExistingModel(Item item, ResourceLocation modelId)` | Writes a `Plain` model definition in `items/<name>.json` pointing to an existing model ID (such as a block model or custom model) |
| `generateTintedModel(Item item, ResourceLocation modelId, ItemTintSource... tintSources)` | Generates a tinted model definition in `items/<name>.json` with `ItemTintSource`s (such as `Constant`, `Dye`, `Firework`) |
| `mcLoc(String)` / `modLoc(String)` | Quickly builds vanilla or mod resource IDs |
| `modid(NonNullSupplier<String> modid)` / `name(NonNullSupplier<String> name)` | Path composition helpers |

## Recipe Generation: `RegistrumRecipeProvider` & `DataIngredient`

`RegistrumRecipeRunner` automatically creates `RegistrumRecipeProvider` (extending `RecipeProvider` and implementing `RecipeOutput`, so it can be passed directly to `.save(prov, ...)`) during server Datagen.

### `DataIngredient`: Bundling Recipe Ingredients with Unlock Criteria

In 1.21.4, `DataIngredient` no longer directly proxies all methods of vanilla `Ingredient`—use `toVanilla()` when passing to `RecipeBuilder`, while unlock criteria are still derived in one call:

| Factory / Instance Method | Description |
| --- | --- |
| `DataIngredient.items(NonNullSupplier<? extends ItemLike> first, NonNullSupplier<? extends ItemLike>... others)` | Wraps one or more deferred item entries as a `DataIngredient` (supports tags or items directly) |
| `DataIngredient.items(ItemLike first, ItemLike... others)` | Wraps existing vanilla or static item instances |
| `DataIngredient.stacks(ItemStack first, ItemStack... others)` | Extracts `Item`s from stacks to build ingredients and unlock criteria |
| `DataIngredient.tag(TagKey<Item> tag)` | Wraps an item tag; unlock criterion is automatically based on that `TagKey` |
| `DataIngredient.ingredient(Ingredient parent, ItemLike / TagKey<Item> / ResourceLocation, ItemPredicate...)` | Wraps a custom vanilla `Ingredient` (e.g., mixed ingredients with NBT/Component checks) |
| `toVanilla()` | Extracts the underlying vanilla `Ingredient` |
| `getCriterion(RegistrumRecipeProvider prov)` | Generates the corresponding `Criterion<InventoryChangeTrigger.TriggerInstance>` |
| `getId()` | Returns the ingredient ID for generating unique recipe names via `prov.safeName(source)` |

### Common Convenience Recipe Methods on `RegistrumRecipeProvider`

Beyond vanilla `RecipeProvider`'s `shaped(...)`, `shapeless(...)`, `has(...)`, and `tag(TagKey)`, `RegistrumRecipeProvider` offers many one-call helpers with automatic naming and unlock criteria:

- **Path-safe helpers**: `resolve(ResourceKey<T>)`, `safeId(...)`, `safeKey(...)`, `safeName(...)`
- **Cooking & smelting**: `smelting(...)`, `blasting(...)`, `smoking(...)`, `campfire(...)`, `cooking(...)`, `smeltingAndBlasting(...)`, `food(...)` (with built-in constants like `DEFAULT_SMELT_TIME = 200`)
- **Stonecutting**: `stonecutting(source, category, result[, resultAmount])`
- **Storage blocks & crafting**: `square(source, category, output, small)` (2x2 or 3x3), `storage(sourceSupplier, category, outputSupplier)` (auto-generates both 3x3 packing and 1->9 unpacking recipes), `singleItem(...)`, `singleItemUnfinished(...)`, `planks(...)`
- **Building variants**: `stairs(...)`, `slab(...)`, `wall(...)`, `fence(...)`, `fenceGate(...)`, `trapDoor(...)`, `door(...)`, `pressurePlate(...)`, `button(...)`, all optionally including stonecutting variants

```java
MyMod.REGISTRUM.item("alloy_ingot", Item::new)
    .recipe((ctx, prov) -> {
        DataIngredient rawAlloy = DataIngredient.items(ModItems.RAW_ALLOY);
        // Both smelting and blasting recipes
        prov.smeltingAndBlasting(rawAlloy, RecipeCategory.MISC, ctx, 0.7F);
        // Bidirectional 9-to-1 storage block recipes
        prov.storage(ctx, RecipeCategory.BUILDING_BLOCKS, ModBlocks.ALLOY_BLOCK);
    })
    .register();
```

## Loot Tables: `RegistrumLootTableProvider`, `Block` & `Entity`

`RegistrumLootTableProvider` in 1.21.4 aggregates loot table generation actions by `ContextKeySet` (replacing legacy `LootContextParamSet`):
- **`LootType.BLOCK` (`RegistrumBlockLootTables`)**: forwards and extends vanilla `VanillaBlockLoot`, exposing all common `protected`/`public` methods (`dropSelf`, `dropOther`, `dropWhenSilkTouch`, `otherWhenSilkTouch`, `createSingleItemTable`, `createOreDrop`, `createSilkTouchDispatchTable`, `createSlabItemTable`, `createDoorTable`, `createCropDrops`, `createMultifaceBlockDrops`, `createMossyCarpetBlockDrops`, etc.) as `public`.
- **`LootType.ENTITY` (`RegistrumEntityLootTables`)**: loot generator for living entities, exposing `add(EntityType<?>, LootTable.Builder)` / `add(EntityType<?>, ResourceKey<LootTable>, LootTable.Builder)`.
- **Custom loot types**: register chest, fishing, or archaeology loot via `prov.addLootAction(LootContextParamSets.CHEST, callback -> ...)`.

> [!WARNING]
> Custom blocks registered with `RegistrumBlockLootTables` must retain loot tables on `BlockBehaviour.Properties` (do not call `.noLootTable()`); if a block neither calls `.noLootTable()` nor has a loot entry written, `LootTableProvider` validation fails. For decorative or fluid blocks that drop nothing, add `.noLootTable()` in `BlockBuilder#properties` or emit an explicit empty table in `BlockBuilder#loot`.

## Tags, Language, Advancements & Generic Data

- **Tag generation (`RegistrumTagsProvider`)**: supports standard `Builder#tag(...)` and global additions `REGISTRUM.addDataGenerator(ProviderType.BLOCK_TAGS, prov -> prov.addTag(...).add(...))`. In `ProviderType.ITEM_TAGS` (`RegistrumItemTagsProvider`), call `prov.copy(BlockTags.FENCES, ItemTags.FENCES)` to copy block tags to item tags without legacy `ExistingFileHelper`.
- **Language generation (`RegistrumLangProvider`)**: all `Builder#lang(...)` and `addRawLang` calls emit both `assets/<modid>/lang/en_us.json` and upside-down test language `en_ud.json` (preserving format specifiers like `%1$s`); static helpers `toEnglishName(String)`, `toUpsideDown(String)`, `add(ResourceKey, ...)`, `addBlock`, `addItem`, etc. are public.
- **Advancement generation (`RegistrumAdvancementProvider`)**: implements `Consumer<AdvancementHolder>`, supporting both vanilla `Advancement.Builder#save(prov, id)` and conditional advancements with NeoForge `ICondition`s via `prov.save(Consumer<AdvancementHolder>, AdvancementHolder, List<ICondition>)` (using `Advancement.CONDITIONAL_CODEC`).
- **DataMaps (`RegistrumDataMapProvider`) & Datapack Registries (`RegistrumDatapackProvider`)**: correspond to `ProviderType.DATA_MAP` and `ProviderType.DYNAMIC`; `RegistrumDatapackProvider` automatically extracts all `RegistrySetBuilder` entries and tags from `AbstractRegistrum#getDataGenInitializer()` into unified static registry JSONs.
- **Generic custom output (`RegistrumGenericProvider`)**: under `ProviderType.GENERIC_SERVER` or `ProviderType.GENERIC_CLIENT`, call `prov.add(data -> new CustomJsonProvider(data.output(), data.registries()))` to mount any standard `DataProvider`.
