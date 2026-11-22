# Data Generation System & Providers (`GatherDataEvent`)

`module.registrum` fully manages NeoForge's `GatherDataEvent`. Instead of writing and registering vanilla `DataProvider`s one by one, calling `Registrum.create(modid)` attaches `RegistrumDataProvider` to the Mod bus to launch all topologically sorted sub-providers during datagen and dispatch `setData` / `addMiscData` / `addDataGenerator` callbacks.

## Scheduling: `RegistrumDataProvider` & `DataProviderInitializer`

### Initialization & Topological Sorting

Every `AbstractRegistrum` maintains a `DataProviderInitializer` accessible via `getDataGenInitializer()`:

- `add(ResourceKey<Registry<T>> registry, RegistrySetBuilder.RegistryBootstrap<T> provider)`: registers datapack registry generation rules on `RegistrySetBuilder` for `ProviderType.DYNAMIC` (`RegistrumDatapackProvider`).
- `addDependency(ProviderType<?> dependent, ProviderType<? extends RegistrumLookupFillerProvider> parent)`: declares that `dependent` must be constructed after `parent` populates its lookup, receiving `parent.getFilledProvider()` as its `CompletableFuture<HolderLookup.Provider>`. Built-in default: `ITEM_TAGS` depends on `BLOCK_TAGS` (for `copy(blockTag, itemTag)`).

At construction, `RegistrumDataProvider` collects target `LogicalSide`s per `event.includeServer()` / `event.includeClient()`, instantiates sub-providers in `getSortedProviders()` topological order (throwing `IllegalStateException` on cycles), and executes global + per-entry tasks via `AbstractRegistrum.genData(ProviderType<T> type, T gen)`.

### Registration Callback APIs

In addition to `.setData(...)`, `.addMiscData(...)`, and `.dataMap(...)` on fluent Builders, you can call directly on `REGISTRUM`:

- `REGISTRUM.addDataGenerator(ProviderType<? extends T> type, NonNullConsumer<? extends T> cons)`: appends a global datagen callback (extra recipes, global lang, cross-entry tags).
- `REGISTRUM.getDataProvider(ProviderType<T> type)`: retrieves an already-created sibling Provider instance in the same run via `Optional<T>` (e.g., `BlockBuilder` reading generated blockstates from `ProviderType.BLOCKSTATE` for default item models).

### Datagen Context: `DataGenContext<R, E>`

The first parameter `DataGenContext<R, E>` in `setData(ProviderType, (ctx, prov) -> ...)` implements `NonNullSupplier<E>` and delegates entry access via `@Delegate`:

- `ctx.getEntry()` / `ctx.get()`: returns the actual registered entry `E`.
- `ctx.getName()`: returns the path string (e.g., `"crusher"`).
- `ctx.getId()`: returns the full `ResourceLocation` (`<modid>:<name>`).

## Built-in `ProviderType` List & Custom Extensions

`ProviderType<T extends RegistrumProvider>` defines all built-in datagen keys, split into **SERVER DATA (`LogicalSide.SERVER`)** and **CLIENT DATA (`LogicalSide.CLIENT`)**:

| Constant Key | Provider Implementation | `LogicalSide` | Purpose |
| :--- | :--- | :--- | :--- |
| `DYNAMIC` | `RegistrumDatapackProvider` | `SERVER` | Generates datapack dynamic registry entries via `DataProviderInitializer`'s `RegistrySetBuilder` (biome modifiers, enchantments, custom registry JSONs) |
| `DATA_MAP` | `RegistrumDataMapProvider` | `SERVER` | Generates NeoForge DataMaps (furnace fuels, compostables, custom `DataMapType`s) |
| `RECIPE` | `RegistrumRecipeProvider` | `SERVER` | Generates crafting, smelting, stonecutting, and custom mod recipes & unlock advancements |
| `ADVANCEMENT` | `RegistrumAdvancementProvider` | `SERVER` | Generates mod advancements (supports `WithConditions` conditional advancements) |
| `LOOT` | `RegistrumLootTableProvider` | `SERVER` | Generates block, entity, or arbitrary `LootContextParamSet` loot tables |
| `BLOCK_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Block>` | `SERVER` | Generates `tags/block` block tags |
| `ENCHANTMENT_TAGS` | `RegistrumTagsProvider.Impl<Enchantment>` | `SERVER` | Generates `tags/enchantment` enchantment tags |
| `DAMAGE_TYPE_TAGS` | `RegistrumTagsProvider.Impl<DamageType>` | `SERVER` | Generates `tags/damage_type` damage type tags |
| `ITEM_TAGS` | `RegistrumItemTagsProvider` | `SERVER` | Generates `tags/item` item tags, supporting `copy` from block tags |
| `FLUID_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Fluid>` | `SERVER` | Generates `tags/fluid` fluid tags |
| `ENTITY_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | `SERVER` | Generates `tags/entity_type` entity type tags |
| `GENERIC_SERVER` | `RegistrumGenericProvider` | `SERVER` | Mounts any custom server-side vanilla `DataProvider` |
| `BLOCKSTATE` | `RegistrumBlockstateProvider` | `CLIENT` | Generates blockstate and block model JSONs |
| `ITEM_MODEL` | `RegistrumItemModelProvider` | `CLIENT` | Generates item model JSONs |
| `LANG` | `RegistrumLangProvider` | `CLIENT` | Generates both `en_us.json` and auto-flipped upside-down `en_ud.json` |
| `GENERIC_CLIENT` | `RegistrumGenericProvider` | `CLIENT` | Mounts any custom client-side vanilla `DataProvider` |

### Registering Custom `ProviderType`s

If a mod introduces custom registry tags or standalone JSON generators, register new `ProviderType`s via static factories (**must be initialized before `GatherDataEvent` fires**):

- `ProviderType.registerServerData(String name, SimpleServerDataFactory<T> factory)`: convenience factory for server generators taking `(parent, output, provider)`.
- `ProviderType.registerProvider(String name, DependencyAwareProviderType<T> type)`: full access to `ProviderType.Context<T>` (`output`, `fileHelper`, `provider`, `existing` map, and `@Deprecated` `event`).
- `ProviderType.registerIntrinsicTag(String providerName, String typeName, ResourceKey<? extends Registry<T>> registry, Function<T, ResourceKey<T>> keyExtractor)`: adds a tag `ProviderType` for built-in static registries.
- `ProviderType.registerDynamicTag(String providerName, String typeName, ResourceKey<Registry<T>> registry)`: adds a tag `ProviderType` for dynamic datapack registries.
- `ProviderType.registerTag(String name, ResourceKey<? extends Registry<T>> key, DependencyAwareProviderType<R> type)`: entry point for custom tag subclasses (note: `RegistrumDataProvider` requires all `RegistrumTagsProvider`s to be registered via `registerTag` variants or it throws).

## Detailed Provider Core APIs

### 1. Models & BlockStates (`RegistrumBlockstateProvider` & `RegistrumItemModelProvider`)

- `RegistrumBlockstateProvider` extends NeoForge `BlockStateProvider`, adding:
  - `getExistingVariantBuilder(Block block)` -> `Optional<VariantBlockStateBuilder>`
  - `getExistingMultipartBuilder(Block block)` -> `Optional<MultiPartBlockStateBuilder>`
- `RegistrumItemModelProvider` extends NeoForge `ItemModelProvider`, adding common shortcuts:
  - `modid(item)` / `name(item)` / `itemTexture(item)` (`modLoc("item/" + name(item))`)
  - `blockItem(block)` / `blockItem(block, suffix)` / `blockWithInventoryModel(block)` (parent `block/<name>_inventory`)
  - `blockSprite(block)` / `blockSprite(block, texture)` (flat block item model using `item/generated` + `block/` texture)
  - `generated(item)` / `generated(item, ResourceLocation... layers)` (multi-layer `layer0`, `layer1`, ...)
  - `handheld(item)` / `handheld(item, texture)` (`item/handheld` tool/weapon model)

### 2. Language Generation (`RegistrumLangProvider`)

Outputs both standard `en_us` and `en_ud` (upside-down via character map while preserving printf placeholders):

- `toEnglishName(String internalName)`: converts snake_case (e.g., `"copper_ingot"`) to `"Copper Ingot"`.
- `getAutomaticName(NonNullSupplier<? extends T> sup, ResourceKey<? extends Registry<T>> registry)`: auto-converts from registry key.
- Quick helpers: `addBlock(block)`, `addItem(item)`, `addEntityType(entity)`, `add(CreativeModeTab tab, String name)`.
- Tooltip support: `addBlockWithTooltip(...)`, `addItemWithTooltip(...)`, `addTooltip(item, String)` (key `<descId>.desc`), `addTooltip(item, List<String>)` (keys `<descId>.desc.0`, `...desc.1`).
- `toUpsideDown(String)`: upside-down English converter preserving `%s`, `%1$s`, etc.

### 3. Recipes & Ingredient Wrappers (`RegistrumRecipeProvider` & `DataIngredient`)

`RegistrumRecipeProvider` extends vanilla `RecipeProvider` and implements `RecipeOutput`, re-exposing previously `protected static` vanilla helpers as `public` / `public static` for use outside lambdas, plus high-level wrappers:

- **Naming helpers**: `safeId(...)`, `safeName(...)` (replaces `/` with `_` to avoid invalid filenames).
- **Cooking**: `cooking(...)`, `smelting(...)`, `blasting(...)`, `smoking(...)`, `campfire(...)`, `smeltingAndBlasting(...)`, `food(...)` (smelting + smoking + campfire), with constants `DEFAULT_SMELT_TIME = 200`, `DEFAULT_BLAST_TIME = 100`, `DEFAULT_SMOKE_TIME = 100`, `DEFAULT_CAMPFIRE_TIME = 600`.
- **Stonecutting & storage**: `stonecutting(...)`, `square(source, category, output, small)` (2x2 or 3x3), `storage(source, category, output)` (bidirectional 9-to-1 + 1-to-9), `singleItemUnfinished(...)`, `singleItem(...)`.
- **Building sets**: `planks(...)`, `stairs(...)`, `slab(...)`, `fence(...)`, `fenceGate(...)`, `wall(...)`, `door(...)`, `trapDoor(...)`; plus 1.21.1 backported helpers `shelf(result, strippedLogs)`, `colorItemWithDye(...)`, `colorWithDye(...)`, `dryGhast(result)`.
- **Dynamic registry lookup**: `resolve(ResourceKey<T> key)` resolves `Holder<T>` directly on `provider`.

`DataIngredient` bundles `Ingredient` with recipe naming / `InventoryChangeTrigger.TriggerInstance` unlock criteria (Datagen-only):
- `DataIngredient.items(NonNullSupplier...)` / `DataIngredient.items(T first, T... others)`
- `DataIngredient.stacks(ItemStack first, ItemStack... others)`
- `DataIngredient.tag(TagKey<Item> tag)`
- `DataIngredient.ingredient(Ingredient, ItemLike / TagKey / ResourceLocation + ItemPredicate...)`
- `getCriterion(RegistrumRecipeProvider)` and `toVanilla()`

### 4. Advancement Generation (`RegistrumAdvancementProvider`)

Implements `Consumer<AdvancementHolder>`, writing to `data/<ns>/advancement/<path>.json` via `provider.accept(holder)` or conditional `provider.withConditions(holder, conditions)`:
- `title(String category, String name, String title)` -> generates `advancements.<category>.<name>.title` via `owner.addLang("advancements", ...)` and returns the component.
- `desc(String category, String name, String desc)` -> generates `.description` and returns the component.
- `resolve(ResourceKey<T> key)` -> resolves `Holder<T>` from `HolderLookup.Provider`.

### 5. Tag Generation (`RegistrumTagsProvider` & `RegistrumItemTagsProvider`)

- `RegistrumTagsProvider<T>` has two implementations: `Impl<T>` (`TagsProvider<T>`, for enchantments, damage types, or dynamic registries) and `IntrinsicImpl<T>` (`IntrinsicHolderTagsProvider<T>`, supporting `addTag(tag).add(entry)` directly).
- `RegistrumItemTagsProvider` adds vanilla `copy(TagKey<Block>, TagKey<Item>)`, copying block tag entries into the matching item tag after `BLOCK_TAGS` completes.

### 6. DataMaps & Dynamic Datapacks (`RegistrumDataMapProvider` & `RegistrumDatapackProvider`)

- `RegistrumDataMapProvider` extends NeoForge `DataMapProvider` and exposes `getProvider()` during `gather(HolderLookup.Provider)` so per-builder `.dataMap(type, (ctx, lookup) -> ...)` can access registries safely (throws `IllegalStateException` outside `gather`).
- `RegistrumDatapackProvider` packages all `RegistrySetBuilder` entries from `DataProviderInitializer.getDatapackRegistryProviders()` via `RegistryPatchGenerator.createLookup(...)` and exposes `getFilledProvider()` to downstream tag providers (such as enchantment or damage type tags).

### 7. Loot Tables (`loot` Subpackage)

`RegistrumLootTableProvider` supports two extension mechanisms:
- **`LootType<T extends RegistrumLootTables>`**: built-in `LootType.BLOCK` (`RegistrumBlockLootTables`, exposing `VanillaBlockLoot` `protected` methods as `public`, e.g., `createSilkTouchDispatchTable`, `createOreDrop`, `dropSelf`, `dropOther`, and scoping `getKnownBlocks()` to this `Registrum`'s blocks) and `LootType.ENTITY` (`RegistrumEntityLootTables`, scoping `getKnownEntityTypes()`). Custom types can be added via `LootType.register(name, paramSet, factory)`.
- **Arbitrary `LootContextParamSet`**: register chest/fishing/archaeology loot via `addLootAction(LootContextParamSet, Consumer<BiConsumer<ResourceKey<LootTable>, LootTable.Builder>>)`.

### 8. Generic Extensions (`RegistrumGenericProvider`)

Mount any vanilla or third-party `DataProvider` via `REGISTRUM.addDataGenerator(ProviderType.GENERIC_SERVER, gen -> gen.add(data -> new MyCustomProvider(data.output(), data.registries(), data.existingFileHelper())))` or `GENERIC_CLIENT` without handling `GatherDataEvent` yourself. `RegistrumProviderDelegate` provides a lightweight `DataProvider` identity interface tied to a single entry (`getName()`, `getId()`, `getEntry()`).

## Complete Practical Example: Dynamic Datapack Registry + Conditional Advancement + Item Tag Copy

```java
package com.example.examplemod.data;

import com.example.examplemod.ExampleMod;
import com.example.examplemod.registry.ModBlocks;
import com.example.examplemod.registry.ModItems;
import dev.anvilcraft.lib.v2.registrum.providers.ProviderType;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumDataProvider;
import dev.anvilcraft.lib.v2.registrum.util.DataIngredient;
import net.minecraft.advancements.Advancement;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.advancements.AdvancementType;
import net.minecraft.advancements.critereon.InventoryChangeTrigger;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.recipes.RecipeCategory;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.damagesource.DamageScaling;
import net.minecraft.world.damagesource.DamageType;
import net.neoforged.neoforge.common.conditions.ModLoadedCondition;

import java.util.List;

public class ModDataGenerators {
    public static final ResourceKey<DamageType> CRUSHING_DAMAGE = ResourceKey.create(
        Registries.DAMAGE_TYPE,
        ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "crushing")
    );

    public static void init() {
        // 1. Declare dynamic datapack registry (DamageType) generation logic and tag dependency
        ExampleMod.REGISTRUM.getDataGenInitializer().add(
            Registries.DAMAGE_TYPE,
            ctx -> ctx.register(CRUSHING_DAMAGE, new DamageType("crushing", DamageScaling.WHEN_CAUSED_BY_LIVING_NON_PLAYER, 0.1f))
        );
        ExampleMod.REGISTRUM.getDataGenInitializer().addDependency(ProviderType.DAMAGE_TYPE_TAGS, ProviderType.DYNAMIC);

        // 2. Item tag copy: copy custom block tag to same-named item tag
        ExampleMod.REGISTRUM.addDataGenerator(ProviderType.ITEM_TAGS, prov -> {
            prov.copy(BlockTags.STORAGE_BLOCKS_IRON, ItemTags.create(BlockTags.STORAGE_BLOCKS_IRON.location()));
        });

        // 3. Global recipe (using DataIngredient for auto unlock criterion and path-safe ID)
        ExampleMod.REGISTRUM.addDataGenerator(ProviderType.RECIPE, prov -> {
            prov.smeltingAndBlasting(
                DataIngredient.items(ModItems.EXAMPLE_INGOT),
                RecipeCategory.MISC,
                ModBlocks.CRUSHER,
                0.7f
            );
        });

        // 4. Conditional starter advancement (only active when anvilcraft is loaded)
        ExampleMod.REGISTRUM.addDataGenerator(ProviderType.ADVANCEMENT, prov -> {
            AdvancementHolder root = Advancement.Builder.advancement()
                .display(
                    ModBlocks.CRUSHER.get(),
                    prov.title(ExampleMod.MODID, "root", "Anvil & Gear"),
                    prov.desc(ExampleMod.MODID, "root", "Obtain a Mechanical Crusher"),
                    ResourceLocation.withDefaultNamespace("textures/gui/advancements/backgrounds/stone.png"),
                    AdvancementType.TASK,
                    true, true, false
                )
                .addCriterion("has_crusher", InventoryChangeTrigger.TriggerInstance.hasItems(ModBlocks.CRUSHER.get()))
                .build(ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "main/root"));

            prov.withConditions(root, List.of(new ModLoadedCondition("anvilcraft")));
        });
    }
}
```
