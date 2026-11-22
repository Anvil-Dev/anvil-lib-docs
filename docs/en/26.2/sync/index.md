# Sync Field Auto-Synchronization: @Sync, @LazySync & SyncProxy (`module.sync`)

<BranchContextCard branch="26.2" />

`module.sync` (artifact `anvillib-sync-neoforge-26.2` and processor `anvillib-sync-processor-neoforge-26.2`, package `dev.anvilcraft.lib.v2.sync`) provides a **bytecode-injection-based cross-side field auto-synchronization framework**. It supports one-way (`S2C` / `C2S`) or bidirectional (`BOTH`) auto-sync on **BlockEntities**, **Entities**, **static class fields**, and any custom registered host objects.

The framework offers two complementary synchronization modes:
1. **Immediate Proxy Sync (`@Sync` on class + `final SyncProxy<T>` field)**: **immediately** sends a `SyncPayload` to the other side whenever `proxy.setValue(newValue)` is called;
2. **Lazy Diff-Grouped Sync (`@LazySync` on field + plain field)**: no wrapper type needed (just `private int energy = 0;`); at the end of each tick, `LazySyncManager` scans tracked objects' field snapshots and **packs all `@LazySync` fields changed on the same object in that tick into a single `LazySyncPayload`**!

This module is split into 2 sub-documents by functionality:
- **This page (Auto-Sync & `@Sync` / `@LazySync`)**: Covers `@Sync`, `@LazySync`, `SyncDirection`, `SyncProxy`, `SyncRegisterEntry`, and full examples.
- **[Bytecode Transformer & Network Protocol](./processor-and-network)**: Covers `SyncClassProcessor`, `SyncBytecodeInjector`, `LazySyncBytecodeInjector`, `SyncManager`, `LazySyncManager`, `SyncConfigManager`, and `SideUtil`.

---

## 1. Setup

`module.sync` relies on `module.sync:processor` (a NeoForge `ClassProcessor` SPI service) to inject host binding and tracking code into `<init>` and `<clinit>` at class-load time. Both are included if you use `anvillib-neoforge-26.2`; if depending standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-26.2:2.0.0")
    runtimeOnly("dev.anvilcraft.lib:anvillib-sync-processor-neoforge-26.2:2.0.0")
}
```

---

## 2. Comparing the Two Sync Modes & Built-in Supported Types

### 1. Choosing Between `@Sync` (`SyncProxy<T>`) and `@LazySync`

| Aspect | Mode A: `@Sync` + `final SyncProxy<T>` | Mode B: `@LazySync` Plain Field (Recommended) |
| :--- | :--- | :--- |
| **Declaration** | Annotate class with `@Sync`, declare `public final SyncProxy<T> field = new SyncProxy<>(...)` (**must be `final`**) | Annotate any plain field (non-`final` ok) with `@LazySync(SyncDirection.S2C)` |
| **Trigger Timing** | Sends packet **immediately** on `field.setValue(val)` | Encodes and diffs snapshots at end of each tick (`ServerTickEvent.Post` / `ClientTickEvent.Post`), sending only on change |
| **Multi-Field Batching** | Each `setValue` sends a separate `SyncPayload` | Multiple `@LazySync` fields modified on the same object in one tick **automatically batch into 1 `LazySyncPayload`** |
| **In-Place Mutation** | Requires calling `setValue` again | **Automatically detected**! Because snapshots compare encoded `StreamCodec` bytes per tick, even in-place edits to `CompoundTag` or `ItemStack` count/components are detected and synced |

### 2. Built-in Supported Field Types (`SyncProxy.defaultCodec`)

Both `SyncProxy` and `@LazySync` automatically match codecs for:
- **Primitives & boxed types**: `boolean`/`Boolean`, `byte`/`Byte`, `short`/`Short`, `int`/`Integer`, `long`/`Long`, `float`/`Float`, `double`/`Double`, `String`, `byte[]`/`Byte[]`, `long[]`/`Long[]`;
- **Vanilla & math types**: `BlockPos`, `CompoundTag`, `Tag`, `Component`, `ItemStack` (`OPTIONAL_STREAM_CODEC`), `ItemStackTemplate`, `Vector3fc`, `Quaternionfc`, `GameProfile`, `PropertyMap`;
- **Self-describing `Codec` types**: any custom class/record declaring `public static final Codec<Self>` or `public static final MapCodec<Self>` is automatically converted into a registry-aware `StreamCodec` via `ByteBufCodecs.fromCodecWithRegistries(codec)`!

---

## 3. Full Code Example

### 1. Using `@LazySync` and `@Sync` (`SyncProxy`) in a BlockEntity

`BlockEntity`, `Entity`, and `static` fields have built-in host locators registered in `AnvilLibSyncEntries` and work out of the box:

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
    // Approach 1 (Recommended): annotate plain fields with @LazySync (works for instance and static fields)
    // At end of tick, if temperature or fuelStack changed, both are batched into one packet to players tracking the chunk
    @LazySync(SyncDirection.S2C)
    private int temperature = 20;

    @LazySync(SyncDirection.S2C)
    private ItemStack fuelStack = ItemStack.EMPTY;

    // Approach 2: @Sync + final SyncProxy<T>, sends a sync packet immediately on setValue
    public final SyncProxy<Boolean> emergencyShutdown = new SyncProxy<>(false)
        .direction(SyncDirection.BOTH);

    public HeaterBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
        // No manual registration needed! SyncClassProcessor injects at the end of the constructor in bytecode:
        // 1. this.emergencyShutdown.setParent(this / fieldName / direction)
        // 2. AnvilLibSync.LAZY_SYNC_MANAGER.track(this)
    }

    public void serverTick() {
        // Mutate plain fields directly; LazySyncManager diffs and syncs to clients at tick end
        this.temperature += 5;
    }

    public void triggerEmergencyShutdown() {
        // Immediately sends SyncPayload to the other side
        this.emergencyShutdown.setValue(true);
    }
}
```

### 2. Registering a Custom Host Type (`SyncRegisterEntry`)

Beyond built-in `STATIC` (static fields), `ENTITY`, and `BLOCK_ENTITY`, to use `@Sync` or `@LazySync` on custom managed objects (e.g., custom multiblock controllers or player session objects), register a `SyncRegisterEntry` to `AnvilLibSyncRegistries.SYNC_ENTRY`:

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

## 4. Public Annotations & Classes API Reference

### 1. `@Sync`, `@LazySync` & `SyncDirection`

| Annotation / Enum | Target | Signature & Description |
| :--- | :---: | :--- |
| **`@Sync`** | `TYPE` (class) | `SyncDirection value() default SyncDirection.BOTH;`. Placed on classes containing `final SyncProxy<T>` fields. |
| **`@LazySync`** | `FIELD` (field) | `SyncDirection value() default SyncDirection.BOTH;`. Placed on plain instance or static fields to enable per-tick lazy snapshot diff sync. |
| **`SyncDirection`** | — | • `BOTH(true, true)`: either side can initiate sync;<br>• `C2S(true, false)`: only client can sync to server;<br>• `S2C(false, true)`: only server can sync to client. |

### 2. `SyncProxy<T>` (Immediate Sync Property Wrapper)

Located in `dev.anvilcraft.lib.v2.sync.management.SyncProxy`. **Must be declared `final` when used as a field** (non-`final` `SyncProxy` fields trigger a warning from `SyncBytecodeInjector` and are skipped).

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public SyncProxy(T value)` | — | Constructs with a non-null initial value, looking up the default `StreamCodec` from `value.getClass()`. |
| `public SyncProxy(@Nullable T value, StreamCodec<? extends ByteBuf, T> codec)` | — | Constructs with an initial value and explicit `StreamCodec`. |
| `public SyncProxy(Class<T> type)` | — | Initial value `null`; looks up the default `StreamCodec` by `type`. |
| `public SyncProxy(StreamCodec<? extends ByteBuf, T> codec)` | — | Initial value `null`; uses the explicit `StreamCodec`. |
| `public SyncProxy<T> direction(SyncDirection direction)` | `SyncProxy<T>` | Overrides sync direction for this field alone (takes precedence over class-level `@Sync`). |
| `public @Nullable T getValue()` | `@Nullable T` | Reads the current field value. |
| `public void setValue(@Nullable T value)` | `void` | Updates the field value and immediately triggers `SyncManager#setValue` to send a sync packet. |

### 3. `SyncRegisterEntry<T, ID>` & Built-in `AnvilLibSyncEntries`

| Class / Constant | Signature | Description |
| :--- | :--- | :--- |
| `SyncRegisterEntry.create` | • `create(Class<T> type, StreamCodec<ByteBuf, ID> idCodec, Function<T, ID> idGetter, Finder<T, ID> finder)` (global broadcast)<br>• `create(Class<T> type, StreamCodec<ByteBuf, ID> idCodec, Function<T, ID> idGetter, Finder<T, ID> finder, Function<T, Level> dimensionGetter)` (targeted broadcast by dimension/chunk/entity tracking) | Defines how to extract unique `ID` from host `T` and how the receiver locates `T` via `Finder#apply(IPayloadContext, ID)`. |
| `AnvilLibSyncEntries.STATIC` | `SyncRegisterEntry<Class<?>, String>` | Built-in static-field host: keyed by `Class::getName`, synced globally. |
| `AnvilLibSyncEntries.ENTITY` | `SyncRegisterEntry<Entity, UUID>` | Built-in entity host: keyed by `Entity::getUUID`; server-to-client sends only to players tracking the entity via `PacketDistributor.sendToPlayersTrackingEntity`. |
| `AnvilLibSyncEntries.BLOCK_ENTITY` | `SyncRegisterEntry<BlockEntity, BlockPos>` | Built-in block entity host: keyed by `BlockEntity::getBlockPos`; server-to-client sends only to players tracking the chunk via `PacketDistributor.sendToPlayersTrackingChunk`. |
