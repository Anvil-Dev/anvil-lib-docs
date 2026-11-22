# Datagen Integration: Models, Recipes, Loot Tables, Tags & Language

`module.registrum` is fully adapted to Minecraft 1.21.11 and NeoForge's data generation pipeline: **`RegistrumDataProvider`** initializes via `GatherDataEvent`, **`ProviderType.MODEL` (`RegistrumModelProvider`)** drives vanilla-style **`RegistrumBlockModelGenerator`** and **`RegistrumItemModelGenerator`**, **`PropertyDispatchWrap`** solves server-startup crashes for multi-property blockstate generators, and **`ProviderType.RECIPE_RUNNER` (`RegistrumRecipeRunner`)** hosts recipe generation.

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
| `ProviderType.DAMAGE_TYPE_TAGS` | `RegistrumTagsProvider.Impl<DamageType>` | Server | Dynamic damage type registry tags (`tags/damage_type`) |
| `ProviderType.FLUID_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Fluid>` | Server | Fluid tags provider (`tags/fluid`) |
| `ProviderType.ENTITY_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | Server | Entity type tags provider (`tags/entity`) |
| `ProviderType.GENERIC_SERVER` | `RegistrumGenericProvider` | Server | Appends any standard `DataProvider` to general server data output |
| `ProviderType.MODEL` | `RegistrumModelProvider` | Client | Vanilla-style client model bundle container |
| `ProviderType.BLOCKSTATE` (subkey) | `RegistrumBlockModelGenerator` | Client | Writes blockstates (`blockstates/*.json`) and block/template models |
| `ProviderType.ITEM_MODEL` (subkey) | `RegistrumItemModelGenerator` | Client | Writes item model definitions (`items/*.json`) and item models |
| `ProviderType.LANG` | `RegistrumLangProvider` | Client | Generates `en_us.json` and auto-flipped `en_ud.json` |
| `ProviderType.GENERIC_CLIENT` | `RegistrumGenericProvider` | Client | Mounts any custom client `DataProvider` (such as `sounds.json`) |

### Registering Custom `ProviderType`s & Dependency Ordering (`DataProviderInitializer`)

Using `ProviderType` static factories and `AbstractRegistrum#getDataGenInitializer()`, you can register custom providers and their topological upstream dependencies (via unified `ProviderType.Context` / `GatherDataEvent`):

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

`RegistrumModelProvider` extends vanilla `ModelProvider`, injecting `RegistrumBlockModelGenerator` (extending `BlockModelGenerators`) into `ProviderType.BLOCKSTATE` and `RegistrumItemModelGenerator` (extending `ItemModelGenerators`) into `ProviderType.ITEM_MODEL`. Note that `getKnownBlocks()` returns `Stream.empty()` in `RegistrumModelProvider` so external blocks without explicit blockstates do not throw.

### BlockStates & Legacy-Compatible Model Builder (`RegistrumLegacyBlockModelBuilder`)

Beyond all vanilla `BlockModelGenerators` template methods (`createTrivialCube(block)`, `createNonTemplateModelBlock(block)`, `createRotatedPillarWithHorizontalVariant(...)`), `RegistrumBlockModelGenerator` provides convenient helper APIs:

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `family(Block block)` | `BlockModelGenerators.BlockFamilyProvider` | For vanilla blocks, uses textures/models as a source without re-emitting vanilla's own assets; for mod blocks, delegates normally |
| `create(Block block, Identifier model)` | `void` | Equivalent to `this.blockStateOutput.accept(createSimpleBlock(block, plainVariant(model)))` |
| `create(Block block, TexturedModel.Provider texture)` | `void` | Creates a model from `TexturedModel.Provider` and binds a simple blockstate |
| `mcLoc(String path)` / `modLoc(String path)` | `Identifier` | Constructs `minecraft:<path>` and `<modid>:<path>` identifiers |
| `getBuilder()` / `withBuilder(ExtendedModelTemplateBuilder)` / `withBuilder(ExtendedModelTemplateBuilder, TextureMapping)` | `RegistrumLegacyBlockModelBuilder` | Enters the legacy-compatible block model template builder chain to freely configure texture slots, parents, and display transforms |
| `withParent(Identifier parent)` | `RegistrumLegacyBlockModelBuilder` | Creates a model builder inheriting from `parent` (e.g., `block/cube_all` or a custom template) |
| `withParent(String name, Identifier parent)` | `RegistrumLegacyBlockModelBuilder` | Specifies a model output suffix and inherits from `parent` |

Fluent methods supported by `RegistrumLegacyBlockModelBuilder`:
- `texture(TextureSlot slot, Identifier texture)` / `texture(TextureSlot slot, Identifier texture, boolean translucent)`: adds a required `TextureSlot` to `ExtendedModelTemplateBuilder` and writes the texture mapping;
- `parent(Identifier parent)`, `suffix(String suffix)`, `transformTemplate(Consumer<ExtendedModelTemplateBuilder>)`, `transformTexture(Consumer<TextureMapping>)`;
- `ambientOcclusion(boolean)`, `guiLight(UnbakedModel.GuiLight)`, `rootTransforms(Consumer<RootTransformsBuilder>)`, `transform(ItemDisplayContext, Consumer<TransformVecBuilder>)`, `customLoader(BiFunction<ExtendedModelTemplateBuilder, ..., L>, Consumer<L>)`;
- **Terminal build methods**: `build(Block target)` or `build(Identifier modelId)` (writes model output and returns the generated `Identifier`).

```java
// Generate a simple blockstate with custom textures pointing to this model
MyMod.REGISTRUM.block("copper_grate", Block::new)
    .blockstate(() -> (ctx, prov) -> {
        Identifier model = prov.withParent(ctx.getName(), prov.mcLoc("block/cube_all"))
            .texture(TextureSlot.ALL, prov.modLoc("block/copper_grate"))
            .build(ctx.getId());
        prov.create(ctx.getEntry(), model);
    })
    .simpleItem()
    .register();
```

### Server-Safe `PropertyDispatchWrap<V>`

Vanilla `net.minecraft.client.data.models.blockstates.PropertyDispatch` is a client-only class. If a block's blockstate helper method signature exposes `PropertyDispatch` directly when running `runServer` in dev, JVM bytecode verification can crash with client classloading errors.

To prevent this, `module.registrum` provides the server-safe wrapper **`PropertyDispatchWrap<V>`** under `dev.anvilcraft.lib.v2.registrum.providers.generators.model`:

| Static Factory | Return Wrapper Type | Target Vanilla Builder |
| --- | --- | --- |
| `PropertyDispatchWrap.initial(p1..p5)` | `PropertyDispatchWrap.C1<MultiVariant, ...>` – `C5` | Initial variant dispatch mapping property combinations to `MultiVariant` |
| `PropertyDispatchWrap.modify(p1..p5)` | `PropertyDispatchWrap.C1<VariantMutator, ...>` – `C5` | Modifier dispatch for `VariantMutator` (such as rotations) |
| `PropertyDispatchWrap.modifyUnbaked(p1..p5)` | `PropertyDispatchWrap.C1<UnbakedMutator, ...>` – `C5` | Modifier dispatch for `UnbakedMutator` on unbaked models |

Each `C1`–`C5` inner class provides:
- `getDefinedProperties()`: returns the bound `Property<?>` list;
- `select(p1Val, ..., V variants)`: maps a specific property combination to a `MultiVariant` / mutator;
- `generate(Function / BiFunction / Function3 / Function4 / Function5)`: dynamically maps all property combinations and returns `PropertyDispatch<V>`;
- `dispatch()`: converts to vanilla `PropertyDispatch<V>` for `MultiVariantGenerator.dispatch(block).with(...)`.

```java
import dev.anvilcraft.lib.v2.registrum.providers.generators.model.PropertyDispatchWrap;
import net.minecraft.client.data.models.BlockModelGenerators;
import net.minecraft.client.data.models.blockstates.MultiVariantGenerator;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

MyMod.REGISTRUM.block("directional_hopper", DirectionalBlock::new)
    .blockstate(() -> (ctx, prov) -> {
        var model = BlockModelGenerators.plainVariant(prov.modLoc("block/directional_hopper"));
        prov.blockStateOutput.accept(
            MultiVariantGenerator.dispatch(ctx.getEntry(), model)
                .with(
                    PropertyDispatchWrap.modify(BlockStateProperties.FACING)
                        .select(Direction.NORTH, BlockModelGenerators.NOP)
                        .select(Direction.EAST, BlockModelGenerators.Y_ROT_90)
                        .select(Direction.SOUTH, BlockModelGenerators.Y_ROT_180)
                        .select(Direction.WEST, BlockModelGenerators.Y_ROT_270)
                        .select(Direction.UP, BlockModelGenerators.X_ROT_270)
                        .select(Direction.DOWN, BlockModelGenerators.X_ROT_90)
                        .dispatch()
                )
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
| `createWithExistingModel(Item item, Identifier id)` | Writes a `Plain` model definition in `items/<name>.json` pointing to an existing model ID |
| `generateTintedModel(Item entry, Identifier model, ItemTintSource tint)` | Generates a tinted model definition in `items/<name>.json` with `ItemTintSource` |
| `mcLoc(String id)` / `modLoc(String id)` | Quickly builds vanilla or mod resource IDs |
| `modid(NonNullSupplier<? extends ItemLike>)` / `name(NonNullSupplier<? extends ItemLike>)` | Extracts namespace and registry path from an item entry |

## Recipe Generation: `RegistrumRecipeProvider` & `DataIngredient`

`RegistrumRecipeRunner` automatically creates `RegistrumRecipeProvider` (extending `RecipeProvider` and implementing `RecipeOutput`, so it can be passed directly to `.save(prov, ...)`) during server Datagen.

### `DataIngredient`: Bundling Recipe Ingredients with Unlock Criteria

Retrieve the underlying vanilla `Ingredient` via `toVanilla()` for `RecipeBuilder`, and auto-derive advancement unlock criteria via `getCriterion(RegistrumRecipeProvider)`:

| Factory / Instance Method | Description |
| --- | --- |
| `DataIngredient.items(NonNullSupplier<? extends ItemLike> first, NonNullSupplier<? extends ItemLike>... others)` | Wraps one or more deferred item entries as a `DataIngredient` |
| `DataIngredient.items(ItemLike first, ItemLike... others)` | Wraps existing vanilla or static item instances |
| `DataIngredient.stacks(ItemStack first, ItemStack... others)` | Extracts `Item`s from stacks to build ingredients and unlock criteria |
| `DataIngredient.tag(TagKey<Item> tag)` | Wraps an item tag; unlock criterion is automatically based on that `TagKey` |
| `DataIngredient.ingredient(Ingredient parent, ItemLike / TagKey<Item> / Identifier, ItemPredicate...)` | Wraps a custom vanilla `Ingredient` |
| `toVanilla()` | Extracts the underlying vanilla `Ingredient` |
| `getCriterion(RegistrumRecipeProvider prov)` | Generates the corresponding `Criterion<InventoryChangeTrigger.TriggerInstance>` |
| `getId()` | Returns the ingredient ID for generating unique recipe names via `prov.safeName(source)` |

### Common Convenience Recipe Methods on `RegistrumRecipeProvider`

Beyond vanilla `RecipeProvider`'s `shaped(...)`, `shapeless(...)`, `has(...)`, and `tag(TagKey)`, `RegistrumRecipeProvider` offers many one-call helpers with automatic naming and unlock criteria:

- **Path-safe helpers**: `resolve(ResourceKey<T>)`, `safeId(...)`, `safeKey(...)`, `safeName(...)`
- **Cooking & smelting**: `smelting(...)`, `blasting(...)`, `smoking(...)`, `campfire(...)`, `cooking(...)`, `smeltingAndBlasting(...)`, `food(...)`
- **Stonecutting**: `stonecutting(source, category, result[, resultAmount])`
- **Smithing & dyeing**: `trimSmithing(Item template, ResourceKey<TrimPattern> pattern, ResourceKey<Recipe<?>> key)`, `colorItemWithDye(List<Item> dyes, List<Item> dyeables, String group, RecipeCategory category)`, `colorWithDye(List<Item> dyes, List<Item> dyeables, @Nullable Item undyed, String group, RecipeCategory category)`
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

`RegistrumLootTableProvider` aggregates loot table generation actions by `ContextKeySet`:
- **`LootType.BLOCK` (`RegistrumBlockLootTables`)**: forwards and extends vanilla `VanillaBlockLoot`, exposing common methods (`dropSelf`, `dropOther`, `dropWhenSilkTouch`, `otherWhenSilkTouch`, `createSingleItemTable`, `createOreDrop`, `createSilkTouchDispatchTable`, `createSlabItemTable`, `createDoorTable`, `createCropDrops`, `createMultifaceBlockDrops`, `createMossyCarpetBlockDrops`, etc.) as `public`.
- **`LootType.ENTITY` (`RegistrumEntityLootTables`)**: loot generator for living entities, exposing `add(EntityType<?>, LootTable.Builder)` / `add(EntityType<?>, ResourceKey<LootTable>, LootTable.Builder)`.
- **Custom loot types**: register chest, fishing, or archaeology loot via `prov.addLootAction(LootContextParamSets.CHEST, callback -> ...)`.

> [!WARNING]
> Custom blocks registered with `RegistrumBlockLootTables` must retain loot tables on `BlockBehaviour.Properties` (do not call `.noLootTable()`); if a block neither calls `.noLootTable()` nor has a loot entry written, `LootTableProvider` validation fails. For decorative or fluid blocks that drop nothing, add `.noLootTable()` in `BlockBuilder#properties` or emit an explicit empty table in `BlockBuilder#loot`.

## Tags, Language, Advancements & Generic Data

- **Tag generation (`RegistrumTagsProvider`)**: split into **`RegistrumTagsProvider.Key<T>`** (`Impl<T>`, e.g., `ENCHANTMENT_TAGS`, `DAMAGE_TYPE_TAGS`) and **`RegistrumTagsProvider.Intrinsic<T>`** (`IntrinsicImpl<T>`, e.g., `BLOCK_TAGS`, `FLUID_TAGS`, `ENTITY_TAGS`, `ITEM_TAGS`). For global additions, use **`prov.tag(TagKey<T>).add(...)`** (e.g., `REGISTRUM.addDataGenerator(ProviderType.BLOCK_TAGS, prov -> prov.tag(...).add(...))`), or `prov.rawBuilder(TagKey<T>)` for the underlying `TagBuilder`; in `ProviderType.ITEM_TAGS` (`RegistrumItemTagsProvider`), call `prov.copy(BlockTags.FENCES, ItemTags.FENCES)` to copy block tags to item tags.
- **Language generation (`RegistrumLangProvider`)**: all `Builder#lang(...)` and `addRawLang` calls emit both `assets/<modid>/lang/en_us.json` and upside-down test language `en_ud.json` (preserving format specifiers like `%1$s`); static helpers `toEnglishName(String)`, `toUpsideDown(String)`, `add(...)`, `addBlock`, `addItem`, etc. are public.
- **Advancement generation (`RegistrumAdvancementProvider`)**: implements `Consumer<AdvancementHolder>`, supporting both vanilla `Advancement.Builder#save(prov, id)` and conditional advancements with NeoForge `ICondition`s via `prov.save(Consumer<AdvancementHolder>, AdvancementHolder, List<ICondition>)` (using `Advancement.CONDITIONAL_CODEC`).
- **DataMaps (`RegistrumDataMapProvider`) & Datapack Registries (`RegistrumDatapackProvider`)**: correspond to `ProviderType.DATA_MAP` and `ProviderType.DYNAMIC`; `RegistrumDatapackProvider` automatically extracts all `RegistrySetBuilder` entries and tags from `AbstractRegistrum#getDataGenInitializer()` into unified static registry JSONs.
- **Generic custom output (`RegistrumGenericProvider`)**: under `ProviderType.GENERIC_SERVER` or `ProviderType.GENERIC_CLIENT`, call `prov.add(data -> new CustomJsonProvider(data.output(), data.registries()))` to mount any standard `DataProvider`.
