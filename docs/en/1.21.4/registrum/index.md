# Core Architecture: Registrum & RegistryEntry

`module.registrum` is AnvilLib's fluent registration and data generation framework for NeoForge (evolved from Registrate and extended for the AnvilCraft ecosystem). It collects **registry entries**, **registration callbacks**, **client extensions**, **creative tab entries**, and **datagen callbacks** through a single entry point and submits them in the proper Mod lifecycle events.

On this branch, `Registrum` runs on `net.neoforged.neoforge` 1.21.4: builders automatically call `properties.setId(getResourceKey())` when constructing vanilla objects, client extensions attach via `RegisterClientExtensionsEvent`, and datagen is driven by `GatherDataEvent.Client`.

## Quick Start & Full Example

The example below creates a static `Registrum` instance in a standalone mod and initializes it in the mod main class constructor.

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.Registrum;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "mymod";

    // Creating automatically registers listeners on the current ModContainer's EventBus
    public static final Registrum REGISTRUM = Registrum.create(MOD_ID);

    public MyMod(IEventBus modEventBus) {
        // Reference and load static registration classes to ensure classloading completes before RegisterEvent
        ModBlocks.register();
        ModItems.register();
        ModAttachments.register();
    }
}
```

### Grouping Related Entries (`object`)

Use `object(name)` to switch context to a shared name and chain-create blocks, items, or derived entries:

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntry;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

public class ModBlocks {
    public static final BlockEntry<Block> TITANIUM_BLOCK = MyMod.REGISTRUM
        .object("titanium_block")
        .block(Block::new)
        .properties(p -> p.strength(5.0F, 6.0F).sound(SoundType.METAL).requiresCorrectToolForDrops())
        .simpleItem()
        .register();

    public static void register() {
        // Trigger static field initialization
    }
}
```

> [!IMPORTANT]
> Be sure to trigger class initialization of all classes containing static `RegistryEntry` fields in your mod constructor or before `FMLCommonSetupEvent`. Calling `.register()` for the first time after `RegisterEvent` fires will fail to register and throw.

## Entry Classes: `Registrum` & `AbstractRegistrum<S>`

`Registrum` extends `AbstractRegistrum<Registrum>` and attaches internal listeners to the current Mod event bus. To customize event registration, extend `AbstractRegistrum<MyRegistrum>` and call `registerEventListeners(IEventBus)` manually.

### Core Lifecycle Methods

| Method / Field | Description |
| --- | --- |
| `Registrum.create(String modid)` | Creates an instance and automatically obtains the `IEventBus` from `ModList` to bind events |
| `AbstractRegistrum#registerEventListeners(IEventBus bus)` | Registers callbacks for `RegisterEvent` (including `EventPriority.LOWEST` late phase), `BuildCreativeModeTabContentsEvent`, `GatherDataEvent.Client`, and `FMLLoadCompleteEvent` |
| `AbstractRegistrum#getModid()` | Returns the namespace owned by this registrum |
| `AbstractRegistrum#object(String name)` | Sets the default registry name for subsequent chained calls, returning `this` (`S`) |
| `AbstractRegistrum#doDatagen()` | Returns `NonNullSupplier<Boolean>` indicating whether Datagen is currently running (`DatagenModLoader.isRunningDataGen()`) |
| `AbstractRegistrum#isRegistered(ResourceKey<? extends Registry<R>> type)` | Checks whether `RegisterEvent` has completed for the specified registry |
| `AbstractRegistrum#getDataGenInitializer()` | Returns `DataProviderInitializer` for registering dynamic datapack registries or adjusting provider dependencies |
| `AbstractRegistrum#getDataProvider(GeneratorType<P> type)` | Retrieves a built or active Provider / Generator instance by `GeneratorType` during Datagen |
| `AbstractRegistrum#get(ResourceKey<R>)` / `get(String name, ResourceKey<? extends Registry<R>>)` | Looks up a built `RegistryEntry<R, T>` by registry name |
| `AbstractRegistrum#getAll(ResourceKey<? extends Registry<R>>)` | Returns all `RegistryEntry` instances registered under that registry |

### Callbacks, Rename Aliases & Modifiers

| Method Signature | Purpose & Timing |
| --- | --- |
| `addRegisterCallback(String name, ResourceKey<? extends Registry<R>> registryType, NonNullConsumer<? super T> callback)` | Appends a registration callback for a specific entry (runs after `RegisterEvent` creates the object) |
| `addRegisterCallback(ResourceKey<? extends Registry<R>> registryType, Runnable callback)` | Appends a callback for an entire registry; runs after that registry fires and this registrum finishes submitting entries |
| `addAlias(ResourceKey<? extends Registry<R>> registryType, ResourceLocation oldName, ResourceLocation newName)` | Registers a legacy-to-new alias submitted to `Registry#addAlias` during `RegisterEvent` |
| `simple(P parent, String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<R> factory)` | Directly builds a no-config `NoConfigBuilder` for custom registries or generic objects |
| `generic(P parent, String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<T> factory)` | Registers a generic entry (returns `NoConfigBuilder<R, T, P>`) without requiring specialized subclasses |
| `modifyCreativeModeTab(ResourceKey<CreativeModeTab> tab, NonNullConsumer<CreativeModeTabModifier> modifier)` | Adds display items to a vanilla or custom creative tab |
| `addRawLang(String key, String value)` | Directly adds an arbitrary key-value translation to the lang generator (e.g., item tooltips or GUI text) |
| `addLang(String type, ResourceLocation id, String localizedName)` | Generates a `<type>.<namespace>.<path>` translation key and writes it to the lang table |
| `setDataGenerator(Builder<?, ?, ?, ?> builder, GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | Overwrites the datagen callback of `type` bound to a specific Builder |
| `addDataGenerator(GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | Appends a module-wide datagen callback without overwriting existing ones of the same type |

### Custom `AbstractRegistrum` Subclasses & Custom Registries

When a mod defines a custom `Registry<T>` and wants `Registrum` to manage its lifecycle, override `onRegister` or use the generic `generic(...)` method:

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.AbstractRegistrum;
import net.neoforged.bus.api.IEventBus;

public class MyRegistrum extends AbstractRegistrum<MyRegistrum> {
    protected MyRegistrum(String modid) {
        super(modid);
    }

    public static MyRegistrum create(String modid, IEventBus modBus) {
        MyRegistrum registrum = new MyRegistrum(modid);
        registrum.registerEventListeners(modBus);
        return registrum;
    }
}
```

## Builder Base: `Builder<R, T, P, S>` & `AbstractBuilder<R, T, P, S>`

All entity, block, item, fluid, and extension builders implement `Builder<R, T extends R, P, S extends Builder<R, T, P, S>>` and typically extend `AbstractBuilder`.

### `Builder` Core Fluent API

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `register()` | `RegistryEntry<R, T>` | Freezes and registers the builder with the parent `AbstractRegistrum`, returning a `RegistryEntry` representing the future entry |
| `build()` | `P` | Calls `register()` and returns `getParent()`, used to return to an outer builder in multi-level chains (e.g., `block().item().build()`) |
| `getOwner()` / `getParent()` / `getName()` | Corresponding object | Returns the owning registrum, outer parent builder, or current entry registry name (without namespace) |
| `getRegistryKey()` | `ResourceKey<? extends Registry<R>>` | Returns the target registry key (e.g., `Registries.BLOCK`) |
| `get()` / `getEntry()` | `RegistryEntry<R, T>` / `T` | Returns the wrapper or underlying vanilla object after registration (`getEntry()` throws if called before `RegisterEvent`) |
| `asSupplier()` | `NonNullSupplier<T>` | Returns a lazy supplier without strong references to the Builder itself (recommended for callbacks and recipes) |
| `aliasFrom(ResourceLocation... oldNames)` | `S` | Declares legacy names for this entry (callable multiple times); derived entries (`BlockItem`, `BlockEntityType`, fluid containers) inherit matching aliases |
| `asOptional()` | `S` | Marks the entry as optional when its registry supports optional/conditional entries |
| `onRegister(NonNullConsumer<? super T> callback)` | `S` | Runs custom initialization logic after the entry is instantiated and registered |
| `onRegisterAfter(ResourceKey<? extends Registry<OR>> dependencyType, NonNullConsumer<? super T> callback)` | `S` | Runs a callback after another registry `dependencyType` finishes registering (useful for cross-registry references) |
| `transform(NonNullFunction<S, S2> func)` | `S2` | Applies a reusable builder template function to extract common config into static helpers |
| `setData(GeneratorType<? extends D> type, NonNullBiConsumer<DataGenContext<R, T>, D> cons)` | `S` | Sets (overwriting) the datagen action bound to this entry's `DataGenContext` |
| `addMiscData(GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | `S` | Appends a free-form datagen action unrelated to a specific entry |
| `dataMap(DataMapType<R, D> type, D val)` | `S` | Writes a constant value to NeoForge's `DataMapProvider` |
| `dataMap(DataMapType<R, D> type, NonNullFunction<DataGenContext<R, T>, D> factory)` | `S` | Lazily computes a DataMap entry value via callback |
| `dataMap(DataMapType<R, D> type, NonNullBiFunction<DataGenContext<R, T>, HolderLookup.Provider, D> factory)` | `S` | Generates a DataMap entry when `HolderLookup.Provider` registry access is needed |
| `lang(NonNullFunction<T, String> langKeyProvider)` | `S` | Writes a translation key using the built-in auto-naming rule (`toEnglishName`) |
| `lang(NonNullFunction<T, String> langKeyProvider, String name)` | `S` | Explicitly sets the `en_us` name (and auto-mirrors `en_ud`) |
| `tag(ProviderType<? extends TP> type, TagKey<R>... tags)` | `S` | Adds this entry to the specified tag provider (e.g., `ProviderType.BLOCK_TAGS`) |
| `removeTag(ProviderType<TP> type, TagKey<R>... tags)` | `S` | Removes tags previously added (usually by default) to this entry |

### Example Using `transform` & `aliasFrom`

```java
public static <T extends Block, P> BlockBuilder<T, P> commonMetalBlock(BlockBuilder<T, P> builder) {
    return builder
        .properties(p -> p.strength(5.0F, 6.0F).sound(SoundType.METAL).requiresCorrectToolForDrops())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL);
}

public static final BlockEntry<Block> REFINED_ALLOY_BLOCK = MyMod.REGISTRUM
    .block("refined_alloy_block", Block::new)
    .transform(ModBlocks::commonMetalBlock)
    .aliasFrom(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "old_alloy_block"))
    .simpleItem()
    .register();
```

## Registration Wrappers: `RegistryEntry<R, S>` & Specialized Entries

Calling `.register()` does not return a raw instance, but a lazy proxy extending `RegistryEntry<R, S>` (backed by `DeferredHolder<R, S>`) implementing `NonNullSupplier<S>`.

### Common Methods: `RegistryEntry<R, S>`

| Method | Description |
| --- | --- |
| `get()` | Unwraps and returns the actual registry object; throws if the registry is not yet initialized |
| `getDelegate()` | Returns the underlying NeoForge `DeferredHolder<R, S>` |
| `getKey()` / `getId()` | Returns the `ResourceKey<R>` or `ResourceLocation` registry ID |
| `isBound()` | Checks whether the underlying `DeferredHolder` is bound to a valid instance |
| `asOptional()` | Returns `Optional.of(entry)` if bound, else `Optional.empty()` |
| `getSibling(ResourceKey<? extends Registry<X>> registryType)` | Looks up a sibling entry with the same registry name under the same Mod (e.g., finding the same-named `Item` or `BlockEntityType` from a `BlockEntry`) |
| `getSibling(Registry<X> registry)` | Same as above, taking a concrete `Registry` instance |
| `is(X entry)` | Identity-compares this entry with the given instance |
| `filter(Predicate<R> predicate)` | Applies `predicate` to the entry value, returning `Optional.of(this)` if satisfied |

### Derived Specialized Entry Types

| Class | Base / Extended Capabilities | Specialized Convenience Methods |
| --- | --- | --- |
| `ItemProviderEntry<R extends ItemLike, T extends R>` | `RegistryEntry<R, T>` (also implements `ItemLike`) | `asStack()`, `asStack(int count)`, `asItem()`, `isIn(ItemStack)`, `is(Item)` |
| `BlockEntry<T extends Block>` | `ItemProviderEntry<Block, T>` | `getDefaultState()`, `has(BlockState)`, `cast(RegistryEntry<Block, T>)` |
| `ItemEntry<T extends Item>` | `ItemProviderEntry<Item, T>` | `cast(RegistryEntry<Item, T>)` |
| `BlockEntityEntry<T extends BlockEntity>` | `RegistryEntry<BlockEntityType<?>, BlockEntityType<T>>` | `create(BlockPos, BlockState)`, `is(BlockEntity)`, `get(BlockGetter, BlockPos)` (returns `Optional<T>`), `getNullable(BlockGetter, BlockPos)`, `cast(...)` |
| `EntityEntry<T extends Entity>` | `RegistryEntry<EntityType<?>, EntityType<T>>` | `create(Level)`, `is(Entity)`, `cast(...)` |
| `FluidEntry<T extends BaseFlowingFluid>` | `RegistryEntry<Fluid, T>` | `getSource()`, `getType()`, `getBucket()`, `is(Fluid)`, `isSource(FluidState)`, `cast(...)` |
| `MenuEntry<T extends AbstractContainerMenu>` | `RegistryEntry<MenuType<?>, MenuType<T>>` | `create(int, Inventory)`, `asProvider()`, `open(ServerPlayer, Component)` and overloads with `Consumer<RegistryFriendlyByteBuf>` / `MenuConstructor` |
| `LazyRegistryEntry<R, T>` | `NonNullSupplier<T>` | Lazily wraps another `RegistryEntry` supplier and caches the result on first `get()` |
| `SelfEntry<T>` / `MobEffectEntry<T>` / `PotionEntry` / `SoundEventEntry` / `GameEventEntry` / `ConditionEntry<T>` / `AttachmentEntry<E>` / `DataComponentEntry<E>` / `RecipeEntry<T>` / `RecipeTypeEntry<T>` / `RecipeSerializerEntry<T>` / `BiomeModifierEntry<T>` / `GlobalLootModifierEntry<T>` / `StructureModifierEntry<T>` | `RegistryEntry` or composite wrapper | Provides type-safe aliases and `cast(...)` conversions for the respective registry entries; `RecipeEntry<T>` wraps both `RecipeTypeEntry<T>` and `RecipeSerializerEntry<T>` |

## `OneTimeEventReceiver`, `Sequence` & Debug Markers

When writing custom builders or cross-lifecycle event dispatch logic, `module.registrum` also provides lightweight utilities:

- **`OneTimeEventReceiver`**: static utility for registering **one-shot auto-unregistering** listeners on the Mod event bus (`addModListener`) or NeoForge game bus (`addForgeListener`), ensuring one-time events like `RegisterClientExtensionsEvent` or `EntityRenderersEvent.RegisterRenderers` never fire twice.
- **`RegistrumDistExecutor`**: replaces deprecated `DistExecutor`, providing `unsafeRunWhenOn(Dist, NonNullSupplier<Runnable>)` and `unsafeCallWhenOn(Dist, NonNullSupplier<Callable<T>>)` to isolate client-only renderer/extension registration code.
- **`Sequence<T>`**: thread-safe ordered container helper (implements `Iterable<T>`) with `Sequence.create()` and `add(T)` to keep registration order stable across generator chains and internal listener sorting.
- **`DebugMarkers`**: holds `Marker` constants (`REGISTER`, `DATA`, `ALIAS`, etc.) for Log4j trace-level filtering.
