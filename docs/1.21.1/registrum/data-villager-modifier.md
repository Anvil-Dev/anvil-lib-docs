# 数据组件、附件、配方类型、修改器与村民

除方块、物品与实体外，`module.registrum` 为 NeoForge 1.21.1 的常见扩展注册表与原版游戏系统提供了一整套轻量级 Builder，避免开发者反复撰写繁琐的 `DeferredRegister` 模板。

## 数据组件与附件 (`data` 子包)

### `DataComponentBuilder<E, P>` — 物品与容器数据组件

在 Minecraft 1.21.1 中，物品 NBT 全面被类型安全的 `DataComponentType<E>` 取代。通过 `REGISTRUM.dataComponent(name, operator)` 或先声明 builder 调用构建方法：

- `AbstractRegistrum.dataComponent(String name, UnaryOperator<DataComponentBuilder<E, S>> builder)` -> 返回构建好的 `DataComponentEntry<E>`。
- 也可先获取 Builder 配置再 `.register()`：
  - `persistent(Codec<E> codec)`：设置磁盘持久化所需的 `Codec<E>`。不调用此方法则该组件仅存在于运行时内存，不会写入存档或战利品 NBT。
  - `networkSynchronized(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)`：设置客户端/服务端网络同步编解码器。若服务端希望把自定义物品组件正确发往客户端展示 Tooltip，务必配置此项。
  - `cacheEncoding()`：开启编码缓存优化（推荐用于高频读取、少修改的不可变 Record 组件）。

### `AttachmentBuilder<E, P>` — NeoForge 数据附件

NeoForge 的 Data Attachments 允许将持久化与可同步数据直接挂载到实体、区块、方块实体、世界和物品栈上。通过 `REGISTRUM.attachment(name, supplierOrFunction)` 创建（支持无参 `Supplier<E>` 或接收 `IAttachmentHolder` 的 `Function<IAttachmentHolder, E>`）：

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `serialize(IAttachmentSerializer<?, E> serializer)` | `AttachmentBuilder<E, P>` | 使用自定义完整 NeoForge 附件序列化器 |
| `serialize(Codec<E> serializer)` | `AttachmentBuilder<E, P>` | 基于 `Codec<E>` 的序列化支持（注：1.21.1 中此处参数为 `Codec<E>`） |
| `serialize(Codec<E> serializer, Predicate<? super E> predicate)` | `AttachmentBuilder<E, P>` | 使用 `Codec<E>` 序列化，仅在值满足 `predicate` 时落盘（用于剔除默认值减少存档体积） |
| `copyOnDeath()` | `AttachmentBuilder<E, P>` | 玩家死亡重生或维度切换实体重建时自动保留附件数据 |
| `copyHandler(IAttachmentCopyHandler<E> cloner)` | `AttachmentBuilder<E, P>` | 自定义拷贝逻辑（常用于深拷贝可变状态容器） |
| `sync(AttachmentSyncHandler<E> syncHandler)` | `AttachmentBuilder<E, P>` | 使用自定义客户端同步处理器 |
| `sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | 使用全量同步 `StreamCodec`（默认广播给跟踪实体的客户端/当前玩家） |
| `sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | 按条件过滤同步接收者的 `StreamCodec` 同步策略 |
| `register()` | `AttachmentEntry<E>` | 完成注册并返回 `AttachmentEntry<E>`（继承 `RegistryEntry<AttachmentType<?>, AttachmentType<E>>`） |

## 配方类型与序列化器 (`recipe` 子包)

在 `AbstractRegistrum` 上可以直接通过 `recipe`、单个 `recipeType` 或自定义序列化器完成注册：

- `REGISTRUM.recipe(String name, MapCodec<T> codec, StreamCodec<RegistryFriendlyByteBuf, T> streamCodec)`：一次性注册同名配方类型 `RecipeType<T>` 和配方序列化器 `RecipeSerializer<T>`，打包返回 `RecipeEntry<T>`（包含 `type()` 与 `serializer()` 两个成员字段）。
- `RecipeTypeBuilder<T, P>`：注册 `Registries.RECIPE_TYPE`，默认覆写 `toString()` 返回 `"<modid>:<name>"`，产出 `RecipeTypeEntry<T>`。
- `RecipeSerializerBuilder<T, P>`：注册 `Registries.RECIPE_SERIALIZER`，接受 `MapCodec<T>` 与 `StreamCodec<RegistryFriendlyByteBuf, T>`，生成对应匿名 `RecipeSerializer<T>` 实现并产出 `RecipeSerializerEntry<T>`。

## 加载条件与数据驱动修改器 (`ConditionBuilder` & `modifier` 子包)

这类条目底层均向 NeoForge 对应的编码注册表注册 `MapCodec<? extends ...>`，供 JSON 数据包中的 `"type"` 或 `"neoforge:conditions"` 字段解析引用：

| Builder 类 | 注册方法 (`REGISTRUM.*`) | 目标注册表 (`NeoForgeRegistries.Keys.*`) | 返回 Entry |
| :--- | :--- | :--- | :--- |
| `ConditionBuilder<T, P>` | `condition(String name, MapCodec<T> mapCodec)` | `CONDITION_CODECS` | `ConditionEntry<T>` |
| `BiomeModifierBuilder<T, P>` | `biomeModifier(String name, MapCodec<T> mapCodec)` | `BIOME_MODIFIER_SERIALIZERS` | `BiomeModifierEntry<T>` |
| `GlobalLootModifierBuilder<T, P>` | `glm(String name, MapCodec<T> codec)` | `GLOBAL_LOOT_MODIFIER_SERIALIZERS` | `GlobalLootModifierEntry<T>` |
| `StructureModifierBuilder<T, P>` | `structureModifier(String name, MapCodec<T> codec)` | `STRUCTURE_MODIFIER_SERIALIZERS` | `StructureModifierEntry<T>` |

## 药水、状态效果、声音与游戏事件

- `MobEffectBuilder<T, P>`：`REGISTRUM.mobEffect(String name, NonNullSupplier<T> supplier)`，向 `Registries.MOB_EFFECT` 注册状态效果，返回 `MobEffectEntry<T>`。
- `PotionBuilder<P>`：`REGISTRUM.potion(String name, MobEffectInstance... effects)`，继承 `SelfBuilder`，自动构造 `new Potion(owner.getModid() + ":" + name, effects)` 注册至 `Registries.POTION`，返回 `PotionEntry`。
- `SoundEventBuilder<P>`：
  - `REGISTRUM.soundEvent(String name)` -> 调用 `SoundEvent.createVariableRangeEvent(...)`。
  - `REGISTRUM.soundEvent(String name, float fix)` -> 调用 `SoundEvent.createFixedRangeEvent(..., fix)`。
  - 返回 `SoundEventEntry`。
- `GameEventBuilder<P>`：`REGISTRUM.gameEvent(String name, int radius)`，创建具备指定振动传播半径 `new GameEvent(radius)` 注册至 `Registries.GAME_EVENT`，返回 `GameEventEntry`。

## 村民系统 (`villager` 子包)

::: info 1.21.1 村民注册说明
在 MC 1.21.1 中，`VillagerProfession` 是仅包含工作站点谓词、需求物品、次级 POI 与工作音效的 6 元 Record，**不存在**数据驱动交易表参数；新增村民交易请在运行时监听 NeoForge 事件 `VillagerTradesEvent` 注册。此外 `BiomeBuilder.java` 在 1.21.1 分支已整体注释停用，不应被引用。
:::

`AbstractRegistrum` 提供完整的村民工作点、职业与群系着装类型支持：

- `poi(String name, Supplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` -> 返回 `PoiTypeBuilder`，注册 `PoiType` 并返回 `SelfEntry<PoiType>`。
- `villager(String name)` -> 返回 `VillagerTypeBuilder`，使用 `new VillagerType(name)` 注册村民类型。
- `profession(...)` 三个重载 -> 返回 `VillagerProfessionBuilder`：
  1. `(String name, ResourceKey<PoiType> jobSite, @Nullable SoundEvent workSound)`：最简版本，同时将 `jobSite` 作为 `heldJobSite` 和 `acquirableJobSite` 谓词，请求物品与次级 POI 均设为空。
  2. `(String name, Predicate<Holder<PoiType>> heldJobSite, Predicate<Holder<PoiType>> acquirableJobSite, @Nullable SoundEvent workSound)`
  3. `(String name, Predicate<Holder<PoiType>> heldJobSite, Predicate<Holder<PoiType>> acquirableJobSite, ImmutableSet<Item> requestedItems, ImmutableSet<Block> secondaryPoi, @Nullable SoundEvent workSound)`

## 完整实用示例：自定义组件、附件、配方、声音与村民

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
    // 1. 持久化并同步的物品能量 DataComponent
    public static final DataComponentEntry<Integer> STORED_CHARGE = ExampleMod.REGISTRUM
        .dataComponent("stored_charge", b -> b
            .persistent(Codec.INT)
            .networkSynchronized(ByteBufCodecs.VAR_INT)
            .cacheEncoding()
        );

    // 2. 实体/玩家附件：仅在非 0 时落盘，死亡保留并仅向对应玩家同步
    public static final AttachmentEntry<Integer> MACHINE_MASTERY = ExampleMod.REGISTRUM
        .attachment("machine_mastery", () -> 0)
        .serialize(Codec.INT, value -> value > 0)
        .copyOnDeath()
        .sync(
            (holder, player) -> holder == player,
            ByteBufCodecs.VAR_INT
        )
        .register();

    // 3. 同时注册 RecipeType 与 RecipeSerializer
    public static final RecipeEntry<CrushingRecipe> CRUSHING_RECIPE = ExampleMod.REGISTRUM
        .recipe("crushing", CrushingRecipe.CODEC, CrushingRecipe.STREAM_CODEC);

    // 4. 声音事件与机械师村民
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
