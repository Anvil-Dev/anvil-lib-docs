---
title: Registrum Core API Reference
prev: false
next: false
---

# Registrum Core API Reference <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="26.1" />

`AbstractRegistrum<S>` is the registration engine base class. It manages all registrations,
data generators, language entries, creative mode tabs, and event listeners for a single mod.
The generic parameter `S` is the self-type (e.g., `Registrum` extends `AbstractRegistrum<Registrum>`).

This document covers every public method, organized by functional group.

::: tip Stateful naming
`object("name")` sets a **persistent** name that all subsequent builder methods inherit until the
next `object()` call. Alternatively, methods accepting an explicit `String name` parameter bypass
the current-name state entirely.
:::

---

## Static & Initialization

### `isDevEnvironment()`

```java
public static boolean isDevEnvironment()
```

Returns `true` when running outside a production environment (`FMLLoader#isProduction() == false`).
Controls debug logging verbosity and error-skipping eligibility.

```java
if (AbstractRegistrum.isDevEnvironment()) {
    LOGGER.info("Running in development mode");
}
```

### `registerEventListeners(IEventBus)`

```java
public S registerEventListeners(IEventBus bus)
```

Called during construction to register all event listeners on the mod event bus.
Subscribes to `RegisterEvent` (normal + `LOWEST`), `BuildCreativeModeTabContentsEvent`,
`FMLCommonSetupEvent` (cleanup), and `GatherDataEvent.Client` (datagen only).

- Sets `modEventBus` if not already set
- Uses `OneTimeEventReceiver` for self-cleaning listeners
- Override to add custom listeners; **always call `super`**

```java
// Typically called automatically by Registrum.create()
Registrum reg = new Registrum("mymod");
reg.registerEventListeners(modEventBus);
```

### `object(String)`

```java
public S object(String name)
```

Sets the current entry name. All subsequent builder invocations that omit an explicit `name`
parameter will use this value. Calling it again overwrites the previous name.

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)       // uses "my_block"
    .register()
    .object("another_block")   // switches name
    .block(AnotherBlock::new); // uses "another_block"
```

### `skipErrors(boolean)`

```java
public S skipErrors(boolean skipErrors)
```

Development-only switch. When `true`, exceptions during registration and data generation are
logged instead of thrown, allowing continued debugging.

::: warning
`skipErrors(true)` is silently ignored outside a development environment.
:::

```java
REGISTRUM.skipErrors(true).object("experimental")
    .block(ExperimentalBlock::new).register();
```

---

## Entry Retrieval

Methods for obtaining references to previously registered entries.

| Method                             | Signature                                                                                              | Description                                           |
|------------------------------------|--------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| `get(ResourceKey)`                 | `<R,T> RegistryEntry<R,T> get(ResourceKey<? extends Registry<R>> type)`                                | Get entry by current name (requires prior `object()`) |
| `get(String, ResourceKey)`         | `<R,T> RegistryEntry<R,T> get(String name, ResourceKey<? extends Registry<R>> type)`                   | Get entry by explicit name                            |
| `getOptional(String, ResourceKey)` | `<R,T> Optional<RegistryEntry<R,T>> getOptional(String name, ResourceKey<? extends Registry<R>> type)` | Get entry that may not exist                          |
| `getAll(ResourceKey)`              | `<R,T> Collection<RegistryEntry<R,T>> getAll(ResourceKey<? extends Registry<R>> type)`                 | Get all known entries for a registry                  |

**Parameters:**

| Parameter | Type                                 | Description                                      |
|-----------|--------------------------------------|--------------------------------------------------|
| `name`    | `String`                             | The entry name (within the mod's namespace)      |
| `type`    | `ResourceKey<? extends Registry<R>>` | The registry to query (e.g., `Registries.BLOCK`) |

**Return types:**

| Method           | Return                            | Throws                                               |
|------------------|-----------------------------------|------------------------------------------------------|
| `get` (current)  | `RegistryEntry<R, T>`             | `NullPointerException` if `currentName` is not set   |
| `get` (explicit) | `RegistryEntry<R, T>`             | `IllegalArgumentException` if registration not found |
| `getOptional`    | `Optional<RegistryEntry<R, T>>`   | Nothing (returns `Optional.empty()` if not found)    |
| `getAll`         | `Collection<RegistryEntry<R, T>>` | Nothing                                              |

```java
// Retrieve by current name
RegistryEntry<Block, MyBlock> myBlock = REGISTRUM
    .object("my_block")
    .get(Registries.BLOCK);

// Retrieve by explicit name (no object() needed)
RegistryEntry<Item, BlockItem> item = REGISTRUM
    .get("my_block", Registries.ITEM);

// Safe optional retrieval
Optional<RegistryEntry<Block, MyBlock>> opt = REGISTRUM
    .getOptional("missing_block", Registries.BLOCK);

// Get all registered items
Collection<RegistryEntry<Item, Item>> allItems = REGISTRUM
    .getAll(Registries.ITEM);
```

::: tip Runtime availability
Entries returned by `get()` / `getOptional()` / `getAll()` are empty before `RegisterEvent`
fires. The `RegistryEntry` holder is valid immediately but the wrapped value will be `null`
until registration completes.
:::

---

## Registration Callbacks

Callbacks invoked during and after the registration phase.

### `addRegisterCallback(name, registryType, callback)`

```java
public <R, T extends R> S addRegisterCallback(
    String name,
    ResourceKey<? extends Registry<R>> registryType,
    NonNullConsumer<? super T> callback
)
```

Adds a callback invoked **immediately after** the named entry is registered. The callback receives
the created entry object. If the entry is already registered, the callback fires immediately.

| Parameter      | Type                                 | Description                              |
|----------------|--------------------------------------|------------------------------------------|
| `name`         | `String`                             | The entry name                           |
| `registryType` | `ResourceKey<? extends Registry<R>>` | The registry containing the entry        |
| `callback`     | `NonNullConsumer<? super T>`         | Callback receiving the registered object |

```java
REGISTRUM.addRegisterCallback("my_crop", Registries.BLOCK, block -> {
    ComposterBlock.COMPOSTABLES.put(block.asItem(), 0.65f);
});
```

### `addRegisterCallback(registryType, callback)`

```java
public <R> S addRegisterCallback(
    ResourceKey<? extends Registry<R>> registryType,
    Runnable callback
)
```

Adds a callback invoked after the **entire registry type** has finished registration (during
`RegisterEvent` at `LOWEST` priority). This fires after all mods have finished registering that type.

| Parameter      | Type                                 | Description           |
|----------------|--------------------------------------|-----------------------|
| `registryType` | `ResourceKey<? extends Registry<R>>` | The registry to watch |
| `callback`     | `Runnable`                           | Callback to invoke    |

```java
REGISTRUM.addRegisterCallback(Registries.BLOCK, () -> {
    LOGGER.info("All blocks have been registered!");
});
```

### `isRegistered(ResourceKey)`

```java
public <R> boolean isRegistered(
    ResourceKey<? extends Registry<R>> registryType
)
```

Checks whether a registry type has completed registration.

```java
if (REGISTRUM.isRegistered(Registries.BLOCK)) {
    // safe to iterate all blocks
}
```

---

## Data Generation

Data generator management, active only during `GatherDataEvent`.

### `getDataProvider(GeneratorType)`

```java
public <P> Optional<P> getDataProvider(GeneratorType<P> type)
```

Gets the data provider instance for a given generator type. Only valid during the datagen phase.

| Parameter | Type               | Description                    |
|-----------|--------------------|--------------------------------|
| `type`    | `GeneratorType<P>` | The generator type to retrieve |

- Returns: `Optional<P>` -- the provider, or empty if not registered for this datagen run
- Throws: `IllegalStateException` if called before datagen starts

```java
// Inside a data generator callback
Optional<RegistrumBlockModelGenerator> modelGen = REGISTRUM
    .getDataProvider(ProviderType.BLOCK_MODEL);
```

### `setDataGenerator(Builder, GeneratorType, NonNullConsumer)`

```java
public <P, R> S setDataGenerator(
    Builder<R, ?, ?, ?> builder,
    GeneratorType<? extends P> type,
    NonNullConsumer<? extends P> cons
)
```

Associates a data generator callback with a specific builder entry. **Replaces** any existing
callback for the same entry/type combination.

```java
// Typically called within a builder chain via .setData()
builder.setData(ProviderType.LOOT, (ctx, prov) -> {
    prov.addBlockLoot(ctx.getName());
});
```

### `setDataGenerator(String, ResourceKey, GeneratorType, NonNullConsumer)`

```java
public <P, R> S setDataGenerator(
    String entry,
    ResourceKey<? extends Registry<R>> registryType,
    GeneratorType<? extends P> type,
    NonNullConsumer<? extends P> cons
)
```

Same as above but identifies the entry by name and registry type rather than by builder instance.
This is the internal implementation that the builder variant delegates to.

### `addDataGenerator(GeneratorType, NonNullConsumer)`

```java
public <T> S addDataGenerator(
    GeneratorType<? extends T> type,
    NonNullConsumer<? extends T> cons
)
```

Adds a data generator callback **not associated** with any specific entry. Use for miscellaneous
data generation (global configuration, custom JSON files, etc.). Unlike `setDataGenerator`, this
**appends** to existing callbacks.

| Parameter | Type                           | Description                     |
|-----------|--------------------------------|---------------------------------|
| `type`    | `GeneratorType<? extends T>`   | Generator type                  |
| `cons`    | `NonNullConsumer<? extends T>` | Callback consuming the provider |

```java
REGISTRUM.addDataGenerator(ProviderType.LANG, lang -> {
    lang.add("mymod.greeting", "Hello World");
});
```

### `getDataGenInitializer()`

```java
public DataProviderInitializer getDataGenInitializer()
```

Accesses the `DataProviderInitializer` for configuring provider dependencies and datapack registry
entries. Creates the initializer lazily on first call.

```java
REGISTRUM.getDataGenInitializer()
    .addDependency(ProviderType.BLOCK_TAGS, ProviderType.BLOCK_MODEL);
```

### `genData(GeneratorType, T)`

```java
public <T> void genData(GeneratorType<? extends T> type, T gen)
```

Internal method called by `RegistrumDataProvider` to execute all registered data generation
callbacks for a given provider type. Invokes both entry-associated and unassociated callbacks.

- Errors are logged individually; if `skipErrors` is `true`, they do not propagate
- No-op if datagen is not running

---

## Language / Translation

All three methods return a `MutableComponent` (via `Component.translatable(key)`) suitable for
display in UIs, tooltips, and creative tab titles. Translation values are written through
`RegistrumLangProvider` during data generation.

### `addLang(type, id, localizedName)`

```java
public MutableComponent addLang(
    String type,
    Identifier id,
    String localizedName
)
```

Adds a translation using vanilla-style key generation (`Util.makeDescriptionId`). For example,
`("block", "mymod:my_block", "My Block")` produces key `"block.mymod.my_block"`.

| Parameter       | Type         | Description                                       |
|-----------------|--------------|---------------------------------------------------|
| `type`          | `String`     | Key prefix (e.g. `"block"`, `"item"`, `"entity"`) |
| `id`            | `Identifier` | The entry identifier                              |
| `localizedName` | `String`     | (English) translation value                       |

### `addLang(type, id, suffix, localizedName)`

```java
public MutableComponent addLang(
    String type,
    Identifier id,
    String suffix,
    String localizedName
)
```

Same as above but appends a dot-separated suffix. For example,
`("block", id, "tooltip", "Hold shift for info")` produces key `"block.mymod.my_block.tooltip"`.

### `addRawLang(key, value)`

```java
public MutableComponent addRawLang(String key, String value)
```

Adds a raw key-value translation pair directly, bypassing key generation.

```java
// Vanilla-style (auto-generated key)
MutableComponent name = REGISTRUM.addLang("block",
    Identifier.fromNamespaceAndPath("mymod", "my_block"),
    "My Special Block");

// With suffix (for tooltips)
MutableComponent tooltip = REGISTRUM.addLang("block",
    Identifier.fromNamespaceAndPath("mymod", "my_block"),
    "tooltip", "A very special block");

// Raw key (custom key)
MutableComponent custom = REGISTRUM.addRawLang(
    "mymod.custom.message", "Hello World");
```

---

## Creative Mode Tab (Resource Key)

These methods control the default creative tab assignment and tab content modification.

### `defaultCreativeTab(ResourceKey)`

```java
public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab)
```

Sets the default creative tab. All subsequent item builders will use this tab unless overridden.
The initial default is `CreativeModeTabs.SEARCH`.

```java
REGISTRUM.defaultCreativeTab(CreativeModeTabs.BUILDING_BLOCKS);
```

### `defaultCreativeTab(RegistryEntry)`

```java
public S defaultCreativeTab(
    RegistryEntry<CreativeModeTab, CreativeModeTab> tab
)
```

Convenience overload that extracts the `ResourceKey` from a `RegistryEntry`. Useful when a creative
tab was registered externally (not by Registrum).

### `modifyCreativeModeTab(ResourceKey, Consumer)`

```java
public S modifyCreativeModeTab(
    ResourceKey<CreativeModeTab> creativeModeTab,
    Consumer<CreativeModeTabModifier> modifier
)
```

Registers a callback invoked during `BuildCreativeModeTabContentsEvent` to modify the contents
of a specific creative tab. Multiple callbacks on the same tab are additive.

| Parameter         | Type                                | Description                                    |
|-------------------|-------------------------------------|------------------------------------------------|
| `creativeModeTab` | `ResourceKey<CreativeModeTab>`      | The target tab                                 |
| `modifier`        | `Consumer<CreativeModeTabModifier>` | Callback receiving a modifier for adding items |

```java
REGISTRUM.modifyCreativeModeTab(CreativeModeTabs.BUILDING_BLOCKS, modifier -> {
    modifier.add(MY_BLOCK.get());
    modifier.addAfter(Items.STONE, MY_SPECIAL_BLOCK.get());
});
```

---

## Transform

Apply transformations to the registrum instance or redirect a fluent chain to a builder helper.

### `transform(NonNullUnaryOperator)`

```java
public S transform(NonNullUnaryOperator<S> func)
```

Applies a function to `this` and returns the result. Useful for helper methods that configure
the registrum itself, not transitioning to a builder.

```java
public static Registrum configureDefaults(Registrum r) {
    return r.defaultCreativeTab(CreativeModeTabs.BUILDING_BLOCKS);
}

REGISTRUM.transform(MyMod::configureDefaults)
    .object("my_block").block(MyBlock::new).register();
```

### `transform(NonNullFunction)`

```java
public <R, T extends R, P, S2 extends Builder<R, T, P, S2>> S2 transform(
    NonNullFunction<S, S2> func
)
```

Applies a function that returns a `Builder`, then continues the chain on whatever the function
returned. This is the key mechanism for extracting builder construction into helper methods.

```java
public static BlockBuilder<MyBlock, Registrum> createMyBlock(Registrum r) {
    return r.object("my_block").block(MyBlock::new);
}

REGISTRUM.transform(MyMod::createMyBlock)
    .lang("My Block")   // chain continues on the BlockBuilder
    .simpleItem()
    .register();
```

---

## Custom Entry & Registry

### `entry(NonNullBiFunction)`

```java
public <R, T extends R, P, S2 extends Builder<R, T, P, S2>> S2 entry(
    NonNullBiFunction<String, BuilderCallback, S2> factory
)
```

Creates a builder using the factory, passing the **current name** (from `object()`) and a
`BuilderCallback`. This is the generic entry point for custom builder types.

### `entry(String, NonNullFunction)`

```java
public <R, T extends R, P, S2 extends Builder<R, T, P, S2>> S2 entry(
    String name,
    NonNullFunction<BuilderCallback, S2> factory
)
```

Same as above but with an **explicit name**, bypassing the current-name state.

```java
// Using current name
REGISTRUM.object("my_thing")
    .entry((name, callback) -> new MyCustomBuilder<>(
        REGISTRUM, REGISTRUM, name, callback));

// Using explicit name
REGISTRUM.entry("my_thing", callback -> new MyCustomBuilder<>(
    REGISTRUM, REGISTRUM, "my_thing", callback));
```

### `makeRegistry(name, builder)`

```java
public <R> ResourceKey<Registry<R>> makeRegistry(
    String name,
    Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder
)
```

Creates a new **synced** registry via `NewRegistryEvent`. Returns the `ResourceKey` immediately;
the actual registry is created later when the event fires.

| Parameter | Type                                        | Description                              |
|-----------|---------------------------------------------|------------------------------------------|
| `name`    | `String`                                    | Registry ID (within the mod's namespace) |
| `builder` | `Function<ResourceKey, RegistryBuilder<R>>` | Configures `RegistryBuilder` properties  |

```java
ResourceKey<Registry<MyType>> MY_REGISTRY = REGISTRUM.makeRegistry(
    "my_custom",
    key -> new RegistryBuilder<MyType>(key)
        .sync(true)
        .maxId(256)
);

REGISTRUM.object("my_entry")
    .simple(MY_REGISTRY, MyType::new);
```

### `makeDatapackRegistry(name, codec)`

```java
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(
    String name,
    Codec<R> codec
)
```

Registers an **unsynced** datapack registry. Data JSONs are loaded from
`data/<datapack_namespace>/<modid>/<name>/`. Clients are not required to have this registry
to connect to a server.

### `makeDatapackRegistry(name, codec, networkCodec)`

```java
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(
    String name,
    Codec<R> codec,
    @Nullable Codec<R> networkCodec
)
```

Registers a datapack registry with an optional network codec. If `networkCodec` is non-null,
data is synced to clients and the registry is required on both sides.

| Parameter      | Type                 | Description                                         |
|----------------|----------------------|-----------------------------------------------------|
| `name`         | `String`             | Registry ID                                         |
| `codec`        | `Codec<R>`           | Codec for loading data from datapacks (server-side) |
| `networkCodec` | `@Nullable Codec<R>` | Codec for syncing to clients; `null` = unsynced     |

```java
// Unsynced (server-only)
ResourceKey<Registry<MyData>> UNSYNCED = REGISTRUM.makeDatapackRegistry(
    "my_server_data", MyData.CODEC);

// Synced (required on both client and server)
ResourceKey<Registry<MyData>> SYNCED = REGISTRUM.makeDatapackRegistry(
    "my_synced_data", MyData.CODEC, MyData.NETWORK_CODEC);
```

---

## Generic Registration (simple / generic)

`simple()` returns a `RegistryEntry` immediately (no builder chain). `generic()` returns a
`NoConfigBuilder` that allows `.lang()`, `.tag()`, `.register()` before finalizing.

### `simple()` overloads (4)

| Signature                                                         | Description                        |
|-------------------------------------------------------------------|------------------------------------|
| `simple(ResourceKey<Registry<R>>, NonNullSupplier<T>)`            | Current name, no parent (`self()`) |
| `simple(String, ResourceKey<Registry<R>>, NonNullSupplier<T>)`    | Explicit name, no parent           |
| `simple(P, ResourceKey<Registry<R>>, NonNullSupplier<T>)`         | Current name, given parent         |
| `simple(P, String, ResourceKey<Registry<R>>, NonNullSupplier<T>)` | Explicit name, given parent        |

| Parameter      | Type                       | Description              |
|----------------|----------------------------|--------------------------|
| `registryType` | `ResourceKey<Registry<R>>` | Target registry          |
| `factory`      | `NonNullSupplier<T>`       | Entry constructor        |
| `name`         | `String`                   | Entry name (optional)    |
| `parent`       | `P`                        | Parent object (optional) |

```java
// Quick registration without builder chain
RegistryEntry<Item, MyItem> entry = REGISTRUM
    .object("my_item")
    .simple(Registries.ITEM, MyItem::new);
```

### `generic()` overloads (4)

| Signature                                                          | Return                   | Description                 |
|--------------------------------------------------------------------|--------------------------|-----------------------------|
| `generic(ResourceKey<Registry<R>>, NonNullSupplier<T>)`            | `NoConfigBuilder<R,T,S>` | Current name, no parent     |
| `generic(String, ResourceKey<Registry<R>>, NonNullSupplier<T>)`    | `NoConfigBuilder<R,T,S>` | Explicit name, no parent    |
| `generic(P, ResourceKey<Registry<R>>, NonNullSupplier<T>)`         | `NoConfigBuilder<R,T,P>` | Current name, given parent  |
| `generic(P, String, ResourceKey<Registry<R>>, NonNullSupplier<T>)` | `NoConfigBuilder<R,T,P>` | Explicit name, given parent |

```java
// Builder chain for arbitrary registry types
REGISTRUM.object("my_entry")
    .generic(Registries.ITEM, MyItem::new)
        .lang("My Custom Item")
        .tag(ItemTags.SWORDS)
        .register();
```

---

## Item Builder (4 overloads)

Creates an `ItemBuilder`. The factory receives `Item.Properties` and returns an `Item` subtype.

| Signature                                              | Name Source     | Parent          |
|--------------------------------------------------------|-----------------|-----------------|
| `item(NonNullFunction<Item.Properties, T>)`            | `currentName()` | `S` (registrum) |
| `item(String, NonNullFunction<Item.Properties, T>)`    | Explicit        | `S` (registrum) |
| `item(P, NonNullFunction<Item.Properties, T>)`         | `currentName()` | `P`             |
| `item(P, String, NonNullFunction<Item.Properties, T>)` | Explicit        | `P`             |

| Parameter | Type                                  | Description                               |
|-----------|---------------------------------------|-------------------------------------------|
| `name`    | `String`                              | Entry name (optional)                     |
| `parent`  | `P`                                   | Parent object in builder chain (optional) |
| `factory` | `NonNullFunction<Item.Properties, T>` | Item constructor from properties          |

```java
REGISTRUM.object("my_item")
    .item(MyItem::new)              // uses currentName, parent=self
    .tab(CreativeModeTabs.TOOLS)
    .lang("My Item")
    .register();

// Explicit name, no object() needed
REGISTRUM.item("another_item", MyItem::new)
    .tab(CreativeModeTabs.BUILDING_BLOCKS)
    .register();
```

::: info Default creative tab
`item()` overloads with parent `S` automatically apply `defaultCreativeTab` (if set) to the
builder. Parent `P` overloads do not apply the default tab.
:::

---

## Block Builder (4 overloads)

Creates a `BlockBuilder`. The factory receives `BlockBehaviour.Properties` and returns a `Block` subtype.

| Signature                                                         | Name Source     | Parent |
|-------------------------------------------------------------------|-----------------|--------|
| `block(NonNullFunction<BlockBehaviour.Properties, T>)`            | `currentName()` | `S`    |
| `block(String, NonNullFunction<BlockBehaviour.Properties, T>)`    | Explicit        | `S`    |
| `block(P, NonNullFunction<BlockBehaviour.Properties, T>)`         | `currentName()` | `P`    |
| `block(P, String, NonNullFunction<BlockBehaviour.Properties, T>)` | Explicit        | `P`    |

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
    .properties(p -> p.strength(3.0f).requiresCorrectToolForDrops())
    .simpleItem()                     // auto-create BlockItem
    .lang("My Block")
    .register();
```

---

## Entity Builder (4 overloads)

Creates an `EntityBuilder`. Takes a `EntityFactory<T>` and a `MobCategory` classification.

| Signature                                          | Name Source     | Parent |
|----------------------------------------------------|-----------------|--------|
| `entity(EntityFactory<T>, MobCategory)`            | `currentName()` | `S`    |
| `entity(String, EntityFactory<T>, MobCategory)`    | Explicit        | `S`    |
| `entity(P, EntityFactory<T>, MobCategory)`         | `currentName()` | `P`    |
| `entity(P, String, EntityFactory<T>, MobCategory)` | Explicit        | `P`    |

| Parameter        | Type               | Description                                         |
|------------------|--------------------|-----------------------------------------------------|
| `name`           | `String`           | Entry name (optional)                               |
| `parent`         | `P`                | Parent object (optional)                            |
| `factory`        | `EntityFactory<T>` | `(EntityType<T>, Level) -> T`                       |
| `classification` | `MobCategory`      | Spawn classification (e.g., `MobCategory.CREATURE`) |

```java
REGISTRUM.object("my_entity")
    .entity(MyEntity::new, MobCategory.CREATURE)
    .renderer(() -> ctx -> new MyEntityRenderer(ctx))
    .attributes(MyEntity::createAttributes)
    .lang("My Entity")
    .register();
```

---

## BlockEntity Builder (4 overloads)

Creates a `BlockEntityBuilder`. Takes a `BlockEntityFactory<T>`.

| Signature                                       | Name Source     | Parent |
|-------------------------------------------------|-----------------|--------|
| `blockEntity(BlockEntityFactory<T>)`            | `currentName()` | `S`    |
| `blockEntity(String, BlockEntityFactory<T>)`    | Explicit        | `S`    |
| `blockEntity(P, BlockEntityFactory<T>)`         | `currentName()` | `P`    |
| `blockEntity(P, String, BlockEntityFactory<T>)` | Explicit        | `P`    |

| Parameter | Type                    | Description                                       |
|-----------|-------------------------|---------------------------------------------------|
| `name`    | `String`                | Entry name (optional)                             |
| `parent`  | `P`                     | Parent object in builder chain (optional)         |
| `factory` | `BlockEntityFactory<T>` | `(BlockEntityType<T>, BlockPos, BlockState) -> T` |

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
    .blockEntity(MyBlockEntity::new) // uses currentName "my_block"
        .renderer(() -> ctx -> new MyBlockEntityRenderer(ctx))
        .build()
    .register();
```

---

## Fluid Builder (36 overloads)

Fluid overloads are organized by parameter pattern. Each pattern has up to 4 variants:
**current name** (no name arg), **explicit name** (String arg), **parent** (parent param,
current name), and **parent + name** (both parent and explicit name).

::: tip Default textures
When still/flowing textures are omitted, Registrum auto-generates them as
`"block/<currentName>_still"` and `"block/<currentName>_flow"`. Pass explicit `Identifier`s
to override.
:::

### Base Fluid (no factory, no custom FluidType)

| Signature                      | Returns                                     | Notes                                     |
|--------------------------------|---------------------------------------------|-------------------------------------------|
| `fluid()`                      | `FluidBuilder<BaseFlowingFluid.Flowing, S>` | Current name, `FluidType::new` as default |
| `fluid(String name)`           | `FluidBuilder<BaseFlowingFluid.Flowing, S>` | Explicit name                             |
| `fluid(P parent)`              | `FluidBuilder<BaseFlowingFluid.Flowing, P>` | Parent, `currentName()`, auto textures    |
| `fluid(P parent, String name)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` | Parent + name, auto textures              |

```java
REGISTRUM.object("my_fluid")
    .fluid()                         // default FluidType, auto textures
    .lang("My Fluid")
    .register();
```

### With FluidTypeFactory

| Signature                                         | Returns                                     |
|---------------------------------------------------|---------------------------------------------|
| `fluid(FluidBuilder.FluidTypeFactory)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, FluidBuilder.FluidTypeFactory)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, FluidBuilder.FluidTypeFactory)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, FluidBuilder.FluidTypeFactory)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

```java
REGISTRUM.object("my_fluid")
    .fluid(props -> props.temperature(300).viscosity(1000))
    .register();
```

### With NonNullSupplier\<FluidType\>

| Signature                                      | Returns                                     |
|------------------------------------------------|---------------------------------------------|
| `fluid(NonNullSupplier<FluidType>)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, NonNullSupplier<FluidType>)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, NonNullSupplier<FluidType>)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, NonNullSupplier<FluidType>)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### With Still/Flowing Textures

| Signature                                     | Returns                                     |
|-----------------------------------------------|---------------------------------------------|
| `fluid(Identifier still, Identifier flowing)` | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, Identifier, Identifier)`       | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, Identifier, Identifier)`            | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, Identifier, Identifier)`    | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### With Textures + FluidTypeFactory

| Signature                                                                 | Returns                                     |
|---------------------------------------------------------------------------|---------------------------------------------|
| `fluid(Identifier, Identifier, FluidBuilder.FluidTypeFactory)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, Identifier, Identifier, FluidBuilder.FluidTypeFactory)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, Identifier, Identifier, FluidBuilder.FluidTypeFactory)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, Identifier, Identifier, FluidBuilder.FluidTypeFactory)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### With Textures + NonNullSupplier\<FluidType\>

| Signature                                                              | Returns                                     |
|------------------------------------------------------------------------|---------------------------------------------|
| `fluid(Identifier, Identifier, NonNullSupplier<FluidType>)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, Identifier, Identifier, NonNullSupplier<FluidType>)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, Identifier, Identifier, NonNullSupplier<FluidType>)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, Identifier, Identifier, NonNullSupplier<FluidType>)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### With Custom FluidFactory (generic fluid type)

| Signature                                                                | Returns              |
|--------------------------------------------------------------------------|----------------------|
| `fluid(Identifier, Identifier, FluidBuilder.FluidFactory<T>)`            | `FluidBuilder<T, S>` |
| `fluid(String, Identifier, Identifier, FluidBuilder.FluidFactory<T>)`    | `FluidBuilder<T, S>` |
| `fluid(P, Identifier, Identifier, FluidBuilder.FluidFactory<T>)`         | `FluidBuilder<T, P>` |
| `fluid(P, String, Identifier, Identifier, FluidBuilder.FluidFactory<T>)` | `FluidBuilder<T, P>` |

### With Custom FluidFactory + FluidTypeFactory

| Signature                                                                                               | Returns              |
|---------------------------------------------------------------------------------------------------------|----------------------|
| `fluid(Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)`            | `FluidBuilder<T, S>` |
| `fluid(String, Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)`    | `FluidBuilder<T, S>` |
| `fluid(P, Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)`         | `FluidBuilder<T, P>` |
| `fluid(P, String, Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)` | `FluidBuilder<T, P>` |

### With Custom FluidFactory + NonNullSupplier\<FluidType\>

| Signature                                                                                            | Returns              |
|------------------------------------------------------------------------------------------------------|----------------------|
| `fluid(Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)`            | `FluidBuilder<T, S>` |
| `fluid(String, Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)`    | `FluidBuilder<T, S>` |
| `fluid(P, Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)`         | `FluidBuilder<T, P>` |
| `fluid(P, String, Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)` | `FluidBuilder<T, P>` |

```java
Identifier still = Identifier.fromNamespaceAndPath("mymod", "block/my_fluid_still");
Identifier flow  = Identifier.fromNamespaceAndPath("mymod", "block/my_fluid_flow");

// Custom FluidType + custom FluidFactory
REGISTRUM.object("my_fluid")
    .fluid(still, flow,
        props -> new MyFluidType(props),
        MyFlowingFluid::new)
    .lang("My Fluid")
    .bucket()
    .register();
```

---

## Menu Builder (8 overloads)

Creates a `MenuBuilder`. Supports both standard `MenuFactory` and Forge-extended `ForgeMenuFactory`.

### With `MenuFactory` (4 overloads)

| Signature                                                               | Name Source     | Parent |
|-------------------------------------------------------------------------|-----------------|--------|
| `menu(MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`            | `currentName()` | `S`    |
| `menu(String, MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`    | Explicit        | `S`    |
| `menu(P, MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`         | `currentName()` | `P`    |
| `menu(P, String, MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)` | Explicit        | `P`    |

### With `ForgeMenuFactory` (4 overloads)

| Signature                                                                    | Name Source     | Parent |
|------------------------------------------------------------------------------|-----------------|--------|
| `menu(ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`            | `currentName()` | `S`    |
| `menu(String, ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`    | Explicit        | `S`    |
| `menu(P, ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`         | `currentName()` | `P`    |
| `menu(P, String, ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)` | Explicit        | `P`    |

| Parameter       | Type                                      | Description                |
|-----------------|-------------------------------------------|----------------------------|
| `name`          | `String`                                  | Entry name (optional)      |
| `parent`        | `P`                                       | Parent object (optional)   |
| `factory`       | `MenuFactory<T>` or `ForgeMenuFactory<T>` | Container menu constructor |
| `screenFactory` | `NonNullSupplier<ScreenFactory<T, SC>>`   | Screen factory supplier    |

- `MenuFactory<T>`: `(int containerId, Inventory playerInv) -> T`
- `ForgeMenuFactory<T>`: `(int containerId, Inventory playerInv, FriendlyByteBuf extraData) -> T`

```java
// Standard MenuFactory
REGISTRUM.object("my_menu")
    .menu(MyMenu::new, () -> MyScreen::new)
    .lang("My Menu")
    .register();

// ForgeMenuFactory (with extra data sync)
REGISTRUM.object("my_forge_menu")
    .menu(MyMenu::new, () -> MyScreen::new)
    .register();
```

---

## Creative Tab Builder (defaultCreativeTab)

Registers a `CreativeModeTab` in the `Registries.CREATIVE_MODE_TAB` registry. Returns a
`NoConfigBuilder<CreativeModeTab, CreativeModeTab, ...>` for further configuration.

### Without config Consumer (4 overloads)

| Signature                       | Name Source     | Parent |
|---------------------------------|-----------------|--------|
| `defaultCreativeTab()`          | `currentName()` | `S`    |
| `defaultCreativeTab(String)`    | Explicit        | `S`    |
| `defaultCreativeTab(P)`         | `currentName()` | `P`    |
| `defaultCreativeTab(P, String)` | Explicit        | `P`    |

### With config Consumer (4 overloads)

| Signature                                                          | Name Source     | Parent |
|--------------------------------------------------------------------|-----------------|--------|
| `defaultCreativeTab(Consumer<CreativeModeTab.Builder>)`            | `currentName()` | `S`    |
| `defaultCreativeTab(String, Consumer<CreativeModeTab.Builder>)`    | Explicit        | `S`    |
| `defaultCreativeTab(P, Consumer<CreativeModeTab.Builder>)`         | `currentName()` | `P`    |
| `defaultCreativeTab(P, String, Consumer<CreativeModeTab.Builder>)` | Explicit        | `P`    |

| Parameter | Type                                | Description                                                               |
|-----------|-------------------------------------|---------------------------------------------------------------------------|
| `name`    | `String`                            | Tab name. Also sets `defaultCreativeModeTab` to the matching resource key |
| `parent`  | `P`                                 | Parent object (optional)                                                  |
| `config`  | `Consumer<CreativeModeTab.Builder>` | Additional tab configuration                                              |

```java
// Simple tab
REGISTRUM.object("my_tab")
    .defaultCreativeTab()
    .lang("My Tab")
    .register();

// Tab with configuration
REGISTRUM.object("my_tab")
    .defaultCreativeTab(tab -> tab
        .withSearchBar()
        .withTabsBefore(CreativeModeTabs.BUILDING_BLOCKS))
    .lang("My Tab")
    .register();

// Explicit name + parent + config
REGISTRUM.defaultCreativeTab(myBlockBuilder, "my_tab",
    tab -> tab.icon(() -> new ItemStack(MY_BLOCK.get())))
    .register();
```

::: info Auto-generated icon
When no icon is configured, `defaultCreativeTab` uses the first registered item as a fallback
icon. If no items are registered, `Items.AIR` is used as a placeholder.
:::

---

## CreativeTabBuilder (2 overloads)

A specialized builder with dedicated display-item configuration capabilities.

### `creativeTab(String, ItemLike)`

```java
public CreativeTabBuilder<S> creativeTab(String name, ItemLike icon)
```

Creates a `CreativeTabBuilder` with the given name and icon. The `ItemLike` is immediately
wrapped in a lazy supplier. Register with `Registries.CREATIVE_MODE_TAB`.

### `creativeTab(String, Supplier\<ItemLike\>)`

```java
public CreativeTabBuilder<S> creativeTab(String name, Supplier<ItemLike> icon)
```

Same as above but accepts a `Supplier` for deferred icon resolution.

```java
REGISTRUM.creativeTab("my_tab", MY_ITEM)
    .displayItems(MY_ITEM, MY_BLOCK, MY_TOOL)
    .lang("My Custom Tab")
    .register();

// Deferred icon
REGISTRUM.creativeTab("my_tab", () -> new ItemStack(MY_DYNAMIC_ITEM))
    .displayItems(MY_ITEM)
    .register();
```

---

## Specialized Builders (26.1) <Badge type="info" text="26.1" />

New in AnvilLib 26.1, these builders cover NeoForge-specific and advanced registry types.

### Attachment Builder (2 overloads)

Registers an attachment type (`NeoForgeRegistries.Keys.ATTACHMENT_TYPES`).

| Signature                                            | Description                                    |
|------------------------------------------------------|------------------------------------------------|
| `attachment(String, Function<IAttachmentHolder, E>)` | Creates attachment with initializer function   |
| `attachment(String, Supplier<E>)`                    | Creates attachment with default value supplier |

| Parameter | Type                                              | Description                          |
|-----------|---------------------------------------------------|--------------------------------------|
| `name`    | `String`                                          | Entry name                           |
| `const_`  | `Function<IAttachmentHolder, E>` or `Supplier<E>` | Constructor for the attachment value |

```java
// With initializer function
REGISTRUM.attachment("my_data", holder -> new MyData())
    .serialize(MyData.CODEC)
    .sync(MyData.STREAM_CODEC)
    .register();

// With default value supplier
REGISTRUM.attachment("my_data2", MyData::new)
    .serialize(MyData.CODEC)
    .register();
```

### Data Component Builder (1 overload)

Registers a data component type (`Registries.DATA_COMPONENT_TYPE`).

```java
public <E> DataComponentBuilder<E, S> dataComponent(String name)
```

| Parameter | Type     | Description |
|-----------|----------|-------------|
| `name`    | `String` | Entry name  |

```java
REGISTRUM.dataComponent("my_component")
    .persistent(MyComponent.CODEC)
    .networkSynchronized(MyComponent.STREAM_CODEC)
    .register();
```

### Biome Modifier Builder (1 overload)

Registers a biome modifier serializer (`NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS`).

```java
public <T extends BiomeModifier> BiomeModifierBuilder<T, S> biomeModifier(
    String name,
    MapCodec<T> codec
)
```

| Parameter | Type          | Description                |
|-----------|---------------|----------------------------|
| `name`    | `String`      | Entry name                 |
| `codec`   | `MapCodec<T>` | MapCodec for serialization |

```java
REGISTRUM.biomeModifier("my_modifier", MyModifier.CODEC).register();
```

### Global Loot Modifier Builder (1 overload)

Registers a global loot modifier serializer (`NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS`).

```java
public <T extends IGlobalLootModifier> GlobalLootModifierBuilder<T, S> glm(
    String name,
    MapCodec<T> codec
)
```

```java
REGISTRUM.glm("my_loot_modifier", MyLootModifier.CODEC).register();
```

### Structure Modifier Builder (1 overload)

Registers a structure modifier serializer (`NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS`).

```java
public <T extends StructureModifier> StructureModifierBuilder<T, S> structureModifier(
    String name,
    MapCodec<T> codec
)
```

```java
REGISTRUM.structureModifier("my_struct_modifier", MyStructModifier.CODEC).register();
```

### Condition Builder (1 overload)

Registers a condition codec (`NeoForgeRegistries.Keys.CONDITION_CODECS`).

```java
public <T extends ICondition> ConditionBuilder<T, S> condition(
    String name,
    MapCodec<T> codec
)
```

```java
REGISTRUM.condition("my_condition", MyCondition.CODEC).register();
```

::: tip Protected overloads
Each 26.1 builder also has a `protected` overload accepting a `(P parent, String name, ...)`
signature for extension via custom subclasses. These are not part of the public API.
:::

---

## Registration Lifecycle

```
1. object("name")              — sets current entry name
2. block() / item() / etc.      — creates Builder, stored in registrations Table
3. .lang() .tag() .setData()   — Builder chain configuration (before register())
4. register()                   — creates Registration object, returns RegistryEntry
5. RegisterEvent fires          — onRegister() iterates per-registry entries
6. RegisterEvent (LOWEST)       — onRegisterLate() invokes afterRegisterCallbacks
7. FMLCommonSetupEvent          — OneTimeEventReceiver cleans up RegisterEvent listeners
8. GatherDataEvent.Client       — (datagen only) onData() starts data generation
```

### Internal `Registration<R, T>` class

```java
// package-private
// Fields: Identifier name, ResourceKey<Registry<R>> type,
//         NonNullSupplier<T> creator, RegistryEntry<R,T> delegate,
//         List<NonNullConsumer<? super T>> callbacks

// register(RegisterEvent):
//   T entry = creator.get();
//   event.register(type, rh -> rh.register(name, entry));
//   callbacks.forEach(c -> c.accept(entry));
//   callbacks.clear();
```

### Event Listeners Registered by `registerEventListeners()`

| Event                               | Priority | Handler                                                           |
|-------------------------------------|----------|-------------------------------------------------------------------|
| `RegisterEvent`                     | normal   | `onRegister()` -- registers collected entries by type             |
| `RegisterEvent`                     | `LOWEST` | `onRegisterLate()` -- executes after-register callbacks           |
| `BuildCreativeModeTabContentsEvent` | normal   | `onBuildCreativeModeTabContents()` -- fills creative tab contents |
| `FMLCommonSetupEvent`               | normal   | Cleans up `RegisterEvent` listeners via `OneTimeEventReceiver`    |
| `GatherDataEvent.Client`            | normal   | (datagen only) `onData()` via `OneTimeEventReceiver`              |

---

## Thread Safety

`AbstractRegistrum` is **not thread-safe**. It uses non-concurrent collections
(`HashBasedTable`, `HashMultimap`) and manages stateful `currentName`.

- All registration must happen during **mod construction** (the `@Mod` constructor), synchronously
- Data generation callbacks execute serially within `genData()`
- `doDatagen` uses `NonNullSupplier.lazy()` for safe one-time lazy evaluation

---

## Error Reference

| Error                                                              | Cause                                                      | Solution                                                      |
|--------------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------|
| `"Current name not set"`                                           | `object()` was never called before a name-dependent method | Call `object("name")` or use explicit-name overloads          |
| `"Unknown registration <name> for type <registry>"`                | `get(name, type)` references a non-existent registration   | Ensure the registration is created before retrieving it       |
| `"Cannot get data provider before datagen is started"`             | `getDataProvider()` called outside datagen                 | Only call during `GatherDataEvent`                            |
| `"Cannot add data generator after construction of root generator"` | `addDataGenerator()` after provider construction           | Register data generators before datagen starts                |
| `"Found unused register callbacks"` (dev)                          | Callbacks reference entries that were never registered     | Verify each `addRegisterCallback()` has a corresponding entry |

---

## BuilderCallback

The functional interface connecting builders to the registration system. Implemented by
`AbstractRegistrum.accept()`.

```java
@FunctionalInterface
public interface BuilderCallback {
    <R, T extends R> RegistryEntry<R, T> accept(
        String name,
        ResourceKey<? extends Registry<R>> type,
        Builder<R, T, ?, ?> builder,
        NonNullSupplier<? extends T> factory,
        NonNullFunction<DeferredHolder<R, T>, ? extends RegistryEntry<R, T>> entryFactory
    );

    // Simplified overload (uses default RegistryEntry wrapper)
    default <R, T extends R> RegistryEntry<R, T> accept(
        String name,
        ResourceKey<? extends Registry<R>> type,
        Builder<R, T, ?, ?> builder,
        NonNullSupplier<? extends T> factory
    );
}
```

---

## Complete Example

```java
@Mod("mymod")
public class MyMod {
    public static final Registrum REGISTRUM = Registrum.create("mymod");

    // Block + BlockItem + BlockEntity
    public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
        .object("my_block")
        .block(MyBlock::new)
            .properties(p -> p.strength(3.0f).requiresCorrectToolForDrops())
            .simpleItem()
            .blockEntity(MyBlockEntity::new)
                .renderer(() -> ctx -> new MyBlockEntityRenderer(ctx))
                .build()
            .lang("My Block")
            .tag(BlockTags.MINEABLE_WITH_PICKAXE)
            .register();

    // Item
    public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
        .object("my_item")
        .item(MyItem::new)
            .tab(CreativeModeTabs.TOOLS)
            .lang("My Item")
            .register();

    // Entity
    public static final EntityEntry<MyEntity> MY_ENTITY = REGISTRUM
        .object("my_entity")
        .entity(MyEntity::new, MobCategory.CREATURE)
            .renderer(() -> ctx -> new MyEntityRenderer(ctx))
            .properties(b -> b.sized(0.6f, 1.8f))
            .attributes(MyEntity::createAttributes)
            .lang("My Entity")
            .register();

    // 26.1: Data component
    public static final DataComponentEntry<MyData> MY_COMPONENT = REGISTRUM
        .dataComponent("my_component")
            .persistent(MyData.CODEC)
            .networkSynchronized(MyData.STREAM_CODEC)
            .register();

    public MyMod(IEventBus modBus) {
        REGISTRUM.addRegisterCallback(Registries.BLOCK, () ->
            LOGGER.info("All blocks registered!"));
    }
}
```
