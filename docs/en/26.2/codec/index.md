# Codec Data Serialization (`module.codec`)

<BranchContextCard branch="26.2" />

`module.codec` (artifact `anvillib-codec-neoforge-26.2`, package `dev.anvilcraft.lib.v2.codec`) provides an out-of-the-box utility suite around Mojang DataFixerUpper (DFU) `Codec` / `MapCodec` and Minecraft's network-layer `StreamCodec`, centered on two core classes:

- **`CodecUtil`**: Preset `Codec` and `MapCodec` constants for JSON / NBT / datapacks, collection and enum converters, block state property codecs, zero/one/many (ZOM) lists, and flattened 1–16 parameter builders `CodecUtil.create(...)` and `CodecUtil.mapCodec(...)`.
- **`StreamCodecUtil`**: Network stream codec preset constants for `ByteBuf` / `FriendlyByteBuf` / `RegistryFriendlyByteBuf`, vanilla criterion predicate stream codecs (`EntityPredicate`, `LocationPredicate`, `ItemPredicate`, etc.), `Codec`-to-`StreamCodec` bridge helpers, and **7–16 parameter `StreamCodecUtil.composite(...)` higher-arity overloads** breaking vanilla's 6-parameter limit.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.2`, this module is included automatically. To depend on `codec` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-26.2:2.0.0")
}
```

---

## 2. `CodecUtil` Deep Dive & Usage

### 1. Problem & Usage

When writing datapack JSON or NBT serialization logic with Mojang's native `RecordCodecBuilder`, you often run into these pain points:

1. **Verbose boilerplate**: `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, ...))` requires nested lambdas every time; `CodecUtil.create(...)` and `CodecUtil.mapCodec(...)` simplify this into direct argument passing similar to `StreamCodec.composite`, supporting **1 to 16 fields**.
2. **Registry ID nullness & air checks**: Vanilla `BuiltInRegistries.ITEM.byNameCodec()` allows resolving `minecraft:air`, which is usually invalid in recipes or machine configs. `CodecUtil.ITEM` and `CodecUtil.BLOCK` return `DataResult.error(...)` immediately if the ID is unregistered or resolves to `Items.AIR` / `Blocks.AIR`.
3. **Single-value & array compatibility in JSON (ZOM list)**: When authoring datapacks by hand, developers often want a field to accept either `"ingredient": "minecraft:iron_ingot"` (single element), `"ingredient": ["minecraft:iron_ingot", "minecraft:gold_ingot"]` (multiple elements), or omit the field entirely (zero elements). `CodecUtil.zomListMap(codec, fieldName)` directly produces a `MapCodec<List<T>>` supporting all three forms.
4. **Number provider shorthand**: `CodecUtil.NUMBER_PROVIDER` allows writing plain integers in JSON (e.g., `3`) or standard loot table `NumberProvider` objects (e.g., `{"type": "minecraft:uniform", "min": 1, "max": 5}`), automatically compacting integer constants back to plain integers on encode.

### 2. Full Code Example

The example below shows how to use `CodecUtil` to build a complete datapack `Codec` and `MapCodec` for a custom machine recipe data record:

```java
package com.example.mymod.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import dev.anvilcraft.lib.v2.codec.CodecUtil;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.providers.number.NumberProvider;

import java.util.LinkedList;
import java.util.List;
import java.util.Optional;

public record CrusherStageData(
    Item catalyst,
    Block targetBlock,
    BlockState outputState,
    EntityType<?> summonedEntity,
    Character symbol,
    NumberProvider rollCount,
    ProcessMode mode,
    List<Item> bonusItems,
    LinkedList<String> steps,
    Optional<String> remark
) {
    public enum ProcessMode {
        FAST,
        PRECISE,
        OVERCLOCK
    }

    // Combine 10 fields directly with CodecUtil.mapCodec (no inst -> inst.group(...) needed)
    public static final MapCodec<CrusherStageData> MAP_CODEC = CodecUtil.mapCodec(
        CodecUtil.ITEM.fieldOf("catalyst").forGetter(CrusherStageData::catalyst),
        CodecUtil.BLOCK.fieldOf("target_block").forGetter(CrusherStageData::targetBlock),
        CodecUtil.BLOCK_STATE_MAP_CODEC.forGetter(CrusherStageData::outputState),
        CodecUtil.ENTITY.fieldOf("summoned_entity").forGetter(CrusherStageData::summonedEntity),
        CodecUtil.CHAR.fieldOf("symbol").forGetter(CrusherStageData::symbol),
        CodecUtil.NUMBER_PROVIDER.fieldOf("roll_count").forGetter(CrusherStageData::rollCount),
        CodecUtil.enumCodecInLowerName(ProcessMode.class)
            .fieldOf("mode")
            .forGetter(CrusherStageData::mode),
        // ZOM field supporting omitted, single-element, or array forms
        CodecUtil.zomListMap(CodecUtil.ITEM, "bonus_items")
            .forGetter(CrusherStageData::bonusItems),
        CodecUtil.linkedListOf(Codec.STRING)
            .fieldOf("steps")
            .forGetter(CrusherStageData::steps),
        CodecUtil.createOptionalCodec(Codec.STRING)
            .fieldOf("remark")
            .forGetter(CrusherStageData::remark),
        CrusherStageData::new
    );

    public static final Codec<CrusherStageData> CODEC = MAP_CODEC.codec();
}
```

### 3. `CodecUtil` Preset Static Constants

| Constant | Type | Serialization Format & Boundary Behavior |
| :--- | :--- | :--- |
| `CodecUtil.ITEM` | `Codec<Item>` | Uses item registry ID strings (`Identifier.parse`). **Boundary**: returns `DataResult.error` on both encode and decode if unregistered, malformed, or `Items.AIR` (`"minecraft:air"`). |
| `CodecUtil.BLOCK` | `Codec<Block>` | Uses block registry ID strings. **Boundary**: returns `DataResult.error` on both encode and decode if unregistered, malformed, or `Blocks.AIR` (`"minecraft:air"`). |
| `CodecUtil.NUMBER_PROVIDER` | `Codec<NumberProvider>` | Accepts both standard `NumberProviders.CODEC` objects and plain `Codec.INT` integers. On encode, if `ConstantValue(float value)` differs from its floor by `< 1E-5`, writes a plain integer; otherwise writes the standard composite object. |
| `CodecUtil.ENTITY` | `Codec<EntityType<?>>` | Based on `Identifier.CODEC` and validates `BuiltInRegistries.ENTITY_TYPE.containsKey(id)`. Returns `DataResult.error` for unregistered entity types instead of silently falling back to a default entity (such as pig). |
| `CodecUtil.CHAR` | `Codec<Character>` | Based on single-character strings (`length == 1`). Decoding returns `DataResult.error` if the string is empty or longer than 1 character. |
| `CodecUtil.BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>` | Dispatches on the `"block"` field to a concrete `Block`, then parses block state properties via `lenientOptionalFieldOf("state", defaultBlockState)`. Falls back to `defaultBlockState()` if `"state"` is absent. |

### 4. `CodecUtil` Public Static Methods

| Method Signature | Purpose, Parameters & Boundary Conditions |
| :--- | :--- |
| `<K, V, T> Codec<T> byMap(Codec<Map<K, V>> mapCodec, Function<T, K> keyGetter, Function<T, V> valueGetter, BiFunction<K, V, T> factory)` | Maps a **single-entry Map** (e.g., `{"#": "minecraft:stone"}`) to a domain object `T`. **Boundary**: decoding returns `DataResult.error("Expected exactly one entry in map, got ...")` if `map.size() != 1`; encoding constructs an immutable single-entry map via `Map.of(key, value)`. |
| `<T> Codec<LinkedList<T>> linkedListOf(Codec<T> codec)` | Creates an order-preserving `LinkedList<T>` codec (internally delegates to `dequeOf(codec, LinkedList::new)`). |
| `<T, D extends Deque<T>> Codec<D> dequeOf(Codec<T> codec, Function<? super List<T>, ? extends D> dequeFac)` | Maps `codec.listOf()` to any `Deque` type `D`; encoding calls `List.copyOf` to create an immutable snapshot. Note: the deque must not contain `null` elements, or `List.copyOf` throws `NullPointerException`. |
| `<T extends Enum<T>> Codec<T> enumCodecInInt(Class<T> clazz)` | Serializes using the enum's `ordinal()` integer. **Boundary**: decoding returns `DataResult.error` if index `< 0` or `>= constants.length`. If enum order may change across versions, use `enumCodecInLowerName` instead. |
| `<T extends Enum<T>> Codec<T> enumCodecInLowerName(Class<T> clazz)` | Serializes using the enum name in lowercase (`Locale.ROOT`). **Note**: internally uses `xmap` calling `Enum.valueOf(clazz, name.toUpperCase(Locale.ROOT))`, so an unknown enum name throws `IllegalArgumentException`. |
| `<T> Codec<Optional<T>> createOptionalCodec(Codec<T> elementCodec)` | Creates a composite object Codec with an explicit boolean `"isPresent"` field and optional `"content"` field. Useful for protocols that must explicitly distinguish presence rather than relying on field omission. |
| `MapCodec<NonNullList<Ingredient>> createIngredientListCodec(String fieldName, int size, String recipeType)` | Builds a `MapCodec<NonNullList<Ingredient>>` under `fieldName` with element count in `[1, size]` for shapeless-style recipes. Returns `DataResult.error` mentioning `recipeType` if empty or exceeding `size`. |
| `<T extends Comparable<T>> MapCodec<BlockState> blockStatePropertiesCodec(BlockState state)` | Iterates all `Property` entries of the prototype `state`, building a `MapCodec<BlockState>` with each property name as an optional field; unspecified properties keep their prototype values. |
| `<T extends Comparable<T>> MapCodec<BlockState> appendBlockStatePropertyCodec(MapCodec<BlockState> propertyCodec, Supplier<BlockState> holderSupplier, String value, Property<T> property, Property.Value<T> defValue)` | Appends a single property field `value` to an existing `BlockState` `MapCodec`. If parsing fails or is absent, falls back to `defValue` or the corresponding property value on `holderSupplier.get()`. |
| `<T, R> DataResult<R> encodeStart(MapCodec<T> codec, DynamicOps<R> ops, T input)` | Encodes `input` directly into a Map structure under `ops` using `MapCodec<T>` (without wrapping via `.codec()`), calling `codec.encode(input, ops, codec.compressedBuilder(ops)).build(ops.emptyMap())`. |
| `<T> MapCodec<List<T>> zomListMap(Codec<T> codec, String name)` | Builds a Zero-Or-More (ZOM) list `MapCodec`. Decoding accepts an omitted field (returns `List.of()`), a single element (returns a singleton list), or a standard array; encoding omits the field if empty, writes a single value for 1 element, or writes an array for `>= 2` elements. |
| `<R, T1..Tn> Codec<R> create(t1, ..., tn, factory)` | Flattened proxy overloads for `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, factory))`, providing all **1 to 16 parameter** overloads (`Function`, `BiFunction`, `Function3` through `Function16`). |
| `<R, T1..Tn> MapCodec<R> mapCodec(t1, ..., tn, factory)` | Flattened proxy overloads for `RecordCodecBuilder.mapCodec(inst -> inst.group(...).apply(inst, factory))`, providing all **1 to 16 parameter** overloads. |

---

## 3. `StreamCodecUtil` Deep Dive & Usage

### 1. Problem & Usage

When writing NeoForge custom network packets (`CustomPacketPayload`) or recipe network sync logic, vanilla `StreamCodec` has two common limitations:

1. **Vanilla `StreamCodec.composite` supports at most 6 fields**: Once a packet or sync record exceeds 6 fields, vanilla forces you back to manual `StreamCodec.of(encode, decode)` or nested wrapper objects. `StreamCodecUtil.composite(...)` fills in all **7 to 16 parameter** overloads.
2. **Many vanilla Criterion predicates and registry objects lack a direct `StreamCodec`**: e.g., `EntityPredicate`, `LocationPredicate`, `DamageSourcePredicate`, and `NumberProvider` only have a `Codec` in vanilla with no public binary `StreamCodec`. `StreamCodecUtil` provides native binary `StreamCodec`s for them, plus `codec2Stream` (registry-aware NBT bridge) and `nbtWrapped` (registry-less NBT bridge).

### 2. Full Code Example

The example below shows how to use `StreamCodecUtil`'s preset constants and higher-arity `composite` overload for a custom network packet payload:

```java
package com.example.mymod.network;

import dev.anvilcraft.lib.v2.codec.StreamCodecUtil;
import net.minecraft.advancements.predicates.entity.EntityPredicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Vec3i;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.providers.number.NumberProvider;
import net.minecraft.world.phys.Vec3;

public record MachineSyncPayload(
    BlockPos controllerPos,
    Vec3i structureOffset,
    Vec3 beamTarget,
    Item activeCatalyst,
    Block casingBlock,
    BlockState currentState,
    TagKey<Item> acceptedTag,
    NumberProvider outputCount,
    EntityPredicate targetEntityFilter
) {
    // 9 fields, using the 9-parameter StreamCodecUtil.composite overload directly
    public static final StreamCodec<RegistryFriendlyByteBuf, MachineSyncPayload> STREAM_CODEC =
        StreamCodecUtil.composite(
            StreamCodecUtil.VAR_INT_BLOCK_POS,
            MachineSyncPayload::controllerPos,
            StreamCodecUtil.VEC3I,
            MachineSyncPayload::structureOffset,
            StreamCodecUtil.VEC3,
            MachineSyncPayload::beamTarget,
            StreamCodecUtil.ITEM,
            MachineSyncPayload::activeCatalyst,
            StreamCodecUtil.BLOCK,
            MachineSyncPayload::casingBlock,
            StreamCodecUtil.BLOCK_STATE,
            MachineSyncPayload::currentState,
            StreamCodecUtil.tagKey(Registries.ITEM),
            MachineSyncPayload::acceptedTag,
            StreamCodecUtil.NUMBER_PROVIDER,
            MachineSyncPayload::outputCount,
            StreamCodecUtil.ENTITY_PREDICATE,
            MachineSyncPayload::targetEntityFilter,
            MachineSyncPayload::new
        );
}
```

### 3. `StreamCodecUtil` Preset Static Constants

#### (1) Core & World Object `StreamCodec`s

| Constant | Buffer & Target Type | Binary Format & Notes |
| :--- | :--- | :--- |
| `StreamCodecUtil.ITEM` | `StreamCodec<RegistryFriendlyByteBuf, Item>` | Writes `Identifier` via `BuiltInRegistries.ITEM.getKey(item)`. Decoding throws `IllegalArgumentException("Unknown item id: ...")` if the ID does not exist. |
| `StreamCodecUtil.BLOCK` | `StreamCodec<RegistryFriendlyByteBuf, Block>` | Writes `Identifier` via `BuiltInRegistries.BLOCK.getKey(block)`. Decoding throws `IllegalArgumentException("Unknown block id: ...")` if the ID does not exist. |
| `StreamCodecUtil.VAR_INT_BLOCK_POS` | `StreamCodec<FriendlyByteBuf, BlockPos>` | Encodes `X`, `Y`, `Z` as 3 separate `ByteBufCodecs.VAR_INT` values (ideal for small coordinates or relative offsets without `BlockPos.asLong` bit-width limits). |
| `StreamCodecUtil.BLOCK_STATE` | `StreamCodec<? super ByteBuf, BlockState>` | Writes a 4-byte global state ID via `Block.getId(blockState)` / `Block.stateById(buf.readInt())`. |
| `StreamCodecUtil.ENTITY` | `StreamCodec<RegistryFriendlyByteBuf, EntityType<?>>` | Encodes and decodes by `BuiltInRegistries.ENTITY_TYPE` `Identifier`. |
| `StreamCodecUtil.CHAR` | `StreamCodec<RegistryFriendlyByteBuf, Character>` | Encodes a single character via `buf.writeUtf` / `buf.readUtf(1)`; throws `IllegalArgumentException` if decoded length is not 1. |
| `StreamCodecUtil.VEC3` | `StreamCodec<FriendlyByteBuf, Vec3>` | Writes 3 `float` values sequentially (12 bytes total). **Precision note**: `Vec3` stores `double` components natively, which are narrowed to `float` precision during transport. |
| `StreamCodecUtil.VEC3I` | `StreamCodec<ByteBuf, Vec3i>` | Packs into a single 8-byte `long` via `BlockPos.asLong(x, y, z)`. **Boundary**: X/Z must be in `[-33554432, 33554431]`, and Y in `[-2048, 2047]`. |
| `StreamCodecUtil.NUMBER_PROVIDER` | `StreamCodec<RegistryFriendlyByteBuf, NumberProvider>` | Compact binary encoding: writes a 1-byte type tag (`1` = `ConstantValue`, `2` = `UniformGenerator`, `3` = `BinomialDistributionGenerator`, `-1` = other) followed by recursive parameters. Unsupported `NumberProvider` implementations safely fall back to `ConstantValue.exactly(1)` on decode. |
| `StreamCodecUtil.TAG_OR_ELEMENT_LOCATION` | `StreamCodec<ByteBuf, ExtraCodecs.TagOrElementLocation>` | Combines `Identifier.STREAM_CODEC` and `ByteBufCodecs.BOOL` (whether it is a Tag). |

#### (2) Vanilla Advancement Criterion Predicates `StreamCodec`s

| Constant | Type | Description |
| :--- | :--- | :--- |
| `StreamCodecUtil.ENTITY_TYPE_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityTypePredicate>` | Stream codec for entity type set predicates |
| `StreamCodecUtil.DISTANCE_PREDICATE` | `StreamCodec<ByteBuf, DistancePredicate>` | Stream codec for distance range predicates (x / y / z / horizontal / absolute) |
| `StreamCodecUtil.MOVEMENT_PREDICATE` | `StreamCodec<ByteBuf, MovementPredicate>` | Stream codec for entity movement speed and fall distance predicates |
| `StreamCodecUtil.POSITION_PREDICATE` | `StreamCodec<ByteBuf, LocationPredicate.PositionPredicate>` | Stream codec for coordinate range predicates |
| `StreamCodecUtil.LIGHT_PREDICATE` | `StreamCodec<ByteBuf, LightPredicate>` | Stream codec for light level range predicates |
| `StreamCodecUtil.FLUID_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, FluidPredicate>` | Stream codec for fluid set and state property predicates |
| `StreamCodecUtil.LOCATION_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, LocationPredicate>` | 9-parameter composite stream codec for location predicates (position, biome, structure, dimension, smokey, light, block, fluid, canSeeSky) |
| `StreamCodecUtil.ENTITY_LOCATION_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityLocationPredicate>` | Stream codec for entity location condition sub-predicates |
| `StreamCodecUtil.STEPPING_ON_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, SteppingOnPredicate>` | Stream codec for stepping-on block condition sub-predicates |
| `StreamCodecUtil.MOVEMENT_AFFECTED_BY_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, MovementAffectedByPredicate>` | Stream codec for movement-affected-by block condition sub-predicates |
| `StreamCodecUtil.MOB_EFFECT_INSTANCE_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, MobEffectsPredicate.MobEffectInstancePredicate>` | Stream codec for single mob effect amplifier, duration, ambient, and visibility predicates |
| `StreamCodecUtil.MOB_EFFECTS_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, MobEffectsPredicate>` | Stream codec for mob effects map predicates |
| `StreamCodecUtil.NBT_PREDICATE` | `StreamCodec<ByteBuf, NbtPredicate>` | Stream codec for NBT compound tag predicates |
| `StreamCodecUtil.ENTITY_FLAGS_PREDICATE` | `StreamCodec<ByteBuf, EntityFlagsPredicate>` | 9-parameter stream codec for entity flags (onGround, onFire, crouching, sprinting, swimming, flying, baby, inWater, fallFlying) |
| `StreamCodecUtil.ITEM_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, ItemPredicate>` | Stream codec for item sets, count ranges, and `DataComponentMatchers` predicates |
| `StreamCodecUtil.ENTITY_EQUIPMENT_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityEquipmentPredicate>` | Stream codec for all 7 entity equipment slots (head, chest, legs, feet, body, mainhand, offhand) |
| `StreamCodecUtil.ENTITY_SUB_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntitySubPredicate>` | Stream codec for entity sub-predicates bridged via `codec2Stream` |
| `StreamCodecUtil.SLOTS_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, SlotsPredicate>` | Stream codec for entity inventory slot range predicates |
| `StreamCodecUtil.ENTITY_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityPredicate>` | Full 16-field `EntityPredicate` stream codec supporting recursion (`vehicle`, `passenger`, `targetedEntity`) |
| `StreamCodecUtil.DAMAGE_SOURCE_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, DamageSourcePredicate>` | Stream codec for damage source predicates (damage tags, direct entity, source entity, isDirect) |

### 4. `StreamCodecUtil` Public Static Methods

| Method Signature | Purpose, Parameters & Boundary Conditions |
| :--- | :--- |
| `<T> StreamCodec<ByteBuf, TagKey<T>> tagKey(ResourceKey<? extends Registry<T>> registryKey)` | Creates a `TagKey<T>` stream codec for the given registry key (delegates to `TagKey.streamCodec(registryKey)`). |
| `<T> StreamCodec<ByteBuf, TagPredicate<T>> tagPredicate(ResourceKey<? extends Registry<T>> registryKey)` | Creates a `TagPredicate<T>` stream codec (containing `TagKey<T>` and `boolean expected`) for the given registry key. |
| `void numberProviderNetworkEncode(RegistryFriendlyByteBuf buf, NumberProvider numberProvider)` | Encodes a `NumberProvider` into the buffer, supporting recursive encoding of `ConstantValue`, `UniformGenerator`, and `BinomialDistributionGenerator`. |
| `NumberProvider numberProviderNetworkDecode(RegistryFriendlyByteBuf buf)` | Decodes a `NumberProvider` from the buffer; returns `ConstantValue.exactly(1)` if an unknown type tag is encountered. |
| `<T> StreamCodec<? super FriendlyByteBuf, T> nbtWrapped(Codec<T> codec)` | Wraps a **registry-independent** `Codec<T>` into a `FriendlyByteBuf` stream codec via `NbtOps.INSTANCE`. **Note**: if `codec` uses `RegistryFixedCodec` or `HolderSet` requiring `RegistryOps`, do not use this method; use `codec2Stream(codec)` instead. |
| `<T> StreamCodec<RegistryFriendlyByteBuf, T> codec2Stream(Codec<T> codec)` | Converts a **registry-dependent** `Codec<T>` into a `RegistryFriendlyByteBuf` stream codec via `buffer.registryAccess().createSerializationContext(NbtOps.INSTANCE)`. Calls `getOrThrow()` on encode/decode failure. |
| `<B extends ByteBuf, T extends Enum<T>> StreamCodec<B, T> enumStreamCodec(Class<T> clazz)` | Encodes and decodes enum constants by `ordinal()` using `ByteBufCodecs.VAR_INT`. |
| `<B, F, S> StreamCodec<B, Pair<F, S>> createPairStreamCodec(StreamCodec<? super B, F> first, StreamCodec<? super B, S> second)` | Combines two `StreamCodec`s into a stream codec for `com.mojang.datafixers.util.Pair<F, S>`. |
| `<B, C, T1..Tn> StreamCodec<B, C> composite(codec1, getter1, ..., codecn, gettern, factory)` | Extends vanilla `StreamCodec.composite` with **7 to 16 parameter** overloads (10 higher-arity overloads paired with `Function7`–`Function16`). Fields are encoded and decoded strictly in declaration order. |
