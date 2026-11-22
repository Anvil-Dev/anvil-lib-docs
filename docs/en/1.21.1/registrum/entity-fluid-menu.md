# Entity, Fluid & Menu Builders (`EntityBuilder`, `FluidBuilder`, `MenuBuilder`)

This section covers the three major composite objects beyond regular blocks and items: entities (`EntityType`) with renderers, attributes, and spawn placements; fluids (`Fluid`) with still/flowing forms, `FluidType`, liquid block, and bucket item; and `MenuType`s registering both server container menus and client GUI screens.

## Entity Builder (`EntityBuilder`)

Obtain `EntityBuilder<T, P>` via `REGISTRUM.entity(name, factory, classification)` (or `.object(name).entity(factory, classification)`). `defaultLang()` is enabled by default (using `EntityType::getDescriptionId`).

### Core Methods Overview

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `properties(NonNullConsumer<EntityType.Builder<T>> cons)` | `EntityBuilder<T, P>` | Modifies vanilla `EntityType.Builder<T>` (`.sized(0.8f, 1.8f)`, `.clientTrackingRange(8)`, `.fireImmune()`, etc.); stackable |
| `renderer(NonNullSupplier<NonNullFunction<EntityRendererProvider.Context, EntityRenderer<? super T>>> renderer)` | `EntityBuilder<T, P>` | Registers client entity renderer; checks `FMLEnvironment.dist.isClient()` and hooks `EntityRenderersEvent.RegisterRenderers` |
| `attributes(Supplier<AttributeSupplier.Builder> attributes)` | `EntityBuilder<T, P>` | Registers mob attributes via `EntityAttributeCreationEvent` (entity must extend `LivingEntity`). Calling twice throws `IllegalStateException` |
| `spawnPlacement(SpawnPlacementType type, Heightmap.Types heightmap, SpawnPredicate<T> predicate, RegisterSpawnPlacementsEvent.Operation operation)` | `EntityBuilder<T, P>` | Registers natural spawn placement (`SpawnPlacementTypes.ON_GROUND`, `Heightmap.Types.MOTION_BLOCKING_NO_LEAVES`, `RegisterSpawnPlacementsEvent.Operation.REPLACE`). Calling twice throws `IllegalStateException` |
| `spawnEgg(int primaryColor, int secondaryColor)` | `ItemBuilder<? extends SpawnEggItem, EntityBuilder<T, P>>` | Registers `<name>_spawn_egg` as `DeferredSpawnEggItem`, adding to `CreativeModeTabs.SPAWN_EGGS` with `item/template_spawn_egg` (`@Deprecated` per upstream notes) |
| `defaultSpawnEgg(int primaryColor, int secondaryColor)` | `EntityBuilder<T, P>` | Registers the spawn egg with defaults and returns to `EntityBuilder` (also `@Deprecated`) |
| `defaultLang()` / `lang(String name)` | `EntityBuilder<T, P>` | Configures or overrides the entity's localized name |
| `loot(NonNullBiConsumer<RegistrumEntityLootTables, EntityType<T>> cons)` | `EntityBuilder<T, P>` | Configures entity loot table datagen |
| `tag(TagKey<EntityType<?>>... tags)` | `EntityBuilder<T, P>` | Adds `EntityType` tags (delegates to `ProviderType.ENTITY_TAGS`) |
| `aliasFrom(ResourceLocation... oldNames)` | `EntityBuilder<T, P>` | Sets rename aliases; if `.spawnEgg(...)` / `.defaultSpawnEgg(...)` was called, also registers `<oldName>_spawn_egg` -> `<newName>_spawn_egg` in the item registry |
| `register()` | `EntityEntry<T>` | Finalizes declaration and returns `EntityEntry<T>` |

### `EntityEntry<T>` Wrapper API

- `create(Level world)` -> `@Nullable T`: calls `get().create(world)` to instantiate an entity in the world.
- `is(Entity t)` -> `boolean`: safely checks non-null and matching entity type.
- `EntityEntry.cast(RegistryEntry<EntityType<?>, EntityType<T>> entry)`: static cast helper.

## Fluid Builder (`FluidBuilder`)

A complete Minecraft/NeoForge fluid involves at least 4 linked registry entries: **flowing fluid (`flowing_<name>`)**, **source fluid (`<name>`)**, **`FluidType` (`<name>`)**, plus optional **`LiquidBlock` (`<name>`)** and **`BucketItem` (`<name>_bucket`)**.

`FluidBuilder<T extends BaseFlowingFluid, P>` unifies all of these in one fluent chain. Note that **`FluidBuilder`'s own underlying entry is the "flowing fluid `flowing_<name>`"**, while source fluid, fluid type, block, and bucket are generated around base name `sourceName = name`.

### Creation Entry Points (`AbstractRegistrum.fluid` / `FluidBuilder.create`)

`AbstractRegistrum` provides two groups of 6 overloads covering default or custom fluid classes / existing `FluidType`s:

1. Using default `FluidType` and `BaseFlowingFluid.Flowing`:
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture)`
   - Plus the no-name overload `fluid(ResourceLocation stillTexture, ResourceLocation flowingTexture)` after `.object(name)`
2. Custom `FluidTypeFactory` (`FluidType.Properties, ResourceLocation still, ResourceLocation flowing -> FluidType`):
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, FluidTypeFactory typeFactory)`
3. Reusing an existing or external `NonNullSupplier<FluidType>`:
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, NonNullSupplier<FluidType> fluidType)`
4. Custom flowing fluid subclass (`NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory`):
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory)`
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, FluidTypeFactory typeFactory, NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory)`
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, NonNullSupplier<FluidType> fluidType, NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory)`

Building via `FluidBuilder.create(...)` enables `defaultLang()`, `defaultSource()`, `defaultBlock()`, and `defaultBucket()` by default.

### Core Methods & State Constraints

- `properties(NonNullConsumer<FluidType.Properties> cons)`: modifies `FluidType.Properties` (density, viscosity, temperature, `lightLevel`, canSwim, etc.).
  - Note: if a same-named block already has a custom translation in the same namespace, Registrum syncs `FluidType`'s `descriptionId` to the block's key and skips duplicate `LANG` generation; otherwise it uses `fluid.<modid>.<name>`.
- `fluidProperties(NonNullConsumer<BaseFlowingFluid.Properties> cons)`: modifies `BaseFlowingFluid.Properties` (`slopeFindDistance`, `levelDecreasePerBlock`, `explosionResistance`, `tickRate`). `.bucket(...)` and `.block(...)` lookups are pre-wired automatically.
- `renderType(Supplier<Supplier<RenderType>> layer)`: client-safely sets the translucent/cutout render layer (e.g., `RenderType::translucent`) for both flowing and source fluids.
- `defaultSource()` / `source(NonNullFunction<BaseFlowingFluid.Properties, ? extends BaseFlowingFluid> factory)`: selects default `BaseFlowingFluid.Source` or a custom source class. **Ordering matters**: if customizing `bucket(...)` with a custom source factory, call `source(...)` first or keep defaults; calling `.source(...)` followed by `.defaultSource()` throws `IllegalStateException`.
- `defaultBlock()` / `block()` / `block(NonNullBiFunction<T, BlockBehaviour.Properties, ? extends B> factory)` / `noBlock()`: configures the liquid block. `.block(...)` returns `BlockBuilder`, inheriting `FluidType.getLightLevel()` and a particle-textured block model. Calling `noBlock()` skips block creation (mutually exclusive with `block()`, else throws `IllegalStateException`).
- `defaultBucket()` / `bucket()` / `bucket(NonNullBiFunction<BaseFlowingFluid, Item.Properties, ? extends I> factory)` / `noBucket()`: configures the bucket item (stack size `1`, crafts back `Items.BUCKET`, generates `item/<name>_bucket` model). Note: `this.source` must be initialized before `.bucket(...)` (call `.source(BaseFlowingFluid.Source::new)` first or keep `defaultSource()`, else throws `IllegalStateException("Cannot create a bucket before creating a source block")`).
- `tag(TagKey<Fluid>... tags)` / `removeTag(TagKey<Fluid>... tags)`: writes or removes fluid tags on **both** flowing and source fluids, so calling `FluidTags.WATER` once tags both!
- `aliasFrom(ResourceLocation... oldNames)`: given legacy base name `oldName`, automatically registers NeoForge aliases for `flowing_<oldName>`, `<oldName>` (source), `<oldName>` (FluidType if owned), `<oldName>` (LiquidBlock if created), and `<oldName>_bucket` (if created).

### `FluidEntry<T>` Wrapper API

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getSource()` | `S extends BaseFlowingFluid` | Returns the corresponding source fluid instance |
| `getType()` | `FluidType` | Returns the bound NeoForge `FluidType` |
| `getBlock()` | `Optional<B extends Block>` | Returns the `LiquidBlock` if created |
| `getBucket()` | `Optional<I extends Item>` | Returns the bucket item if non-empty |
| `is(R entry)` | `boolean` | Overridden to match both flowing and source fluids via `get().isSame((Fluid) entry)` |

## Menu Builder (`MenuBuilder`)

`MenuBuilder<T extends AbstractContainerMenu, S extends Screen & MenuAccess<T>, P>` unifies server `MenuType` registration and client `RegisterMenuScreensEvent` screen binding, natively integrating NeoForge's `IMenuTypeExtension` to sync extra initialization data (`RegistryFriendlyByteBuf`) from server to client.

Created via `REGISTRUM.menu(name, factory, screenFactory)` with two menu factory interfaces:

- `MenuBuilder.MenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv)` (no extra network packet; for pure inventory menus).
- `MenuBuilder.ForgeMenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer)` (with extra sync buffer; note `buffer` may be `null` if invoked directly via `MenuEntry.create(id, inv)` without a packet).
- `MenuBuilder.ScreenFactory<M, T>`: `T create(M menu, Inventory inv, Component displayName)` (usually `MyScreen::new`). Provide lazily via `() -> MyScreen::new` so servers never load vanilla client `Screen` classes.

### `MenuEntry<T>` Wrapper API

`MenuBuilder.register()` returns `MenuEntry<T>`:

- `create(int windowId, Inventory playerInv)` -> `T`
- `asProvider()` -> `MenuConstructor`
- `open(ServerPlayer player, Component displayName)`
- `open(ServerPlayer player, Component displayName, Consumer<RegistryFriendlyByteBuf> extraData)`
- `open(ServerPlayer player, Component displayName, MenuConstructor provider)`
- `open(ServerPlayer player, Component displayName, MenuConstructor provider, Consumer<RegistryFriendlyByteBuf> extraData)`

## Complete Practical Example: Entity, Fluid & Custom Container Menu

```java
package com.example.examplemod.registry;

import com.example.examplemod.ExampleMod;
import com.example.examplemod.client.render.SparkProjectileRenderer;
import com.example.examplemod.client.screen.CrusherScreen;
import com.example.examplemod.entity.SparkProjectile;
import com.example.examplemod.menu.CrusherMenu;
import dev.anvilcraft.lib.v2.registrum.util.entry.EntityEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.FluidEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.MenuEntry;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.MobCategory;
import net.neoforged.neoforge.fluids.BaseFlowingFluid;

public class ModWorldAndMenus {
    // 1. Projectile entity registration (with client renderer)
    public static final EntityEntry<SparkProjectile> SPARK = ExampleMod.REGISTRUM
        .entity("spark_projectile", SparkProjectile::new, MobCategory.MISC)
        .properties(b -> b.sized(0.4f, 0.4f).clientTrackingRange(4).updateInterval(10))
        .renderer(() -> SparkProjectileRenderer::new)
        .lang("Spark Projectile")
        .register();

    // 2. Molten metal fluid (flowing + source + FluidType + block + bucket)
    public static final FluidEntry<BaseFlowingFluid.Flowing> MOLTEN_IRON = ExampleMod.REGISTRUM
        .fluid(
            "molten_iron",
            ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "block/molten_iron_still"),
            ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "block/molten_iron_flow")
        )
        .lang("Molten Iron")
        .properties(p -> p.temperature(1800).lightLevel(12).density(4000).viscosity(6000))
        .fluidProperties(p -> p.tickRate(30).levelDecreasePerBlock(2).explosionResistance(100.0f))
        .renderType(() -> RenderType::solid)
        .tag(FluidTags.LAVA)
        .source(BaseFlowingFluid.Source::new) // Declare source before chaining custom bucket()
        .bucket()
            .tab(ModCreativeTabs.MAIN_TAB.getKey())
            .lang("Bucket of Molten Iron")
            .build()
        .block()
            .build()
        .register();

    // 3. Machine menu & GUI screen binding with extra BlockPos network sync
    public static final MenuEntry<CrusherMenu> CRUSHER_MENU = ExampleMod.REGISTRUM
        .menu(
            "crusher",
            CrusherMenu::fromNetwork,
            () -> CrusherScreen::new
        )
        .register();

    public static void register() {}
}
```
