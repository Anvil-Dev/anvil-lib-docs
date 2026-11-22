# `@Sync` & `@LazySync` Annotations and Sync Managers

`module.sync` provides a declarative framework for syncing fields on entities, block entities, and static classes across sides without writing boilerplate network packets:
- **`@Sync`**: Class annotation (`ElementType.TYPE`) working with compile-time/class-load transformation and `SyncTargetIndex` to route field reads/writes or attach `SyncProxy` for immediate packet sending.
- **`@LazySync`**: Field annotation (`ElementType.FIELD`, `RetentionPolicy.RUNTIME`) managed at runtime by `LazySyncManager`, which diffs byte snapshots per object at the end of each tick and packs all changed fields of a target object into a single packet.

## Module Identity & Core Classes

- Mod ID: `anvillib_sync` (`AnvilLibSync.MOD_ID`)
- Resource namespace: `AnvilLibSync.MOD_ID`

## Quick Start Example: Using `@Sync` & `@LazySync`

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.sync.annotation.LazySync;
import dev.anvilcraft.lib.v2.sync.annotation.Sync;
import dev.anvilcraft.lib.v2.sync.util.SyncDirection;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;

@Sync
public class EnergyMeterBlockEntity extends BlockEntity {
    @LazySync(SyncDirection.S2C)
    private int storedEnergy = 0;

    @LazySync(SyncDirection.BOTH)
    private boolean active = true;

    public EnergyMeterBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
    }

    public void addEnergy(int delta) {
        this.storedEnergy += delta;
        // For @LazySync, once the host object is tracked, tick end auto-detects and sends delta packets
    }
}
```

> [!IMPORTANT]
> Ensure the target object type and locator (`SyncRegisterEntry`) are registered in `AnvilLibSync.getSyncManager()` (e.g., `BlockPos` for block entities, `UUID` for entities). Built-in managers establish ID mappings for server `BlockEntity`s, entities, and registered static classes.

## Core Enum & Annotations: `SyncDirection`, `@Sync`, `@LazySync`

### `SyncDirection`

| Enum Constant | Meaning |
| --- | --- |
| `S2C` | Server-to-client one-way sync only; client edits are not pushed back to the server |
| `C2S` | Client-to-server one-way sync only |
| `BOTH` | Bidirectional sync; edits on either side push to the other |

### `@Sync` & `@LazySync` Attributes

- `@Sync`: `SyncDirection value() default SyncDirection.BOTH;` (class-level marker indicating the class contains synced structures)
- `@LazySync`: `SyncDirection value() default SyncDirection.BOTH;` (field-level marker scanned periodically by `LazySyncManager`)

## `SyncProxy<T>`: Explicit Sync Field Wrapper

`SyncProxy<T>` provides fine-grained value wrapping, dirty-flag triggering, and codec control for any field (when field reflection replacement is unwanted or impossible):

| Constructor / Method Signature | Description |
| --- | --- |
| `new SyncProxy<>(T value)` | Creates with a non-null initial value and auto-resolves the default `StreamCodec` by runtime class |
| `new SyncProxy<>(T value, StreamCodec<? extends ByteBuf, T> codec)` | Explicitly passes a custom `StreamCodec` |
| `new SyncProxy<>(Class<T> type)` / `new SyncProxy<>(StreamCodec<? extends ByteBuf, T> codec)` | Constructors without an initial value (allows initial `null`) |
| `direction(SyncDirection direction)` / `setDirection(SyncDirection direction)` | Sets allowed sync flow direction |
| `getValue()` / `setValue(@Nullable T value)` | Reads or mutates the inner value; triggers sync encoding and sending on allowed sides |
| `setValue(B buf, boolean serverbound)` | Decodes from a network buffer and writes the inner value |
| `encode(B byteBuf)` | Writes the current value into a byte buffer using the bound `StreamCodec` |

## Manager System: `SyncManager`, `LazySyncManager` & `SyncRegisterEntry`

### `SyncManager` & `SyncRegisterEntry<T, ID>`

`SyncManager` maintains all registered locator strategies and config metadata:
- `compileContent()`: collects all sync targets and compiles field/class-name mapping indices;
- `contains(Class<?> clazz)`: walks the target class inheritance chain to find a matching `SyncRegisterEntry<P, ID>`;
- `SyncRegisterEntry.create(...)`: binds a target superclass (`BlockEntity.class`, `Entity.class`, or static host class), unique ID `StreamCodec`, and reverse lookup `Finder<T, ID>`.

### `LazySyncManager`

Maintains `@LazySync` holder snapshots per tick and executes batched pushes:

| Method Signature | Description |
| --- | --- |
| `track(@Nullable Object object)` | Manually adds a runtime instance (e.g., an unregistered custom controller) to lazy change tracking |
| `trackStatic(@Nullable Class<?> owner)` | Adds all static `@LazySync` fields in a utility class to tracking |
| `tickServer()` / `tickClient()` | Diffs snapshots at tick end: generates a single `LazySyncPayload` per changed object with all `FieldChange(configKey, blob)` entries and sends per direction |
| `applyGrouped(Object object, List<AppliedField> fields)` | Batch-decodes and writes back fields on the target object when receiving a grouped packet |
| `clearServer()` / `clearClient()` | Clears cached snapshots on world exit/server stop to prevent memory leaks |

### `SyncConfigManager`

Assigns compact integer `usedId` indices to `"pkg.ClassName#fieldName"` during class load/sync handshake, syncing the map to clients via `SyncConfigurationPayload` during player login configuration so high-frequency runtime packets only send `int id` instead of verbose FQCN strings.
