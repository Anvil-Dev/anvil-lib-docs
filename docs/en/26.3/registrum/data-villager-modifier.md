# Data Components, Attachments, Recipes, Villagers & Modifiers (`data` / `villager` / `modifier` / `recipe`)

<BranchContextCard branch="26.3" />

In Minecraft 1.21+ / 26.3, items and block entities rely heavily on Data Components (`DataComponentType`) and NeoForge Data Attachments (`AttachmentType`), while worldgen and loot use modifiers (`BiomeModifier` / `GlobalLootModifier` / `StructureModifier`). `module.registrum` provides out-of-the-box fluent builders for these NeoForge 26.3 core registries.

---

## 1. Data Component & Component Predicate Builders (`DataComponentBuilder` / `DataComponentPredicateBuilder`)

### 1. Problem & Usage

- **`DataComponentBuilder<E, P>`**: Created via `REGISTRUM.dataComponent("name")` (or `REGISTRUM.dataComponent("name", MyData.class)`), fluently configuring `persistent(Codec)`, `networkSynchronized(StreamCodec)`, `cacheEncoding()`, and `ignoreSwapAnimation()`, returning `DataComponentEntry<E>`.
- **`DataComponentPredicateBuilder<E, P>`**: Created via `REGISTRUM.dataComponentPredicate("name")`, configuring `codec(Codec<E>)` which is automatically wrapped as `new DataComponentPredicate.ConcreteType<>(codec)` and registered to `Registries.DATA_COMPONENT_PREDICATE_TYPE`, returning `DataComponentPredicateEntry<E>`.

### 2. Code Example

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.mojang.serialization.Codec;
import dev.anvilcraft.lib.v2.registrum.util.entry.data.DataComponentEntry;
import net.minecraft.network.codec.ByteBufCodecs;

public final class ModDataComponents {
    // Register a persistent, network-synced integer charge-level data component
    public static final DataComponentEntry<Integer> CHARGE_LEVEL = MyMod.REGISTRUM
        .<Integer>dataComponent("charge_level")
        .persistent(Codec.INT)
        .networkSynchronized(ByteBufCodecs.VAR_INT)
        .cacheEncoding()
        .ignoreSwapAnimation()
        .register();
}
```

### 3. API Reference Table

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| `DataComponentBuilder<E, P>` | • `persistent(Codec<E> codec)`<br>• `networkSynchronized(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)`<br>• `cacheEncoding()`<br>• `ignoreSwapAnimation()`<br>• `DataComponentEntry<E> register()` | Wraps vanilla `DataComponentType.Builder<E>` and registers to `Registries.DATA_COMPONENT_TYPE`. |
| `DataComponentPredicateBuilder<E, P>` | • `codec(Codec<E> codec)`<br>• `DataComponentPredicateEntry<E> register()` | Registers to `Registries.DATA_COMPONENT_PREDICATE_TYPE`. Throws `IllegalStateException("Codec is not set")` in `createEntry()` if `codec(...)` was not called. |

---

## 2. NeoForge Data Attachment Builder (`AttachmentBuilder`)

### 1. Code Example

Use `REGISTRUM.attachment(name, defaultValueSupplier)` (or the overload taking `Function<IAttachmentHolder, E>`) to register data attachments for chunks, entities, block entities, or levels to `NeoForgeRegistries.Keys.ATTACHMENT_TYPES`:

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.mojang.serialization.Codec;
import dev.anvilcraft.lib.v2.registrum.util.entry.data.AttachmentEntry;
import net.minecraft.network.codec.ByteBufCodecs;

public final class ModAttachments {
    public static final AttachmentEntry<Integer> PLAYER_MANA = MyMod.REGISTRUM
        .attachment("player_mana", () -> 100)
        .serialize(Codec.INT.fieldOf("mana"))
        .copyOnDeath()
        .sync((holder, toPlayer) -> holder == toPlayer, ByteBufCodecs.VAR_INT)
        .register();
}
```

### 2. `AttachmentBuilder<E, P>` API Table

| Method Signature | Description |
| :--- | :--- |
| `serialize(IAttachmentSerializer<E> serializer)` | Persists the attachment using a custom `IAttachmentSerializer`. |
| `serialize(MapCodec<E> serializer)`<br>`serialize(MapCodec<E> serializer, Predicate<? super E> shouldSerialize)` | Persists the attachment using a `MapCodec<E>` (optionally with a predicate controlling when to write to disk). |
| `copyOnDeath()`<br>`copyHandler(IAttachmentCopyHandler<E> cloner)` | Preserves attachment data across player respawn or dimension travel, or specifies a custom copy handler. |
| `sync(AttachmentSyncHandler<E> syncHandler)`<br>`sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)`<br>`sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | Configures server-to-client automatic attachment sync with a stream codec and target player filter. |
| `AttachmentEntry<E> register()` | Finalizes building and returns `AttachmentEntry<E>`. |

---

## 3. Coupled RecipeType & RecipeSerializer Registration (`RecipeTypeBuilder` / `RecipeSerializerBuilder` / `RecipeEntry`)

In vanilla, adding a custom recipe type requires separately registering `RecipeType<T>` to `Registries.RECIPE_TYPE` and `RecipeSerializer<T>` to `Registries.RECIPE_SERIALIZER`.

Calling `REGISTRUM.recipe(String name, MapCodec<T> codec, StreamCodec<RegistryFriendlyByteBuf, T> streamCodec)` **creates and registers both `RecipeTypeBuilder` and `RecipeSerializerBuilder` under the same name at once**, returning `RecipeEntry<T>(RecipeTypeEntry<T> type, RecipeSerializerEntry<T> serializer)`:

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.example.mymod.recipe.GrindingRecipe;
import dev.anvilcraft.lib.v2.registrum.util.entry.RecipeEntry;

public final class ModRecipeTypes {
    public static final RecipeEntry<GrindingRecipe> GRINDING = MyMod.REGISTRUM.recipe(
        "grinding",
        GrindingRecipe.MAP_CODEC,
        GrindingRecipe.STREAM_CODEC
    );
    // Access RecipeType via GRINDING.type().get() and RecipeSerializer via GRINDING.serializer().get()
}
```

---

## 4. Villager POI, Profession & Type Builders (`villager`)

Located in `dev.anvilcraft.lib.v2.registrum.builders.villager`, providing three villager builders (all extending `SelfBuilder` and returning `SelfEntry<T>`):

| Builder Class | `REGISTRUM` Entry Method Signature | Description |
| :--- | :--- | :--- |
| **`PoiTypeBuilder<P>`** | `REGISTRUM.poi(String name, Supplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` | Registers a `PoiType` for a workstation block state set to `Registries.POINT_OF_INTEREST_TYPE`. |
| **`VillagerProfessionBuilder<P>`** | • `REGISTRUM.profession(String name, Predicate<Holder<PoiType>> heldJobSite, Predicate<Holder<PoiType>> acquirableJobSite, ImmutableSet<Item> requestedItems, ImmutableSet<Block> secondaryPoi, @Nullable SoundEvent workSound, Int2ObjectMap<ResourceKey<TradeSet>> tradeSetsByLevel)`<br>• Plus convenience overloads omitting `requestedItems` / `secondaryPoi` or accepting `ResourceKey<PoiType> jobSite` | Registers a villager profession to `Registries.VILLAGER_PROFESSION` (adapted to Minecraft 26.3's `Int2ObjectMap<ResourceKey<TradeSet>>` trade set structure, auto-binding translation key `"entity.<modid>.villager.<name>"`). |
| **`VillagerTypeBuilder<P>`** | `REGISTRUM.villager(String name)` | Registers a biome villager appearance type `new VillagerType()` to `Registries.VILLAGER_TYPE`. |

---

## 5. Biome, Global Loot & Structure Modifier Builders (`modifier`)

Located in `dev.anvilcraft.lib.v2.registrum.builders.modifier`, for registering NeoForge's three datapack modifier codecs:

| Builder & Return Entry | `REGISTRUM` Entry Method Signature | Target Registry |
| :--- | :--- | :--- |
| **`BiomeModifierBuilder<T, P>`**<br>→ `BiomeModifierEntry<T>` | `REGISTRUM.biomeModifier(String name, MapCodec<T> codec)` | `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` |
| **`GlobalLootModifierBuilder<T, P>`**<br>→ `GlobalLootModifierEntry<T>` | `REGISTRUM.glm(String name, MapCodec<T> codec)` | `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` |
| **`StructureModifierBuilder<T, P>`**<br>→ `StructureModifierEntry<T>` | `REGISTRUM.structureModifier(String name, MapCodec<T> codec)` | `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` |

> **Note on `BiomeBuilder.java`**: `dev.anvilcraft.lib.v2.registrum.builders.BiomeBuilder` in the source is an archived Forge 1.16-era file (completely commented out); in Minecraft 26.3, biomes belong to a datapack registry (`Registries.BIOME`), so use `DataProviderInitializer#add(Registries.BIOME, bootstrap)` (covered in the next page) and `BiomeModifierBuilder` to generate and modify biomes.
