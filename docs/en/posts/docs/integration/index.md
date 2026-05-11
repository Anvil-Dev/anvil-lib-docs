---
title: Integration
prev: false
next: false
---

# Integration Module <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="IntegrationType changed in 26.1" />

The package `dev.anvilcraft.lib.v2.integration` provides a lightweight inter-mod integration system. Integration points
are declared via the `@Integration` annotation, automatically discovered and loaded by `IntegrationManager`, and support
executing integration logic on designated physical sides through convention-based methods.

## Documentation Index

| Document                     | Content                                                             |
|------------------------------|---------------------------------------------------------------------|
| [Core API](./core)           | `@Integration` annotation, `IntegrationType`, `IntegrationInstance` |
| [Manager & Hooks](./manager) | `IntegrationManager`, `IntegrationHook`, `ModVersionRange`          |

## Quick Start

```java
// 1. Define the integration class
@Integration(value = "targetmod", version = "[1.0,2.0)", type = {IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER})
public class MyIntegration {
    public void apply() { /* Common (both sides) */ }
    public void applyClient() { /* Client only */ }
    public void applyClientData() { /* Client data generation */ }
    public void applyServerData() { /* Server data generation */ }
}

// 2. Create the manager in the mod main class
public static final IntegrationManager MANAGER = new IntegrationManager("mymod");
// In the constructor
MANAGER.compileContent();
```

## Notes

- Integration classes are loaded via `Class.forName`; ensure the target class is on the classpath
- Version matching uses Maven version range syntax; `"*"` matches any version
- Method lookup only recognizes `void apply*(void)` methods; at least one must be defined, otherwise a warning is
  emitted
- Loading should be invoked during the appropriate mod lifecycle event
