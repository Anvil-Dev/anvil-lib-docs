# Data Components, Attachments, Recipe Types, Modifiers & Villagers

Beyond blocks, items, and entities, `module.registrum` provides lightweight builders for NeoForge 1.21.1 extension registries and vanilla systems to eliminate repetitive `DeferredRegister` boilerplate.

## Data Components & Attachments (`data` Subpackage)

### `DataComponentBuilder<E, P>` — Item & Container Data Components

In Minecraft 1.21.1, item NBT is replaced by type-safe `DataComponentType<E>`. Create via `REGISTRUM.dataComponent(name, operator)` or configure the builder:

- `AbstractRegistrum.dataComponent(String name, UnaryOperator<DataComponentBuilder<E, S>> builder)` -> returns built `DataComponentEntry<E>`.
- Or configure the builder before calling `.register()`:
  - `persistent(Codec<E> codec)`: sets the `Codec<E>` for disk persistence. Without this, the component is in-memory only and not saved to saves or loot NBT.
  - `networkSynchronized(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)`: sets the client/server network sync codec. Required if server-side custom item components should display in client tooltips.
  - `cacheEncoding()`: enables encoding cache optimization (recommended for frequently read, rarely mutated immutable Record components).

### `AttachmentBuilder<E, P>` — NeoForge Data Attachments

NeoForge Data Attachments attach persistent and syncable data directly to entities, chunks, block entities, levels, and item stacks. Create via `REGISTRUM.attachment(name, supplierOrFunction)` (supports no-arg `Supplier<E>` or `Function<IAttachmentHolder, E>`):

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `serialize(IAttachmentSerializer<?, E> serializer)` | `AttachmentBuilder<E, P>` | Uses a custom full NeoForge attachment serializer |
| `serialize(Codec<E> serializer)` | `AttachmentBuilder<E, P>` | `Codec<E>`-based serialization (note: parameter type in 1.21.1 is `Codec<E>`) |
| `serialize(Codec<E> serializer, Predicate<? super E> predicate)` | `AttachmentBuilder<E, P>` | Serializes with `Codec<E>` only when `predicate` passes (skips defaults to shrink save size) |
| `copyOnDeath()` | `AttachmentBuilder<E, P>` | Preserves attachment data across player death/respawn or dimension transfer |
| `copyHandler(IAttachmentCopyHandler<E> cloner)` | `AttachmentBuilder<E, P>` | Customizes copy logic (e.g., deep-copying mutable state containers) |
| `sync(AttachmentSyncHandler<E> syncHandler)` | `AttachmentBuilder<E, P>` | Uses a custom client sync handler |
| `sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | Uses full-sync `StreamCodec` (broadcasts to tracking clients / owning player by default) |
| `sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | Conditional `StreamCodec` sync filtering target players |
| `register()` | `AttachmentEntry<E>` | Registers and returns `AttachmentEntry<E>` (extends `RegistryEntry<AttachmentType<?>, AttachmentType<E>>`) |

## Recipe Types & Serializers (`recipe` Subpackage)

On `AbstractRegistrum`, register via `recipe`, individual `recipeType`, or custom serializer:

- `REGISTRUM.recipe(String name, MapCodec<T> codec, StreamCodec<RegistryFriendlyByteBuf, T> streamCodec)`: registers both `RecipeType<T>` and `RecipeSerializer<T>` under the same name, returning `RecipeEntry<T>` (with `type()` and `serializer()`).
- `RecipeTypeBuilder<T, P>`: registers `Registries.RECIPE_TYPE`, overriding `toString()` to `"<modid>:<name>"` and producing `RecipeTypeEntry<T>`.
- `RecipeSerializerBuilder<T, P>`: registers `Registries.RECIPE_SERIALIZER` with `MapCodec<T>` and `StreamCodec<RegistryFriendlyByteBuf, T>`, producing `RecipeSerializerEntry<T>`.

## Load Conditions & Data-Driven Modifiers (`ConditionBuilder` & `modifier` Subpackage)

These entries register `MapCodec<? extends ...>` to NeoForge's codec registries for `"type"` or `"neoforge:conditions"` in JSON datapacks:

| Builder Class | Registration Method (`REGISTRUM.*`) | Target Registry (`NeoForgeRegistries.Keys.*`) | Return Entry |
| :--- | :--- | :--- | :--- |
| `ConditionBuilder<T, P>` | `condition(String name, MapCodec<T> mapCodec)` | `CONDITION_CODECS` | `ConditionEntry<T>` |
| `BiomeModifierBuilder<T, P>` | `biomeModifier(String name, MapCodec<T> mapCodec)` | `BIOME_MODIFIER_SERIALIZERS` | `BiomeModifierEntry<T>` |
| `GlobalLootModifierBuilder<T, P>` | `glm(String name, MapCodec<T> codec)` | `GLOBAL_LOOT_MODIFIER_SERIALIZERS` | `GlobalLootModifierEntry<T>` |
| `StructureModifierBuilder<T, P>` | `structureModifier(String name, MapCodec<T> codec)` | `STRUCTURE_MODIFIER_SERIALIZERS` | `StructureModifierEntry<T>` |

## Potions, MobEffects, SoundEvents & GameEvents

- `MobEffectBuilder<T, P>`: `REGISTRUM.mobEffect(String name, NonNullSupplier<T> supplier)` registers to `Registries.MOB_EFFECT`, returning `MobEffectEntry<T>`.
- `PotionBuilder<P>`: `REGISTRUM.potion(String name, MobEffectInstance... effects)` extends `SelfBuilder`, constructing `new Potion(owner.getModid() + ":" + name, effects)` in `Registries.POTION` and returning `PotionEntry`.
- `SoundEventBuilder<P>`:
  - `REGISTRUM.soundEvent(String name)` -> calls `SoundEvent.createVariableRangeEvent(...)`.
  - `REGISTRUM.soundEvent(String name, float fix)` -> calls `SoundEvent.createFixedRangeEvent(..., fix)`.
  - Returns `SoundEventEntry`.
- `GameEventBuilder<P>`: `REGISTRUM.gameEvent(String name, int radius)` registers `new GameEvent(radius)` to `Registries.GAME_EVENT`, returning `GameEventEntry`.

## Villager System (`villager` Subpackage)

::: info 1.21.1 Villager Registration Notes
In MC 1.21.1, `VillagerProfession` is a 6-element record containing only job site predicates, requested items, secondary POIs, and work sound—**there is no** data-driven trade table parameter; register villager trades at runtime via NeoForge's `VillagerTradesEvent`. Also, `BiomeBuilder.java` is completely commented out on 1.21.1 and should not be referenced.
:::

`AbstractRegistrum` provides full support for villager POIs, professions, and biome outfit types:

- `poi(String name, Supplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` -> returns `PoiTypeBuilder`, registering `PoiType` and returning `SelfEntry<PoiType>`.
- `villager(String name)` -> returns `VillagerTypeBuilder`, registering `new VillagerType(name)`.
- `profession(...)` (3 overloads) -> returns `VillagerProfessionBuilder`:
  1. `(String name, ResourceKey<PoiType> jobSite, @Nullable SoundEvent workSound)`: simplest overload, using `jobSite` for both `heldJobSite` and `acquirableJobSite` with empty requested items and secondary POIs.
  2. `(String name, Predicate<Holder<PoiType>> heldJobSite, Predicate<Holder<PoiType>> acquirableJobSite, @Nullable SoundEvent workSound)`
  3. `(String name, Predicate<Holder<PoiType>> heldJobSite, Predicate<Holder<PoiType>> acquirableJobSite, ImmutableSet<Item> requestedItems, ImmutableSet<Block> secondaryPoi, @Nullable SoundEvent workSound)`

## Complete Practical Example: Custom Component, Attachment, Recipe, Sound & Villager

```java
package com.example.examplemod.registry;

import com.example.examplemod.ExampleMod;
import com.example.examplemod.recipe.CrushingRecipe;
import com.mojang.serialization.Codec;
import dev.anvilcraft.lib.v2.registrum.util.entry.RecipeEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.SelfEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.SoundEventEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.data.AttachmentEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.data.DataComponentEntry;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.npc.VillagerProfession;

public class ModMiscRegistries {
    // 1. Persistent and synced item energy DataComponent
    public static final DataComponentEntry<Integer> STORED_CHARGE = ExampleMod.REGISTRUM
        .dataComponent("stored_charge", b -> b
            .persistent(Codec.INT)
            .networkSynchronized(ByteBufCodecs.VAR_INT)
            .cacheEncoding()
        );

    // 2. Entity/player attachment: saved only when non-zero, kept on death, synced only to owning player
    public static final AttachmentEntry<Integer> MACHINE_MASTERY = ExampleMod.REGISTRUM
        .attachment("machine_mastery", () -> 0)
        .serialize(Codec.INT, value -> value > 0)
        .copyOnDeath()
        .sync(
            (holder, player) -> holder == player,
            ByteBufCodecs.VAR_INT
        )
        .register();

    // 3. Register RecipeType and RecipeSerializer together
    public static final RecipeEntry<CrushingRecipe> CRUSHING_RECIPE = ExampleMod.REGISTRUM
        .recipe("crushing", CrushingRecipe.CODEC, CrushingRecipe.STREAM_CODEC);

    // 4. SoundEvent and Machinist Villager
    public static final SoundEventEntry CRUSHER_WORK_SOUND = ExampleMod.REGISTRUM
        .soundEvent("crusher_work")
        .register();

    public static final SelfEntry<PoiType> CRUSHER_POI = ExampleMod.REGISTRUM
        .poi("crusher_poi", () -> Set.copyOf(ModBlocks.CRUSHER.get().getStateDefinition().getPossibleStates()), 1, 1)
        .register();

    public static final SelfEntry<VillagerProfession> MECHANIC = ExampleMod.REGISTRUM
        .profession("mechanic", CRUSHER_POI.getKey(), CRUSHER_WORK_SOUND.get())
        .register();

    public static void register() {}
}
```
