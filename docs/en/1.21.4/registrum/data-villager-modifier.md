# Villager, Biome, DataComponent, Attachment & Modifier Builders

AnvilLib deeply extends Registrate to cover NeoForge **DataComponent**, **Data Attachment** with automatic network sync, **Villager** systems, and datapack world modifiers (**Biome / Loot / Structure Modifier**).

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

## Data Attachments & Active Sync (`AttachmentBuilder` & `AttachmentSync`)

NeoForge's native `AttachmentType` in Minecraft 1.21.4 does not directly provide full automatic cross-entity/chunk network sync infrastructure. AnvilLib includes a complete attachment sync system in `module.registrum` powered by Mixins (`AttachmentHolderMixin`, `ChunkMapAccessor`, `TrackedEntityAccessor`), automatically pushing attachments on `Entity`, `BlockEntity`, `LevelChunk`, and `Level` to clients.

### `AttachmentBuilder<E, P>` Full API

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `AbstractRegistrum#attachment(String name, Function<IAttachmentHolder, E> const_)` | `AttachmentBuilder<E, S>` | Constructs default attachment values using the holder factory (e.g., reading entity context) |
| `AbstractRegistrum#attachment(String name, Supplier<E> const_)` | `AttachmentBuilder<E, S>` | Constructs default attachment values via a no-arg supplier |
| `serialize(IAttachmentSerializer<?, E> serializer)` | `AttachmentBuilder<E, P>` | Registers a custom NeoForge serializer |
| `serialize(Codec<E> codec)` | `AttachmentBuilder<E, P>` | Configures disk serialization directly using `Codec<E>` |
| `serialize(Codec<E> codec, Predicate<? super E> shouldCopy)` | `AttachmentBuilder<E, P>` | Adds a predicate controlling whether to serialize/clone alongside `Codec<E>` |
| `copyOnDeath()` | `AttachmentBuilder<E, P>` | Preserves attachment data across player death/respawn (requires `serialize(...)`) |
| `copyHandler(IAttachmentCopyHandler<E> handler)` | `AttachmentBuilder<E, P>` | Customizes value copying during dimension travel, respawn, etc. |
| `sync(AttachmentSyncHandler<E> syncHandler)` | `AttachmentBuilder<E, P>` | Registers a fully controllable sync handler (see interface definition below) |
| `sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | Syncs full data via simplified `StreamCodec` to all clients tracking the target |
| `sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | Syncs only to players matching visibility/permission filters (e.g., `holder == player` for owner-only) |
| `register()` | `AttachmentEntry<E>` | Registers the handler with `AttachmentSync` while creating `AttachmentType<E>` |

### `AttachmentSyncHandler<T>` & `AttachmentSync` Core Interfaces

To differentiate encoding by `initialSync` (initial join/track vs runtime incremental updates) or send only diffed fields, implement `AttachmentSyncHandler<T>` directly:

```java
public interface AttachmentSyncHandler<T> {
    /** Return whether the target client player should receive this attachment update; defaults to true */
    default boolean sendToPlayer(IAttachmentHolder holder, ServerPlayer to) {
        return true;
    }

    /** Write to network packet buffer (max 1 MiB per payload) */
    void write(RegistryFriendlyByteBuf buf, T attachment, boolean initialSync);

    /** Read and deserialize on the client, optionally mutating previousValue in place; return null to keep existing/skip write */
    @Nullable
    T read(IAttachmentHolder holder, RegistryFriendlyByteBuf buf, @Nullable T previousValue);
}
```

#### When Does Sync Happen Automatically vs Manually?

`AttachmentSync` automatically listens to these server events and pushes synced attachments over channel `anvillib_registrum:attachments`:
- **Initial tracking / login / dimension change / respawn**: `PlayerEvent.StartTracking` (entities), `ChunkWatchEvent.Sent` (chunks and all `BlockEntity`s inside with Sync attachments), `PlayerLoggedInEvent`, `PlayerChangedDimensionEvent`, `PlayerRespawnEvent` (current level and player).
- **When `IAttachmentHolder#setData(...)` mutates data**: `AttachmentHolderMixin` intercepts all writes to attachments registered in `AttachmentSync` and triggers an incremental push on the server.
- **Manual trigger (when mutating fields inside a mutable object without calling `setData`)**:

```java
// Trigger incremental sync (initial = false)
AttachmentSync.syncData(player, ModAttachments.MANA_POOL.get());

// Or explicitly specify whether it is an initial full sync
AttachmentSync.syncData(blockEntity, ModAttachments.MACHINE_CONFIG.get(), false);
```

To register a third-party `AttachmentType` directly outside `AttachmentBuilder`, call `AttachmentSync.register(AttachmentType<T> type, AttachmentSyncHandler<T> handler)` (each type may only be registered once).

### Complete Synced Attachment Example

```java
public class ModAttachments {
    public record PlayerMana(int current, int max) {
        public static final Codec<PlayerMana> CODEC = RecordCodecBuilder.create(inst -> inst.group(
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

| Builder | `AbstractRegistrum` Entry | Parameters |
| --- | --- | --- |
| `PoiTypeBuilder<P>` | `poiType(String name, NonNullSupplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` | Registers workstation block state sets (e.g., profession job site), max villager claim tickets, and search radius |
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

## Dynamic Biomes & World Modifiers (Biome & Modifiers)

| Builder | `AbstractRegistrum` Entry | Target Registry & Purpose |
| --- | --- | --- |
| `BiomeBuilder<P>` | `biome(String name, NonNullSupplier<Biome> factory)` | Registers a statically built `Biome` entry, returning `RegistryEntry<Biome, Biome>` (note: modern worldgen prefers generating `Biome`s as Datapack JSON via `ProviderType.DYNAMIC`) |
| `BiomeModifierBuilder<T, P>` | `biomeModifier(String name, MapCodec<T> mapCodec)` | Registers custom biome modifier codecs to `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` (returns `BiomeModifierEntry<T>`) |
| `GlobalLootModifierBuilder<T, P>` | `globalLootModifier(String name, MapCodec<T> codec)` | Registers global loot modifier codecs to `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` (returns `GlobalLootModifierEntry<T>`) |
| `StructureModifierBuilder<T, P>` | `structureModifier(String name, MapCodec<T> codec)` | Registers structure modifier codecs to `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` (returns `StructureModifierEntry<T>`) |
