---
title: Registrum Changelog
prev: false
next: false
---

# Changelog <Badge type="tip" text=">=1.21.1" />

This document records API changes in the Registrum module across versions.

---

## v2.0 (26.1) <Badge type="tip" text="current" />

### Added

| API                                        | Type       | Description                                                       |
|--------------------------------------------|------------|-------------------------------------------------------------------|
| `GeneratorType<T>`                         | Interface  | Marker interface, replaces anonymous `String` generator types     |
| `ProviderType.RECIPE_RUNNER`               | Provider   | Recipe runner, replaces direct use of `RECIPE`                    |
| `ProviderType.MODEL`                       | Provider   | Unified model entry point, replaces standalone `BLOCKSTATE`/`ITEM_MODEL` providers |
| `ProviderType.ENCHANTMENT_TAGS`            | Provider   | Enchantment tag generation                                        |
| `ProviderType.DAMAGE_TYPE_TAGS`            | Provider   | Damage type tag generation                                        |
| `ProviderType.FLUID_TAGS`                  | Provider   | Fluid tag generation                                              |
| `ProviderType.ENTITY_TAGS`                 | Provider   | Entity tag generation                                             |
| `RegistrumModelProvider`                   | Class      | New model generator (extends `ModelProvider`)                     |
| `RegistrumBlockModelGenerator`             | Class      | New block model generator (extends `BlockModelGenerators`)        |
| `RegistrumItemModelGenerator`              | Class      | New item model generator (extends `ItemModelGenerators`)          |
| `RegistrumLegacyBlockModelBuilder`         | Class      | Legacy block model builder                                        |
| `RegistrumRecipeRunner`                    | Class      | Recipe runner (extends `RecipeProvider.Runner`)                   |
| `RegistrumDatapackProvider`                | Class      | Dynamic datapack registration support                             |
| `DataProviderInitializer.addDependency()`  | Method     | Provider dependency declaration                                   |
| `ProviderType.createGenerator(String)`     | Method     | Create GeneratorType from ProviderType                            |
| `GeneratorType` composition pattern        | Pattern    | `RECIPE = RECIPE_RUNNER.createGenerator("recipe")`               |
| `@FieldsAreNonnullByDefault`               | Annotation | FieldsAreNonnullByDefault support (migrated from Registrate)      |

### Changed

| API                              | Before (1.21.1)                           | After (26.1)                                           | Impact                                      |
|----------------------------------|-------------------------------------------|--------------------------------------------------------|---------------------------------------------|
| `ProviderType.BLOCKSTATE`        | Directly uses `RegistrumBlockstateProvider` | `MODEL.createGenerator("blockstate")`                  | <Badge type="danger" text="breaking" />     |
| `ProviderType.ITEM_MODEL`        | Directly uses `RegistrumItemModelProvider`  | `MODEL.createGenerator("item_model")`                  | <Badge type="danger" text="breaking" />     |
| `ProviderType.RECIPE`            | Directly uses `RegistrumRecipeProvider`     | `RECIPE_RUNNER.createGenerator("recipe")`              | <Badge type="danger" text="breaking" />     |
| `RegistrumBlockstateProvider`    | Present (extends `BlockStateProvider`)      | Removed                                                 | <Badge type="danger" text="breaking" />     |
| `RegistrumItemModelProvider`     | Present (extends `ItemModelProvider`)       | Removed                                                 | <Badge type="danger" text="breaking" />     |
| `RegistrumRecipeProvider`        | extends `RecipeProvider`                    | extends `RecipeProvider`, implements `RecipeOutput`    | <Badge type="warning" text="behavior" />    |
| `RegistrumDataProvider.Context`  | Contains `ExistingFileHelper`               | No `ExistingFileHelper`; uses `PackOutput` directly     | <Badge type="danger" text="breaking" />     |
| Generator package structure      | `providers/RegistrumXxxProvider.java`       | `providers/generators/RegistrumXxxGenerator.java`      | <Badge type="info" text="refactor" />       |

### Deprecated

| API                                            | Description                                      |
|------------------------------------------------|--------------------------------------------------|
| Legacy `register(String, NonNullBiFunction, ...)` | Replaced by the `SimpleServerDataFactory` pattern |

### Removed

| API                                        | Description                                   |
|--------------------------------------------|-----------------------------------------------|
| `RegistrumBlockstateProvider`              | Replaced by `RegistrumBlockModelGenerator`    |
| `RegistrumItemModelProvider`               | Replaced by `RegistrumItemModelGenerator`     |
| `RegistrumProviderDelegate`                | No longer needed; uses GeneratorType composition |
| `ProviderType.Context.existingFileHelper`  | Replaced by `PackOutput`                      |

### Migration Guide

```java
// 1.21.1: Legacy generators
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumBlockstateProvider;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumItemModelProvider;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumRecipeProvider;

builder.blockstate(() -> (ctx, gen) -> { ... });
builder.model(() -> (ctx, gen) -> { ... });
builder.recipe((ctx, gen) -> { ... });

// 26.1: New generators
import dev.anvilcraft.lib.v2.registrum.providers.generators.RegistrumBlockModelGenerator;
import dev.anvilcraft.lib.v2.registrum.providers.generators.RegistrumItemModelGenerator;
import dev.anvilcraft.lib.v2.registrum.providers.generators.RegistrumRecipeProvider;

// API call conventions unchanged (AbstractRegistrum internally adapted)
builder.blockstate(() -> (ctx, gen) -> { ... });
builder.model(() -> (ctx, gen) -> { ... });
builder.recipe((ctx, gen) -> { ... });
```

---

## v2.0 (1.21.1) <Badge type="info" text="initial" />

### Initial Release -- All New

| Category   | API                             | Description                                                         |
|------------|---------------------------------|---------------------------------------------------------------------|
| Entry      | `Registrum.create(String)`      | Create a Registrum instance                                         |
| Core       | `AbstractRegistrum<S>`          | Registration engine base class                                      |
| Core       | `Builder<R,T,P,S>`              | Builder root interface                                              |
| Block      | `BlockBuilder<T,P>`             | Block builder                                                       |
| Item       | `ItemBuilder<T,P>`              | Item builder                                                        |
| BlockEntity| `BlockEntityBuilder<T,P>`       | Block entity type builder                                           |
| Entity     | `EntityBuilder<T,P>`            | Entity type builder                                                 |
| Menu       | `MenuBuilder<T,SC,P>`           | Menu type builder                                                   |
| Fluid      | `FluidBuilder<T,P>`             | Fluid builder                                                       |
| Generic    | `NoConfigBuilder<R,T,P>`        | No-configuration builder                                            |
| Entry      | `RegistryEntry<R,S>`            | Base registration entry                                             |
| Entry      | `ItemProviderEntry<R,T>`        | Item provider entry                                                 |
| Entry      | `BlockEntry<T>`                 | Block entry                                                         |
| Entry      | `ItemEntry<T>`                  | Item entry                                                          |
| Entry      | `BlockEntityEntry<T>`           | Block entity entry                                                  |
| Entry      | `EntityEntry<T>`                | Entity entry                                                        |
| Entry      | `MenuEntry<T>`                  | Menu entry                                                          |
| Entry      | `FluidEntry<T>`                 | Fluid entry                                                         |
| Entry      | `LazyRegistryEntry<R,T>`        | Lazy entry reference                                                |
| Generator  | `RegistrumBlockstateProvider`   | Block state provider (<Badge type="danger" text="removed in 26.1" />) |
| Generator  | `RegistrumItemModelProvider`    | Item model provider (<Badge type="danger" text="removed in 26.1" />) |
| Generator  | `RegistrumRecipeProvider`       | Recipe provider                                                     |
| Generator  | `RegistrumLootTableProvider`    | Loot table provider                                                 |
| Generator  | `RegistrumAdvancementProvider`  | Advancement provider                                                |
| Generator  | `RegistrumDataMapProvider`      | DataMap provider                                                    |
| Generator  | `RegistrumLangProvider`         | Language file provider                                              |
| Generator  | `RegistrumTagsProvider`         | Tag provider                                                        |
| Generator  | `RegistrumItemTagsProvider`     | Item tags provider                                                  |
| Generator  | `RegistrumGenericProvider`      | Generic provider                                                    |
| Utility    | `CreativeModeTabModifier`       | Creative tab modifier                                               |
| Utility    | `DataIngredient`                | Data generation recipe ingredient                                   |
| Utility    | `OneTimeEventReceiver`          | One-time event receiver                                             |
| Utility    | `RegistrumDistExecutor`         | Physical-side dispatch executor                                     |
| Utility    | `Sequence<T>`                   | Sequence building utility                                           |
| Utility    | `DebugMarkers`                  | Debug log markers                                                   |

---

## Version Comparison Quick Reference

| Feature                                      | 1.21.1                                        | 26.1                                           | Notes                                     |
|----------------------------------------------|-----------------------------------------------|------------------------------------------------|-------------------------------------------|
| `Registrum.create()`                         | yes                                           | yes                                            |                                           |
| `object()` / `get()` / `getAll()`            | yes                                           | yes                                            |                                           |
| `simple()` / `generic()`                     | yes                                           | yes                                            |                                           |
| `block()` / `item()`                         | yes                                           | yes                                            |                                           |
| `entity()` / `blockEntity()` / `menu()`      | yes                                           | yes                                            |                                           |
| `fluid()`                                    | yes                                           | yes                                            |                                           |
| `defaultCreativeTab()`                       | yes                                           | yes                                            |                                           |
| `addRegisterCallback()`                      | yes                                           | yes                                            |                                           |
| `makeRegistry()` / `makeDatapackRegistry()`  | yes                                           | yes                                            |                                           |
| `addLang()` / `addRawLang()`                 | yes                                           | yes                                            |                                           |
| `transform()`                                | yes                                           | yes                                            |                                           |
| `skipErrors()`                               | yes                                           | yes                                            |                                           |
| `getDataProvider()`                          | yes                                           | yes                                            | Internal implementation changed           |
| `setDataGenerator()` / `addDataGenerator()`  | yes                                           | yes                                            |                                           |
| `getDataGenInitializer()`                    | yes                                           | yes                                            | 26.1 supports addDependency               |
| `BiomeBuilder`                               | <Badge type="warning" text="commented out" /> | <Badge type="warning" text="commented out" />  | Not enabled in either version             |
| Block model generation (`blockstate()`)      | `RegistrumBlockstateProvider`                 | `RegistrumBlockModelGenerator`                 | <Badge type="danger" text="breaking" />   |
| Item model generation (`model()`)            | `RegistrumItemModelProvider`                  | `RegistrumItemModelGenerator`                  | <Badge type="danger" text="breaking" />   |
| Recipe generation (`recipe()`)               | `RegistrumRecipeProvider`                     | `RegistrumRecipeProvider` (via Runner)         | <Badge type="warning" text="changed" />   |
| `GeneratorType`                              | no                                            | yes                                            |                                           |
| `ProviderType.createGenerator()`             | no                                            | yes                                            |                                           |
| Enchantment tags `ENCHANTMENT_TAGS`          | no                                            | yes                                            |                                           |
| Damage type tags `DAMAGE_TYPE_TAGS`          | no                                            | yes                                            |                                           |
| Fluid tags `FLUID_TAGS`                      | no                                            | yes                                            |                                           |
| Entity tags `ENTITY_TAGS`                    | no                                            | yes                                            |                                           |
| `DataProviderInitializer.addDependency()`    | no                                            | yes                                            |                                           |
