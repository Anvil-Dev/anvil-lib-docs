# Codec 数据编解码 (`module.codec`)

<BranchContextCard branch="1.21.8" />

`module.codec`（构件名 `anvillib-codec-neoforge-1.21.8`，包名 `dev.anvilcraft.lib.v2.codec`）包含两个核心工具类：**`CodecUtil`** 与 **`StreamCodecUtil`**。

在 Minecraft `1.21.8` / NeoForge `21.8.x` 开发中，编写自定义配方、网络数据包或数据组件时经常会遇到以下痛点：
1. 原版 `BuiltInRegistries.ITEM.byNameCodec()` 允许解析出 `minecraft:air`，而在配方原料或产出里 `air` 通常代表非法的空物品；
2. 原版战利品 `NumberProviders.CODEC` 要求写完整的 JSON 对象，不支持在 JSON 里直接写纯整数简写（如 `"count": 3`）；
3. 原版 `StreamCodec.composite` 最多只提供 6 参数重载，而原版成就谓词（`net.minecraft.advancements.critereon.*`，如 `EntityPredicate`、`LocationPredicate`）普遍缺少官方 `StreamCodec`；
4. `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, ...))` 样板代码冗长。

`CodecUtil` 与 `StreamCodecUtil` 针对上述场景提供了开箱即用的编解码器常量与 1~16 参数组合工厂方法。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.8`，则已自动包含本模块；若仅需单独引入 `codec` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-1.21.8:2.0.0")
}
```

---

## 二、 核心用法与完整代码示例

### 1. 使用 `CodecUtil.mapCodec` 与 `StreamCodecUtil.composite` 编写多字段记录

下面的示例展示了如何为一个包含 8 个字段的机器配方数据记录同时构建 `Codec`、`MapCodec` 与 `StreamCodec`：

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
    // 使用 CodecUtil.mapCodec 直接传入 8 个字段定义，免去 inst -> inst.group(...).apply(inst, ...)
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

    // 使用 StreamCodecUtil.composite 的 8 参数重载构建网络流编解码器
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

## 三、 `CodecUtil` 公开 API 详解

位于 `dev.anvilcraft.lib.v2.codec.CodecUtil`。

### 1. 内置编解码器常量

| 常量名 | 类型 | 序列化格式与边界行为 |
| :--- | :--- | :--- |
| `CodecUtil.ITEM` | `Codec<Item>` | 使用 `ResourceLocation` 字符串通过 `BuiltInRegistries.ITEM.getOptional(...)` 查找（默认 `Items.AIR`）。**注意**：若 ID 不存在或解析结果为 `Items.AIR`，返回 `DataResult.error`。 |
| `CodecUtil.BLOCK` | `Codec<Block>` | 使用 `ResourceLocation` 字符串通过 `BuiltInRegistries.BLOCK.getOptional(...)` 查找（默认 `Blocks.AIR`）。若 ID 不存在或解析结果为 `Blocks.AIR`，返回 `DataResult.error`。 |
| `CodecUtil.NUMBER_PROVIDER` | `Codec<NumberProvider>` | 支持标准 `NumberProviders.CODEC` 对象结构与纯整数简写（`Codec.INT` 自动转为 `ConstantValue`）。编码时若 `ConstantValue` 的浮点值与整数差值 `< 1E-5`，自动压缩为纯整数输出。 |
| `CodecUtil.ENTITY` | `Codec<EntityType<?>>` | 基于 `ResourceLocation.CODEC` 并校验 `BuiltInRegistries.ENTITY_TYPE.containsKey(id)` 与 `getOptional(id)`，防止未知实体 ID 静默回退为猪（Pig）。 |
| `CodecUtil.CHAR` | `Codec<Character>` | 将单个字符序列化为长度为 `1` 的 JSON 字符串；若字符串长度不为 `1` 则解码报错。 |
| `CodecUtil.BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>` | 按 `"block"` 字段分发方块类型，并将方块属性置于可选的 `"state"` 对象字段中（未指定的属性自动保留 `defaultBlockState()` 默认值）。 |

### 2. 集合、枚举、方块状态与 Record 组合工厂方法

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `<K, V, T> Codec<T> byMap(Codec<Map<K, V>> mapCodec, Function<T, K> keyGetter, Function<T, V> valueGetter, BiFunction<K, V, T> factory)` | `Codec<T>` | 将**恰好包含 1 个键值对**的 Map 编解码器转换为目标对象 `T` 的编解码器（若 Map 大小不为 1 则返回 `DataResult.error`）。 |
| `<T> Codec<LinkedList<T>> linkedListOf(Codec<T> codec)` | `Codec<LinkedList<T>>` | 基于列表顺序创建 `LinkedList<T>` 编解码器。 |
| `<T, D extends Deque<T>> Codec<D> dequeOf(Codec<T> codec, Function<? super List<T>, ? extends D> dequeFac)` | `Codec<D>` | 基于列表顺序创建自定义双端队列 `Deque<T>` 编解码器。 |
| `<T extends Enum<T>> Codec<T> enumCodecInInt(Class<T> clazz)` | `Codec<T>` | 按枚举的 `ordinal()` 整数序号序列化；反序列化越界时返回清晰的 `DataResult.error` 范围提示。 |
| `<T extends Enum<T>> Codec<T> enumCodecInLowerName(Class<T> clazz)` | `Codec<T>` | 按枚举的小写名称（`name().toLowerCase(Locale.ROOT)`）序列化，反序列化时自动转大写匹配。 |
| `<T> Codec<Optional<T>> createOptionalCodec(Codec<T> elementCodec)` | `Codec<Optional<T>>` | 构建包含显式布尔字段 `"isPresent"` 与可选字段 `"content"` 的 `Optional<T>` 编解码器。 |
| `MapCodec<NonNullList<Ingredient>> createIngredientListCodec(String fieldName, int size, String recipeType)` | `MapCodec<NonNullList<Ingredient>>` | 基于 `Ingredient.CODEC.listOf(1, size)` 为配方构建长度限制在 `[1, size]` 范围内的 `NonNullList<Ingredient>` 编解码器（内部通过 `NonNullList.copyOf` 构造）。 |
| `<T extends Comparable<T>> MapCodec<BlockState> blockStatePropertiesCodec(BlockState state)` | `MapCodec<BlockState>` | 为给定原型 `BlockState` 的所有 `Property` 构建可选属性 `MapCodec`。 |
| `<T extends Comparable<T>> MapCodec<BlockState> appendBlockStatePropertyCodec(MapCodec<BlockState> propertyCodec, Supplier<BlockState> holderSupplier, String value, Property<T> property, Property.Value<T> defValue)` | `MapCodec<BlockState>` | 向现有 `MapCodec<BlockState>` 追加单个属性的编解码支持。 |
| `<T> MapCodec<List<T>> zomListMap(Codec<T> codec, String name)` | `MapCodec<List<T>>` | **Zero-Or-One-Or-Many 列表编解码器**：字段缺失时解码为空列表 `List.of()`；字段为单个元素时解码为单元素列表；字段为数组时解码为完整列表。 |
| `<T, R> DataResult<R> encodeStart(MapCodec<T> codec, DynamicOps<R> ops, T input)` | `DataResult<R>` | 直接使用 `MapCodec` 将对象编码为 `ops` 对应的 Map 结构。 |
| `CodecUtil.create(t1, ..., tn, factory)` | `Codec<R>` | **提供 1 ~ 16 参数共 16 个重载**：对 `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, factory))` 的扁平化封装。 |
| `CodecUtil.mapCodec(t1, ..., tn, factory)` | `MapCodec<R>` | **提供 1 ~ 16 参数共 16 个重载**：对 `RecordCodecBuilder.mapCodec(inst -> inst.group(...).apply(inst, factory))` 的扁平化封装。 |

---

## 四、 `StreamCodecUtil` 公开 API 详解

位于 `dev.anvilcraft.lib.v2.codec.StreamCodecUtil`。

### 1. 内置流编解码器常量

| 常量名 | 缓冲区类型 `<B>` | 值类型 `<V>` | 编码协议说明 |
| :--- | :--- | :--- | :--- |
| `ITEM` | `RegistryFriendlyByteBuf` | `Item` | 写入/读取 `BuiltInRegistries.ITEM` 的 `ResourceLocation`（使用 `getOptional` 解析，未知 ID 抛异常）。 |
| `BLOCK` | `RegistryFriendlyByteBuf` | `Block` | 写入/读取 `BuiltInRegistries.BLOCK` 的 `ResourceLocation`（使用 `getOptional` 解析，未知 ID 抛异常）。 |
| `VAR_INT_BLOCK_POS` | `FriendlyByteBuf` | `BlockPos` | 使用 3 个 `VAR_INT` 分别编码 `x`、`y`、`z`。 |
| `BLOCK_STATE` | `? super ByteBuf` | `BlockState` | 使用 `Block.getId(state)` 与 `Block.stateById(id)` 编码 32 位全局状态 ID。 |
| `ENTITY` | `RegistryFriendlyByteBuf` | `EntityType<?>` | 写入/读取 `BuiltInRegistries.ENTITY_TYPE` 的 `ResourceLocation`（通过 `getValue` 读取）。 |
| `CHAR` | `RegistryFriendlyByteBuf` | `Character` | 使用最大长度 1 的 UTF 字符串编码单字符（长度不为 `1` 时抛异常）。 |
| `VEC3` | `FriendlyByteBuf` | `Vec3` | 连续写入/读取 3 个 `float` 分量（`x`、`y`、`z`），兼顾数据包体积。 |
| `VEC3I` | `ByteBuf` | `Vec3i` | 使用 `BlockPos.asLong(x, y, z)` 打包为单个 `long`。 |
| `NUMBER_PROVIDER` | `RegistryFriendlyByteBuf` | `NumberProvider` | 紧凑二进制编码：支持 `ConstantValue`（type=1）、`UniformGenerator`（type=2）与 `BinomialDistributionGenerator`（type=3）。 |
| `TAG_OR_ELEMENT_LOCATION` | `ByteBuf` | `ExtraCodecs.TagOrElementLocation` | 编码 `ResourceLocation id` 与 `boolean tag` 标志。 |
| `ENTITY_TYPE_PREDICATE`<br>`DISTANCE_PREDICATE`<br>`MOVEMENT_PREDICATE`<br>`POSITION_PREDICATE`<br>`LIGHT_PREDICATE`<br>`FLUID_PREDICATE`<br>`LOCATION_PREDICATE`<br>`LOCATION_WRAPPER`<br>`MOB_EFFECT_INSTANCE_PREDICATE`<br>`MOB_EFFECTS_PREDICATE`<br>`NBT_PREDICATE`<br>`ENTITY_FLAGS_PREDICATE`<br>`ITEM_PREDICATE`<br>`ENTITY_EQUIPMENT_PREDICATE`<br>`ENTITY_SUB_PREDICATE`<br>`SLOTS_PREDICATE`<br>`ENTITY_PREDICATE`<br>`DAMAGE_SOURCE_PREDICATE` | `ByteBuf` 或 `RegistryFriendlyByteBuf` | 对应的 `net.minecraft.advancements.critereon.*` 谓词类 | 为原版缺少官方网络流编解码器的进度触发器谓词（`ITEM_PREDICATE` 与 `ENTITY_PREDICATE` 已适配 1.21.8 `DataComponentMatchers.STREAM_CODEC`，`ENTITY_PREDICATE` 支持递归 `vehicle`/`passenger`/`targetedEntity`）提供原生二进制 `StreamCodec`。 |

### 2. 工厂方法与 7~16 参数 `composite` 重载

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `<T> StreamCodec<ByteBuf, TagKey<T>> tagKey(ResourceKey<? extends Registry<T>> registryKey)` | `StreamCodec<ByteBuf, TagKey<T>>` | 委托 `TagKey.streamCodec(registryKey)` 创建标签键流编解码器。 |
| `<T> StreamCodec<ByteBuf, TagPredicate<T>> tagPredicate(ResourceKey<? extends Registry<T>> registryKey)` | `StreamCodec<ByteBuf, TagPredicate<T>>` | 为 `TagPredicate<T>` 构建网络流编解码器（内部组合 `TagKey.streamCodec` 与 `BOOL`）。 |
| `void numberProviderNetworkEncode(RegistryFriendlyByteBuf buf, NumberProvider numberProvider)`<br>`NumberProvider numberProviderNetworkDecode(RegistryFriendlyByteBuf buf)` | `void` / `NumberProvider` | 带类型标记的紧凑 `NumberProvider` 读写辅助方法，未知标记解码回退为 `ConstantValue.exactly(1)`。 |
| `<T> StreamCodec<? super FriendlyByteBuf, T> nbtWrapped(Codec<T> codec)` | `StreamCodec<? super FriendlyByteBuf, T>` | 使用 `NbtOps.INSTANCE` 将普通 `Codec<T>` 包装为通过 `readNbt` / `writeNbt` 传输的 `StreamCodec`（不依赖注册表上下文）。 |
| `<T> StreamCodec<RegistryFriendlyByteBuf, T> codec2Stream(Codec<T> codec)` | `StreamCodec<RegistryFriendlyByteBuf, T>` | **注册表感知 NBT 桥接器**：利用 `buffer.registryAccess().createSerializationContext(NbtOps.INSTANCE)` 将任意 `Codec<T>` 包装为 `StreamCodec`。 |
| `<T extends Enum<T>> StreamCodec<B, T> enumStreamCodec(Class<T> clazz)` | `StreamCodec<B, T>` | 按枚举的 `ordinal()` 使用 `VAR_INT` 编码枚举值。 |
| `<B, F, S> StreamCodec<B, Pair<F, S>> createPairStreamCodec(StreamCodec<? super B, F> first, StreamCodec<? super B, S> second)` | `StreamCodec<B, Pair<F, S>>` | 组合两个组件编解码器生成 Mojang `Pair<F, S>` 流编解码器。 |
| `<B, C, T1..Tn> StreamCodec<B, C> composite(...)` | `StreamCodec<B, C>` | **提供 7 ~ 16 参数共 10 个高阶重载**：无缝补充原版 `StreamCodec.composite` 仅支持 1~6 参数的限制。 |
