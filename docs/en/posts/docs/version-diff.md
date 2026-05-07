---
title: Version Diff
prev: false
next: false
---

# Version Diff Documentation

This document records API differences, module availability, and code-level changes between Minecraft versions of AnvilLib, helping developers quickly identify compatibility differences and migration costs between versions.

> All versions belong to AnvilLib `2.0.0`, developed **in parallel simultaneously**, differing only in the target Minecraft compilation version. Some modules were not synchronized to all Minecraft versions due to development capacity constraints. The version numbering below is for retrieval convenience only and does not imply release order.

---

## Module Availability Matrix

The following table shows the **presence status** of each module across 12 Minecraft versions.

| Module | 1.21.1 | 1.21.2–1.21.11 | 26.1 | Notes |
|--------|--------|----------------|------|-------|
| codec | x 3 | x 3 | x 3 | |
| config | x 11 | x 11 | x 11 | |
| integration | x 7 | x 7 | x 7 | |
| main | x 2 | x 2 | x 2 | |
| network | x 14 | x 12 | x 14 | 1.21.2–1.21.11 lack `NetworkUtil` |
| recipe | x 88 | x 99 | x 89 | |
| registrum | x 55 | x 68–71 | x 60 | 1.21.2+ embeds nullness package (11 files) |
| wheel | x 20 | x 22–30 | x 26 | |
| moveable-entity-block | x 7 | x 7 | x 8 | |
| **multiblock** | x 26 | -- | x 26 | Not synced to 1.21.2–1.21.11 due to capacity constraints |
| **util** | x 43 | -- | x 43 | Not synced to 1.21.2–1.21.11 due to capacity constraints; nullness package embedded into registrum as a stopgap |
| **rendering** | -- | -- | x 19 | Only exists in 26.1 |
| test | x 17 | x 6 | x 12 | |
| **Total** | 273 | 240–248 | 312 | |

> `--` indicates the module does **not exist** in that version range. Numbers represent Java source file counts.
>
> **nullness package embedding for util module**: In versions where `module.util` was removed (1.21.2–1.21.11), functional interfaces such as `NonNullSupplier` and `NonNullFunction` were temporarily embedded into `module.registrum` under the `registrum.util.nullness` package to ensure the Registrum module could compile independently. In 26.1, once `module.util` was restored as an independent module, these classes migrated back to `util.nullness`.

---

## Code-Level Change Comparison

The following lists **source code diffs** between each version and its predecessor for each Minecraft version. Only entries with actual changes between versions are listed; version transitions with no changes are omitted here.

### 1.21.1 -> 1.21.2

Compilation target change: `[1.21.1,1.21.2)` -> `[1.21.2,1.21.3)`, Parchment `2024.11.17`.

**Module availability changes:**

- `module.multiblock` — Not synced to this version
- `module.util` — Not synced to this version; nullness package embedded into registrum
- `module.network` — `NetworkUtil.java` and `util/` package not synced (14->12 files)
- `module.test` — Multiblock tests, Datagen tests, wheel/lang not synced (17->6 files)

**recipe module code changes:**

| File | Change |
|------|--------|
| `InWorldRecipe.java` | Added `placementInfo()`, `recipeBookCategory()`; removed `canCraftInDimensions()` |
| `InWorldRecipeBuilder.java` | `save()` second param: `ResourceLocation` -> `ResourceKey<Recipe<?>>`; added `save(RecipeOutput, ResourceLocation)` overload |
| (new) `IRecipeMapExtension.java` | Injected interface, provides `anvillib$addRecipes()` |
| (new) `RecipeMapMixin.java` | Mixin injecting RecipeMap |
| (new) `ISerializer.java` | Generic serialization interface |
| (new) `NumberProviderUtil.java` | NumberProvider utility methods |
| (new) `component/` package | `BlockStatePredicate`, `ChanceBlockState`, `ChanceItemStack`, `IItemStackPredicate`, `ItemIngredientPredicate`, `ItemPredicate`, `NbtPredicate` (7 files) |
| `init/` package path | `init/recipe/` -> `init/reicpe/` (typo persisted until 1.21.11) |

**registrum module code changes:**

| File | Change |
|------|--------|
| `AbstractRegistrum.java` | Complete rewrite: License header update, `Registration` inner class reorganization, import order changes |
| (new) `GeneratorType.java` | GeneratorType marker interface |
| (new) `nullness/` package (11 files) | Embedded from `module.util`: `NonNullSupplier`, `NonNullConsumer`, etc. |
| Builder/DataGen method signatures | `setDataGenerator()`/`addDataGenerator()` use `GeneratorType<?>` instead of `ProviderType<?>` |

**wheel module code changes:**

| File | Change |
|------|--------|
| (new) `util/MathUtil.java` | Wheel math utilities |

**Bug fixes:**

- Recipe: `LibRegistries.*_REGISTRY.get()` -> `.getValue()` — Unified registry query API

---

### 1.21.3

Compilation target change: `[1.21.3,1.21.4)`, Parchment `2024.12.07`.

**No source code differences** — File manifest identical to 1.21.2. Only compilation target adaptation.

---

### 1.21.4

Compilation target change: `[1.21.4,1.21.5)`, Parchment `2025.03.23`.

**registrum module generator refactoring:**

| File | Change |
|------|--------|
| `RegistrumBlockstateProvider.java` | Removed — replaced by `generators/RegistrumBlockModelGenerator.java` |
| `RegistrumItemModelProvider.java` | Removed — replaced by `generators/RegistrumItemModelGenerator.java` |
| (new) `providers/generators/` subpackage | `RegistrumBlockModelGenerator`, `RegistrumItemModelGenerator`, `RegistrumLegacyBlockModelBuilder`, `RegistrumModelProvider` (4 files) |
| `RegistrumRecipeProvider` | Migrated from `providers/` to `providers/generators/` |
| `RegistrumRecipeRunner` | Same as above |
| `AbstractRegistrum.java` | License header reformatted, `RegistrumProvider` import removed, `@Accessors` added |

---

### 1.21.5

Compilation target change: `[1.21.5,1.21.6)`, Parchment `2025.06.15`.

| File | Module | Change |
|------|--------|--------|
| `LibItemSubPredicates.java` | recipe | Replaced by `LibDataComponentPredicates.java` — `ItemSubPredicate.Type` -> `DataComponentPredicate.Type` |
| `LibShaders.java` | wheel | Replaced by `LibRenders.java` — Class renamed |

---

### 1.21.6

Compilation target change: `[1.21.6,1.21.7)`, Parchment `2025.06.29`.

**wheel module rendering system upgrade:**

| File | Change |
|------|--------|
| (new) `render/state/` package (5 files) | `RingRenderState`, `SelectionRenderState`, `LibGuiElementRenderState`, `LibQuadGuiElementRenderState` |
| (new) `LibDynamicUniforms.java` | GPU Uniform dynamic storage (Std140) |
| (new) `mixin/GuiRendererMixin.java` | GUI rendering Mixin |
| (removed) `shaders/core/ring.json` | Replaced by Java `RingRenderState` |
| (removed) `shaders/core/selection.json` | Replaced by Java `SelectionRenderState` |

---

### 1.21.7

Compilation target change: `[1.21.7,1.21.8)`, Parchment `2025.07.18`.

| File | Module | Change |
|------|--------|--------|
| `NetworkRegistrar.java` | network | `*Bidirectional(type, codec, handler)` -> `*Bidirectional(type, codec, handler, handler)` — Added second handler parameter |

---

### 1.21.8

Compilation target change: `[1.21.8,1.21.9)`, Parchment `2025.09.14`. **No source code differences.**

---

### 1.21.9

Compilation target change: `[1.21.9,1.21.10)`, Parchment `2025.10.05`.

| File | Module | Change |
|------|--------|--------|
| `IntegrationManager.java` | integration | `LoadingModList.get()` -> `FMLLoader.getCurrent().getLoadingModList()` |
| `NetworkRegistrar.java` | network | Same as above |
| `AbstractRegistrum.java` | registrum | `!FMLLoader.isProduction()` -> `!FMLLoader.getCurrent().isProduction()` |

---

### 1.21.10

Compilation target change: `[1.21.10,1.21.11)`, Parchment `2025.10.12`.

| File | Module | Change |
|------|--------|--------|
| `IItemHandlerCache.java` | recipe | Removed — replaced by `ItemResourceHandlerCache.java` (`I` prefix removed, `Handler`->`ResourceHandler`) |
| `ItemHandlerCacheElement.java` | recipe | Replaced by `ItemResourceHandlerCacheElement.java` |
| Cache API methods | recipe | `getStackInSlot`->`extract`, `getSlotLimit`->`getCapacityAsInt`, `isItemValid`->`isValid`, `insertItem`->`insert` |

---

### 1.21.11

Compilation target change: `[1.21.11,26.1)`, Parchment `2025.12.20`.

| File | Change |
|------|--------|
| Global | `ResourceLocation` -> `Identifier` project-wide migration (adapting to NeoForge 1.21.5+ mapping change) |
| Affected files | `CodecUtil`, `StreamCodecUtil`, `InWorldRecipe`, `InWorldRecipeBuilder`, `AbstractRegistrum`, etc. |

---

### 26.1

Compilation target change: `[26.1,26.2)`, no Parchment (NeoForge 26.1 no longer uses MCP mappings).

**Module availability changes:**

| Module | Status | Notes |
|--------|--------|-------|
| **rendering** | New | Bloom post-processing, UBO framework, GUI Mixin, renderdoc-loader (19 files) |
| **multiblock** | Synced | Not synced in 1.21.2–1.21.11; restored in 26.1 (26 files) |
| **util** | Synced | Not synced in 1.21.2–1.21.11; restored in 26.1 (43 files) |
| **network** | Restored | `NetworkUtil.java` returns (12->14 files) |
| **registrum** | Reorganized | nullness package migrated out (-11 files), back to independent `util` module |

**API Redesign (Breaking Changes):**

| Change | Module | Details |
|--------|--------|---------|
| `IMoveableEntityBlock` | moveable-entity-block | `clearData`/`setData` (CompoundTag) -> `storeData`/`loadData` (ValueInput/ValueOutput) |
| `PistonBaseBlockMixin` | moveable-entity-block | `anvillib$nbt` type: `CompoundTag` -> `TagValueOutput` |
| `IntegrationType` | integration | `DATA` -> `CLIENT_DATA` + `SERVER_DATA` |
| `IntegrationInstance`/`IntegrationManager` | integration | `invokeData`/`loadData` -> `invokeClientData`+`invokeServerData` / `loadClientData`+`loadServerData` |
| `InWorldRecipe` | recipe | `icon` field: `ItemStack` -> `ItemStackTemplate`; Serializer no longer implements `RecipeSerializer`; `assemble()` removes `HolderLookup.Provider` parameter |
| `InWorldRecipeBuilder` | recipe | `icon`/`spawnItem()` use `ItemStackTemplate`; added `defaultId()` |
| `AbstractRegistrum` | registrum | nullness import paths migrated back to `dev.anvilcraft.lib.v2.util.nullness.*` |

**New Features:**

| Addition | Module |
|----------|--------|
| `AnvilLibMoveableEntityBlock` | moveable-entity-block |
| `WheelSelectionEffect` enum | wheel |
| `AnnularSectorRenderState` | wheel |
| `LibEntityTypeTags` | recipe |
| `IRecipeMapExtension` + `RecipeMapMixin` | recipe |
| Entire `rendering` module | rendering |

---

## util.nullness Import Path Changes

Due to the differing presence status of `module.util` across versions, import paths for classes like `NonNullSupplier` vary:

| Version Range     | Import Path                                                             |
|-------------------|-------------------------------------------------------------------------|
| 1.21.1            | `import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;`           |
| 1.21.2–1.21.11    | `import dev.anvilcraft.lib.v2.registrum.util.nullness.NonNullSupplier;` |
| 26.1              | `import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;` (restored) |

Affected classes (9 total): `NonNullSupplier`, `NonNullConsumer`, `NonNullBiConsumer`, `NonNullFunction`, `NonNullBiFunction`, `NonNullUnaryOperator`, `NonnullType`, `NullableType`, `NullableSupplier`.

> 1.21.2+ additionally includes the `FieldsAreNonnullByDefault` annotation.

---

## API Stability Ratings

Based on the frequency and impact of changes across versions:

| API | Rating | Notes |
|-----|--------|-------|
| `CodecUtil` / `StreamCodecUtil` | <Badge type="tip" text="stable" /> | Only underwent ResourceLocation->Identifier migration in 1.21.11 |
| `ConfigManager` / `@Config` annotations | <Badge type="tip" text="stable" /> | No API changes |
| `IPacket` interface hierarchy | <Badge type="tip" text="stable" /> | No API changes |
| Registrum Builder (Block/Item/Entity, etc.) | <Badge type="tip" text="stable" /> | No API changes |
| `MultiblockDefinition` / `DynamicMultiblockManager` | <Badge type="tip" text="stable" /> | API consistent, differs only in available versions (1.21.1, 26.1) |
| `NetworkRegistrar` | <Badge type="warning" text="volatile" /> | 1.21.7 (bidirectional), 1.21.9 (FMLLoader) |
| `InWorldRecipe` | <Badge type="warning" text="volatile" /> | Changes in 1.21.2, 1.21.11, and 26.1 |
| `InWorldRecipeBuilder` | <Badge type="warning" text="volatile" /> | Same as above |
| `AbstractRegistrum` | <Badge type="warning" text="volatile" /> | Internal changes in nearly every version transition |
| `WheelMenuBuilder` | <Badge type="warning" text="volatile" /> | Changes in 1.21.5, 1.21.6, and 26.1 |
| `IMoveableEntityBlock` | <Badge type="danger" text="26.1 redesigned" /> | Complete redesign in 26.1 |
| `IntegrationType` | <Badge type="danger" text="26.1 split" /> | DATA -> CLIENT_DATA + SERVER_DATA |
| util utility classes (Lazy/MathUtil/ShapeUtil, etc.) | <Badge type="info" text="limited availability" /> | Independent `module.util` only in 1.21.1 and 26.1 |
| nullness functional interfaces | <Badge type="warning" text="import path changes" /> | 3 distinct import paths |
| rendering module all APIs | <Badge type="tip" text="26.1+" /> | Only exists in 26.1 |

---

## Dependency Coordinates

All versions share the Groovy DSL pattern:

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-<module>-neoforge-<mc_version>:2.0.0"
}
```

Example: `dev.anvilcraft.lib:anvillib-registrum-neoforge-1.21.1:2.0.0` (the `<mc_version>` suffix matches the version number for each version)

| Artifact Module | 1.21.1 | 1.21.2–1.21.11 | 26.1 |
|-----------------|--------|----------------|------|
| `anvillib-neoforge-<ver>` | x | x | x |
| `anvillib-codec-neoforge-<ver>` | x | x | x |
| `anvillib-config-neoforge-<ver>` | x | x | x |
| `anvillib-integration-neoforge-<ver>` | x | x | x |
| `anvillib-moveable-entity-block-neoforge-<ver>` | x | x | x |
| `anvillib-network-neoforge-<ver>` | x | x | x |
| `anvillib-recipe-neoforge-<ver>` | x | x | x |
| `anvillib-registrum-neoforge-<ver>` | x | x | x |
| `anvillib-wheel-neoforge-<ver>` | x | x | x |
| `anvillib-test-neoforge-<ver>` | x | x | x |
| `anvillib-multiblock-neoforge-<ver>` | x | -- | x |
| `anvillib-util-neoforge-<ver>` | x | -- | x |
| `anvillib-rendering-neoforge-<ver>` | -- | -- | x |
