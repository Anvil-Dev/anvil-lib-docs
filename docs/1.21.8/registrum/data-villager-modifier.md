# 村民、数据组件、数据谓词、附件与修改器构建器

AnvilLib 对原生 Registrate 做了一系列深度扩展，覆盖 **DataComponent**、**DataComponentPredicate**、接入 NeoForge 原生同步的 **Data Attachment**、**Villager** 相关系统以及面向数据包的世界修改器（**Biome / Loot / Structure Modifier**）。

## 数据组件 (`DataComponentBuilder<E, P>`)

用于在物品堆叠上安全存储序列化数据。`DataComponentBuilder` 自动包装 `DataComponentType.builder()`，并通过 `persistent` 与 `networkSynchronized` 声明持久化及客户端同步方式。

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `AbstractRegistrum#dataComponent(String name)` | `DataComponentBuilder<E, S>` | 启动通用组件构建器（显式泛型） |
| `AbstractRegistrum#dataComponent(String name, Class<E> clazz)` | `DataComponentBuilder<E, S>` | 传入类型标记帮助编译器推导出组件值类型 `E` |
| `persistent(Codec<E> codec)` | `DataComponentBuilder<E, P>` | 指定保存到 NBT/磁盘时的 `Codec<E>` |
| `networkSynchronized(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `DataComponentBuilder<E, P>` | 指定通过物品网络包同步到客户端的 `StreamCodec` |
| `cacheEncoding()` | `DataComponentBuilder<E, P>` | 启用底层序列化缓存（对应原版 `DataComponentType.Builder#cacheEncoding()`，适合不可变值对象） |
| `register()` | `DataComponentEntry<E>` | 生成 `DataComponentType<E>` 并绑定至 `Registries.DATA_COMPONENT_TYPE` |

```java
public static final DataComponentEntry<Integer> ENERGY_STORED = MyMod.REGISTRUM
    .dataComponent("energy_stored", Integer.class)
    .persistent(Codec.INT)
    .networkSynchronized(ByteBufCodecs.VAR_INT)
    .cacheEncoding()
    .register();
```

## 数据组件谓词 (`DataComponentPredicateBuilder<E, P>`)

用于向 `Registries.DATA_COMPONENT_PREDICATE_TYPE` 注册自定义 `DataComponentPredicate.Type<E>`，供战利品表条件、进度触发器及配方匹配使用。

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `AbstractRegistrum#dataComponentPredicate(String name)` | `DataComponentPredicateBuilder<E, S>` | 创建数据组件谓词类型构建器 |
| `AbstractRegistrum#dataComponentPredicate(String name, Class<E> clazz)` | `DataComponentPredicateBuilder<E, S>` | 传入谓词类标记辅助泛型推导 |
| `codec(Codec<E> codec)` | `DataComponentPredicateBuilder<E, P>` | **必填**：设置该谓词类型对应的 `Codec<E>`（未调用会在构建条目时抛出 `IllegalStateException("Codec is not set")`） |
| `register()` | `DataComponentPredicateEntry<E>` | 创建 `new DataComponentPredicate.Type<>(codec)` 并返回包装 Entry；支持通过 `DataComponentPredicateEntry.cast(...)` 强转 |

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

## 数据附件与原生同步 (`AttachmentBuilder<E, P>`)

`AttachmentBuilder` 围绕 NeoForge `AttachmentType.Builder<E>` 封装了链式注册 API，将磁盘序列化（`MapCodec`）、死亡保留与 NeoForge 原生附件网络同步处理器（`net.neoforged.neoforge.attachment.AttachmentSyncHandler<E>`）统一整合在同一条构建链上。

### `AttachmentBuilder<E, P>` 全量 API

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `AbstractRegistrum#attachment(String name, Function<IAttachmentHolder, E> defaultValueSupplier)` | `AttachmentBuilder<E, S>` | 通过持有者工厂构造附件默认值（如读取实体上下文） |
| `AbstractRegistrum#attachment(String name, Supplier<E> defaultValueSupplier)` | `AttachmentBuilder<E, S>` | 通过无参供应器构造附件默认值 |
| `serialize(IAttachmentSerializer<E> serializer)` | `AttachmentBuilder<E, P>` | 注册自定义 NeoForge `IAttachmentSerializer<E>` |
| `serialize(MapCodec<E> serializer)` | `AttachmentBuilder<E, P>` | 基于 `MapCodec<E>` 配置磁盘与 NBT 持久化序列化 |
| `serialize(MapCodec<E> serializer, Predicate<? super E> shouldCopy)` | `AttachmentBuilder<E, P>` | 除 `MapCodec<E>` 序列化外自定义判定是否持久化/拷贝的谓词 |
| `copyOnDeath()` | `AttachmentBuilder<E, P>` | 玩家死亡重生后保留该附件数据（需配合 `serialize(...)`） |
| `copyHandler(IAttachmentCopyHandler<E> handler)` | `AttachmentBuilder<E, P>` | 自定义实体维度切换、重生等阶段的值拷贝行为 |
| `sync(net.neoforged.neoforge.attachment.AttachmentSyncHandler<E> syncHandler)` | `AttachmentBuilder<E, P>` | 直接传入 NeoForge 原生 `AttachmentSyncHandler<E>` 控制差量同步与玩家过滤 |
| `sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | 使用 `StreamCodec` 全量同步给所有正在追踪目标的客户端 |
| `sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | 仅同步给满足指定条件（例如 `holder == player`）的客户端玩家；由 `AttachmentBuilder` 内部适配为 `AttachmentSyncHandler<E>` 传给 `AttachmentType.Builder#sync(...)` |
| `register()` | `AttachmentEntry<E>` | 构建并向 `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` 注册 `AttachmentType<E>` |

### 完整同步附件示例

若你直接修改了可变附件对象内部的字段而非调用 `holder.setData(...)`，可调用 NeoForge 原生的 `holder.syncData(ModAttachments.MANA.get())` 主动推送同步。

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
        // 仅同步给玩家本人，不向旁观的其他客户端泄露私密数值
        .sync((holder, player) -> holder == player, PlayerMana.STREAM_CODEC)
        .register();

    public static void register() {
    }
}
```

## 村民体系：`PoiType`、`VillagerProfession` 与 `VillagerType`

`VillagerProfessionBuilder` 构造原版 `VillagerProfession` 时会自动使用 `"entity." + owner.getModid() + ".villager." + name` 作为显示名称翻译键。

| Builder | `AbstractRegistrum` 入口 | 参数说明 |
| --- | --- | --- |
| `PoiTypeBuilder<P>` | `poiType(String name, NonNullSupplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` | 注册兴趣点方块状态集合（如职业工作台）、最大村民认领名额和搜寻半径 |
| `VillagerProfessionBuilder<P>` | `villagerProfession(String name, ResourceKey<PoiType> jobSite, ...)` | 支持传入 `heldJobSite` 谓词、`acquirableJobSite` 谓词、附带工具/采集方块 `ImmutableSet` 及工作音效 `SoundEvent` |
| `VillagerTypeBuilder<P>` | `villagerType(String name)` | 注册自定义生物群系服装风格的村民类型 |

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

## 世界修改器（Biome / Loot / Structure Modifiers）

| Builder | `AbstractRegistrum` 入口 | 目标注册表与用途 |
| --- | --- | --- |
| `BiomeModifierBuilder<T, P>` | `biomeModifier(String name, MapCodec<T> codec)` | 向 `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` 注册自定义群系修改器编解码器（返回 `BiomeModifierEntry<T>`） |
| `GlobalLootModifierBuilder<T, P>` | `globalLootModifier(String name, MapCodec<T> codec)` | 向 `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` 注册全局战利品修饰器编解码器（返回 `GlobalLootModifierEntry<T>`） |
| `StructureModifierBuilder<T, P>` | `structureModifier(String name, MapCodec<T> codec)` | 向 `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` 注册结构修饰器编解码器（返回 `StructureModifierEntry<T>`） |
