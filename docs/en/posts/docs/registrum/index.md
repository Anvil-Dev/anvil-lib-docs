---
title: Registrum Registration
prev: false
next: false
---

# Registration System Module <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="changed: 1.21.2 / 1.21.4 / 1.21.9 / 1.21.11 / 26.1" />

The package `dev.anvilcraft.lib.v2.registrum` provides a declarative registration system based on fluent builders, greatly simplifying the registration and data generation workflow for blocks, items, entities, block entities, menus, fluids, and more in Minecraft mods.

> Portions of this module are based on [Registrate](https://github.com/tterrag1098/Registrate), under the Mozilla Public License 2.0.

## Architecture Overview

1. **Entry Point** -- `Registrum.create("modid")` creates an instance and auto-registers event buses
2. **Builder** -- Fluent API for chaining registration declarations (`BlockBuilder`, `ItemBuilder`, etc.)
3. **Entries** -- Type-safe references obtained after registration (`BlockEntry<T>`, `ItemEntry<T>`, etc.)
4. **Data Generation** -- Built-in model, loot table, recipe, tag, and language file generators

## Document Index

| Document                                | Content                                                                  |
|-----------------------------------------|--------------------------------------------------------------------------|
| [Core API](./core)                      | `Registrum`, `AbstractRegistrum` core methods, event lifecycle           |
| [Builders](./builders)                  | `Builder` interface, `BlockBuilder`, `ItemBuilder`                       |
| [Entity & Menu Builders](./entity-builders) | `BlockEntityBuilder`, `EntityBuilder`, `MenuBuilder`, `FluidBuilder` |
| [Entry Types](./entries)                | `RegistryEntry`, `ItemProviderEntry`, `BlockEntry`, `ItemEntry`, etc.    |
| [Data Generation](./datagen)            | `GeneratorType`, Provider types, 1.21.1-to-26.1 migration                |
| [Changelog](./changelog)                | API changes, additions, deprecations, and removals across versions        |

## Quick Start

```java
public static final Registrum REGISTRUM = Registrum.create("mymod");

public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
    .object("my_block")
    .block(MyBlock::new)
        .simpleItem()           // Auto-create BlockItem
        .lang("My Block")
        .tag(BlockTags.MINEABLE_WITH_PICKAXE)
        .register();

public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
    .object("my_item")
    .item(MyItem::new)
        .tab(CreativeModeTabs.TOOLS)
        .register();
```

## Dependency Management

### Gradle (Groovy DSL)

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:2.0.0"
}
```

### Gradle (Kotlin DSL)

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:2.0.0")
}
```

### Transitive Dependencies

The Registrum module internally depends on the following AnvilLib submodules:

- `anvillib-util` -- Utility methods (`NonNullSupplier`, `NonNullFunction`, etc.)
- `anvillib-config` -- Configuration system (used for generator configuration)

## Core Concepts

### object() Name State

`object("name")` sets a **persistent state**; subsequent builder calls will reuse that name until the next `object()` call.

```java
// Recommended: explicit object() per entry
REGISTRUM.object("my_block").block(MyBlock::new).register();
REGISTRUM.object("my_item").item(MyItem::new).register();

// Also possible: reuse the same name consecutively
REGISTRUM.object("my_block")
    .block(MyBlock::new).register()  // Register block
    .object("my_block")              // Name is "my_block" (BlockEntry does not change state)
    .blockEntity(MyBE::new).register(); // Block entity with the same name
```

### register() vs build()

- `register()` -- Completes the registration chain, returns `RegistryEntry` (terminates the builder)
- `build()` -- Equivalent to `register()` but returns the Parent object (allows continued chaining)

```java
// register() -> returns BlockEntry
BlockEntry<MyBlock> entry = builder.register();

// build() -> returns parent, allowing continued configuration
BlockBuilder<...> parent = builder.blockEntity(MyBE::new)
    .renderer(MyRenderer::new)
    .build(); // Returns BlockBuilder; can continue .lang() .tag() etc.
```

## Error Codes and Troubleshooting

| Error                                                               | Cause                                                        | Resolution                                              |
|---------------------------------------------------------------------|--------------------------------------------------------------|---------------------------------------------------------|
| `"Current name not set"`                                            | Building method called on `AbstractRegistrum` without prior `object()` | Call `object("name")` first                             |
| `"Unknown registration <name> for type <registry>"`                 | `get(name, type)` cannot find the corresponding registration entry | Ensure `object(name)` and builder calls precede `get()` |
| `"Cannot get data provider before datagen is started"`              | `getDataProvider()` called outside of the datagen phase      | Only call during `GatherDataEvent`                      |
| `"Cannot add data generator after construction of root generator"`  | `addDataGenerator` called after provider construction        | Register all data generators before `GatherDataEvent`   |
| `"Attempt to get non IController..."` (Multiblock)                  | Controller not registered and block does not implement `IController` | Call `ControllerRecord.register(controller)`     |
| `"Failed to register eventListeners for mod"`                       | `Registrum.create()` could not find the corresponding ModContainer | Check modId spelling; ensure the mod is properly loaded |
| `"Found unused register callbacks"` (dev)                           | Some register callbacks reference entries that were never registered | Check that all `addRegisterCallback()` calls have a corresponding `register()` |

## Version Compatibility

| Feature | 1.21.1 | 1.21.2-1.21.11 | 26.1 | Notes |
|---------|--------|----------------|------|-------|
| Core Builder API | yes | yes | yes | Block/Item/Entity/BlockEntity/Menu/Fluid builders are universal |
| `GeneratorType` interface | -- | yes | yes | Introduced in 1.21.2 |
| `providers/generators/` subpackage | -- | -- (1.21.4+) | yes | Introduced in 1.21.4 |
| Legacy `RegistrumBlockstateProvider` | yes | yes (through 1.21.3) | -- | Replaced by `RegistrumBlockModelGenerator` in 1.21.4 |
| nullness package location | `util.nullness` | `registrum.util.nullness` | `util.nullness` | Varies with `module.util` presence |
| `NonNullSupplier` import path | `v2.util.nullness` | `v2.registrum.util.nullness` | `v2.util.nullness` | |
| BIOME builder | <Badge type="warning" text="commented" /> | <Badge type="warning" text="commented" /> | <Badge type="warning" text="commented" /> | Commented out in all three versions, not enabled |

## Notes

- Registration operations should be completed during the mod construction phase (in the `@Mod` constructor or before `FMLCommonSetupEvent`)
- The name set by `object(String)` persists until the next call
- `skipErrors(true)` only takes effect in a development environment; it is automatically ignored in production
- Thread safety: `AbstractRegistrum` is not thread-safe; all registration operations should be performed on the main thread
- Entry names are globally unique (within the modId namespace); registering a duplicate entry with the same name will overwrite the previous one
