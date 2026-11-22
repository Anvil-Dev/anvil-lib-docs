# Processor Compile-Time Bytecode Transform & Setup

To provide a low-boilerplate experience for `@Sync` and `@LazySync`, `module.sync` splits out an independent class-loading transformer/processor subproject `anvillib-sync-processor-neoforge-1.21.11`, working alongside NeoForge network registration and cross-side lookup utility `SideUtil`.

## Gradle Setup Notes

If your mod depends directly on full `anvillib` (or standalone `module.sync` in dev), note the sync processor and base module dependencies:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-1.21.11:<version>")
    // Processor and related runtime modules (codec / network / util) are included via transitive deps / JarJar;
    // If splitting modules or enabling compile-time processor config separately, the artifact is:
    // dev.anvilcraft.lib:anvillib-sync-processor-neoforge-1.21.11
    // dev.anvilcraft.lib:anvillib-codec-neoforge-1.21.11
    // dev.anvilcraft.lib:anvillib-network-neoforge-1.21.11
    // dev.anvilcraft.lib:anvillib-util-neoforge-1.21.11
}
```

## Class-Loading Transformation Flow (`processor`)

Submodule `module.sync/processor` enhances classes with `@Sync` features in the build/load pipeline via NeoForge's `ClassProcessor` SPI (`SyncClassProcessor`):
1. **`SyncTargetIndex`**: Collects index metadata for all `@Sync` and `@LazySync` targets prior to transform/load so `SyncConfigManager.compileContent()` can build tables quickly at runtime.
2. **`SyncClassProcessor` & `SyncBytecodeInjector`**: Weaves field write interception and access hooks into target fields in the transform pipeline so mutations automatically trigger dirty updates and sync encoding.

> [!TIP]
> Prefer primitives, common vanilla types (`BlockPos`, `Identifier`, `ItemStack`, `CompoundTag`, etc.), or types with preset serializers in `CodecUtil` / `StreamCodecUtil` for `@LazySync` fields to get zero-config auto-encoding.

## Network Protocol & Cross-Side Helpers: `AnvilLibSyncNetwork` & `SideUtil`

### Packet Payloads Overview

| Payload Class | Channel ID | Flow & Responsibility |
| --- | --- | --- |
| `SyncConfigurationPayload` | `anvillib_sync:sync_config` | `S2C` (Configuration phase): sends server `SyncConfigManager`'s `Map<Integer, String>` field ID map |
| `SyncConfigurationFinishPayload` | `anvillib_sync:sync_config_finish` | `C2S` (Configuration phase): client confirms map load completion to advance connection |
| `SyncPayload` | `anvillib_sync:sync` | Bidirectional (`IBidirectionalPacket`): immediate single-field `SyncProxy` update packet |
| `LazySyncPayload` | `anvillib_sync:lazy_sync` | Bidirectional (`IBidirectionalPacket`): incremental sync packet grouping all modified `List<FieldChange>` for an object in one tick |

All network handlers are registered uniformly by `AnvilLibSyncNetwork.register(RegisterPayloadHandlersEvent)` under protocol version `"1"`.

### `SideUtil` Cross-Side Send & Target Resolution Utilities

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `SideUtil.isServer()` | `boolean` | Determines whether currently running on the logical server thread based on `FMLLoader.getCurrent().getDist()` and `LogicalSide` |
| `SideUtil.registryAccess()` | `@Nullable RegistryAccess` | Safely obtains the active `RegistryAccess` (`ServerLifecycleHooks.getCurrentServer()` on server, `Minecraft.getInstance().level` on client) |
| `SideUtil.entityFinder(IPayloadContext context, UUID uuid)` | `@Nullable Entity` | Looks up the entity with `uuid` in the dimension corresponding to the receiving logical side |
| `SideUtil.blockEntityFinder(IPayloadContext context, BlockPos blockPos)` | `@Nullable BlockEntity` | Locates the `BlockEntity` at `blockPos` in the dimension associated with this packet |
| `SideUtil.createFriendlyByteBuf(ByteBuf byteBuf)` | `FriendlyByteBuf` / `RegistryFriendlyByteBuf` | Wraps a buffer with `RegistryAccess` when encoding requires registry context |
| `SideUtil.send(T target, SyncProxy<?> proxy, ...)` / `serverSend(...)` / `clientSend(...)` | `void` | Automatically routes incremental sync packets to players tracking the entity/chunk or back to the server |
