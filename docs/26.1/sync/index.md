# Sync 字段自动同步：@Sync、@LazySync 与 SyncProxy (`module.sync`)

<BranchContextCard branch="26.1" />

`module.sync`（构件名 `anvillib-sync-neoforge-26.1` 及类处理器 `anvillib-sync-processor-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.sync`）提供了一套**基于字节码自动注入的跨端字段自动同步框架**。支持对**方块实体（`BlockEntity`）**、**实体（`Entity`）**、**类的静态字段（`static`）**以及任意自定义注册宿主对象上的字段进行单向（`S2C` / `C2S`）或双向（`BOTH`）自动同步。

框架提供两种互补的字段同步模式：
1. **即时代理同步（`@Sync` 类注解 + `final SyncProxy<T>` 字段）**：每次调用 `proxy.setValue(newValue)` 时**立即**向对端发送 `SyncPayload`；
2. **惰性差分分组同步（`@LazySync` 字段注解 + 普通字段）**：无需改变字段类型（直接写 `private int energy = 0;`），由 `LazySyncManager` 在每 Tick 结束时自动扫描被跟踪对象的字段快照，将同一个对象在同一 Tick 内发生变化的所有 `@LazySync` 字段**打包进单个 `LazySyncPayload`** 一次性发送！

本模块按功能拆分为 2 篇子文档：
- **本篇（字段自动同步与 `@Sync` / `@LazySync`）**：详解 `@Sync`、`@LazySync`、`SyncDirection`、`SyncProxy`、`SyncRegisterEntry` 与完整使用示例。
- **[字节码转换器与底层网络协议](./processor-and-network)**：详解 `SyncClassProcessor`、`SyncBytecodeInjector`、`LazySyncBytecodeInjector`、`SyncManager`、`LazySyncManager`、`SyncConfigManager` 与 `SideUtil`。

---

## 一、 接入配置

`module.sync` 依赖 `module.sync:processor`（NeoForge `ClassProcessor` SPI 服务）在类加载时自动向构造器 `<init>` 和静态初始化块 `<clinit>` 注入宿主绑定与跟踪代码。若已引入聚合包 `anvillib-neoforge-26.1`，两者均已包含；若单独引入：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-26.1:2.0.0")
    runtimeOnly("dev.anvilcraft.lib:anvillib-sync-processor-neoforge-26.1:2.0.0")
}
```

---

## 二、 两种同步模式对比与默认支持的类型

### 1. `@Sync` (`SyncProxy<T>`) vs `@LazySync` 怎么选？

| 维度 | 模式 A：`@Sync` + `final SyncProxy<T>` | 模式 B：`@LazySync` 普通字段（推荐） |
| :--- | :--- | :--- |
| **声明方式** | 在类上标 `@Sync`，字段声明为 `public final SyncProxy<T> field = new SyncProxy<>(...)`（**必须是 `final`**） | 直接在普通字段（无需 `final`）上标 `@LazySync(SyncDirection.S2C)` |
| **触发时机** | 调用 `field.setValue(val)` 时**立即**发包 | 每 Tick 结束时（`ServerTickEvent.Post` / `ClientTickEvent.Post`）自动编码比对快照，有变化才发包 |
| **多字段合并** | 每个字段每次 `setValue` 独立发送一个 `SyncPayload` | 同一个对象在同一 Tick 内修改多个 `@LazySync` 字段，**自动合并为 1 个 `LazySyncPayload`** |
| **可变对象原地修改** | 需重新调用 `setValue` 触发 | **自动检测**！因为每 Tick 按 `StreamCodec` 编码后的字节数组对比快照，哪怕原地修改了 `CompoundTag` 或 `ItemStack` 的数量/组件也能自动检出并同步 |

### 2. 默认支持的字段类型 (`SyncProxy.defaultCodec`)

无论使用 `SyncProxy` 还是 `@LazySync`，以下类型均会自动匹配编解码器：
- **基础类型与包装类**：`boolean`/`Boolean`、`byte`/`Byte`、`short`/`Short`、`int`/`Integer`、`long`/`Long`、`float`/`Float`、`double`/`Double`、`String`、`byte[]`/`Byte[]`、`long[]`/`Long[]`；
- **原版与数学类型**：`BlockPos`、`CompoundTag`、`Tag`、`Component`、`ItemStack`（`OPTIONAL_STREAM_CODEC`）、`ItemStackTemplate`、`Vector3fc`、`Quaternionfc`、`GameProfile`、`PropertyMap`；
- **自描述 Codec 类型**：任何自身声明了 `public static final Codec<Self>` 或 `public static final MapCodec<Self>` 的自定义类/记录，会自动通过 `ByteBufCodecs.fromCodecWithRegistries(codec)` 转换为支持注册表的 `StreamCodec`！

---

## 三、 完整代码示例

### 1. 在方块实体中使用 `@LazySync` 与 `@Sync` (`SyncProxy`)

`BlockEntity`、`Entity` 与 `static` 静态字段已在 `AnvilLibSyncEntries` 中默认注册了宿主寻址器，开箱即用：

```java
package com.example.mymod.block.entity;

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
public class HeaterBlockEntity extends BlockEntity {
    // 方式 1（推荐）：使用 @LazySync 直接标注普通字段，支持实例字段与静态字段
    // 每 Tick 结束时若 temperature 或 fuelStack 发生变化，会自动打包进同一个包下发给追踪该区块的客户端
    @LazySync(SyncDirection.S2C)
    private int temperature = 20;

    @LazySync(SyncDirection.S2C)
    private ItemStack fuelStack = ItemStack.EMPTY;

    // 方式 2：使用 @Sync + final SyncProxy<T>，每次调用 setValue 立即发送同步包
    public final SyncProxy<Boolean> emergencyShutdown = new SyncProxy<>(false)
        .direction(SyncDirection.BOTH);

    public HeaterBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
        // 无需手写任何注册代码！SyncClassProcessor 会在字节码层面向构造器末尾自动注入：
        // 1. this.emergencyShutdown.setParent(this / fieldName / direction)
        // 2. AnvilLibSync.LAZY_SYNC_MANAGER.track(this)
    }

    public void serverTick() {
        // 直接修改普通字段，Tick 结束时 LazySyncManager 自动检测差量并下发给客户端
        this.temperature += 5;
    }

    public void triggerEmergencyShutdown() {
        // 立即向对端发送 SyncPayload
        this.emergencyShutdown.setValue(true);
    }
}
```

### 2. 注册自定义宿主类型 (`SyncRegisterEntry`)

除了内置的 `STATIC`（静态字段）、`ENTITY`（实体）和 `BLOCK_ENTITY`（方块实体）外，如果你希望在自定义管理对象（如自定义多方块控制器或玩家会话对象）上使用 `@Sync` 或 `@LazySync`，只需向 `AnvilLibSyncRegistries.SYNC_ENTRY` 注册一个 `SyncRegisterEntry`：

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.example.mymod.network.GuildSession;
import dev.anvilcraft.lib.v2.sync.init.AnvilLibSyncRegistries;
import dev.anvilcraft.lib.v2.sync.management.SyncRegisterEntry;
import net.minecraft.core.UUIDUtil;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.UUID;

public final class ModSyncEntries {
    public static final DeferredRegister<SyncRegisterEntry<?, ?>> SYNC_ENTRIES =
        DeferredRegister.create(AnvilLibSyncRegistries.SYNC_ENTRY, MyMod.MOD_ID);

    public static final DeferredHolder<SyncRegisterEntry<?, ?>, SyncRegisterEntry<GuildSession, UUID>> GUILD_SESSION =
        SYNC_ENTRIES.register("guild_session", () -> SyncRegisterEntry.create(
            GuildSession.class,
            UUIDUtil.STREAM_CODEC,
            GuildSession::getGuildId,
            (ctx, guildId) -> GuildSession.findById(ctx.flow(), guildId)
        ));

    public static void register(IEventBus modEventBus) {
        SYNC_ENTRIES.register(modEventBus);
    }
}
```

---

## 四、 公开注解与类 API 详解

### 1. `@Sync`、`@LazySync` 与 `SyncDirection`

| 注解 / 枚举 | 适用目标 | 签名与说明 |
| :--- | :---: | :--- |
| **`@Sync`** | `TYPE`（类） | `SyncDirection value() default SyncDirection.BOTH;`。标注在包含 `final SyncProxy<T>` 字段的类上。 |
| **`@LazySync`** | `FIELD`（字段） | `SyncDirection value() default SyncDirection.BOTH;`。标注在普通实例字段或静态字段上，启用每 Tick 惰性快照差分同步。 |
| **`SyncDirection`** | — | • `BOTH(true, true)`：双端均可发起同步；<br>• `C2S(true, false)`：仅客户端可发起同步到服务端；<br>• `S2C(false, true)`：仅服务端可发起同步到客户端。 |

### 2. `SyncProxy<T>`（即时同步属性包装器）

位于 `dev.anvilcraft.lib.v2.sync.management.SyncProxy`。**声明为字段时必须加 `final` 修饰符**（非 `final` 的 `SyncProxy` 字段会被 `SyncBytecodeInjector` 警告并跳过注入）。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public SyncProxy(T value)` | — | 以非空初始值构造，自动根据 `value.getClass()` 查找默认 `StreamCodec`。 |
| `public SyncProxy(@Nullable T value, StreamCodec<? extends ByteBuf, T> codec)` | — | 以初始值和显式指定的 `StreamCodec` 构造。 |
| `public SyncProxy(Class<T> type)` | — | 初始值为 `null`，按 `type` 查找默认 `StreamCodec`。 |
| `public SyncProxy(StreamCodec<? extends ByteBuf, T> codec)` | — | 初始值为 `null`，使用显式指定的 `StreamCodec`。 |
| `public SyncProxy<T> direction(SyncDirection direction)` | `SyncProxy<T>` | 单独覆盖当前字段的同步方向（优先于类级 `@Sync` 的默认方向）。 |
| `public @Nullable T getValue()` | `@Nullable T` | 读取当前字段值。 |
| `public void setValue(@Nullable T value)` | `void` | 更新字段值并立即触发 `SyncManager#setValue` 发送网络同步包。 |

### 3. `SyncRegisterEntry<T, ID>` 与内置 `AnvilLibSyncEntries`

| 类 / 常量 | 签名 | 说明 |
| :--- | :--- | :--- |
| `SyncRegisterEntry.create` | • `create(Class<T> type, StreamCodec<ByteBuf, ID> idCodec, Function<T, ID> idGetter, Finder<T, ID> finder)`（全服广播）<br>• `create(Class<T> type, StreamCodec<ByteBuf, ID> idCodec, Function<T, ID> idGetter, Finder<T, ID> finder, Function<T, Level> dimensionGetter)`（按维度/区块/实体追踪精确广播） | 定义如何从宿主对象 `T` 提取唯一标识 `ID`，以及对端收到包后如何通过 `Finder#apply(IPayloadContext, ID)` 找到对应的宿主对象 `T`。 |
| `AnvilLibSyncEntries.STATIC` | `SyncRegisterEntry<Class<?>, String>` | 内置静态字段宿主：以类名 `Class::getName` 为 ID，全服同步。 |
| `AnvilLibSyncEntries.ENTITY` | `SyncRegisterEntry<Entity, UUID>` | 内置实体宿主：以 `Entity::getUUID` 为 ID，服务端下发时通过 `PacketDistributor.sendToPlayersTrackingEntity` 仅发送给追踪该实体的玩家。 |
| `AnvilLibSyncEntries.BLOCK_ENTITY` | `SyncRegisterEntry<BlockEntity, BlockPos>` | 内置方块实体宿主：以 `BlockEntity::getBlockPos` 为 ID，服务端下发时通过 `PacketDistributor.sendToPlayersTrackingChunk` 仅发送给追踪该区块的玩家。 |
