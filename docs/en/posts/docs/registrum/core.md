---
title: Registrum Core API
prev: false
next: false
---

# Core API <Badge type="tip" text=">=1.21.1" />

## Registrum

Entry point class, extending `AbstractRegistrum<Registrum>`.

```java
// Create an instance
public static Registrum create(String modid);
```

Inside `create()`:

1. Constructs `new Registrum(modid)`
2. Looks up the mod container via `ModList.get().getModContainerById(modid)`
3. Gets the `modEventBus` and calls `registerEventListeners(bus)`
4. If the ModContainer is not found, logs a fatal error (wrapped with `#` characters)

## AbstractRegistrum

Registration engine base class, containing all core logic. The generic parameter `S` is the self-type.

### Environment Detection

```java
// Dev environment check (FMLLoader.isProduction() == false)
public static boolean isDevEnvironment();
```

### Object Naming

```java
// Sets the entry name for subsequent builders until the next object() call
public S object(String name);

// Gets the currently set name (throws NullPointerException if not set)
protected String currentName();
```

**Important**: `object("name")` sets a persistent state. The following code registers a block and a block entity with the same name:

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new).register()   // Registers block "my_block"
    .blockEntity(MyBE::new).register(); // Registers block entity "my_block" (name is inherited)
```

### Entry Retrieval

| Method                                                                  | Description                                     |
|-------------------------------------------------------------------------|-------------------------------------------------|
| `<R,T> RegistryEntry<R,T> get(ResourceKey<Registry<R>>)`                | Get by current name (requires prior `object()`) |
| `<R,T> RegistryEntry<R,T> get(String, ResourceKey)`                     | Get by specified name                           |
| `<R,T> Optional<RegistryEntry<R,T>> getOptional(String, ResourceKey)`   | Optional get                                    |
| `<R,T> Collection<RegistryEntry<R,T>> getAll(ResourceKey)`              | Get all known entries for a registry            |

```java
// Retrieve a previously registered block (for referencing elsewhere)
RegistryEntry<Block, MyBlock> entry = REGISTRUM.get("my_block", Registries.BLOCK);

// Get the sibling Item (BlockItem) with the same name
ItemEntry<BlockItem> itemEntry = entry.getSibling(Registries.ITEM);
```

### Registration Callbacks

```java
// Called immediately after an entry is registered (callback receives the created object)
public <R,T> S addRegisterCallback(String name, ResourceKey<Registry<R>> type,
    NonNullConsumer<? super T> callback);

// Called after the entire registry is complete (no arguments)
public <R> S addRegisterCallback(ResourceKey<Registry<R>> type, Runnable callback);

// Check whether a registry has completed registration
public <R> boolean isRegistered(ResourceKey<Registry<R>> type);
```

```java
// Example: automatically set compost probability after block registration
REGISTRUM.object("my_crop").block(MyCropBlock::new).register();
REGISTRUM.addRegisterCallback("my_crop", Registries.BLOCK, block -> {
    // block is the registered MyCropBlock instance
});

// After the entire registry is complete
REGISTRUM.addRegisterCallback(Registries.BLOCK, () -> {
    LOGGER.info("All blocks have been registered!");
});
```

### Data Generation

```java
// Gets a data generator instance (only available during the datagen phase)
public <P> Optional<P> getDataProvider(GeneratorType<P> type);

// Sets a data generation callback for a specific entry (replaces existing)
public <P,R> S setDataGenerator(Builder<R,?,?,?> builder,
    GeneratorType<? extends P> type, NonNullConsumer<? extends P> cons);

// Adds a non-associated data generation callback (appends, does not replace)
public <T> S addDataGenerator(GeneratorType<? extends T> type,
    NonNullConsumer<? extends T> cons);

// Gets the DataGen initializer (for configuring provider dependencies and datapack registries)
public DataProviderInitializer getDataGenInitializer();
```

### Language / Translation

```java
// Use vanilla-style key -> "block.mymod.myblock"
public MutableComponent addLang(String type, Identifier id, String localizedName);

// With suffix -> "block.mymod.myblock.tooltip"
public MutableComponent addLang(String type, Identifier id, String suffix, String localizedName);

// Raw key-value pair
public MutableComponent addRawLang(String key, String value);
```

These methods return a `MutableComponent` (using `Component.translatable(key)`), which can be further used for UI display. Translation values are output by
`RegistrumLangProvider` during the data generation phase.

```java
// Add a translation during registration
REGISTRUM.addLang("block", Identifier.fromNamespaceAndPath("mymod", "my_block"), "My Special Block");
// -> Generates translation key "block.mymod.my_block": "My Special Block"
```

### Creative Mode Tabs

```java
// Set the default tab (affects all subsequent item builders)
public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab);

// Register a tab modification callback
public S modifyCreativeModeTab(ResourceKey<CreativeModeTab> tab,
    Consumer<CreativeModeTabModifier> modifier);
```

Callbacks registered via `modifyCreativeModeTab` are triggered during `BuildCreativeModeTabContentsEvent`. Multiple callbacks can be registered for the same tab.

### Error Skipping

```java
// Enable error skipping (dev environment only; automatically ignored in production)
public S skipErrors(boolean skipErrors);
```

In a development environment, `skipErrors(true)` will only log errors during registration/data generation rather than throwing exceptions, making debugging easier. Error skipping applies to:

- Exceptions during registration entry creation
- Exceptions in data generation callbacks

### Transform

```java
// Apply a transformation to AbstractRegistrum itself
public S transform(NonNullUnaryOperator<S> func);

// Apply a transformation and return a Builder (the transformed builder can continue chaining)
public <R,T,P,S2> S2 transform(NonNullFunction<S, S2> func);
```

```java
// Use transform to extract registration logic into a helper method
public static BlockBuilder<MyBlock, Registrum> createMyBlock(Registrum r) {
    return r.object("my_block").block(MyBlock::new).defaultItem();
}

// Use in a chain
REGISTRUM.transform(MyMod::createMyBlock)
    .lang("My Block")       // Can continue configuration after transform
    .register();
```

### Builder Entry Points

```java
// Generic Builder creation (using the current name)
public <R,T,P,S2> S2 entry(NonNullBiFunction<String, BuilderCallback, S2> factory);

// Simplified registration (no configuration chain; directly returns RegistryEntry)
public <R,T> RegistryEntry<R,T> simple(ResourceKey<Registry<R>> type,
    NonNullSupplier<T> factory);

// Generic Builder (NoConfigBuilder, usable with any registry)
public <R,T> NoConfigBuilder<R,T,S> generic(ResourceKey<Registry<R>> type,
    NonNullSupplier<T> factory);
```

### Specialized Builder Entry Points

The following methods provide quick entry points for specific builder types:

| Method | Return Type | Registry |
|--------|-------------|----------|
| `attachment(String, Function<IAttachmentHolder, E>)` | `AttachmentBuilder<E, S>` | `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` |
| `attachment(String, Supplier<E>)` | `AttachmentBuilder<E, S>` | `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` |
| `dataComponent(String)` | `DataComponentBuilder<E, S>` | `Registries.DATA_COMPONENT_TYPE` |
| `creativeTab(String, ItemLike)` | `CreativeTabBuilder<S>` | `Registries.CREATIVE_MODE_TAB` |
| `creativeTab(String, Supplier<ItemLike>)` | `CreativeTabBuilder<S>` | `Registries.CREATIVE_MODE_TAB` |
| `condition(String, MapCodec<T>)` | `ConditionBuilder<T, S>` | `NeoForgeRegistries.Keys.CONDITION_CODECS` |
| `biomeModifier(String, MapCodec<T>)` | `BiomeModifierBuilder<T, S>` | `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` |
| `glm(String, MapCodec<T>)` | `GlobalLootModifierBuilder<T, S>` | `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` |
| `structureModifier(String, MapCodec<T>)` | `StructureModifierBuilder<T, S>` | `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` |

```java
// Examples
REGISTRUM.attachment("my_data", MyAttachment::new)
    .serialize(MyAttachment.CODEC)
    .sync(MyAttachment.STREAM_CODEC)
    .register();

REGISTRUM.dataComponent("my_component")
    .persistent(MyComponent.CODEC)
    .networkSynchronized(MyComponent.STREAM_CODEC)
    .register();

REGISTRUM.creativeTab("my_tab", MY_ITEM)
    .displayItems(MY_ITEM, MY_BLOCK)
    .register();

REGISTRUM.condition("my_condition", MyCondition.CODEC).register();
REGISTRUM.biomeModifier("my_modifier", MyModifier.CODEC).register();
REGISTRUM.glm("my_loot", MyLootModifier.CODEC).register();
REGISTRUM.structureModifier("my_struct", MyStructModifier.CODEC).register();
```

### Creating Custom Registries

```java
// Synced registry (via NewRegistryEvent)
public <R> ResourceKey<Registry<R>> makeRegistry(String name,
    Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder);

// Datapack registry (server-side only, not synced)
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec);

// Datapack registry (synced to client)
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name,
    Codec<R> codec, @Nullable Codec<R> networkCodec);
```

```java
// Create a custom synced registry
ResourceKey<Registry<MyCustomType>> MY_REGISTRY = REGISTRUM.makeRegistry(
    "my_custom",
    key -> new RegistryBuilder<MyCustomType>(key).sync(true).maxId(256)
);

// Register an entry in the custom registry
RegistryEntry<MyCustomType, MyCustomType> entry = REGISTRUM
    .object("my_entry")
    .simple(MY_REGISTRY, MyCustomType::new);
```

## Registration Lifecycle

```
1. object("name")         -- Sets the current operation name
2. block() / item() etc.  -- Creates a Builder, stores it in the registrations Table
3. .lang() .tag() etc.    -- Builder chained configuration (before register())
4. register()             -- Creates a Registration object, stores it in registrations, returns RegistryEntry
5. RegisterEvent fires    -- onRegister() iterates registrations.row(type), calls register(event) for each
6. After priority registration -- onRegisterLate() executes afterRegisterCallbacks
7. FMLCommonSetupEvent    -- Cleans up one-time event listeners
8. GatherDataEvent.Client -- (datagen only) onData() starts data generation
```

### Internal Registration Class

```java
// package-private: Registration<R, T extends R>
// Stores: Identifier name, ResourceKey<Registry<R>> type,
//          NonNullSupplier<T> creator, RegistryEntry<R,T> delegate,
//          List<NonNullConsumer<? super T>> callbacks

// register(RegisterEvent event):
//   T entry = creator.get();
//   event.register(type, rh -> rh.register(name, entry));
//   callbacks.forEach(c -> c.accept(entry));
//   callbacks.clear();
```

## Event Listening

Automatically registered in `registerEventListeners(IEventBus bus)`:

| Event                                | Priority | Handling                                                         |
|--------------------------------------|----------|------------------------------------------------------------------|
| `RegisterEvent`                      | normal   | `onRegister()` -- iterates registrations and registers           |
| `RegisterEvent`                      | LOWEST   | `onRegisterLate()` -- executes afterRegisterCallbacks             |
| `BuildCreativeModeTabContentsEvent`  | normal   | `onBuildCreativeModeTabContents()` -- populates creative tabs    |
| `FMLCommonSetupEvent`                | normal   | Cleans up RegisterEvent listeners via `OneTimeEventReceiver`     |
| `GatherDataEvent.Client`             | normal   | Datagen mode only; calls `onData()` via `OneTimeEventReceiver`   |

## BuilderCallback

A functional interface, implemented by `AbstractRegistrum.accept()`, passed to Builder:

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
        String name, ResourceKey<? extends Registry<R>> type,
        Builder<R, T, ?, ?> builder, NonNullSupplier<? extends T> factory
    );
}
```

## Thread Safety

`AbstractRegistrum` is **not thread-safe**. It uses non-concurrent collections (`HashBasedTable`, `HashMultimap`) and manages naming through the stateful `currentName`.

- All registration operations should be completed synchronously during the **mod construction phase** (`@Mod` constructor)
- Data generation callbacks are executed synchronously in `genData()` (serial invocation)
- `doDatagen` ensures lazy single evaluation via `NonNullSupplier.lazy()`

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

    public MyMod(IEventBus modBus) {
        // Initialization hook
        IntegrationHook.setModEventBus(modBus);

        // Callback after registry completion
        REGISTRUM.addRegisterCallback(Registries.BLOCK, () -> {
            LOGGER.info("All blocks registered!");
        });
    }
}
```
