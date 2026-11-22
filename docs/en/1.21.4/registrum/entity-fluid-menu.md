# Entity, Fluid, Menu, MobEffect, Potion & Sound Builders

Beyond blocks and items, `module.registrum` provides fluent out-of-the-box builders for **Entities (`EntityBuilder`)**, **Fluids (`FluidBuilder`)**, **Container Menus (`MenuBuilder`)**, and **single-registry helper types (`MobEffect`, `Potion`, `SoundEvent`, `GameEvent`, `Condition`)**.

## Entities: `EntityBuilder<T extends Entity, P>`

### Entry Points

- `AbstractRegistrum#entity(String name, EntityType.EntityFactory<T> factory, MobCategory classification)` (plus overloads omitting `name` or passing a custom `parent`)

### Common API Quick Reference

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `properties(NonNullConsumer<EntityType.Builder<T>> cons)` | `EntityBuilder<T, P>` | Configures `EntityType.Builder` properties such as `sized(w, h)`, tracking range, update interval, etc. |
| `renderer(NonNullSupplier<NonNullFunction<EntityRendererProvider.Context, EntityRenderer<? super T, ?>>> renderer)` | `EntityBuilder<T, P>` | Registers a client entity renderer (1.21.4's `EntityRenderer<T, S>` takes dual generics supporting any `EntityRenderState`); evaluated only when `FMLEnvironment.dist.isClient()` and registered via `EntityRenderersEvent.RegisterRenderers` |
| `attributes(Supplier<AttributeSupplier.Builder> attributes)` | `EntityBuilder<T, P>` | Binds base attributes for `LivingEntity` (hooks `EntityAttributeCreationEvent`; may only be called once) |
| `spawnPlacement(SpawnPlacementType type, Heightmap.Types heightmap, SpawnPlacements.SpawnPredicate<T> predicate)` | `EntityBuilder<T, P>` | Registers natural spawn placement with `RegisterSpawnPlacementsEvent.Operation.OR` (may only be called once) |
| `spawnPlacement(SpawnPlacementType type, Heightmap.Types heightmap, SpawnPlacements.SpawnPredicate<T> predicate, RegisterSpawnPlacementsEvent.Operation operation)` | `EntityBuilder<T, P>` | Registers natural spawn placement with a custom `Operation` |
| `defaultLang()` / `lang(String name)` | `EntityBuilder<T, P>` | Auto-generates or explicitly sets the entity's `en_us` name |
| `loot(NonNullBiConsumer<RegistrumEntityLootTables, EntityType<T>> cons)` | `EntityBuilder<T, P>` | Configures the entity's loot table |
| `tag(TagKey<EntityType<?>>... tags)` | `EntityBuilder<T, P>` | Adds the entity to `ProviderType.ENTITY_TAGS` |
| `register()` | `EntityEntry<T>` | Builds `EntityType<T>` and queues registration |

> [!NOTE]
> On the current 1.21.4 branch, `EntityBuilder#spawnEgg(...)` and `#defaultSpawnEgg(...)` are disabled (not yet migrated). To add a spawn egg for a custom mob, register it separately via `REGISTRUM.item(name + "_spawn_egg", p -> new SpawnEggItem(...))`.

```java
public static final EntityEntry<CopperGolemEntity> COPPER_GOLEM = MyMod.REGISTRUM
    .<CopperGolemEntity>entity("copper_golem", CopperGolemEntity::new, MobCategory.MISC)
    .properties(b -> b.sized(0.7F, 1.2F).clientTrackingRange(8))
    .attributes(CopperGolemEntity::createAttributes)
    .renderer(() -> CopperGolemRenderer::new)
    .lang("Copper Golem")
    .loot((tables, type) -> tables.add(type, LootTable.lootTable()))
    .register();
```

## Fluids: `FluidBuilder<T extends BaseFlowingFluid, P>`

Like blocks/items, a single fluid in Minecraft + NeoForge requires **4 linked objects**: flowing fluid (`flowing_*`), source fluid (`<name>`), `FluidType`, `LiquidBlock`, and `BucketItem`. `FluidBuilder` unifies them all in one chain and automatically creates the source, liquid block, and bucket by default.

In 1.21.4, `FluidTypeFactory` is simplified to `FluidType create(FluidType.Properties properties)`, and texture locations are registered separately via `clientExtension(...)` on `RegisterClientExtensionsEvent`.

### Entry Points & Texture Convenience Factories

- `AbstractRegistrum#fluid()` / `fluid(String name)`: creates a standard `BaseFlowingFluid.Flowing` and default `FluidType`;
- `AbstractRegistrum#fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture)` (and full overloads with `FluidTypeFactory` / `FluidType` / `FluidFactory`): auto-attaches `.clientExtension(stillTexture, flowingTexture)`;
- `AbstractRegistrum#fluid(String name, FluidBuilder.FluidTypeFactory typeFactory)` / `fluid(String name, NonNullSupplier<FluidType> fluidType)`: uses a custom or shared `FluidType`.

Two core functional interfaces:

```java
@FunctionalInterface
public interface FluidTypeFactory {
    FluidType create(FluidType.Properties properties);
}

@FunctionalInterface
public interface FluidFactory<T> {
    T create(BaseFlowingFluid.Properties properties);
}
```

### `FluidBuilder` Full API Reference

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `clientExtension(NonNullSupplier<Supplier<IClientFluidTypeExtensions>> clientExtension)` | `FluidBuilder<T, P>` | Registers `IClientFluidTypeExtensions` for the `FluidType` during `RegisterClientExtensionsEvent` (tinting, overlay textures, fog, etc.) |
| `clientExtension(ResourceLocation stillTexture, ResourceLocation flowingTexture)` | `FluidBuilder<T, P>` | Quickly registers still and flowing textures using built-in `DefaultFluidTypeExtension(stillTexture, flowingTexture)` |
| `properties(NonNullConsumer<FluidType.Properties> cons)` | `FluidBuilder<T, P>` | Configures `FluidType.Properties` (density, viscosity, temperature, `lightLevel`, sounds, path type) |
| `fluidProperties(NonNullConsumer<BaseFlowingFluid.Properties> cons)` | `FluidBuilder<T, P>` | Configures `BaseFlowingFluid.Properties` (`slopeFindDistance`, `levelDecreasePerBlock`, `tickRate`) |
| `renderType(Supplier<Supplier<RenderType>> layer)` | `FluidBuilder<T, P>` | Sets the translucent render layer (e.g., `RenderType::translucent`) for both flowing and source fluids during `FMLClientSetupEvent` |
| `defaultLang()` / `lang(String name)` | `FluidBuilder<T, P>` | Writes localization using `fluidType.getDescriptionId()` (note that fluid translation is configured separately from the bucket) |
| `defaultSource()` / `source(NonNullFunction<BaseFlowingFluid.Properties, ? extends BaseFlowingFluid> factory)` | `FluidBuilder<T, P>` | Enables default source fluid or replaces with a custom source subclass factory |
| `noSource()` | `FluidBuilder<T, P>` | Disables automatic source fluid creation (rarely used) |
| `defaultBlock()` / `block()` / `block(NonNullBiFunction<T, BlockBehaviour.Properties, ? extends B> factory)` | `BlockBuilder` / `FluidBuilder` | Configures the fluid's `LiquidBlock`; by default generates a placeholder `createNonTemplateModelBlock` |
| `noBlock()` | `FluidBuilder<T, P>` | Disables automatic liquid block creation (e.g., gases or virtual fluids that only exist in pipes/tanks) |
| `defaultBucket()` / `bucket()` / `bucket(NonNullBiFunction<BaseFlowingFluid, Item.Properties, ? extends I> factory)` | `ItemBuilder` / `FluidBuilder` | Configures the bucket item; by default generates a flat item model via `generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM)` |
| `noBucket()` | `FluidBuilder<T, P>` | Disables automatic bucket item creation |
| `tag(TagKey<Fluid>... tags)` / `removeTag(TagKey<Fluid>... tags)` | `FluidBuilder<T, P>` | Batch-adds or removes fluid tags on both flowing and source fluids |
| `register()` | `FluidEntry<T>` | Registers flowing fluid, source fluid, and `FluidType` |

> [!TIP]
> If you manually customize the derived block or bucket via `.block().build()` or `.bucket().build()` (e.g., renaming to `"Molten Brass Bucket"` or adding custom stack logic), do not also call `.defaultBlock()` / `.defaultBucket()` on the same chain—they are mutually exclusive.

### Complete Fluid Declaration Example

```java
public static final FluidEntry<BaseFlowingFluid.Flowing> LIQUID_RESIN = MyMod.REGISTRUM
    .fluid(
        "liquid_resin",
        ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "block/resin_still"),
        ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "block/resin_flow")
    )
    .properties(p -> p.density(1400).viscosity(2500).temperature(350).lightLevel(3))
    .fluidProperties(p -> p.levelDecreasePerBlock(2).tickRate(15).slopeFindDistance(3))
    .renderType(() -> RenderType::translucent)
    .lang("Liquid Resin")
    .bucket()
    .lang("Liquid Resin Bucket")
    .build()
    .register();
```

## Container Menus & Screens: `MenuBuilder<T, S, P>`

`MenuBuilder` registers server/common `MenuType<T>` via `IMenuTypeExtension.create(...)` and binds the matching `Screen & MenuAccess<T>` on the client in `RegisterMenuScreensEvent`.

### Three Factory Functional Interfaces

- `MenuBuilder.MenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv)` (no extra sync buffer)
- `MenuBuilder.ForgeMenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer)` (with custom coords/context sync on open)
- `MenuBuilder.ScreenFactory<M, T>`: `T create(M menu, Inventory inv, Component displayName)`

### `AbstractRegistrum` Entry & Opening Menus

```java
// 1. Register a container and screen supporting BlockPos payload
public static final MenuEntry<MachineMenu> MACHINE_MENU = MyMod.REGISTRUM
    .menu(
        "machine_menu",
        (type, windowId, inv, buf) -> new MachineMenu(type, windowId, inv, buf != null ? buf.readBlockPos() : BlockPos.ZERO),
        () -> MachineScreen::new
    )
    .register();

// 2. Open the screen in one call on the server (e.g., in Block#useWithoutItem) via MenuEntry
if (player instanceof ServerPlayer serverPlayer) {
    MACHINE_MENU.open(
        serverPlayer,
        Component.translatable("container.mymod.machine"),
        (windowId, playerInv, p) -> new MachineMenu(MACHINE_MENU.get(), windowId, playerInv, pos),
        buf -> buf.writeBlockPos(pos)
    );
}
```

## MobEffect, Potion, SoundEvent, GameEvent & Condition Builders

For flatter single-object registry types, AnvilLib provides specialized builders extending `AbstractBuilder` or `SelfBuilder`, keeping full `lang`, `tag`, and `onRegister` support with minimal boilerplate.

| Module / Builder | `AbstractRegistrum` Entry | Return Entry | Specific / Key Config |
| --- | --- | --- | --- |
| `MobEffectBuilder<T, P>` | `mobEffect(String name, NonNullSupplier<T> sup)` | `MobEffectEntry<T>` | Registers to `Registries.MOB_EFFECT`, supporting standard `.lang(...)` and custom tags |
| `PotionBuilder<P>` | `potion(String name, MobEffectInstance... effects)` | `PotionEntry` | Extends `SelfBuilder<Potion>`, constructing `new Potion(effects)` with varargs |
| `SoundEventBuilder<P>` | `soundEvent(String name)` / `soundEvent(String name, float fixedRange)` | `SoundEventEntry` | Extends `SelfBuilder<SoundEvent>`, supporting variable range (`createVariableRangeEvent`) and fixed range (`createFixedRangeEvent`) |
| `GameEventBuilder<P>` | `gameEvent(String name, int radius)` | `GameEventEntry` | Registers sculk vibration `GameEvent` with configurable notification radius (commonly 16) |
| `ConditionBuilder<T, P>` | `condition(String name, MapCodec<T> mapCodec)` | `ConditionEntry<T>` | Registers NeoForge `NeoForgeRegistries.CONDITION_SERIALIZERS` (for recipe/datapack conditions) |
| `RecipeTypeBuilder<T, P>` + `RecipeSerializerBuilder<T, P>` | `recipe(String name, MapCodec<T> codec, StreamCodec<RegistryFriendlyByteBuf, T> streamCodec)` | `RecipeEntry<T>` | Registers `RecipeType<T>` and `RecipeSerializer<T>` together, accessible via `RecipeEntry#type()` / `#serializer()` |
| `NoConfigBuilder<R, T, P>` | `generic(...)` / `simple(...)` | `RegistryEntry<R, T>` | Quickly registers objects for any registry without complex builder callbacks |

```java
public static final PotionEntry HASTE_ELIXIR = MyMod.REGISTRUM
    .potion("haste_elixir", new MobEffectInstance(MobEffects.DIG_SPEED, 3600, 1))
    .register();

public static final SoundEventEntry MACHINE_HUM = MyMod.REGISTRUM
    .soundEvent("machine_hum", 16.0F)
    .register();
```
