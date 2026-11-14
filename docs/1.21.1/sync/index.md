# @Sync 与 @LazySync 注解及同步管理器

`module.sync`（模组 ID：`anvillib_sync`）为 NeoForge 1.21.1 提供了一套**零手写网络包的声明式字段双端自动同步框架**。通过在方块实体、实体或静态状态持有类上添加注解，并在类加载期借助 CoreMod 字节码注入完成宿主绑定，开发者可以直接在代码中修改字段，框架便会自动在 `S2C`（服务端到客户端）、`C2S`（客户端到服务端）或 `BOTH`（双向）间保持状态同步。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

## 两种同步模式对比

`module.sync` 提供两种互补的同步策略，开发者可根据性能特点与代码侵入度按需选择（亦可在同一类中混用）：

| 对比维度 | `@Sync` + `SyncProxy<T>`（即时同步） | `@LazySync`（每 Tick 差分分组同步） |
| --- | --- | --- |
| **注解标注位置** | 标注在**类 (`TYPE`)** 上 | 标注在**字段 (`FIELD`)** 上 |
| **字段类型要求** | 必须是 **`public final SyncProxy<T>`**（否则发包反射读取或注入报错/跳过） | **直接声明原生类型字段**（`private` / 非 `final` 均可，不能为 `final` 否则无法写回） |
| **发送时机** | 调用 `proxy.setValue(...)` 时**立即**触发单字段网络包 `SyncPayload` | 每服务端/客户端 Tick 结束 (`TickEvent.Post`) 时由 `LazySyncManager` 统一编码对比字节快照，有变化时才发包 |
| **合批效率** | 每次 `setValue` 发送 1 个 `SyncPayload` | 同一对象在同一 Tick 内变更的多个 `@LazySync` 字段合并为 **1 个 `LazySyncPayload`** |
| **可变对象感知** | 需显式调用 `setValue` 触发 | 自动对比编码后字节数组，因此支持 `CompoundTag` / `ItemStack` 等**原地修改** |
| **Codec 指定方式** | 支持在 `SyncProxy` 构造器显式传入自定义 `StreamCodec` | 仅支持通过 `SyncProxy.defaultCodec` 解析的内建类型与声明了 `Codec`/`MapCodec` 静态字段的类型 |
| **静态字段支持** | 支持（`public static final SyncProxy<T>`，父类键为 `Class<?>`） | 支持（`static` 且非 `final` 的带 `@LazySync` 字段） |

## 完整用法示例

### 示例一：在方块实体中同时使用 `@Sync` 与 `@LazySync`

内建 `AnvilLibSyncEntries` 已为 `BlockEntity`、`Entity` 与 `Class<?>`（静态字段宿主）注册了 `SyncRegisterEntry`，因此方块实体和实体无需额外注册即可开箱同步。

```java
package com.example.examplemod.block.entity;

import dev.anvilcraft.lib.v2.sync.annotation.LazySync;
import dev.anvilcraft.lib.v2.sync.annotation.Sync;
import dev.anvilcraft.lib.v2.sync.management.SyncProxy;
import dev.anvilcraft.lib.v2.sync.util.SyncDirection;
import net.minecraft.core.BlockPos;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;

@Sync(SyncDirection.S2C)
public class ArcaneInfuserBlockEntity extends BlockEntity {
    // 1. @Sync 即时同步字段：必须为 public final SyncProxy<T>，方向默认继承类上 @Sync(S2C)
    public final SyncProxy<Integer> progress = new SyncProxy<>(0);

    // 可对单个代理显式覆盖同步方向，例如允许客户端 GUI 按钮直接修改目标模式
    public final SyncProxy<Boolean> autoEject = new SyncProxy<>(false).direction(SyncDirection.C2S);

    // 2. @LazySync 字段：无需 SyncProxy 包装，支持 private 字段及原地可变对象，由 LazySyncManager 按 tick 差分合批
    @LazySync(SyncDirection.S2C)
    private ItemStack displayCatalyst = ItemStack.EMPTY;

    @LazySync(SyncDirection.S2C)
    private int storedMana = 0;

    public ArcaneInfuserBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState blockState) {
        super(type, pos, blockState);
        // CoreMod 字节码注入会自动在构造器末尾绑定 progress/autoEject 的 parent 与 fieldName，并向 LazySyncManager 登记 this
    }

    public void serverStep(int deltaMana, ItemStack newStack) {
        if (this.level == null || this.level.isClientSide()) {
            return;
        }
        // 即时触发 SyncPayload 到追踪该区块的客户端
        Integer current = this.progress.getValue();
        this.progress.setValue((current == null ? 0 : current) + 1);

        // 以下两个字段会在当前 ServerTickEvent.Post 统一合并成一个 LazySyncPayload 下发
        this.storedMana += deltaMana;
        this.displayCatalyst = newStack.copy();
    }
}
```

### 示例二：为自定义非原版宿主类型注册 `SyncRegisterEntry`

如果需要同步既不是 `BlockEntity`、也不是 `Entity`、也不是静态全局字段的自定义对象（例如按玩家 UUID 索引的全局能力对象或自定义世界服务），可以向 `AnvilLibSyncRegistries.SYNC_ENTRY` 注册自己的 `SyncRegisterEntry<T, ID>`：

```java
package com.example.examplemod.sync;

import dev.anvilcraft.lib.v2.sync.init.AnvilLibSyncRegistries;
import dev.anvilcraft.lib.v2.sync.management.SyncRegisterEntry;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.codec.StreamCodec;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class ModSyncEntries {
    public static final Map<UUID, PlayerManaState> CLIENT_STATES = new ConcurrentHashMap<>();
    public static final Map<UUID, PlayerManaState> SERVER_STATES = new ConcurrentHashMap<>();

    public static final DeferredRegister<SyncRegisterEntry<?, ?>> ENTRIES =
        DeferredRegister.create(AnvilLibSyncRegistries.SYNC_ENTRY, "examplemod");

    public static final DeferredHolder<SyncRegisterEntry<?, ?>, SyncRegisterEntry<PlayerManaState, UUID>> PLAYER_MANA =
        ENTRIES.register(
            "player_mana",
            () -> SyncRegisterEntry.create(
                PlayerManaState.class,
                (StreamCodec<ByteBuf, UUID>) (StreamCodec<?, ?>) UUIDUtil.STREAM_CODEC,
                PlayerManaState::ownerId,
                (ctx, id) -> ctx.flow().isServerbound() ? SERVER_STATES.get(id) : CLIENT_STATES.get(id)
            )
        );

    public static void register(IEventBus modEventBus) {
        ENTRIES.register(modEventBus);
    }

    public record PlayerManaState(UUID ownerId) {
    }
}
```

::: danger `@Sync` 字段可见性与 `final` 约束
1. **`SyncProxy` 字段必须是 `public final`**：
   - `SyncBytecodeInjector` 在类加载期注入时只处理带有 `final` 修饰符的 `SyncProxy` 字段（非 `final` 将被跳过并打印 Warn）。
   - `SyncPayload` 在对端收包写回时调用 `clazz.getField(fieldName)`（注意是 `getField` 而非 `getDeclaredField`！），如果代理字段是 `private` 或 `protected`，收包时将抛出 `NoSuchFieldException`！
2. **`@LazySync` 字段不能是 `final`**：`LazySyncManager` 写回变更时会调用 `Field#set(...)`，若字段被声明为 `final` 将导致反射写回失败（而 `private` 完全允许，管理器内部通过 `getDeclaredFields()` + `setAccessible(true)` 访问）。
3. **无参值构造 `new SyncProxy<>(null)` 会失败**：使用单参构造器 `new SyncProxy<>(T value)` 时会调用 `value.getClass()` 推断编解码器；初始值为 `null` 时请务必使用 `new SyncProxy<>(MyType.class)` 或传入显式 `StreamCodec` 的构造器。
4. **`@LazySync` 首 Tick 基线静默规则**：`LazySyncManager` 第一次在 Tick 中观测到某对象字段时只记录初始字节快照（不发送网络包），假设两端构造后初始状态一致；只有从下一 Tick 开始发生差异时才触发同步。
:::

## 默认 `StreamCodec` 解析支持列表

当未向 `SyncProxy` 显式传递 `StreamCodec`（或使用 `@LazySync` 自动解析字段类型）时，`SyncProxy` 按如下顺序匹配：

1. **内建类型直连映射**：
   - `CompoundTag` / `Tag` (`ByteBufCodecs.TAG`)
   - `Vector3fc` (`VECTOR3F`)、`Quaternionfc` (`QUATERNIONF`)
   - `PropertyMap` (`GAME_PROFILE_PROPERTIES`)、`GameProfile` (`GAME_PROFILE`)
   - `BlockPos` (`BlockPos.STREAM_CODEC`)、`Component` (`ComponentSerialization.STREAM_CODEC`)
   - `ItemStack` (`ItemStack.OPTIONAL_STREAM_CODEC`)
   - `String` (`STRING_UTF8`)
   - 原始与包装基本类型：`Boolean`/`boolean`、`Double`/`double`、`Float`/`float`、`Long`/`long` (`VAR_LONG`)、`Integer`/`int` (`INT`)、`Short`/`short`、`Byte`/`byte`
   - 数组：`Long[]`/`long[]`（`VarInt` 长度 + `VarLong` 逐元素编码）、`Byte[]`/`byte[]` (`BYTE_ARRAY`)
2. **自定义类型的 `Codec<T>` / `MapCodec<T>` 回退扫描**：
   - 检查目标类自身声明的所有 `public static final` 字段（不含父类），查找类型严格等于 `Codec<T>` 或 `MapCodec<T>`（类型实参与目标类兼容）的字段，并通过 `ByteBufCodecs.fromCodecWithRegistries(...)` 包装为注册表感知的 `StreamCodec`。

## 公开 API 完整参考

### 1. 注解与方向枚举 (`dev.anvilcraft.lib.v2.sync.annotation` / `util`)

| 类型 | 签名 / 成员 | 说明 |
| --- | --- | --- |
| `@Sync` | `@Target(ElementType.TYPE)`；`SyncDirection value() default SyncDirection.BOTH` | 声明当前类含 `@Sync` 即时同步字段 (`SyncProxy`) 并设定默认同步方向 |
| `@LazySync` | `@Target(ElementType.FIELD)`；`SyncDirection value() default SyncDirection.BOTH` | 标记指定字段由 `LazySyncManager` 每 tick 进行字节级差分并按宿主对象合批同步 |
| `enum SyncDirection` | `BOTH(true, true)`、`C2S(true, false)`、`S2C(false, true)`；`isCreateByClient()`、`isCreateByServer()` | 控制同步包可由哪一端发起；注意 `@Sync` 只带 `CLASS` 保留策略且仅由 `SyncBytecodeInjector` 在类加载时注入方向 |

### 2. `SyncProxy<T>`

包名：`dev.anvilcraft.lib.v2.sync.management`

| 构造器 / 方法签名 | 参数与返回值 | 说明 |
| --- | --- | --- |
| `SyncProxy(T value)` | `value` 不可为 `null` | 以初始值非空实例的运行时类查找默认 `StreamCodec` |
| `SyncProxy(T value, StreamCodec<? extends ByteBuf, T> codec)` | 初始值与自定义 `StreamCodec` | 显式绑定编码器，允许 `value` 为 `null` |
| `SyncProxy(Class<T> type)` | 目标类 `Class` | 初始值为 `null`，按 `type` 查找默认 `StreamCodec` |
| `SyncProxy(StreamCodec<? extends ByteBuf, T> codec)` | 自定义 `StreamCodec` | 初始值为 `null`，直接使用指定 `StreamCodec` |
| `SyncProxy<T> direction(SyncDirection direction)` | 同步方向，返回 `this` | 链式覆盖该字段的同步方向（优先于类上 `@Sync` 注解） |
| `@Nullable T getValue()` | 返回当前缓存值 | 线程安全读取 `volatile` 缓存值 |
| `void setValue(@Nullable T value)` | 写入新值 | 写入本地 `volatile` 值并若方向允许则向对端发送 `SyncPayload`（内部允许 `null` 标记位） |
| `<B extends ByteBuf> void setValue(B buf, boolean serverbound)` | 从缓冲区解码并更新值 | 由接收端解包调用；若 `serverbound == true`（且字段方向为 `BOTH` 等可服务端发包），还会继续触发转发逻辑 |
| `<B extends ByteBuf> void encode(B byteBuf)` | 写入目标 `ByteBuf` | 先写入 `boolean (value == null)`，非空时再通过 `codec` 写入内容 |

### 3. 注册表与索引入口 (`dev.anvilcraft.lib.v2.sync.init` & `management`)

| 类 / 成员签名 | 说明 |
| --- | --- |
| `AnvilLibSyncRegistries.SYNC_ENTRY` | `ResourceKey<Registry<SyncRegisterEntry<?, ?>>>`，注册表 ID 为 `anvillib_sync:sync_entry` |
| `AnvilLibSyncRegistries.SYNC_ENTRY_REGISTRY` | `Registry<SyncRegisterEntry<?, ?>>`，最大容量 `512`，在 `NewRegistryEvent` 自动注册 |
| `AnvilLibSyncEntries.STATIC` | 内置静态类宿主条目：目标类型 `Class<?>`，ID 为全限定类名 `String` |
| `AnvilLibSyncEntries.ENTITY` | 内置实体宿主条目：目标类型 `Entity`，ID 为 `UUID`，启用维度/实体追踪筛选 |
| `AnvilLibSyncEntries.BLOCK_ENTITY` | 内置方块实体宿主条目：目标类型 `BlockEntity`，ID 为 `BlockPos`，启用维度/追踪区块筛选 |
| `record SyncRegisterEntry<T, ID>(...)` | 宿主定位描述符，包含 `(clazz, idCodec, idGetter, finder, dimension, dimensionGetter)`；提供 3 个 `create(...)` 静态工厂重载（全局 / 按 `Level` 计算维度 / 完整参数）及函数式接口 `SyncRegisterEntry.Finder<T, ID>` |
