---
title: Sync Data Synchronization
prev: false
next: false
---

# Data Synchronization Module <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.sync` provides a **declarative field synchronization system** that automatically
synchronizes Java object field values between client and server using the `@Sync` annotation and `SyncProxy<T>` proxies.
It supports directional control, dimension-aware distribution, and bytecode injection that auto-associates proxies with parent objects, field names, and directions — completely transparent to users.

> **Availability**: This module is **only** available in Minecraft **26.1**.

## Architecture Overview

1. **Annotation Layer** — `@Sync` marks synchronizable classes, specifying the sync direction
2. **Proxy Layer** — `SyncProxy<T>` wraps field values, providing automatic codec and change notification
3. **Management Layer** — `SyncManager` maintains the registry and coordinates data transmission
4. **Network Layer** — `SyncPayload` transmits data between both sides via `IInsensitiveBiPacket`
5. **Injection Layer** — `SyncBytecodeInjector` auto-associates proxies with their parent objects, field names, and directions via bytecode injection — completely transparent to users

## Document Index

| Document               | Contents                                                                             |
|------------------------|--------------------------------------------------------------------------------------|
| [Core API](./api)      | `@Sync` annotation, `SyncProxy`, `SyncDirection`, `SyncManager`, `SyncRegisterEntry` |
| [Usage Guide](./usage) | Complete usage examples, bytecode injection, registration flow                       |

## Quick Start

```java
// 1. Mark a class as synchronizable
@Sync(SyncDirection.BOTH)
public class MySyncObject {
    public final SyncProxy<Integer> counter = new SyncProxy<>(0);
    public final SyncProxy<String> name = new SyncProxy<>("");
}

// 2. Use
MySyncObject obj = new MySyncObject();
obj.counter.setValue(42);  // Automatically syncs to the other side
int val = obj.counter.getValue(); // Get current value
```

## Dependency Management

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-sync-neoforge-26.1:2.0.0"
}
```

## Notes

- `SyncProxy` fields must be declared `public final`
- 18 built-in types have default StreamCodec support (CompoundTag, String, Integer, Vector3fc, etc.)
- Custom types require specifying a codec via `SyncProxy(value, customCodec)`
- Sync direction is controlled at runtime by `SyncDirection`: `BOTH` / `C2S` / `S2C`
