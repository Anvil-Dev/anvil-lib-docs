# Bytecode Transformer & Underlying Network Protocol (`module.sync:processor` / `management` / `network`)

<BranchContextCard branch="26.1" />

Why don't developers need to write `proxy.setParent(this)` in constructors or manually register/unregister objects with a manager when using `@Sync` and `@LazySync`? This page explains `module.sync:processor`'s ASM bytecode injection, `LazySyncManager`'s weak-reference snapshot anti-loop mechanism, and configuration-phase ID map syncing.

---

## 1. Compile-Time Indexing & Load-Time ASM Bytecode Injection (`module.sync:processor`)

`SyncClassProcessor` implements NeoForge's `net.neoforged.neoforgespi.transformation.ClassProcessor` (`anvillib_sync:processor`), transparently rewriting classes containing `@Sync` or `@LazySync` during startup class loading:

### 1. `SyncBytecodeInjector` (For `@Sync` Classes)

When a class is annotated with `@Sync`, scans all `ACC_FINAL` fields of type `SyncProxy`:
- **For instance `final SyncProxy` fields**: injects before every `RETURN` in every constructor `<init>`:
  ```java
  if (this.field != null) {
      this.field.setParent(this);
      this.field.setFieldName("field");
      this.field.setDirection(SyncDirection.XXX); // Only if the field did not specify its own direction
  }
  ```
- **For `static final SyncProxy` fields**: injects before every `RETURN` in `<clinit>` (creating `<clinit>` if absent):
  ```java
  if (Owner.field != null) {
      Owner.field.setParent(Owner.class);
      Owner.field.setFieldName("field");
      Owner.field.setDirection(SyncDirection.XXX);
  }
  ```

### 2. `LazySyncBytecodeInjector` (For Classes with `@LazySync` Fields)

When a class has any `@LazySync`-annotated field:
- **If instance `@LazySync` fields exist**: injects before every `RETURN` in each `<init>`:
  ```java
  AnvilLibSync.LAZY_SYNC_MANAGER.track(this);
  ```
- **If static `@LazySync` fields exist**: injects before every `RETURN` in `<clinit>`:
  ```java
  AnvilLibSync.LAZY_SYNC_MANAGER.trackStatic(Owner.class);
  ```

---

## 2. `LazySyncManager` Weak-Reference Tracking & Anti-Loop Design

1. **Automatic GC Reclamation (No Manual `untrack` Needed)**:
   `LazySyncManager` stores `instances` and `snapshots` using Guava's **`new MapMaker().weakKeys()` (weak keys + identity `==` equality)**. Once a `BlockEntity` or `Entity` unloads from the world and loses external strong references, the JVM GC reclaims it automatically with zero memory leaks.
2. **Initial Baseline & Loop Suppression**:
   - The first time `scanTarget` scans a newly constructed object, it stores the initial encoded bytes in `snapshots` as a baseline without sending an initial packet;
   - When the receiver gets `LazySyncPayload` and writes fields back via `applyGrouped`, it **immediately re-encodes the newly written values into its own `snapshots`**, ensuring the next tick's scan does not mistake the synced values for local changes and echo them back (eliminating bidirectional sync loops).
   - Note: for `C2S` or `BOTH` on `SyncProxy` / `@LazySync`, when the **server** receives an update from a client, it updates local state and broadcasts the change to other clients tracking that object.

---

## 3. Configuration-Phase Field ID Dictionary Sync (`SyncConfigManager`)

To avoid sending verbose `"com.example.HeaterBlockEntity#temperature"` strings in every sync packet:
1. During `FMLCommonSetupEvent`, `SyncConfigManager.compileContent()` scans all mods' `@Sync` classes (`final SyncProxy` fields) and `@LazySync` fields, assigning a compact integer `configId` to each `"ClassName#fieldName"`;
2. When a player connects (`RegisterConfigurationTasksEvent`), `AnvilLibSync.SyncConfig` (`anvillib_sync:sync_config`) sends `SyncConfigurationPayload` (`Map<Integer, String>`) to the client, which adopts it and replies with `SyncConfigurationFinishPayload`.

---

## 4. Internal Management & Network Classes (`@ApiStatus.Internal`)

| Package / Class | Core Responsibility |
| :--- | :--- |
| `AnvilLibSync` | Module main class holding `SYNC_MANAGER`, `SYNC_CONFIG_MANAGER`, and `LAZY_SYNC_MANAGER` singletons. |
| `SyncManager` | Manages `SyncRegisterEntry` host mappings and handles immediate packet sending on `SyncProxy#setValue`. |
| `LazySyncManager` | Manages weak-reference sets of `@LazySync` instances/static classes, byte snapshot diffing, and grouped batch send/apply. |
| `SyncConfigManager` | Scans and maintains the `"ClassName#fieldName" <-> int` index map. |
| `SideUtil` | Provides cross-side `RegistryAccess` lookup, built-in `entityFinder` / `blockEntityFinder`, and smart `serverSend` routing (`sendToPlayersTrackingChunk` / `sendToPlayersTrackingEntity` / `sendToPlayersInDimension`). |
| `SyncPayload` / `LazySyncPayload` | Immediate single-field sync packet (`anvillib_sync:sync`) and lazy multi-field grouped sync packet (`anvillib_sync:lazy_sync`). |
| `SyncConfigurationPayload` / `SyncConfigurationFinishPayload` | Configuration-phase field ID dictionary sync packet and ack packet. |
