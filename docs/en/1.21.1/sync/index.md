# `@Sync` & `@LazySync` Annotations and Sync Managers

`module.sync` (Mod ID: `anvillib_sync`) provides a **zero-boilerplate declarative cross-side field auto-sync framework** for NeoForge 1.21.1. By annotating block entities, entities, or static state holders and binding hosts via CoreMod bytecode injection at class-load time, you can mutate fields directly and let the framework keep `S2C`, `C2S`, or `BOTH` sides in sync.

## Setup

### Gradle Repositories & Dependencies

Official releases are available on Maven Central, but `Cjsah Maven` with `exclusiveContent` filtering is recommended to avoid NeoForge Maven's incomplete Maven Central sync causing interface injection or transitive metadata errors:

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

## Comparing the Two Sync Modes

`module.sync` offers two complementary sync strategies (mixable in the same class) depending on performance and intrusiveness:

| Aspect | `@Sync` + `SyncProxy<T>` (Immediate) | `@LazySync` (Per-Tick Diff-Batched) |
| --- | --- | --- |
| **Annotation Target** | Placed on **class (`TYPE`)** | Placed on **field (`FIELD`)** |
| **Field Type** | Must be **`public final SyncProxy<T>`** (else reflection/injection errors or skips) | **Plain native field** (`private` or non-`final` ok; must not be `final` so it can be written back) |
| **Send Timing** | Immediately sends single-field `SyncPayload` on `proxy.setValue(...)` | `LazySyncManager` encodes and diffs byte snapshots at end of server/client tick (`TickEvent.Post`), sending only on change |
| **Batching** | 1 `SyncPayload` per `setValue` | All `@LazySync` fields changed on the same object in one tick merge into **1 `LazySyncPayload`** |
| **Mutable Objects** | Requires explicit `setValue` call | Automatically compares encoded byte arrays, supporting **in-place mutations** on `CompoundTag` / `ItemStack` |
| **Codec Config** | Supports passing custom `StreamCodec` to `SyncProxy` constructor | Supports built-in types resolved by `SyncProxy.defaultCodec` and types with static `Codec`/`MapCodec` fields |
| **Static Fields** | Supported (`public static final SyncProxy<T>`, host key `Class<?>`) | Supported (`static` non-`final` `@LazySync` fields) |

## Full Usage Examples

### Example 1: Using `@Sync` and `@LazySync` Together in a BlockEntity

Built-in `AnvilLibSyncEntries` already registers `SyncRegisterEntry` for `BlockEntity`, `Entity`, and `Class<?>` (static field hosts), so block entities and entities sync out of the box.

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
    // 1. @Sync immediate sync field: must be public final SyncProxy<T>, inherits @Sync(S2C) from class
    public final SyncProxy<Integer> progress = new SyncProxy<>(0);

    // Override direction per-proxy, e.g., allowing client GUI buttons to change target mode directly
    public final SyncProxy<Boolean> autoEject = new SyncProxy<>(false).direction(SyncDirection.C2S);

    // 2. @LazySync fields: no SyncProxy wrapper needed, supports private fields & in-place mutable objects, batched per tick by LazySyncManager
    @LazySync(SyncDirection.S2C)
    private ItemStack displayCatalyst = ItemStack.EMPTY;

    @LazySync(SyncDirection.S2C)
    private int storedMana = 0;

    public ArcaneInfuserBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState blockState) {
        super(type, pos, blockState);
        // CoreMod bytecode injection binds progress/autoEject's parent & fieldName at constructor end and registers `this` with LazySyncManager
    }

    public void serverStep(int deltaMana, ItemStack newStack) {
        if (this.level == null || this.level.isClientSide()) {
            return;
        }
        // Immediately sends SyncPayload to clients tracking this chunk
        Integer current = this.progress.getValue();
        this.progress.setValue((current == null ? 0 : current) + 1);

        // Both fields below batch into a single LazySyncPayload at the end of ServerTickEvent.Post
        this.storedMana += deltaMana;
        this.displayCatalyst = newStack.copy();
    }
}
```

### Example 2: Registering `SyncRegisterEntry` for a Custom Non-Vanilla Host

To sync custom objects that are neither `BlockEntity`, `Entity`, nor static fields (e.g., per-UUID player capability objects or custom world services), register your own `SyncRegisterEntry<T, ID>` to `AnvilLibSyncRegistries.SYNC_ENTRY`:

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

::: danger `@Sync` Field Visibility & `final` Constraints
1. **`SyncProxy` fields must be `public final`**:
   - `SyncBytecodeInjector` only processes `final` `SyncProxy` fields during class load (non-`final` fields are skipped with a warning).
   - `SyncPayload` calls `clazz.getField(fieldName)` (`getField`, not `getDeclaredField`!) when writing back on the receiver; `private` or `protected` proxy fields throw `NoSuchFieldException`!
2. **`@LazySync` fields must not be `final`**: `LazySyncManager` calls `Field#set(...)` on write-back, which fails on `final` fields (`private` is completely fine via `getDeclaredFields()` + `setAccessible(true)`).
3. **No-arg `new SyncProxy<>(null)` fails**: The 1-arg `new SyncProxy<>(T value)` calls `value.getClass()` to infer the codec; use `new SyncProxy<>(MyType.class)` or pass an explicit `StreamCodec` when initializing with `null`.
4. **`@LazySync` first-tick silent baseline rule**: The first time `LazySyncManager` observes an object's fields in a tick, it only records the initial byte snapshot (sending no packet), assuming both sides start with identical initial state; syncs trigger starting from subsequent ticks on diff.
:::

## Default `StreamCodec` Resolution List

When no explicit `StreamCodec` is passed to `SyncProxy` (or when `@LazySync` auto-resolves field types), `SyncProxy` matches in this order:

1. **Built-in direct mappings**:
   - `CompoundTag` / `Tag` (`ByteBufCodecs.TAG`)
   - `Vector3fc` (`VECTOR3F`), `Quaternionfc` (`QUATERNIONF`)
   - `PropertyMap` (`GAME_PROFILE_PROPERTIES`), `GameProfile` (`GAME_PROFILE`)
   - `BlockPos` (`BlockPos.STREAM_CODEC`), `Component` (`ComponentSerialization.STREAM_CODEC`)
   - `ItemStack` (`ItemStack.OPTIONAL_STREAM_CODEC`)
   - `String` (`STRING_UTF8`)
   - Primitives & boxed types: `Boolean`/`boolean`, `Double`/`double`, `Float`/`float`, `Long`/`long` (`VAR_LONG`), `Integer`/`int` (`INT`), `Short`/`short`, `Byte`/`byte`
   - Arrays: `Long[]`/`long[]` (`VarInt` length + per-element `VarLong`), `Byte[]`/`byte[]` (`BYTE_ARRAY`)
2. **Fallback scan for `Codec<T>` / `MapCodec<T>` on custom types**:
   - Scans `public static final` fields declared directly on the target class (excluding superclasses) for `Codec<T>` or `MapCodec<T>` compatible with the target class, wrapping via `ByteBufCodecs.fromCodecWithRegistries(...)`.

## Full Public API Reference

### 1. Annotations & Direction Enum (`dev.anvilcraft.lib.v2.sync.annotation` / `util`)

| Type | Signature / Members | Description |
| --- | --- | --- |
| `@Sync` | `@Target(ElementType.TYPE)`; `SyncDirection value() default SyncDirection.BOTH` | Declares that a class contains `@Sync` immediate sync fields (`SyncProxy`) and sets the default sync direction |
| `@LazySync` | `@Target(ElementType.FIELD)`; `SyncDirection value() default SyncDirection.BOTH` | Marks a field for per-tick byte-level diffing and host-batched sync by `LazySyncManager` |
| `enum SyncDirection` | `BOTH(true, true)`, `C2S(true, false)`, `S2C(false, true)`; `isCreateByClient()`, `isCreateByServer()` | Controls which side can initiate sync; note `@Sync` has `CLASS` retention and its direction is injected at class load by `SyncBytecodeInjector` |

### 2. `SyncProxy<T>`

Package: `dev.anvilcraft.lib.v2.sync.management`

| Constructor / Method Signature | Parameters & Return | Description |
| --- | --- | --- |
| `SyncProxy(T value)` | `value` must be non-null | Resolves default `StreamCodec` from the non-null initial value's runtime class |
| `SyncProxy(T value, StreamCodec<? extends ByteBuf, T> codec)` | Initial value and custom `StreamCodec` | Explicitly binds codec; allows `value` to be `null` |
| `SyncProxy(Class<T> type)` | Target `Class` | Initial value `null`; resolves default `StreamCodec` by `type` |
| `SyncProxy(StreamCodec<? extends ByteBuf, T> codec)` | Custom `StreamCodec` | Initial value `null`; uses the given `StreamCodec` directly |
| `SyncProxy<T> direction(SyncDirection direction)` | Sync direction; returns `this` | Fluently overrides sync direction for this field (takes precedence over class-level `@Sync`) |
| `@Nullable T getValue()` | Returns current cached value | Thread-safe read of the `volatile` cached value |
| `void setValue(@Nullable T value)` | Writes new value | Updates local `volatile` value and sends `SyncPayload` if direction permits (supports `null` marker) |
| `<B extends ByteBuf> void setValue(B buf, boolean serverbound)` | Decodes from buffer and updates value | Called on packet receipt; if `serverbound == true` (and direction allows server-to-client, e.g., `BOTH`), forwards to tracking clients |
| `<B extends ByteBuf> void encode(B byteBuf)` | Writes to target `ByteBuf` | Writes `boolean (value == null)` first, then encodes value via `codec` if non-null |

### 3. Registry & Entry Points (`dev.anvilcraft.lib.v2.sync.init` & `management`)

| Class / Member Signature | Description |
| --- | --- |
| `AnvilLibSyncRegistries.SYNC_ENTRY` | `ResourceKey<Registry<SyncRegisterEntry<?, ?>>>`, registry ID `anvillib_sync:sync_entry` |
| `AnvilLibSyncRegistries.SYNC_ENTRY_REGISTRY` | `Registry<SyncRegisterEntry<?, ?>>`, max capacity `512`, auto-registered in `NewRegistryEvent` |
| `AnvilLibSyncEntries.STATIC` | Built-in static-class host entry: target `Class<?>`, ID is FQCN `String` |
| `AnvilLibSyncEntries.ENTITY` | Built-in entity host entry: target `Entity`, ID is `UUID`, with dimension/entity tracking filter |
| `AnvilLibSyncEntries.BLOCK_ENTITY` | Built-in block entity host entry: target `BlockEntity`, ID is `BlockPos`, with dimension/chunk tracking filter |
| `record SyncRegisterEntry<T, ID>(...)` | Host locator descriptor `(clazz, idCodec, idGetter, finder, dimension, dimensionGetter)`; provides 3 `create(...)` static factories (global / `Level`-derived / full) and `SyncRegisterEntry.Finder<T, ID>` |
