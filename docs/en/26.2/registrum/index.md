# Registrum Registration & Datagen System: Core Architecture (`module.registrum`)

<BranchContextCard branch="26.2" />

`module.registrum` (artifact `anvillib-registrum-neoforge-26.2`, package `dev.anvilcraft.lib.v2.registrum`) is a one-stop fluent registration and data generation framework heavily adapted from [Registrate](https://github.com/IThundxr/Registrate) for Minecraft 26.2 / NeoForge 26.2.

In traditional NeoForge development, adding a single block requires boilerplate across many files: `DeferredRegister<Block>`, `DeferredRegister<Item>`, `BlockEntityType`, blockstate/model provider, item model provider, loot table provider, tag provider, and English language provider. `Registrum` consolidates all of these into one fluent Builder chain, automatically firing registration and datagen during `RegisterEvent` and `GatherDataEvent.Client`.

In addition, AnvilLib's `Registrum` extends Registrate with many specialized builders and client features:
- **Creative Tab Section Banners (`CreativeTabSections` / `CreativeTabSection`) & 4×4 Variant Picker Overlay (`CreativeVariantPickerRegistry` / `CreativeVariantPickerOverlay`)**;
- **Full suite of NeoForge 26.2 specialized builders**: `DataComponentBuilder`, `DataComponentPredicateBuilder`, `AttachmentBuilder`, `RecipeTypeBuilder` / `RecipeSerializerBuilder`, `ConditionBuilder`, `BiomeModifierBuilder`, `GlobalLootModifierBuilder`, `StructureModifierBuilder`, `SoundEventBuilder`, `PotionBuilder`, `MobEffectBuilder`, `GameEventBuilder`, `PoiTypeBuilder` / `VillagerProfessionBuilder` / `VillagerTypeBuilder`, and `BiomeBuilder`;
- **Automatic alias mapping on rename (`aliasFrom` / `addAlias`)**: automatically aliases derived `BlockItem`, `BlockEntityType`, spawn eggs, or fluid buckets when a block/fluid is renamed.

This module is split into 6 sub-documents by functional domain:
- **This page (Core Architecture: `Registrum` & `RegistryEntry`)**: Covers `Registrum`, `AbstractRegistrum`, `Builder`, `AbstractBuilder`, `NoConfigBuilder`, `SelfBuilder`, `BuilderCallback`, `RegistryEntry`, `LazyRegistryEntry`, `OneTimeEventReceiver`, `RegistrumDistExecutor`, and `Sequence`.
- **[Block & BlockEntity Builders](./block-and-be)**: Covers `BlockBuilder`, `BlockEntry`, `BlockEntityBuilder`, `BlockEntityEntry`.
- **[Item, CreativeTab & Variant Selectors](./item-and-creativetab)**: Covers `ItemBuilder`, `ItemEntry`, `ItemProviderEntry`, `CreativeTabBuilder`, `CreativeModeTabModifier`, `CreativeTabSection` / `CreativeTabSections`, and `CreativeVariantPicker*`.
- **[Entity, Fluid, Menu, MobEffect & Sound Builders](./entity-fluid-menu)**: Covers `EntityBuilder`, `FluidBuilder`, `MenuBuilder`, `MobEffectBuilder`, `PotionBuilder`, `SoundEventBuilder`, `GameEventBuilder`, and `ConditionBuilder`.
- **[Villager, Biome, DataComponent, Attachment & Modifier Builders](./data-villager-modifier)**: Covers `DataComponentBuilder`, `DataComponentPredicateBuilder`, `AttachmentBuilder`, `RecipeTypeBuilder` / `RecipeSerializerBuilder`, villager builders, `BiomeBuilder`, and the three Modifier builders.
- **[Datagen Integration: Models, Recipes, Loot, Tags & Lang](./datagen-providers)**: Covers `ProviderType`, `GeneratorType`, `DataGenContext`, `DataProviderInitializer`, `DataIngredient`, and all `Registrum*Provider` classes.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.2`, this module is included automatically. To depend on `registrum` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-26.2:2.0.0")
}
```

---

## 2. Quick Start & Full Code Example

```java
package com.example.mymod;

import com.example.mymod.init.ModBlocks;
import com.example.mymod.init.ModCreativeTabs;
import com.example.mymod.init.ModItems;
import dev.anvilcraft.lib.v2.registrum.Registrum;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";

    // 1. Create the Registrum singleton bound to modId (auto-registers listeners on ModContainer.getEventBus())
    public static final Registrum REGISTRUM = Registrum.create(MOD_ID);

    public MyMod() {
        // 2. Trigger static initialization of each registration class in order
        ModCreativeTabs.register();
        ModItems.register();
        ModBlocks.register();
    }
}
```

---

## 3. Core Classes & Interfaces API Reference

### 1. `Registrum` & `AbstractRegistrum<S>` (Central Registration & Datagen Hub)

`Registrum` extends `AbstractRegistrum<Registrum>`.

| Category | Method Signatures | Description & Boundary Behavior |
| :--- | :--- | :--- |
| **Creation & Bus Binding** | `public static Registrum create(String modid)`<br>`public S registerEventListeners(IEventBus bus)` | Creates a `Registrum` instance, obtains the Mod event bus via `ModList.get().getModContainerById(modid)`, and registers listeners for `RegisterEvent`, `BuildCreativeModeTabContentsEvent`, `FMLCommonSetupEvent`, and (during DataGen) `GatherDataEvent.Client`. |
| **Current Name State** | `public S object(String name)`<br>`protected String currentName()` | Sets the default registry name `currentName` for subsequent unnamed builders (e.g., `.block(factory)`, `.item(factory)`). Note: `AbstractRegistrum` is not thread-safe; initialize registration classes sequentially on the main thread. |
| **Default Creative Tab** | `public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab)`<br>`public S defaultCreativeTab(RegistryEntry<CreativeModeTab, CreativeModeTab> tab)`<br>`public S modifyCreativeModeTab(ResourceKey<CreativeModeTab>, Consumer<CreativeModeTabModifier>)` | Sets the default `CreativeModeTab` for subsequent `ItemBuilder`s (initially `CreativeModeTabs.SEARCH`), or appends a modifier callback to a tab. |
| **Custom Registries** | `public <R> ResourceKey<Registry<R>> makeRegistry(String name, Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder)`<br>`public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec)`<br>`public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec, @Nullable Codec<R> networkCodec)` | Listens to `NewRegistryEvent` to create standard registries, or `DataPackRegistryEvent.NewRegistry` to create datapack registries (with optional client-sync `networkCodec`). |
| **Legacy ID Aliasing** | `public <R> S addAlias(ResourceKey<? extends Registry<R>> registryType, Identifier oldName, Identifier newName)` | Registers an old-to-new alias via `Registry#addAlias` during `onRegisterLate` when blocks or items are renamed, preventing missing blocks/items in old saves (prefer `.aliasFrom(oldId)` on builders). |
| **Registered Entry Lookup** | `public <R, T extends R> RegistryEntry<R, T> get(ResourceKey<? extends Registry<R>> type)`<br>`public <R, T extends R> RegistryEntry<R, T> get(String name, ResourceKey<? extends Registry<R>> type)`<br>`public <R, T extends R> Optional<RegistryEntry<R, T>> getOptional(String name, ResourceKey<? extends Registry<R>> type)`<br>`public <R, T extends R> Collection<RegistryEntry<R, T>> getAll(ResourceKey<? extends Registry<R>> type)` | Queries `RegistryEntry` objects declared on this `Registrum` instance (e.g., fetching the derived `BlockItem` created by `BlockBuilder#simpleItem()`). |
| **Registration Callbacks** | `public <R, T extends R> S addRegisterCallback(String name, ResourceKey<? extends Registry<R>> registryType, NonNullConsumer<? super T> callback)`<br>`public <R> S addRegisterCallback(ResourceKey<? extends Registry<R>> registryType, Runnable callback)`<br>`public <R> boolean isRegistered(ResourceKey<? extends Registry<R>> registryType)` | Registers a callback fired when a single entry or entire registry finishes registering (fired in `onRegisterLate` at `EventPriority.LOWEST`). Note: in dev environments, dangling callbacks (registered without ever calling `.register()`) throw `IllegalStateException` during `onRegister`. |
| **Language & Datagen** | `public MutableComponent addLang(String type, Identifier id, String localizedName)`<br>`public MutableComponent addLang(String type, Identifier id, String suffix, String localizedName)`<br>`public MutableComponent addRawLang(String key, String value)`<br>`public <T> S addDataGenerator(GeneratorType<? extends T> type, NonNullConsumer<? extends T> cons)`<br>`public <P, R> S setDataGenerator(...)`<br>`public <P> Optional<P> getDataProvider(GeneratorType<P> type)`<br>`public DataProviderInitializer getDataGenInitializer()` | Injects custom translation keys into `ProviderType.LANG` and returns the `MutableComponent`, or registers global DataGen callbacks not tied to a specific entry (global recipes, global lang keys). |
| **Builder Entry Points** | `simple(...)` / `generic(...)`<br>`item(...)` / `block(...)` / `blockEntity(...)`<br>`entity(...)` / `fluid(...)` / `menu(...)`<br>`creativeTab(...)` / `defaultCreativeTab(...)`<br>`attachment(...)` / `dataComponent(...)` / `dataComponentPredicate(...)`<br>`biomeModifier(...)` / `glm(...)` / `structureModifier(...)`<br>`condition(...)` / `soundEvent(...)` / `recipe(...)`<br>`gameEvent(...)` / `potion(...)` / `mobEffect(...)`<br>`poiType(...)` / `villagerProfession(...)` / `villagerType(...)` / `biome(...)` | Starts a fluent Builder for the corresponding registry type (see subsequent sub-pages for details). |

### 2. `Builder<R, T, P, S>` & `AbstractBuilder<R, T, P, S>` (Builder Base)

All concrete builders (such as `BlockBuilder` and `ItemBuilder`) implement `Builder` and extend `AbstractBuilder`.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `RegistryEntry<R, T> register()` | `RegistryEntry<R, T>` | Finalizes building, queues the entry with `AbstractRegistrum` for deferred registration, and returns the `RegistryEntry` handle. |
| `default P build()` | `P` (parent) | Calls `register()` and returns `getParent()` (e.g., in `BlockBuilder.item()...build()`, returns to the outer `BlockBuilder`). |
| `default <D> S setData(GeneratorType<? extends D> type, NonNullBiConsumer<DataGenContext<R, T>, D> cons)` | `S` | Sets the datagen callback for `GeneratorType` (**calling multiple times for the same `type` overwrites the previous callback**, useful for overriding default models or loot tables). |
| `default <D> S addMiscData(GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | `S` | Appends a datagen callback without overwriting previous ones. |
| `default <D> S dataMap(DataMapType<R, D> type, D val)` (and `NonNullFunction` / `NonNullBiFunction` overloads) | `S` | Generates NeoForge DataMap entries for this entry (furnace burn times, compost chances, oxidization/waxing tables, etc.). |
| `public final <TP extends TagsProvider<R> & RegistrumTagsProvider<R>> S tag(ProviderType<? extends TP> type, TagKey<R>... tags)`<br>`public final <TP extends ...> S removeTag(ProviderType<TP> type, TagKey<R>... tags)`<br>`public S asOptional()` | `S` | Binds or removes tags for this entry. If `asOptional()` is called, the entry is written as optional (`"required": false`) in generated tag JSONs. |
| `public S lang(NonNullFunction<T, String> langKeyProvider)`<br>`public S lang(NonNullFunction<T, String> langKeyProvider, String name)` | `S` | Configures language translation generation for this entry (the 1-arg overload converts the registry name to a Title Cased English phrase). |
| `public S aliasFrom(Identifier... oldNames)` | `S` | Declares legacy registry names for this entry. On `register()`, automatically registers `Registry#addAlias` for itself and derived entries (`BlockItem`, `BlockEntityType`, spawn eggs, fluid buckets). |
| `default S onRegister(NonNullConsumer<? super T> callback)`<br>`default <OR> S onRegisterAfter(ResourceKey<? extends Registry<OR>> dependencyType, NonNullConsumer<? super T> callback)` | `S` | Registers a callback fired after this entry is instantiated in `RegisterEvent` (`onRegisterAfter` waits until `dependencyType` finishes registering). |
| `default <R2, T2 extends R2, P2, S2 extends Builder<R2, T2, P2, S2>> S2 transform(NonNullFunction<S, S2> func)` | `S2` | Applies a reusable external builder transformation function (e.g., shared property presets) inline in the chain. |
| `getOwner()` / `getParent()` / `getName()` / `getRegistryKey()` / `getResourceKey()` / `asSupplier()` / `get()` / `getEntry()` | Corresponding type | Returns the owning `Registrum`, parent, name, registry key, `ResourceKey<R>`, `LazyRegistryEntry` (holding no strong reference to `Builder`), or registered instance. |

### 3. `NoConfigBuilder`, `SelfBuilder` & `RegistryEntry` Hierarchy

| Class | Signature & Core Methods | Description |
| :--- | :--- | :--- |
| `NoConfigBuilder<R, T, P>` | `extends AbstractBuilder<R, T, P, NoConfigBuilder<R, T, P>>` | For simple registry entries needing no specialized builder methods (created via `registrum.generic(...)` or `registrum.simple(...)`). |
| `SelfBuilder<T, P, S>` | `extends AbstractBuilder<T, T, P, S>` | Builder base where the registry base type `R` equals the concrete entry type `T` (e.g., `PotionBuilder`, `SoundEventBuilder`); `register()` returns `SelfEntry<T>`. |
| `RegistryEntry<R, S extends R>` | `extends DeferredHolder<R, S> implements NonNullSupplier<S>` | Wraps NeoForge's `DeferredHolder<R, S>`, adding:<br>• `<X, Y extends X> RegistryEntry<X, Y> getSibling(ResourceKey<? extends Registry<X>> registryType)` / `getSibling(Registry<X>)`: gets a same-named sibling entry (e.g., `Item` or `BlockEntityType` from a `BlockEntry`);<br>• `Optional<RegistryEntry<R, S>> filter(Predicate<R> predicate)`;<br>• `<X> boolean is(X entry)`: checks `get() == entry`. |
| `LazyRegistryEntry<R, T>` | `implements NonNullSupplier<T>` | Clears its internal `supplier` to `null` after resolving `RegistryEntry` on first `get()`, releasing build-time `Builder` references for GC. |
| `OneTimeEventReceiver<T>` | `addModListener(...)` / `addForgeListener(...)` / `unregister(...)` | (`@ApiStatus.Internal`) One-shot event receiver: uses `AtomicBoolean` to ensure a listener runs at most once, and unregisters from the event bus on `FMLLoadCompleteEvent` so startup listeners do not stay resident. |
| `Sequence<T>` | `Sequence.create()` / `run(Runnable)` / `next(Supplier<T>)` / `next(T)` | Fluent helper for executing a sequence of initialization actions or expressions. |
