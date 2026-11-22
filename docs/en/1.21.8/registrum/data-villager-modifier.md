# Villager, DataComponent, DataPredicate, Attachment & Modifier Builders

AnvilLib deeply extends Registrate to cover **DataComponent**, **DataComponentPredicate**, **Data Attachment** integrated with NeoForge native sync, **Villager** systems, and datapack world modifiers (**Biome / Loot / Structure Modifier**).

## Data Components (`DataComponentBuilder<E, P>`)

Safely stores serializable data on item stacks. `DataComponentBuilder` wraps `DataComponentType.builder()` and declares persistence and client sync via `persistent` and `networkSynchronized`.

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `AbstractRegistrum#dataComponent(String name)` | `DataComponentBuilder<E, S>` | Starts a generic component builder (explicit type args) |
| `AbstractRegistrum#dataComponent(String name, Class<E> clazz)` | `DataComponentBuilder<E, S>` | Passes a class token to help the compiler infer component value type `E` |
| `persistent(Codec<E> codec)` | `DataComponentBuilder<E, P>` | Specifies the `Codec<E>` for NBT/disk persistence |
| `networkSynchronized(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `DataComponentBuilder<E, P>` | Specifies the `StreamCodec` for client item network sync |
| `cacheEncoding()` | `DataComponentBuilder<E, P>` | Enables underlying encoding cache (maps to vanilla `DataComponentType.Builder#cacheEncoding()`, ideal for immutable values) |
| `register()` | `DataComponentEntry<E>` | Builds `DataComponentType<E>` and registers to `Registries.DATA_COMPONENT_TYPE` |

```java
public static final DataComponentEntry<Integer> ENERGY_STORED = MyMod.REGISTRUM
    .dataComponent("energy_stored", Integer.class)
    .persistent(Codec.INT)
    .networkSynchronized(ByteBufCodecs.VAR_INT)
    .cacheEncoding()
    .register();
```

## Data Component Predicates (`DataComponentPredicateBuilder<E, P>`)

Registers custom `DataComponentPredicate.Type<E>`s to `Registries.DATA_COMPONENT_PREDICATE_TYPE` for loot conditions, advancement triggers, and recipe matching.

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `AbstractRegistrum#dataComponentPredicate(String name)` | `DataComponentPredicateBuilder<E, S>` | Creates a data component predicate type builder |
| `AbstractRegistrum#dataComponentPredicate(String name, Class<E> clazz)` | `DataComponentPredicateBuilder<E, S>` | Passes a predicate class token to assist generic inference |
| `codec(Codec<E> codec)` | `DataComponentPredicateBuilder<E, P>` | **Required**: sets the `Codec<E>` for this predicate type (omitting throws `IllegalStateException("Codec is not set")` when building the entry) |
| `register()` | `DataComponentPredicateEntry<E>` | Creates `new DataComponentPredicate.Type<>(codec)` and returns the wrapper Entry; supports casting via `DataComponentPredicateEntry.cast(...)` |

```java
public record MinEnergyPredicate(int minEnergy) implements DataComponentPredicate {
    public static final Codec<MinEnergyPredicate> CODEC = Codec.INT.xmap(MinEnergyPredicate::new, MinEnergyPredicate::minEnergy);

    @Override
    public boolean matches(DataComponentGetter components) {
        Integer energy = components.get(ModComponents.ENERGY_STORED.get());
        return energy != null && energy >= minEnergy;
    }
}

public static final DataComponentPredicateEntry<MinEnergyPredicate> MIN_ENERGY = MyMod.REGISTRUM
    .dataComponentPredicate("min_energy", MinEnergyPredicate.class)
    .codec(MinEnergyPredicate.CODEC)
    .register();
```

## Data Attachments & Native Sync (`AttachmentBuilder<E, P>`)

`AttachmentBuilder` wraps NeoForge's `AttachmentType.Builder<E>` into a fluent chain unifying disk serialization (`MapCodec`), death persistence, and NeoForge's native `net.neoforged.neoforge.attachment.AttachmentSyncHandler<E>`.

### `AttachmentBuilder<E, P>` Full API

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `AbstractRegistrum#attachment(String name, Function<IAttachmentHolder, E> defaultValueSupplier)` | `AttachmentBuilder<E, S>` | Constructs default attachment values using the holder factory (e.g., reading entity context) |
| `AbstractRegistrum#attachment(String name, Supplier<E> defaultValueSupplier)` | `AttachmentBuilder<E, S>` | Constructs default attachment values via a no-arg supplier |
| `serialize(IAttachmentSerializer<E> serializer)` | `AttachmentBuilder<E, P>` | Registers a custom NeoForge `IAttachmentSerializer<E>` |
| `serialize(MapCodec<E> serializer)` | `AttachmentBuilder<E, P>` | Configures disk and NBT persistence using `MapCodec<E>` |
| `serialize(MapCodec<E> serializer, Predicate<? super E> shouldCopy)` | `AttachmentBuilder<E, P>` | Adds a predicate controlling whether to persist/copy alongside `MapCodec<E>` serialization |
| `copyOnDeath()` | `AttachmentBuilder<E, P>` | Preserves attachment data across player death/respawn (requires `serialize(...)`) |
| `copyHandler(IAttachmentCopyHandler<E> handler)` | `AttachmentBuilder<E, P>` | Customizes value copying during dimension travel, respawn, etc. |
| `sync(net.neoforged.neoforge.attachment.AttachmentSyncHandler<E> syncHandler)` | `AttachmentBuilder<E, P>` | Passes a native NeoForge `AttachmentSyncHandler<E>` for delta sync and player filtering |
| `sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | Syncs full data via `StreamCodec` to all clients tracking the target |
| `sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | Syncs only to clients matching `sendToPlayer` (e.g., `holder == player`), adapted internally to `AttachmentSyncHandler<E>` for `AttachmentType.Builder#sync(...)` |
| `register()` | `AttachmentEntry<E>` | Builds and registers `AttachmentType<E>` to `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` |

### Complete Synced Attachment Example

If you mutate fields inside a mutable attachment object directly instead of calling `holder.setData(...)`, call NeoForge's `holder.syncData(ModAttachments.MANA.get())` to push sync updates.

```java
package com.example.mymod;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.anvilcraft.lib.v2.registrum.util.entry.data.AttachmentEntry;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

public class ModAttachments {
    public record PlayerMana(int current, int max) {
        public static final MapCodec<PlayerMana> CODEC = RecordCodecBuilder.mapCodec(inst -> inst.group(
            Codec.INT.fieldOf("current").forGetter(PlayerMana::current),
            Codec.INT.fieldOf("max").forGetter(PlayerMana::max)
        ).apply(inst, PlayerMana::new));

        public static final StreamCodec<RegistryFriendlyByteBuf, PlayerMana> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, PlayerMana::current,
            ByteBufCodecs.VAR_INT, PlayerMana::max,
            PlayerMana::new
        );
    }

    public static final AttachmentEntry<PlayerMana> MANA = MyMod.REGISTRUM
        .attachment("mana", () -> new PlayerMana(100, 100))
        .serialize(PlayerMana.CODEC)
        .copyOnDeath()
        // Sync only to the owning player without leaking private values to other spectators
        .sync((holder, player) -> holder == player, PlayerMana.STREAM_CODEC)
        .register();

    public static void register() {
    }
}
```

## Villager System: `PoiType`, `VillagerProfession` & `VillagerType`

`VillagerProfessionBuilder` automatically uses `"entity." + owner.getModid() + ".villager." + name` as the display name translation key when constructing vanilla `VillagerProfession`.

| Builder | `AbstractRegistrum` Entry | Parameters |
| --- | --- | --- |
| `PoiTypeBuilder<P>` | `poiType(String name, NonNullSupplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` | Registers workstation block state sets, max villager claim tickets, and search radius |
| `VillagerProfessionBuilder<P>` | `villagerProfession(String name, ResourceKey<PoiType> jobSite, ...)` | Supports `heldJobSite` predicate, `acquirableJobSite` predicate, extra tool/harvestable block `ImmutableSet`, and work `SoundEvent` |
| `VillagerTypeBuilder<P>` | `villagerType(String name)` | Registers custom biome villager outfit types |

```java
public static final RegistryEntry<PoiType, PoiType> FORGE_MASTER_POI = MyMod.REGISTRUM
    .poiType("forge_master_poi", () -> Set.copyOf(ModBlocks.PROCESSING_MACHINE.get().getStateDefinition().getPossibleStates()), 1, 1)
    .register();

public static final RegistryEntry<VillagerProfession, VillagerProfession> FORGE_MASTER = MyMod.REGISTRUM
    .villagerProfession(
        "forge_master",
        FORGE_MASTER_POI.getKey(),
        ImmutableSet.of(),
        ImmutableSet.of(),
        SoundEvents.ANVIL_USE
    )
    .lang("Forge Master")
    .register();
```

## World Modifiers (Biome / Loot / Structure Modifiers)

| Builder | `AbstractRegistrum` Entry | Target Registry & Purpose |
| --- | --- | --- |
| `BiomeModifierBuilder<T, P>` | `biomeModifier(String name, MapCodec<T> codec)` | Registers custom biome modifier codecs to `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` (returns `BiomeModifierEntry<T>`) |
| `GlobalLootModifierBuilder<T, P>` | `globalLootModifier(String name, MapCodec<T> codec)` | Registers global loot modifier codecs to `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` (returns `GlobalLootModifierEntry<T>`) |
| `StructureModifierBuilder<T, P>` | `structureModifier(String name, MapCodec<T> codec)` | Registers structure modifier codecs to `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` (returns `StructureModifierEntry<T>`) |
