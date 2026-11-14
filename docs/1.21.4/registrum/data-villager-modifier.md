# 村民、生物群系、数据组件、附件与修改器构建器

AnvilLib 对原生 Registrate 做了一系列深度扩展，覆盖 NeoForge **DataComponent**、带自动网络同步的 **Data Attachment**、**Villager** 相关系统以及面向数据包的世界修改器（**Biome / Loot / Structure Modifier**）。

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

## 数据附件与主动同步 (`AttachmentBuilder` & `AttachmentSync`)

Minecraft 1.21.4 的 NeoForge 原生注册 `AttachmentType` 不直接提供全自动跨实体/区块网络同步基础设施。为此，AnvilLib 在 `module.registrum` 中内置了基于自身 Mixin（`AttachmentHolderMixin`、`ChunkMapAccessor`、`TrackedEntityAccessor`）的完整附件同步系统，支持将 `Entity`、`BlockEntity`、`LevelChunk` 与 `Level` 上的附件自动推送至客户端。

### `AttachmentBuilder<E, P>` 全量 API

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `AbstractRegistrum#attachment(String name, Function<IAttachmentHolder, E> const_)` | `AttachmentBuilder<E, S>` | 通过持有者工厂构造附件默认值（如读取实体上下文） |
| `AbstractRegistrum#attachment(String name, Supplier<E> const_)` | `AttachmentBuilder<E, S>` | 通过无参供应器构造附件默认值 |
| `serialize(IAttachmentSerializer<?, E> serializer)` | `AttachmentBuilder<E, P>` | 注册自定义 NeoForge 序列化器 |
| `serialize(Codec<E> codec)` | `AttachmentBuilder<E, P>` | 直接基于 `Codec<E>` 配置磁盘序列化 |
| `serialize(Codec<E> codec, Predicate<? super E> shouldCopy)` | `AttachmentBuilder<E, P>` | 除序列化之外自定义判定是否序列化/克隆的谓词 |
| `copyOnDeath()` | `AttachmentBuilder<E, P>` | 玩家死亡重生后保留该附件数据（需同时调用过 `serialize(...)`） |
| `copyHandler(IAttachmentCopyHandler<E> handler)` | `AttachmentBuilder<E, P>` | 自定义实体维度切换、重生等阶段的值拷贝行为 |
| `sync(AttachmentSyncHandler<E> syncHandler)` | `AttachmentBuilder<E, P>` | 注册完全可控的同步处理器（见下文接口定义） |
| `sync(StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | 使用简化 `StreamCodec` 全量同步给所有正在追踪目标的客户端 |
| `sync(BiPredicate<IAttachmentHolder, ServerPlayer> sendToPlayer, StreamCodec<? super RegistryFriendlyByteBuf, E> streamCodec)` | `AttachmentBuilder<E, P>` | 仅同步给满足特定可见/权限过滤条件的玩家（例如只发送给持有者本人 `holder == player`） |
| `register()` | `AttachmentEntry<E>` | 在创建 `AttachmentType<E>` 时同时把处理器注册进 `AttachmentSync` |

### `AttachmentSyncHandler<T>` 与 `AttachmentSync` 核心接口

如果需要按 `initialSync`（首次进服/追踪 vs 运行期增量更新）区分编码格式或仅发送差异字段，可直接实现 `AttachmentSyncHandler<T>`：

```java
public interface AttachmentSyncHandler<T> {
    /** 判断目标客户端玩家是否应当接收该附件更新，默认返回 true */
    default boolean sendToPlayer(IAttachmentHolder holder, ServerPlayer to) {
        return true;
    }

    /** 写入网络包缓冲（单个负载最大限制 1 MiB） */
    void write(RegistryFriendlyByteBuf buf, T attachment, boolean initialSync);

    /** 在客户端从缓冲读取并反序列化，可基于 previousValue 做原地更新；返回 null 时保留原状态/跳过写入 */
    @Nullable
    T read(IAttachmentHolder holder, RegistryFriendlyByteBuf buf, @Nullable T previousValue);
}
```

#### 什么时候会自动同步？什么时候需要手动触发？

`AttachmentSync` 会自动监听以下服务端事件，并将需要同步的附件通过通道 `anvillib_registrum:attachments` 推送给对应玩家：
- **首次开始追踪 / 登录 / 切换维度 / 重生**：`PlayerEvent.StartTracking`（实体）、`ChunkWatchEvent.Sent`（区块及其内部全部带 Sync 附件的 `BlockEntity`）、`PlayerLoggedInEvent`、`PlayerChangedDimensionEvent`、`PlayerRespawnEvent`（当前世界及玩家自身）。
- **当 `IAttachmentHolder#setData(...)` 修改数据时**：内置 `AttachmentHolderMixin` 会拦截所有注册到 `AttachmentSync` 的附件写入，在服务端侧直接触发增量推送。
- **手动触发（当你直接修改了可变对象内部字段、未重新调用 `setData` 时）**：

```java
// 触发增量同步（initial = false）
AttachmentSync.syncData(player, ModAttachments.MANA_POOL.get());

// 或显式指定是否为首次全量同步标志
AttachmentSync.syncData(blockEntity, ModAttachments.MACHINE_CONFIG.get(), false);
```

若需要直接注册脱离 `AttachmentBuilder` 的第三方 `AttachmentType`，也可调用 `AttachmentSync.register(AttachmentType<T> type, AttachmentSyncHandler<T> handler)`（每个类型仅允许注册一次）。

### 完整同步附件示例

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
        // 仅同步给玩家本人，不向旁观的其他客户端泄露私密数值
        .sync((holder, player) -> holder == player, PlayerMana.STREAM_CODEC)
        .register();

    public static void register() {
    }
}
```

## 村民体系：`PoiType`、`VillagerProfession` 与 `VillagerType`

| Builder | `AbstractRegistrum` 入口 | 参数说明 |
| --- | --- | --- |
| `PoiTypeBuilder<P>` | `poiType(String name, NonNullSupplier<Set<BlockState>> matchingStates, int maxTickets, int validRange)` | 注册兴趣点方块状态集合（如职业工作台）、同时绑定最大村民认领名额和搜寻半径 |
| `VillagerProfessionBuilder<P>` | `villagerProfession(String name, ResourceKey<PoiType> jobSite, ...)` | 完整支持传入 `heldJobSite` 谓词、`acquirableJobSite` 谓词、附带工具/采集方块 `ImmutableSet` 及工作音效 `SoundEvent` |
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

## 动态生物群系与世界修改器（Biome & Modifiers）

| Builder | `AbstractRegistrum` 入口 | 目标注册表与用途 |
| --- | --- | --- |
| `BiomeBuilder<P>` | `biome(String name, NonNullSupplier<Biome> factory)` | 登记静态构建的 `Biome` 注册项，返回 `RegistryEntry<Biome, Biome>`（注：现代世界生成更推荐使用 `ProviderType.DYNAMIC` 以 Datapack JSON 形式生成 `Biome`） |
| `BiomeModifierBuilder<T, P>` | `biomeModifier(String name, MapCodec<T> mapCodec)` | 向 `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` 注册自定义群系修改器编解码器（返回 `BiomeModifierEntry<T>`） |
| `GlobalLootModifierBuilder<T, P>` | `globalLootModifier(String name, MapCodec<T> codec)` | 向 `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` 注册全局战利品修饰器编解码器（返回 `GlobalLootModifierEntry<T>`） |
| `StructureModifierBuilder<T, P>` | `structureModifier(String name, MapCodec<T> codec)` | 向 `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` 注册结构修饰器编解码器（返回 `StructureModifierEntry<T>`） |
