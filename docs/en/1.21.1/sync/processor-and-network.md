# Processor Bytecode Transformation & Network Sync Mechanics

This page explains the low-level implementation of `module.sync` and `module.sync:processor` on NeoForge 1.21.1, helping you understand how zero-boilerplate registration works and how to debug complex inheritance, cross-dimension, or custom network setups.

## Processor & Bytecode Injection (`ICoreMod` Mode)

When depending on `anvillib-sync-neoforge-1.21.1` in Maven/Gradle, `anvillib-sync-processor-neoforge-1.21.1` is **automatically nested and bundled** via `slimJarJar`—no manual processor dependency is needed.

On NeoForge 1.21.1 (FML Loader 4.0.x), before newer `ClassProcessor` SPIs existed, `module.sync:processor` registers an ASM `ITransformer<ClassNode>` class transformer with ModLauncher via the standard SPI file:

`META-INF/services/net.neoforged.neoforgespi.coremod.ICoreMod` -> `dev.anvilcraft.lib.v2.sync.transform.SyncClassProcessor`

registers an ASM `ITransformer<ClassNode>` class transformer with ModLauncher.

### Startup Timeline & Bytecode Rewrites

1. **Mod discovery phase (before target classes load)**:
   - `SyncTargetIndex` statically scans `LoadingModList` for internal names and `SyncDirection`s of all `@Sync`-annotated classes.
   - `LazySyncTargetIndex` statically scans owning class internal names for all `@LazySync`-annotated fields.
2. **Class-load transformation phase (`SyncTransformer.transform`)**:
   - If the class is in `SyncTargetIndex`: `SyncBytecodeInjector` inspects all **`final SyncProxy`** fields and injects `proxy.setParent(this)`, `proxy.setFieldName(name)`, and `proxy.setDirection(classDir)` before every return in `<init>`; for `static final` fields, injects `proxy.setParent(Owner.class)` etc. at the end of `<clinit>` (creating `<clinit>` if absent).
   - If the class is in `LazySyncTargetIndex`: `LazySyncBytecodeInjector` injects `AnvilLibSync.LAZY_SYNC_MANAGER.track(this)` before every return in `<init>`, and `AnvilLibSync.LAZY_SYNC_MANAGER.trackStatic(Owner.class)` at the end of `<clinit>` for static `@LazySync` fields.

::: tip Automatic GC & Inheritance Support
- `LazySyncManager` stores tracked instances and snapshots in Guava `MapMaker().weakKeys()` weak-keyed maps; unloaded `Entity`s or `BlockEntity`s without external strong references are automatically garbage-collected with **no explicit unregister needed**.
- `LazySyncManager` walks superclasses (`clazz -> superclass -> ...`) when collecting metadata, so subclasses automatically inherit and sync `@LazySync` fields declared on parent classes (provided both sides match the same `SyncRegisterEntry`).
:::

## Config Sync & Packet Routing Rules

### 1. Configuration-Phase Unified Field Index Table

To avoid sending verbose `"com.example.MyTile#manaPool"` strings on every field update, the module uses a config compression table like RPC:
- After mod init (`FMLCommonSetupEvent`), `SyncConfigManager.compileContent()` scans all `final SyncProxy` fields in `@Sync` classes and all `@LazySync` fields, assigning incremental `int` IDs (`syncConfigId`).
- When a player joins during Configuration, `AnvilLibSync.SyncConfig` sends `SyncConfigurationPayload(syncMap)`; the client writes it into `AnvilLibSyncClient.SYNC_CONFIG_MANAGER` and replies with `SyncConfigurationFinishPayload`.

### 2. Per-Dimension & Tracking-Player Routing (`SideUtil`)

When the server sends a sync packet, `SideUtil.serverSend(...)` chooses the broadcast scope from `SyncRegisterEntry` to avoid unnecessary global broadcasts:

| Host Condition (`entry.dimension()` & ID/Object Type) | NeoForge Send Target |
| --- | --- |
| `dimension == false` or `dimensionGetter == null` (e.g., `STATIC`) | `PacketDistributor.sendToAllPlayers(packet)` |
| Host ID is `BlockPos` (e.g., `BLOCK_ENTITY`) | `PacketDistributor.sendToPlayersTrackingChunk(level, ChunkPos(pos), packet)` |
| Host object is `Entity` | `PacketDistributor.sendToPlayersTrackingEntity(entity, packet)` followed by dimension send (note: source has no `return` here, so entities also fall through to `sendToPlayersInDimension`) |
| Other dimension-scoped objects | `PacketDistributor.sendToPlayersInDimension(level, packet)` |

Client-side sends (`C2S` / `BOTH`) uniformly call `PacketDistributor.sendToServer(...)`.

### 3. `LazySyncPayload` & Anti-Loop Suppression

After `LazySyncManager` receives `LazySyncPayload` and writes fields back via `field.set(...)`, it **immediately re-encodes the newly written value and overwrites its local `snap.put(configKey, encoded)`**. This prevents the next tick from mistaking the received update for a local change and ping-ponging it back.

## Internal API & Network Payloads Overview

Although most of these classes are `@ApiStatus.Internal`, understanding their roles helps when writing custom `SyncRegisterEntry`s or debugging packets:

### Runtime & Network Classes (`dev.anvilcraft.lib.v2.sync.*`)

| Class | Responsibilities & Key Public Members |
| --- | --- |
| `AnvilLibSync` | Mod entry (`MOD_ID = "anvillib_sync"`); holds `SYNC_MANAGER`, `SYNC_CONFIG_MANAGER`, `LAZY_SYNC_MANAGER`; registers server `ServerTickEvent.Post`, `ServerStoppedEvent`, and `SyncConfig` task |
| `AnvilLibSyncClient` | Client `@Mod(dist = Dist.CLIENT)` entry; holds client `SYNC_CONFIG_MANAGER`; drives `ClientTickEvent.Post` and clears client lazy tracking on `ClientPlayerNetworkEvent.LoggingOut` |
| `AnvilLibSyncNetwork` | Auto-registers all bidirectional and config packets under `NETWORK_VERSION = "1"` via `NetworkRegistrar` |
| `SyncManager` | Maintains `Class<?> -> SyncRegisterEntry<?, ?>` lookups (`isAssignableFrom` matching) and immediate sync dispatch |
| `LazySyncManager` | Handles `@LazySync` diffing, grouped encoding, and anti-loop write-back (`AppliedField` record, `tickServer`/`tickClient`/`clearServer`/`clearClient`/`track`/`trackStatic`/`applyGrouped`) |
| `SyncConfigManager` | Scans `@Sync` bytecode fields and `@LazySync` fields via ASM, managing the bidirectional `String <-> int` config map |
| `SideUtil` | Provides `isServer()`, `registryAccess()`, `entityFinder`, `blockEntityFinder`, `createFriendlyByteBuf(ByteBuf)` (creates `RegistryFriendlyByteBuf` when registries exist), and `send` / `serverSend` / `clientSend` |
| `SyncPayload` | Immediate single-`SyncProxy` bidirectional sync packet (`anvillib_sync:sync`) |
| `LazySyncPayload` | Host-batched lazy sync bidirectional packet (`anvillib_sync:lazy_sync`) with nested `FieldChange(String configKey, byte[] blob)` |
| `SyncConfigurationPayload` / `Finish` | Configuration-phase config map sync packets (`anvillib_sync:sync_config` / `anvillib_sync:sync_config_finish`) |

### Processor Bytecode Injection Classes (`dev.anvilcraft.lib.v2.sync.transform`)

| Class | Description |
| --- | --- |
| `SyncClassProcessor` | Implements `ICoreMod` and exposes `SyncTransformer`, routing target classes to `@Sync` and `@LazySync` injectors |
| `SyncTargetIndex` / `LazySyncTargetIndex` | Pre-builds target class indices from `LoadingModList` annotation scan results |
| `SyncBytecodeInjector` / `LazySyncBytecodeInjector` | Pure ASM Tree API bytecode injectors appending registration and binding calls before `<init>` and `<clinit>` returns |
