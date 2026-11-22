# Codec Data Serialization (`module.codec`)

<BranchContextCard branch="1.21.8" />

`module.codec` (artifact `anvillib-codec-neoforge-1.21.8`, package `dev.anvilcraft.lib.v2.codec`) contains two core utility classes: **`CodecUtil`** and **`StreamCodecUtil`**.

In Minecraft `1.21.8` / NeoForge `21.8.x` development, writing custom recipes, network packets, or data components often hits these pain points:
1. Vanilla `BuiltInRegistries.ITEM.byNameCodec()` allows resolving `minecraft:air`, whereas in recipe ingredients or outputs `air` is usually an invalid empty item;
2. Vanilla loot `NumberProviders.CODEC` requires full JSON objects and does not allow writing plain integer shorthands in JSON (like `"count": 3`);
3. Vanilla `StreamCodec.composite` only provides up to 6-parameter overloads, while vanilla advancement predicates (`net.minecraft.advancements.critereon.*`, e.g., `EntityPredicate`, `LocationPredicate`) generally lack official `StreamCodec`s;
4. `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, ...))` has verbose boilerplate.

`CodecUtil` and `StreamCodecUtil` provide ready-to-use codec constants and 1–16 parameter builder factory methods for these scenarios.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.8`, this module is included automatically. To depend on `codec` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-1.21.8:2.0.0")
}
```

---

## 2. Core Usage & Full Code Example

### 1. Writing Multi-Field Records with `CodecUtil.mapCodec` & `StreamCodecUtil.composite`

The example below shows how to build a `Codec`, `MapCodec`, and `StreamCodec` simultaneously for an 8-field machine recipe data record:

```java
package com.example.mymod.recipe;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import dev.anvilcraft.lib.v2.codec.CodecUtil;
import dev.anvilcraft.lib.v2.codec.StreamCodecUtil;
import net.minecraft.advancements.critereon.EntityPredicate;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.providers.number.NumberProvider;

import java.util.List;
import java.util.Optional;

public record AltarProcessData(
    Item catalyst,
    Block targetBlock,
    BlockState outputState,
    NumberProvider energyCost,
    EntityType<?> sacrificeType,
    Optional<EntityPredicate> guardianFilter,
    BlockPos offset,
    List<Character> runeSymbols
) {
    // Pass 8 field definitions directly to CodecUtil.mapCodec, avoiding inst -> inst.group(...).apply(inst, ...)
    public static final MapCodec<AltarProcessData> MAP_CODEC = CodecUtil.mapCodec(
        CodecUtil.ITEM.fieldOf("catalyst").forGetter(AltarProcessData::catalyst),
        CodecUtil.BLOCK.fieldOf("target_block").forGetter(AltarProcessData::targetBlock),
        CodecUtil.BLOCK_STATE_MAP_CODEC.fieldOf("output_state").forGetter(AltarProcessData::outputState),
        CodecUtil.NUMBER_PROVIDER.fieldOf("energy_cost").forGetter(AltarProcessData::energyCost),
        CodecUtil.ENTITY.fieldOf("sacrifice_type").forGetter(AltarProcessData::sacrificeType),
        EntityPredicate.CODEC.optionalFieldOf("guardian_filter").forGetter(AltarProcessData::guardianFilter),
        BlockPos.CODEC.fieldOf("offset").forGetter(AltarProcessData::offset),
        CodecUtil.CHAR.listOf().fieldOf("rune_symbols").forGetter(AltarProcessData::runeSymbols),
        AltarProcessData::new
    );

    public static final Codec<AltarProcessData> CODEC = MAP_CODEC.codec();

    // Build the network stream codec using the 8-parameter overload of StreamCodecUtil.composite
    public static final StreamCodec<RegistryFriendlyByteBuf, AltarProcessData> STREAM_CODEC =
        StreamCodecUtil.composite(
            StreamCodecUtil.ITEM, AltarProcessData::catalyst,
            StreamCodecUtil.BLOCK, AltarProcessData::targetBlock,
            StreamCodecUtil.BLOCK_STATE, AltarProcessData::outputState,
            StreamCodecUtil.NUMBER_PROVIDER, AltarProcessData::energyCost,
            StreamCodecUtil.ENTITY, AltarProcessData::sacrificeType,
            ByteBufCodecs.optional(StreamCodecUtil.ENTITY_PREDICATE), AltarProcessData::guardianFilter,
            StreamCodecUtil.VAR_INT_BLOCK_POS, AltarProcessData::offset,
            StreamCodecUtil.CHAR.apply(ByteBufCodecs.list()), AltarProcessData::runeSymbols,
            AltarProcessData::new
        );
}
```

---

## 3. `CodecUtil` Public API Reference

Located in `dev.anvilcraft.lib.v2.codec.CodecUtil`.

### 1. Built-in Codec Constants

| Constant | Type | Serialization Format & Boundary Behavior |
| :--- | :--- | :--- |
| `CodecUtil.ITEM` | `Codec<Item>` | Looks up by `ResourceLocation` string via `BuiltInRegistries.ITEM.getOptional(...)` (defaults to `Items.AIR`). **Note**: returns `DataResult.error` if the ID does not exist or resolves to `Items.AIR`. |
| `CodecUtil.BLOCK` | `Codec<Block>` | Looks up by `ResourceLocation` string via `BuiltInRegistries.BLOCK.getOptional(...)` (defaults to `Blocks.AIR`). Returns `DataResult.error` if missing or `Blocks.AIR`. |
| `CodecUtil.NUMBER_PROVIDER` | `Codec<NumberProvider>` | Supports both standard `NumberProviders.CODEC` objects and plain integer shorthand (`Codec.INT` auto-converted to `ConstantValue`). On encode, if `ConstantValue`'s float value differs from an integer by `< 1E-5`, compacts to a plain integer. |
| `CodecUtil.ENTITY` | `Codec<EntityType<?>>` | Based on `ResourceLocation.CODEC` and validates `BuiltInRegistries.ENTITY_TYPE.containsKey(id)` and `getOptional(id)`, preventing unknown entity IDs from silently falling back to Pig. |
| `CodecUtil.CHAR` | `Codec<Character>` | Serializes a single character as a length-`1` JSON string; decoding errors if string length is not `1`. |
| `CodecUtil.BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>` | Dispatches block type by the `"block"` field and places block properties in an optional `"state"` object field (unspecified properties keep `defaultBlockState()` defaults). |

### 2. Collection, Enum, BlockState & Record Composite Factories

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `<K, V, T> Codec<T> byMap(Codec<Map<K, V>> mapCodec, Function<T, K> keyGetter, Function<T, V> valueGetter, BiFunction<K, V, T> factory)` | `Codec<T>` | Converts a Map codec containing **exactly 1 key-value pair** into a `Codec<T>` (returns `DataResult.error` if Map size is not 1). |
| `<T> Codec<LinkedList<T>> linkedListOf(Codec<T> codec)` | `Codec<LinkedList<T>>` | Creates a `LinkedList<T>` codec preserving list order. |
| `<T, D extends Deque<T>> Codec<D> dequeOf(Codec<T> codec, Function<? super List<T>, ? extends D> dequeFac)` | `Codec<D>` | Creates a custom `Deque<T>` codec preserving list order. |
| `<T extends Enum<T>> Codec<T> enumCodecInInt(Class<T> clazz)` | `Codec<T>` | Serializes by enum `ordinal()` integer; out-of-range values return a clear `DataResult.error` range message on decode. |
| `<T extends Enum<T>> Codec<T> enumCodecInLowerName(Class<T> clazz)` | `Codec<T>` | Serializes by lowercase enum name (`name().toLowerCase(Locale.ROOT)`), auto-uppercasing on decode. |
| `<T> Codec<Optional<T>> createOptionalCodec(Codec<T> elementCodec)` | `Codec<Optional<T>>` | Builds an `Optional<T>` codec with explicit boolean `"isPresent"` and optional `"content"` fields. |
| `MapCodec<NonNullList<Ingredient>> createIngredientListCodec(String fieldName, int size, String recipeType)` | `MapCodec<NonNullList<Ingredient>>` | Builds a `NonNullList<Ingredient>` codec constrained to `[1, size]` elements using `Ingredient.CODEC.listOf(1, size)` (constructed via `NonNullList.copyOf`). |
| `<T extends Comparable<T>> MapCodec<BlockState> blockStatePropertiesCodec(BlockState state)` | `MapCodec<BlockState>` | Builds an optional property `MapCodec` for all `Property` entries of the prototype `BlockState`. |
| `<T extends Comparable<T>> MapCodec<BlockState> appendBlockStatePropertyCodec(MapCodec<BlockState> propertyCodec, Supplier<BlockState> holderSupplier, String value, Property<T> property, Property.Value<T> defValue)` | `MapCodec<BlockState>` | Appends single-property codec support to an existing `MapCodec<BlockState>`. |
| `<T> MapCodec<List<T>> zomListMap(Codec<T> codec, String name)` | `MapCodec<List<T>>` | **Zero-Or-One-Or-Many list codec**: decodes omitted field as `List.of()`, single element as singleton list, and array as full list. |
| `<T, R> DataResult<R> encodeStart(MapCodec<T> codec, DynamicOps<R> ops, T input)` | `DataResult<R>` | Encodes an object directly into an `ops` Map structure using `MapCodec`. |
| `CodecUtil.create(t1, ..., tn, factory)` | `Codec<R>` | **Provides 1–16 parameter overloads (16 total)**: flattened wrapper around `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, factory))`. |
| `CodecUtil.mapCodec(t1, ..., tn, factory)` | `MapCodec<R>` | **Provides 1–16 parameter overloads (16 total)**: flattened wrapper around `RecordCodecBuilder.mapCodec(inst -> inst.group(...).apply(inst, factory))`. |

---

## 4. `StreamCodecUtil` Public API Reference

Located in `dev.anvilcraft.lib.v2.codec.StreamCodecUtil`.

### 1. Built-in StreamCodec Constants

| Constant | Buffer Type `<B>` | Value Type `<V>` | Encoding Protocol |
| :--- | :--- | :--- | :--- |
| `ITEM` | `RegistryFriendlyByteBuf` | `Item` | Writes/reads `BuiltInRegistries.ITEM` `ResourceLocation` (resolved via `getOptional`; throws on unknown ID). |
| `BLOCK` | `RegistryFriendlyByteBuf` | `Block` | Writes/reads `BuiltInRegistries.BLOCK` `ResourceLocation` (resolved via `getOptional`; throws on unknown ID). |
| `VAR_INT_BLOCK_POS` | `FriendlyByteBuf` | `BlockPos` | Encodes `x`, `y`, `z` separately using 3 `VAR_INT`s. |
| `BLOCK_STATE` | `? super ByteBuf` | `BlockState` | Encodes 32-bit global state ID via `Block.getId(state)` and `Block.stateById(id)`. |
| `ENTITY` | `RegistryFriendlyByteBuf` | `EntityType<?>` | Writes/reads `BuiltInRegistries.ENTITY_TYPE` `ResourceLocation` (read via `getValue`). |
| `CHAR` | `RegistryFriendlyByteBuf` | `Character` | Encodes single character as a max-length-1 UTF string (throws if length != `1`). |
| `VEC3` | `FriendlyByteBuf` | `Vec3` | Sequentially writes/reads 3 `float` components (`x`, `y`, `z`) to save packet size. |
| `VEC3I` | `ByteBuf` | `Vec3i` | Packs into a single `long` via `BlockPos.asLong(x, y, z)`. |
| `NUMBER_PROVIDER` | `RegistryFriendlyByteBuf` | `NumberProvider` | Compact binary encoding: supports `ConstantValue` (type=1), `UniformGenerator` (type=2), and `BinomialDistributionGenerator` (type=3). |
| `TAG_OR_ELEMENT_LOCATION` | `ByteBuf` | `ExtraCodecs.TagOrElementLocation` | Encodes `ResourceLocation id` and `boolean tag` flag. |
| `ENTITY_TYPE_PREDICATE`<br>`DISTANCE_PREDICATE`<br>`MOVEMENT_PREDICATE`<br>`POSITION_PREDICATE`<br>`LIGHT_PREDICATE`<br>`FLUID_PREDICATE`<br>`LOCATION_PREDICATE`<br>`LOCATION_WRAPPER`<br>`MOB_EFFECT_INSTANCE_PREDICATE`<br>`MOB_EFFECTS_PREDICATE`<br>`NBT_PREDICATE`<br>`ENTITY_FLAGS_PREDICATE`<br>`ITEM_PREDICATE`<br>`ENTITY_EQUIPMENT_PREDICATE`<br>`ENTITY_SUB_PREDICATE`<br>`SLOTS_PREDICATE`<br>`ENTITY_PREDICATE`<br>`DAMAGE_SOURCE_PREDICATE` | `ByteBuf` or `RegistryFriendlyByteBuf` | Corresponding `net.minecraft.advancements.critereon.*` predicate class | Provides native binary `StreamCodec`s for vanilla advancement criterion predicates lacking official stream codecs (`ITEM_PREDICATE` and `ENTITY_PREDICATE` are adapted to 1.21.8 `DataComponentMatchers.STREAM_CODEC`; `ENTITY_FLAGS_PREDICATE` supports `isInWater`/`isFallFlying`; `ENTITY_PREDICATE` supports recursive `vehicle`/`passenger`/`targetedEntity`). |

### 2. Factory Methods & 7–16 Parameter `composite` Overloads

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `<T> StreamCodec<ByteBuf, TagKey<T>> tagKey(ResourceKey<? extends Registry<T>> registryKey)` | `StreamCodec<ByteBuf, TagKey<T>>` | Delegates to `TagKey.streamCodec(registryKey)` to create a tag key stream codec. |
| `<T> StreamCodec<ByteBuf, TagPredicate<T>> tagPredicate(ResourceKey<? extends Registry<T>> registryKey)` | `StreamCodec<ByteBuf, TagPredicate<T>>` | Builds a stream codec for `TagPredicate<T>` (combining `TagKey.streamCodec` and `BOOL`). |
| `void numberProviderNetworkEncode(RegistryFriendlyByteBuf buf, NumberProvider numberProvider)`<br>`NumberProvider numberProviderNetworkDecode(RegistryFriendlyByteBuf buf)` | `void` / `NumberProvider` | Tagged compact read/write helpers for `NumberProvider`; unknown tags decode to `ConstantValue.exactly(1)`. |
| `<T> StreamCodec<? super FriendlyByteBuf, T> nbtWrapped(Codec<T> codec)` | `StreamCodec<? super FriendlyByteBuf, T>` | Wraps a plain `Codec<T>` using `NbtOps.INSTANCE` into a `StreamCodec` transported via `readNbt` / `writeNbt` (registry-independent). |
| `<T> StreamCodec<RegistryFriendlyByteBuf, T> codec2Stream(Codec<T> codec)` | `StreamCodec<RegistryFriendlyByteBuf, T>` | **Registry-aware NBT bridge**: wraps any `Codec<T>` into a `StreamCodec` using `buffer.registryAccess().createSerializationContext(NbtOps.INSTANCE)`. |
| `<T extends Enum<T>> StreamCodec<B, T> enumStreamCodec(Class<T> clazz)` | `StreamCodec<B, T>` | Encodes enum constants by `ordinal()` using `VAR_INT`. |
| `<B, F, S> StreamCodec<B, Pair<F, S>> createPairStreamCodec(StreamCodec<? super B, F> first, StreamCodec<? super B, S> second)` | `StreamCodec<B, Pair<F, S>>` | Combines two component codecs into a Mojang `Pair<F, S>` stream codec. |
| `<B, C, T1..Tn> StreamCodec<B, C> composite(...)` | `StreamCodec<B, C>` | **Provides 7–16 parameter higher-arity overloads (10 total)**: seamlessly fills vanilla `StreamCodec.composite`'s 1–6 parameter limit. |
