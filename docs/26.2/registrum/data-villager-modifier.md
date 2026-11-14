# 数据组件、附件、配方、村民与修改器构建器 (`data` / `villager` / `modifier` / `recipe`)

<BranchContextCard branch="26.2" />

在 Minecraft 1.21+ / 26.2 架构中，物品与方块实体大量使用数据组件（`DataComponentType`）与 NeoForge 数据附件（`AttachmentType`），世界生成与战利品广泛使用修改器（`BiomeModifier` / `GlobalLootModifier` / `StructureModifier`）。`module.registrum` 为这些 NeoForge 26.2 核心注册表提供了开箱即用的链式构建器。

---

## 一、 数据组件与组件谓词构建器 (`DataComponentBuilder` / `DataComponentPredicateBuilder`)

### 1. 要解决什么问题 / 怎么用

- **`DataComponentBuilder<E, P>`**：通过 `REGISTRUM.dataComponent("name")`（或传入类型标识 `REGISTRUM.dataComponent("name", MyData.class)`）链式配置 `persistent(Codec)`、`networkSynchronized(StreamCodec)`、`cacheEncoding()` 与 `ignoreSwapAnimation()`，返回 `DataComponentEntry<E>`。
- **`DataComponentPredicateBuilder<E, P>`**：通过 `REGISTRUM.dataComponentPredicate("name")` 配置 `codec(Codec<E>)`，自动包装为 `new DataComponentPredicate.ConcreteType<>(codec)` 注册至 `Registries.DATA_COMPONENT_PREDICATE_TYPE`，返回 `DataComponentPredicateEntry<E>`。

### 2. 代码示例

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.mojang.serialization.Codec;
import dev.anvilcraft.lib.v2.registrum.util.entry.data.DataComponentEntry;
import net.minecraft.network.codec.ByteBufCodecs;

public final class ModDataComponents {
    // 注册一个持久化且网络同步的整数型充能等级数据组件
    public static final DataComponentEntry<Integer> CHARGE_LEVEL = MyMod.REGISTRUM
        .<Integer>dataComponent("charge_level")
        .persistent(Codec.INT)
        .networkSynchronized(ByteBufCodecs.VAR_INT)
        .cacheEncoding()
        .ignoreSwapAnimation()
        .register();
}
```

### 3. API 签名表

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `DataComponentBuilder<E, P>` | • `persistent(Codec<E> codec)`<br>• `networkSynchronized(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)`<br>• `cacheEncoding()`<br>• `ignoreSwapAnimation()`<br>• `DataComponentEntry<E> register()` | 封装原版 `DataComponentType.Builder<E>`，注册至 `Registries.DATA_COMPONENT_TYPE`。 |
| `DataComponentPredicateBuilder<E, P>` | • `codec(Codec<E> codec)`<br>• `DataComponentPredicateEntry<E> register()` | 注册至 `Registries.DATA_COMPONENT_PREDICATE_TYPE`。若未调用 `codec(...)` 则在 `createEntry()` 时抛出 `IllegalStateException("Codec is not set")`。 |

---

## 二、 NeoForge 数据附件构建器 (`AttachmentBuilder`)

### 1. 代码示例

通过 `REGISTRUM.attachment(name, defaultValueSupplier)`（或接收 `Function<IAttachmentHolder, E>` 的重载）向 `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` 注册附加在区块、实体、方块实体或世界上的数据附件：

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

### 2. `AttachmentBuilder<E, P>` API 表

| 方法签名 | 说明 |
| :--- | :--- |
| `serialize(IAttachmentSerializer<E> serializer)` | 使用自定义 `IAttachmentSerializer` 持久化附件。 |
| `serialize(MapCodec<E> serializer)`<br>`serialize(MapCodec<E> serializer, Predicate<? super E> shouldSerialize)` | 使用 `MapCodec<E>` 持久化附件（可附加条件谓词控制何时需要写入存档）。 |
| `copyOnDeath()`<br>`copyHandler(IAttachmentCopyHandler<E> cloner)` | 设置玩家死亡重生或跨维度转换时保留附件数据，或指定自定义复制处理器。 |
| `sync(AttachmentSyncHandler<E> syncHandler)`<br>`sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)`<br>`sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | 配置服务端向客户端自动同步附件数据的网络流编解码器及目标玩家过滤条件。 |
| `AttachmentEntry<E> register()` | 完成构建并返回 `AttachmentEntry<E>`。 |

---

## 三、 配方类型与序列化器联动注册 (`RecipeTypeBuilder` / `RecipeSerializerBuilder` / `RecipeEntry`)

在原版中新增一种自定义配方需要分别向 `Registries.RECIPE_TYPE` 注册 `RecipeType<T>`、向 `Registries.RECIPE_SERIALIZER` 注册 `RecipeSerializer<T>`。

调用 `REGISTRUM.recipe(String name, MapCodec<T> codec, StreamCodec<RegistryFriendlyByteBuf, T> streamCodec)` 会**一次性同时创建并注册同名 `RecipeTypeBuilder` 与 `RecipeSerializerBuilder`**，并返回聚合记录 `RecipeEntry<T>(RecipeTypeEntry<T> type, RecipeSerializerEntry<T> serializer)`：

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
    // 可通过 GRINDING.type().get() 获取 RecipeType，通过 GRINDING.serializer().get() 获取 RecipeSerializer
}
```

---

## 四、 村民兴趣点、职业与外观类型构建器 (`villager`)

位于 `dev.anvilcraft.lib.v2.registrum.builders.villager`，提供村民系统的三类构建器（均继承自 `SelfBuilder`，返回 `SelfEntry<T>`）：

| 构建器类名 | `REGISTRUM` 入口方法签名 | 说明 |
| :--- | :--- | :--- |
| **`PoiTypeBuilder<P>`** | `REGISTRUM.poi(String name, Supplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` | 向 `Registries.POINT_OF_INTEREST_TYPE` 注册工作站点方块集合对应的 `PoiType`。 |
| **`VillagerProfessionBuilder<P>`** | • `REGISTRUM.profession(String name, Predicate<Holder<PoiType>> heldJobSite, Predicate<Holder<PoiType>> acquirableJobSite, ImmutableSet<Item> requestedItems, ImmutableSet<Block> secondaryPoi, @Nullable SoundEvent workSound, Int2ObjectMap<ResourceKey<TradeSet>> tradeSetsByLevel)`<br>• 以及省略 `requestedItems` / `secondaryPoi` 或直接接收 `ResourceKey<PoiType> jobSite` 的便捷重载 | 向 `Registries.VILLAGER_PROFESSION` 注册村民职业（适配 Minecraft 26.2 基于 `Int2ObjectMap<ResourceKey<TradeSet>>` 的交易集结构，自动绑定翻译键 `"entity.<modid>.villager.<name>"`）。 |
| **`VillagerTypeBuilder<P>`** | `REGISTRUM.villager(String name)` | 向 `Registries.VILLAGER_TYPE` 注册生物群系村民外观类型 `new VillagerType()`。 |

---

## 五、 生物群系、全局战利品与结构修改器构建器 (`modifier`)

位于 `dev.anvilcraft.lib.v2.registrum.builders.modifier`，用于注册 NeoForge 的三大数据包修改器 Codec：

| 构建器与返回 Entry | `REGISTRUM` 入口方法签名 | 目标注册表 |
| :--- | :--- | :--- |
| **`BiomeModifierBuilder<T, P>`**<br>→ `BiomeModifierEntry<T>` | `REGISTRUM.biomeModifier(String name, MapCodec<T> codec)` | `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` |
| **`GlobalLootModifierBuilder<T, P>`**<br>→ `GlobalLootModifierEntry<T>` | `REGISTRUM.glm(String name, MapCodec<T> codec)` | `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` |
| **`StructureModifierBuilder<T, P>`**<br>→ `StructureModifierEntry<T>` | `REGISTRUM.structureModifier(String name, MapCodec<T> codec)` | `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` |

> **关于 `BiomeBuilder.java` 的说明**：源码中的 `dev.anvilcraft.lib.v2.registrum.builders.BiomeBuilder` 为早期 Forge 1.16 时代的注释归档文件（全文已注释）；在 Minecraft 26.2 中，生物群系属于数据包注册表（`Registries.BIOME`），请使用下一篇介绍的 `DataProviderInitializer#add(Registries.BIOME, bootstrap)` 与 `BiomeModifierBuilder` 生成和修改生物群系。
