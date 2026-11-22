# Processor Compile-Time Bytecode Transform & Setup

To provide a low-boilerplate experience for `@Sync` and `@LazySync`, `module.sync` splits out an independent bytecode/annotation processor subproject `anvillib-sync-processor-neoforge-1.21.4`, working alongside NeoForge network registration and cross-side lookup utility `SideUtil`.

## Gradle Setup Notes

If your mod depends directly on full `anvillib` (or standalone `module.sync` in dev), note the sync processor and base module dependencies (1.21.4 coordinates below):

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-1.21.4:<version>")
    // Processor and related runtime modules (codec / network / util) are included via transitive deps / JarJar;
    // If splitting modules or enabling compile-time processor config separately, the artifact is:
    // dev.anvilcraft.lib:anvillib-sync-processor-neoforge-1.21.4
    // dev.anvilcraft.lib:anvillib-codec-neoforge-1.21.4
    // dev.anvilcraft.lib:anvillib-network-neoforge-1.21.4
    // dev.anvilcraft.lib:anvillib-util-neoforge-1.21.4
}
```

## Compile-Time / Class-Load Transformation Flow (`processor`)

Core components in submodule `module.sync/processor` collaborate to enhance sync code and build target indices:
1. **`SyncTargetIndex`**: Extracts class and field metadata for all `@Sync` and `@LazySync` targets during compile or build scanning so `SyncConfigManager.compileContent()` can build tables quickly without runtime full-classpath reflection.
2. **`SyncBytecodeInjector`**: Weaves field-write interception or access hooks into sync-annotated fields/wrappers in the transform pipeline and injects tracking helpers at build time so member mutations automatically trigger dirty updates.

> [!TIP]
> Prefer primitives, common vanilla types (`BlockPos`, `ResourceLocation`, `ItemStack`, `CompoundTag`, etc.), or types with preset serializers in `CodecUtil` / `StreamCodecUtil` for `@LazySync` fields to get zero-config auto-encoding.

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
| `SideUtil.isServer()` | `boolean` | Determines whether currently running on the logical server thread based on `FMLEnvironment.dist` and `LogicalSide` |
| `SideUtil.registryAccess()` | `@Nullable RegistryAccess` | Safely obtains the active `RegistryAccess` (`ServerLifecycleHooks.getCurrentServer()` on server, `Minecraft.getInstance().level` on client) |
| `SideUtil.entityFinder(IPayloadContext context, UUID uuid)` | `@Nullable Entity` | Looks up the entity with `uuid` in the dimension corresponding to the receiving logical side |
| `SideUtil.blockEntityFinder(IPayloadContext context, BlockPos blockPos)` | `@Nullable BlockEntity` | Locates the `BlockEntity` at `blockPos` in the dimension associated with this packet |
| `SideUtil.createFriendlyByteBuf(ByteBuf byteBuf)` | `FriendlyByteBuf` / `RegistryFriendlyByteBuf` | Wraps a buffer with `RegistryAccess` when encoding requires registry context |
| `SideUtil.send(T target, SyncProxy<?> proxy, ...)` / `serverSend(...)` / `clientSend(...)` | `void` | Automatically routes incremental sync packets to players tracking the entity/chunk or back to the server |
