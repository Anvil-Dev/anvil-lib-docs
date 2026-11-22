# Registrum Core Architecture & Basic Registration

`module.registrum` is AnvilLib's fluent declarative registration and data generation framework for NeoForge 1.21.1 (derived from Registrate). Centered on `Registrum` / `AbstractRegistrum`, it consolidates scattered `DeferredRegister` registrations, client renderer bindings, event callbacks, and `GatherDataEvent` datagen into a single type-safe fluent builder chain.

## Why Registrum?

Standard vanilla/NeoForge registration scatters a single block's declaration across many places: block registration, item form, block entity type, client renderer binding, creative tab insertion, and tags/loot/blockstate/model/lang datagen. `Registrum` cohesive-groups all of these via Builder pattern and lazy evaluation:

1. **Deferred but ordered registration**: `.register()` records entries into registry-grouped tables rather than constructing game objects immediately; when `RegisterEvent` fires in order, blocks, items, and other registries are instantiated and registered cleanly, with full `addAlias` rename migration support.
2. **Built-in datagen binding**: `block`, `item`, `entity`, `fluid` builders automatically attach sensible default models, blockstates, English/upside-down English lang files, and loot tables; override or append anytime via `setData` / `addDataGenerator`.
3. **Client-safe isolation**: safely hooks client listeners on `Dist.CLIENT` via `RegistrumDistExecutor` and `OneTimeEventReceiver`, preventing dedicated server crashes.

## Setup

### Gradle Repositories & Dependencies

Official releases are available on Maven Central, but `Cjsah Maven` with `exclusiveContent` filtering is recommended to avoid NeoForge Maven's incomplete Maven Central sync causing interface injection or transitive metadata errors:

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### Creating a Registrum Instance

Create an instance in a static field of your Mod main class via `Registrum.create(modid)` (ensuring the class loads during or before Mod construction so `ModList` can find its `ModContainer` and `IEventBus`):

```java
package com.example.examplemod;

import dev.anvilcraft.lib.v2.registrum.Registrum;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

@Mod(ExampleMod.MODID)
public class ExampleMod {
    public static final String MODID = "examplemod";
    public static final Registrum REGISTRUM = Registrum.create(MODID);

    public ExampleMod(IEventBus modEventBus) {
        // Just ensure the class holding REGISTRUM is initialized, e.g., calling init() on static registration classes
        ModBlocks.register();
        ModItems.register();
    }
}
```

::: warning Golden Rule of Registration Timing
`Registrum.create(modid)` immediately looks up the Mod event bus via `ModList.get().getModContainerById(modid)` and calls `registerEventListeners(bus)`. **All `.register()` calls on `REGISTRUM` must complete before `RegisterEvent` fires** (i.e., during Mod construction or static loading of registration classes), otherwise `AbstractRegistrum` will reject late registrations or miss entries.
:::

## Core Classes: `Registrum` & `AbstractRegistrum`

`Registrum` extends `AbstractRegistrum<Registrum>` and provides ready-to-use factory methods. Library authors can also extend `AbstractRegistrum<S>` to expose domain-specific DSL methods.

### Common Fluent Entry Points

Before calling a specific type builder, state methods can preset the next entry's name and default creative tab:

- `object(String name)`: sets the current context name; subsequent unnamed `.block(...)`, `.item(...)`, etc. reuse this name.
- `defaultCreativeTab(ResourceKey<CreativeModeTab> creativeModeTab)`: sets the default creative tab for subsequent items and block items (pass `null` to clear). Under vanilla semantics, `defaultCreativeTab` is read at the moment `item(...)` is built and calls `.tab(...)`.
- `defaultCreativeTab(ResourceKey<CreativeModeTab> tab, NonNullBiConsumer<DataGenContext<Item, I>, CreativeModeTabModifier> modifier)`: sets the global default creative tab and custom modifier logic when adding items.

```java
public class ModItems {
    static {
        ExampleMod.REGISTRUM.defaultCreativeTab(ModCreativeTabs.MAIN_TAB.getKey());
    }

    public static final ItemEntry<Item> EXAMPLE_INGOT = ExampleMod.REGISTRUM
        .item("example_ingot", Item::new)
        .lang("Example Ingot")
        .register();

    public static final BlockEntry<Block> EXAMPLE_BLOCK = ExampleMod.REGISTRUM
        .object("example_block")
        .block(Block::new)
        .simpleItem()
        .register();

    public static void register() {}
}
```

### Generic Registry Extensions & Lookups

For registries without a specialized Builder, use these base builder factories:

- `simple(String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<T> factory)`: registers a custom registry entry with no extra config (returns `NoConfigBuilder`).
- `selfEntry(String name, ResourceKey<? extends Registry<T>> registryType, NonNullSupplier<T> factory)`: when registry type equals entry type (`Registry<T>` storing `T`), returns `SelfBuilder<T, S, ...>` producing `SelfEntry<T>`.
- `generic(P parent, String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<T> factory)`: returns `NoConfigBuilder` with a customizable parent type.
- `entry(String name, NonNullFunction<BuilderCallback, T> builderFactory)`: plugs a custom `Builder` instance directly into the fluent chain.

To create brand-new vanilla/datapack registries:

- `makeRegistry(ResourceKey<Registry<T>> registryKey, Consumer<RegistryBuilder<T>> builder)`: registers a standard synced/unsynced static registry in `NewRegistryEvent`, returning the `Registry<T>` reference.
- `makeDatapackRegistry(ResourceKey<Registry<T>> registryKey, Codec<T> codec)` / `makeDatapackRegistry(ResourceKey<Registry<T>> registryKey, Codec<T> codec, @Nullable Codec<T> networkCodec)`: registers a data-driven dynamic registry via `DataPackRegistryEvent.NewRegistry` (not synced to clients if `networkCodec` is `null`).

Looking up and querying registered results:

| Method Signature | Description | Boundary Conditions & Notes |
| :--- | :--- | :--- |
| `get(String name, ResourceKey<? extends Registry<R>> type)` | Gets `RegistryEntry<R, T>` by name under this `modid` and registry | Throws `IllegalArgumentException` if undeclared |
| `getOptional(String name, ResourceKey<? extends Registry<R>> type)` | Safely looks up a declared entry, returning `Optional<RegistryEntry<R, T>>` | Returns `Optional.empty()` if undeclared |
| `get(ResourceKey<R> key)` | Gets a declared entry by full `ResourceKey` | Must be registered by this `Registrum` or same registry |
| `getAll(ResourceKey<? extends Registry<R>> type)` | Gets all `RegistryEntry` objects registered by this `Registrum` in that registry | Returns a read-only view excluding external entries |
| `isRegistered(ResourceKey<? extends Registry<R>> type)` | Checks whether `RegisterEvent` has finished for the given registry | Useful for cross-registry ordering checks |

### Lifecycle Callbacks, Aliases & Error Handling

- `addRegisterCallback(String name, ResourceKey<? extends Registry<R>> registryType, NonNullConsumer<? super T> callback)`: fires after the entry named `name` is instantiated and registered in `RegisterEvent` (used internally by `Builder.onRegister(...)`). Dangling callbacks (calling `onRegister` without `.register()`) throw an exception when registration finishes.
- `addRegisterCallback(ResourceKey<? extends Registry<R>> registryType, Runnable callback)`: fires once the entire registry finishes registering.
- `addAlias(ResourceKey<? extends Registry<T>> registry, ResourceLocation oldName, ResourceLocation newName)`: registers a NeoForge Alias in the registry for a legacy ID so old-save blocks/items migrate seamlessly; normally use `.aliasFrom(oldNames)` on builders.
- `skipErrors(boolean skipErrors)`: in test/compat environments, logs errors instead of aborting load on entry creation/registration exceptions (keep `false` in production).
- `modifyCreativeModeTab(ResourceKey<CreativeModeTab> creativeModeTab, Consumer<CreativeModeTabModifier> modifier)`: runs custom creative tab modifiers in FIFO order during `BuildCreativeModeTabContentsEvent`.

### Language Helper Methods

Inject non-entry-specific translation keys into the default language provider anytime (typically during init or datagen setup):

- `addLang(String type, ResourceLocation id, String key)` -> returns a `MutableComponent` (key `type.namespace.path`).
- `addLang(String type, ResourceLocation id, String suffix, String key)` -> returns a `MutableComponent` with key `type.namespace.path.suffix`.
- `addRawLang(String key, String value)` -> adds an arbitrary key-value pair directly to the default English lang table (and auto-generates upside-down `en_ud`).

## Generic Builder System (`Builder` & `AbstractBuilder`)

All registration builders implement `Builder<R, T extends R, P, S extends Builder<R, T, P, S>>`, and most extend `AbstractBuilder`. `R` is the registry base type (`Block`), `T` is the concrete type (`MyBlock`), `P` is the parent (`Registrum` at top level, or outer `BlockBuilder` in nested chains), and `S` is self-type for fluent returns.

### Common Builder Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `register()` | `RegistryEntry<R, T>` (narrowed by subclasses) | Finalizes configuration, queues the entry with the owning `Registrum`, and returns the entry wrapper |
| `build()` | `P` | Calls `register()` and returns `getParent()`; used to exit child builders (`block.item()`, `block.blockEntity()`) back to the parent builder |
| `get()` / `getEntry()` | `RegistryEntry<R, T>` / `T` | Gets the handle or underlying instance after registration (`getEntry()` throws before registration) |
| `asSupplier()` | `NonNullSupplier<T>` | Returns a safe lazy `LazyRegistryEntry` without holding a reference to `Builder`, safe to capture in factory callbacks |
| `transform(NonNullFunction<S, S2> func)` | `S2` | Embeds a reusable helper config function in the fluent chain (e.g., shared block properties, tags, and models) |
| `onRegister(NonNullConsumer<? super T> callback)` | `S` | Fires immediately when the entry is registered in `RegisterEvent` (`T` is available, though some cross-registry objects may not be ready) |
| `onRegisterAfter(ResourceKey<? extends Registry<OR>> dependencyType, NonNullConsumer<? super T> callback)` | `S` | Waits until `dependencyType`'s registry also finishes registering before firing |
| `aliasFrom(ResourceLocation... oldNames)` | `S` | Declares historical registry names; derived entries (`BlockItem`, `SpawnEgg`, `Bucket`, `FluidType`, `Flowing`/`Source`) automatically inherit aliases if present |
| `tag(ProviderType<? extends TP> type, TagKey<R>... tags)` | `S` | Adds datagen tags for this entry (matching the tag provider type of `ProviderType`) |
| `asOptional()` | `S` | Emits subsequent tag references as optional (`TagEntry.optionalElement(id)`) to prevent tag load failures if absent |
| `removeTag(ProviderType<TP> type, TagKey<R>... tags)` | `S` | Removes specified tags previously added via the Builder |
| `lang(NonNullFunction<T, String> langKeyProvider)` | `S` | Binds a custom key extractor using the auto-converted English name from `RegistrumLangProvider#getAutomaticName` |
| `lang(NonNullFunction<T, String> langKeyProvider, String name)` | `S` | Explicitly binds a translation key extractor and text |
| `setData(ProviderType<? extends D> type, NonNullBiConsumer<DataGenContext<R, T>, D> cons)` | `S` | Sets (overwriting previous of the same type) the per-entry datagen callback |
| `addMiscData(ProviderType<? extends D> type, NonNullConsumer<? extends D> cons)` | `S` | Appends a general datagen task on this `Registrum` not tied to a single context |
| `dataMap(DataMapType<R, D> type, D val)` | `S` | Generates a constant NeoForge DataMap entry for this entry |
| `dataMap(DataMapType<R, D> type, NonNullFunction<DataGenContext<R, T>, D> factory)` | `S` | Dynamically builds a DataMap value using `DataGenContext` |
| `dataMap(DataMapType<R, D> type, NonNullBiFunction<DataGenContext<R, T>, HolderLookup.Provider, D> factory)` | `S` | Dynamically builds a DataMap value with `HolderLookup.Provider` |

## Entry Wrappers & Utilities

### `RegistryEntry` & Subtypes

`RegistryEntry<R, S extends R>` extends NeoForge's `DeferredHolder<R, S>` and implements `NonNullSupplier<S>`, so it can be passed directly anywhere a vanilla `Holder<R>`, `DeferredHolder<R, S>`, or `Supplier<S>` is expected.

- `getSibling(ResourceKey<? extends Registry<X>> registryType)` / `getSibling(Registry<X> registry)`: looks up a sibling entry with the same `modid` and path across registries (e.g., `ItemEntry` or `BlockEntityEntry` from `BlockEntry`).
- `filter(Predicate<R> predicate)`: returns `Optional.of(this)` if bound and matching `predicate`.
- `is(X entry)`: checks reference equality `get() == entry` (`FluidEntry` overrides to `get().isSame((Fluid) entry)`).
- `RegistryEntry.cast(Class, RegistryEntry)`: type-safe cast throwing a clear `IllegalArgumentException` on mismatch.

Specialized extensions for common game objects (each with convenience methods):

- `ItemProviderEntry<R extends ItemLike, T extends R>`: implements `ItemLike`, providing `asStack()`, `asStack(int count)`, `isIn(ItemStack)`, `is(Item)`, `asItem()`. Extended by both `BlockEntry` and `ItemEntry`.
- `LazyRegistryEntry<R, T>`: wrapper returned by `Builder.asSupplier()`; looks up `RegistryEntry` from `Registrum` on first `get()` and clears its strong reference to `Builder` for GC.
- `SelfEntry<T>`: equivalent subtype of `RegistryEntry<T, T>` returned by `SelfBuilder`, including `SoundEventEntry` and `PotionEntry`.

### Concurrency & Event Utilities

- `OneTimeEventReceiver`: registers one-shot listeners on the Mod bus or NeoForge bus (`addModListener` / `addForgeListener`), queuing if the ModBus isn't ready yet and auto-unregistering during `FMLLoadCompleteEvent`.
- `RegistrumDistExecutor`: lightweight side executor `unsafeRunWhenOn(Dist, Supplier<Runnable>)` using double-lambda lazy loading to prevent `ClassNotFoundException` on dedicated servers.
- `Sequence<T>`: lightweight fluent helper executing steps and evaluations in declaration order (`create()`, `run(Runnable)`, `next(Supplier<T>)`, `next(T)`).
- `DebugMarkers`: Log4j2 marker constants `DebugMarkers.REGISTER` (`"REGISTRATE.REGISTER"`) and `DebugMarkers.DATA` (`"REGISTRATE.DATA"`) for fine-grained registration and datagen log filtering.
