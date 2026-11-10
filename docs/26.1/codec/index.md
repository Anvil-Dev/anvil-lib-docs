# Codec 数据编解码 (`module.codec`)

<BranchContextCard branch="26.1" />

`module.codec`（构件名 `anvillib-codec-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.codec`）围绕 Mojang DataFixerUpper (DFU) 的 `Codec` / `MapCodec` 与 Minecraft 网络层的 `StreamCodec` 提供了一套开箱即用的工具集，涵盖两类核心类：

- **`CodecUtil`**：面向 JSON / NBT / 数据包的 `Codec` 与 `MapCodec` 预置常量、集合与枚举转换器、方块状态属性编解码、零/一/多元素（ZOM）列表，以及 1~16 参数的 `CodecUtil.create(...)` 与 `CodecUtil.mapCodec(...)` 扁平化构建代理。
- **`StreamCodecUtil`**：面向 `ByteBuf` / `FriendlyByteBuf` / `RegistryFriendlyByteBuf` 的网络流编解码器预置常量、原版准则谓词（`EntityPredicate`、`LocationPredicate`、`ItemPredicate` 等）流编解码器、`Codec` 转 `StreamCodec` 桥接方法，以及突破原版 6 参数上限的 **7~16 参数 `StreamCodecUtil.composite(...)` 高阶重载**。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `codec` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-26.1:2.0.0")
}
```

---

## 二、 `CodecUtil` 详解与用法

### 1. 要解决什么问题 / 怎么用

在使用 Mojang 原生 `RecordCodecBuilder` 编写数据包 JSON 或 NBT 序列化逻辑时，常会遇到以下痛点：

1. **样板代码冗长**：`RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, ...))` 每次都要手写 Lambda 嵌套；`CodecUtil.create(...)` 与 `CodecUtil.mapCodec(...)` 将其简化为类似 `StreamCodec.composite` 的直接传参形式，支持 **1 至 16 个字段**。
2. **注册表 ID 判空与空气校验**：原版 `BuiltInRegistries.ITEM.byNameCodec()` 允许解析出 `minecraft:air`；而在配方或机器配置中，`air` 往往属于非法输入。`CodecUtil.ITEM` 与 `CodecUtil.BLOCK` 在解析不到注册表项或结果为 `Items.AIR` / `Blocks.AIR` 时会直接返回 `DataResult.error(...)`。
3. **JSON 单值与数组兼容（ZOM 列表）**：手写数据包时，开发者常希望某个字段既能写 `"ingredient": "minecraft:iron_ingot"`（单元素），也能写 `"ingredient": ["minecraft:iron_ingot", "minecraft:gold_ingot"]`（多元素），甚至省略该字段（零元素）。`CodecUtil.zomListMap(codec, fieldName)` 直接生成兼容这三种写法的 `MapCodec<List<T>>`。
4. **数值提供器简写**：`CodecUtil.NUMBER_PROVIDER` 允许 JSON 中直接写整数（如 `3`）或标准战利品表 `NumberProvider` 对象（如 `{"type": "minecraft:uniform", "min": 1, "max": 5}`），且在编码整数常量时自动压缩回纯整数。

### 2. 完整代码示例

下面展示如何使用 `CodecUtil` 为自定义机器配方数据类构建完整的数据包 `Codec` 与 `MapCodec`：

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

    // 使用 CodecUtil.mapCodec 直接组合 10 个字段（无需写 inst -> inst.group(...)）
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
        // 支持省略、单元素或列表的 ZOM 字段
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

### 3. `CodecUtil` 预设静态常量一览

| 常量名 | 类型 | 序列化格式与边界行为 |
| :--- | :--- | :--- |
| `CodecUtil.ITEM` | `Codec<Item>` | 使用物品注册表 ID 字符串（`Identifier.parse`）。**边界条件**：当 ID 未注册、解析异常或对应 `Items.AIR`（`"minecraft:air"`）时，编码与解码均返回 `DataResult.error`。 |
| `CodecUtil.BLOCK` | `Codec<Block>` | 使用方块注册表 ID 字符串。**边界条件**：当 ID 未注册、解析异常或对应 `Blocks.AIR`（`"minecraft:air"`）时，编码与解码均返回 `DataResult.error`。 |
| `CodecUtil.NUMBER_PROVIDER` | `Codec<NumberProvider>` | 同时兼容标准 `NumberProviders.CODEC` 对象结构与纯整数 `Codec.INT`。编码时，若实例为 `ConstantValue(float value)` 且与向下取整差值 `< 1E-5`，自动写出为纯整数；否则写出为标准复合结构。 |
| `CodecUtil.ENTITY` | `Codec<EntityType<?>>` | 基于 `Identifier.CODEC` 并校验 `BuiltInRegistries.ENTITY_TYPE.containsKey(id)`。若实体类型未注册，返回 `DataResult.error`，不会静默回退到默认实体（如猪）。 |
| `CodecUtil.CHAR` | `Codec<Character>` | 基于单字符字符串（`length == 1`）。若输入字符串为空或长度大于 1，解码返回 `DataResult.error`。 |
| `CodecUtil.BLOCK_STATE_MAP_CODEC` | `MapCodec<BlockState>` | 按 `"block"` 字段分发到具体 `Block`，并通过 `lenientOptionalFieldOf("state", defaultBlockState)` 解析方块状态属性表。若 `"state"` 缺失则回退为该方块的 `defaultBlockState()`。 |

### 4. `CodecUtil` 公开静态方法详解

| 方法签名 | 用途、参数说明与边界条件 |
| :--- | :--- |
| `<K, V, T> Codec<T> byMap(Codec<Map<K, V>> mapCodec, Function<T, K> keyGetter, Function<T, V> valueGetter, BiFunction<K, V, T> factory)` | 将**单条目 Map**（如 `{"#": "minecraft:stone"}`）映射为领域对象 `T`。**边界条件**：解码时若 `map.size() != 1`，返回 `DataResult.error("Expected exactly one entry in map, got ...")`；编码时通过 `Map.of(key, value)` 构造单条目不可变映射。 |
| `<T> Codec<LinkedList<T>> linkedListOf(Codec<T> codec)` | 基于列表顺序创建 `LinkedList<T>` 编解码器（内部委托 `dequeOf(codec, LinkedList::new)`）。 |
| `<T, D extends Deque<T>> Codec<D> dequeOf(Codec<T> codec, Function<? super List<T>, ? extends D> dequeFac)` | 将 `codec.listOf()` 映射为任意双端队列 `D`；编码时调用 `List.copyOf` 生成不可变快照。注意：队列内不能包含 `null` 元素，否则 `List.copyOf` 会抛出 `NullPointerException`。 |
| `<T extends Enum<T>> Codec<T> enumCodecInInt(Class<T> clazz)` | 使用枚举的 `ordinal()` 整数序号序列化。**边界条件**：解码时若下标 `< 0` 或 `>= constants.length`，返回 `DataResult.error`。若枚举顺序可能在未来版本调整，请改用 `enumCodecInLowerName`。 |
| `<T extends Enum<T>> Codec<T> enumCodecInLowerName(Class<T> clazz)` | 使用枚举名称的小写字符串（`Locale.ROOT`）序列化。**注意**：内部使用 `xmap` 调用 `Enum.valueOf(clazz, name.toUpperCase(Locale.ROOT))`，若遇到不存在的枚举名会直接抛出 `IllegalArgumentException`。 |
| `<T> Codec<Optional<T>> createOptionalCodec(Codec<T> elementCodec)` | 创建带显式布尔字段 `"isPresent"` 与可选字段 `"content"` 的复合对象 Codec。适用于必须显式区分存在位而非仅靠字段省略的协议。 |
| `MapCodec<NonNullList<Ingredient>> createIngredientListCodec(String fieldName, int size, String recipeType)` | 为无序合成等配方构建字段名为 `fieldName`、元素数量在 `[1, size]` 范围内的 `NonNullList<Ingredient>` MapCodec。若列表为空或超过 `size`，返回包含 `recipeType` 名称的 `DataResult.error`。 |
| `<T extends Comparable<T>> MapCodec<BlockState> blockStatePropertiesCodec(BlockState state)` | 遍历给定原型 `state` 的所有 `Property`，将每个属性名作为可选字段构造 `MapCodec<BlockState>`；未指定的属性保持原型 `state` 中的值。 |
| `<T extends Comparable<T>> MapCodec<BlockState> appendBlockStatePropertyCodec(MapCodec<BlockState> propertyCodec, Supplier<BlockState> holderSupplier, String value, Property<T> property, Property.Value<T> defValue)` | 向现有的 `BlockState` `MapCodec` 追加单个属性字段 `value`。若解析该属性失败或缺失，回退到 `defValue` 或 `holderSupplier.get()` 上的对应属性值。 |
| `<T, R> DataResult<R> encodeStart(MapCodec<T> codec, DynamicOps<R> ops, T input)` | 直接使用 `MapCodec<T>` 将 `input` 编码为 `ops` 下的 Map 结构（无需先 `.codec()` 包装一层），内部调用 `codec.encode(input, ops, codec.compressedBuilder(ops)).build(ops.emptyMap())`。 |
| `<T> MapCodec<List<T>> zomListMap(Codec<T> codec, String name)` | 构建零/一/多元素（Zero-Or-More）列表 `MapCodec`。解码时支持字段缺失（返回空列表 `List.of()`）、单个元素（返回单元素列表）或标准数组；编码时若列表为空则不写出字段，若仅有 1 个元素则写出为单值，若 `>= 2` 个元素则写出为数组。 |
| `<R, T1..Tn> Codec<R> create(t1, ..., tn, factory)` | `RecordCodecBuilder.create(inst -> inst.group(...).apply(inst, factory))` 的扁平化代理重载，完整提供 **1 参数至 16 参数** 共 16 个重载（分别接收 `Function`、`BiFunction`、`Function3` 至 `Function16`）。 |
| `<R, T1..Tn> MapCodec<R> mapCodec(t1, ..., tn, factory)` | `RecordCodecBuilder.mapCodec(inst -> inst.group(...).apply(inst, factory))` 的扁平化代理重载，完整提供 **1 参数至 16 参数** 共 16 个重载。 |

---

## 三、 `StreamCodecUtil` 详解与用法

### 1. 要解决什么问题 / 怎么用

在编写 NeoForge 自定义网络包（`CustomPacketPayload`）或配方网络同步逻辑时，原版 `StreamCodec` 存在两个常见限制：

1. **原版 `StreamCodec.composite` 最多只支持 6 个字段**：一旦网络包或同步记录超过 6 个字段，原版就必须退回手写 `StreamCodec.of(encode, decode)` 或嵌套拆分对象。`StreamCodecUtil.composite(...)` 直接补齐了 **7 参数至 16 参数** 的全部重载。
2. **大量原版 Criterion 谓词与注册表对象缺少直接可用的 `StreamCodec`**：例如 `EntityPredicate`、`LocationPredicate`、`DamageSourcePredicate`、`NumberProvider` 等在原版中只有 `Codec` 而没有公开的二进制 `StreamCodec`。`StreamCodecUtil` 提供了这些类型的原生二进制 `StreamCodec`，同时提供 `codec2Stream`（带注册表上下文 NBT 桥接）和 `nbtWrapped`（无注册表上下文 NBT 桥接）。

### 2. 完整代码示例

下面演示如何使用 `StreamCodecUtil` 的预置常量与 8 参数 `composite` 重载编写一个自定义网络包负载：

```java
package com.example.mymod.network;

import dev.anvilcraft.lib.v2.codec.StreamCodecUtil;
import net.minecraft.advancements.criterion.EntityPredicate;
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
    // 9 个字段，直接使用 StreamCodecUtil.composite 9 参数重载
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

### 3. `StreamCodecUtil` 预设静态常量一览

#### (1) 基础与世界对象 `StreamCodec`

| 常量名 | 缓冲区类型与目标类型 | 二进制编码格式与注意事项 |
| :--- | :--- | :--- |
| `StreamCodecUtil.ITEM` | `StreamCodec<RegistryFriendlyByteBuf, Item>` | 按 `BuiltInRegistries.ITEM.getKey(item)` 写入 `Identifier`。解码时若 ID 不存在则抛出 `IllegalArgumentException("Unknown item id: ...")`。 |
| `StreamCodecUtil.BLOCK` | `StreamCodec<RegistryFriendlyByteBuf, Block>` | 按 `BuiltInRegistries.BLOCK.getKey(block)` 写入 `Identifier`。解码时若 ID 不存在则抛出 `IllegalArgumentException("Unknown block id: ...")`。 |
| `StreamCodecUtil.VAR_INT_BLOCK_POS` | `StreamCodec<FriendlyByteBuf, BlockPos>` | 分别使用 3 个 `ByteBufCodecs.VAR_INT` 编码 `X`、`Y`、`Z`（适合小坐标或相对偏移，不受 `BlockPos.asLong` 位宽限制）。 |
| `StreamCodecUtil.BLOCK_STATE` | `StreamCodec<? super ByteBuf, BlockState>` | 使用 `Block.getId(blockState)` / `Block.stateById(buf.readInt())` 写入 4 字节全局状态 ID。 |
| `StreamCodecUtil.ENTITY` | `StreamCodec<RegistryFriendlyByteBuf, EntityType<?>>` | 按 `BuiltInRegistries.ENTITY_TYPE` 的 `Identifier` 编码与解码。 |
| `StreamCodecUtil.CHAR` | `StreamCodec<RegistryFriendlyByteBuf, Character>` | 使用 `buf.writeUtf` / `buf.readUtf(1)` 编码单个字符；若解码后长度不为 1 则抛出 `IllegalArgumentException`。 |
| `StreamCodecUtil.VEC3` | `StreamCodec<FriendlyByteBuf, Vec3>` | 依次写入 3 个 `float`（共 12 字节）。**精度注意**：`Vec3` 原生分量为 `double`，经此编解码器传输后会转为 `float` 精度。 |
| `StreamCodecUtil.VEC3I` | `StreamCodec<ByteBuf, Vec3i>` | 使用 `BlockPos.asLong(x, y, z)` 打包为单个 8 字节 `long` 传输。**边界条件**：X/Z 范围需在 `[-33554432, 33554431]`，Y 范围需在 `[-2048, 2047]`。 |
| `StreamCodecUtil.NUMBER_PROVIDER` | `StreamCodec<RegistryFriendlyByteBuf, NumberProvider>` | 紧凑二进制编码：先写 1 字节类型标记（`1` = `ConstantValue`、`2` = `UniformGenerator`、`3` = `BinomialDistributionGenerator`、`-1` = 其他），再递归写入参数。若遇到不支持的 `NumberProvider` 实现，解码端会安全回退为 `ConstantValue.exactly(1)`。 |
| `StreamCodecUtil.TAG_OR_ELEMENT_LOCATION` | `StreamCodec<ByteBuf, ExtraCodecs.TagOrElementLocation>` | 组合 `Identifier.STREAM_CODEC` 与 `ByteBufCodecs.BOOL`（是否为 Tag）。 |

#### (2) 原版准则谓词（Advancement Criterion Predicates）`StreamCodec`

| 常量名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `StreamCodecUtil.ENTITY_TYPE_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityTypePredicate>` | 实体类型集合谓词流编解码器 |
| `StreamCodecUtil.DISTANCE_PREDICATE` | `StreamCodec<ByteBuf, DistancePredicate>` | 距离范围谓词（x / y / z / horizontal / absolute）流编解码器 |
| `StreamCodecUtil.MOVEMENT_PREDICATE` | `StreamCodec<ByteBuf, MovementPredicate>` | 实体运动速度与摔落距离谓词流编解码器 |
| `StreamCodecUtil.POSITION_PREDICATE` | `StreamCodec<ByteBuf, LocationPredicate.PositionPredicate>` | 坐标范围谓词流编解码器 |
| `StreamCodecUtil.LIGHT_PREDICATE` | `StreamCodec<ByteBuf, LightPredicate>` | 光照等级范围谓词流编解码器 |
| `StreamCodecUtil.FLUID_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, FluidPredicate>` | 流体集合与状态属性谓词流编解码器 |
| `StreamCodecUtil.LOCATION_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, LocationPredicate>` | 位置谓词（坐标、生物群系、结构、维度、烟雾、光照、方块、流体、天空可见性）9 参数组合流编解码器 |
| `StreamCodecUtil.LOCATION_WRAPPER` | `StreamCodec<RegistryFriendlyByteBuf, EntityPredicate.LocationWrapper>` | 实体所在位置 / 脚踏位置 / 影响移动位置三元组流编解码器 |
| `StreamCodecUtil.MOB_EFFECT_INSTANCE_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, MobEffectsPredicate.MobEffectInstancePredicate>` | 单个状态效果等级、持续时间、信标环境与可见性谓词流编解码器 |
| `StreamCodecUtil.MOB_EFFECTS_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, MobEffectsPredicate>` | 状态效果映射表谓词流编解码器 |
| `StreamCodecUtil.NBT_PREDICATE` | `StreamCodec<ByteBuf, NbtPredicate>` | NBT 复合标签谓词流编解码器 |
| `StreamCodecUtil.ENTITY_FLAGS_PREDICATE` | `StreamCodec<ByteBuf, EntityFlagsPredicate>` | 实体状态标志位（着地、着火、潜行、疾跑、游泳、飞行、幼年、水中、鞘翅滑翔）9 参数流编解码器 |
| `StreamCodecUtil.ITEM_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, ItemPredicate>` | 物品集合、数量范围与 `DataComponentMatchers` 谓词流编解码器 |
| `StreamCodecUtil.ENTITY_EQUIPMENT_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityEquipmentPredicate>` | 实体 7 个装备槽位（头、胸、腿、脚、身体、主手、副手）谓词流编解码器 |
| `StreamCodecUtil.ENTITY_SUB_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntitySubPredicate>` | 通过 `codec2Stream` 桥接的实体子类型谓词流编解码器 |
| `StreamCodecUtil.SLOTS_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, SlotsPredicate>` | 实体物品栏槽位范围谓词流编解码器 |
| `StreamCodecUtil.ENTITY_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, EntityPredicate>` | 支持递归（载具 `vehicle`、乘客 `passenger`、目标实体 `targetedEntity`）的 16 字段完整 `EntityPredicate` 流编解码器 |
| `StreamCodecUtil.DAMAGE_SOURCE_PREDICATE` | `StreamCodec<RegistryFriendlyByteBuf, DamageSourcePredicate>` | 伤害来源（伤害标签、直接实体、源头实体、是否直接伤害）谓词流编解码器 |

### 4. `StreamCodecUtil` 公开静态方法详解

| 方法签名 | 用途、参数说明与边界条件 |
| :--- | :--- |
| `<T> StreamCodec<ByteBuf, TagKey<T>> tagKey(ResourceKey<? extends Registry<T>> registryKey)` | 为指定注册表键创建 `TagKey<T>` 流编解码器（内部委托 `TagKey.streamCodec(registryKey)`）。 |
| `<T> StreamCodec<ByteBuf, TagPredicate<T>> tagPredicate(ResourceKey<? extends Registry<T>> registryKey)` | 为指定注册表键创建 `TagPredicate<T>`（包含 `TagKey<T>` 与 `boolean expected`）流编解码器。 |
| `void numberProviderNetworkEncode(RegistryFriendlyByteBuf buf, NumberProvider numberProvider)` | 将 `NumberProvider` 编码写入缓冲区，支持 `ConstantValue`、`UniformGenerator` 与 `BinomialDistributionGenerator` 的递归写入。 |
| `NumberProvider numberProviderNetworkDecode(RegistryFriendlyByteBuf buf)` | 从缓冲区解码 `NumberProvider`；若遇到未知类型字节标记，返回 `ConstantValue.exactly(1)`。 |
| `<T> StreamCodec<? super FriendlyByteBuf, T> nbtWrapped(Codec<T> codec)` | 将**不依赖注册表上下文**的普通 `Codec<T>` 通过 `NbtOps.INSTANCE` 包装为 `FriendlyByteBuf` 流编解码器。**注意**：若 `codec` 内部使用了 `RegistryFixedCodec` 或 `HolderSet` 等需要 `RegistryOps` 的组件，请勿使用本方法，必须改用 `codec2Stream(codec)`。 |
| `<T> StreamCodec<RegistryFriendlyByteBuf, T> codec2Stream(Codec<T> codec)` | 将**依赖注册表上下文**的 `Codec<T>` 通过 `buffer.registryAccess().createSerializationContext(NbtOps.INSTANCE)` 转换为 `RegistryFriendlyByteBuf` 流编解码器。编码或解码失败时调用 `getOrThrow()` 抛出异常。 |
| `<B extends ByteBuf, T extends Enum<T>> StreamCodec<B, T> enumStreamCodec(Class<T> clazz)` | 基于 `ByteBufCodecs.VAR_INT` 按枚举 `ordinal()` 编解码。 |
| `<B, F, S> StreamCodec<B, Pair<F, S>> createPairStreamCodec(StreamCodec<? super B, F> first, StreamCodec<? super B, S> second)` | 将两个 `StreamCodec` 组合为 `com.mojang.datafixers.util.Pair<F, S>` 的流编解码器。 |
| `<B, C, T1..Tn> StreamCodec<B, C> composite(codec1, getter1, ..., codecn, gettern, factory)` | 扩展原版 `StreamCodec.composite`，提供 **7 参数至 16 参数** 共 10 个高阶重载（配合 `Function7` 至 `Function16`）。各字段按声明顺序严格依次编码和解码。 |
