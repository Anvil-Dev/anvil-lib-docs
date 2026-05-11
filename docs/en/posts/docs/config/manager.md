---
title: Config Management
prev: false
next: false
---

# Config Management

## ConfigManager

The core class for managing config registration and loading. Each modId corresponds to a global singleton.

### Usage Steps

```java
// 1. Define the config class (using @Config and other annotations)

// 2. Register the config
MyConfig cfg = ConfigManager.register("mymod", MyConfig::new);

// Or register on an existing instance
MyConfig cfg = new MyConfig();
ConfigManager manager = ConfigManager.get("mymod");
manager.register(cfg);
```

### Automatic Behaviors

- `FMLConstructModEvent` — Automatically registers the `ModConfigSpec` with the `ModContainer`
- `ModConfigEvent.Loading` / `Reloading` — Automatically writes config values to fields
- Client — Automatically registers the config screen extension point (based on `IConfigScreenFactory`)

### Internal Mechanism

1. Scans fields using reflection
2. Generates a `ModConfigSpec.ConfigValue` for each field, wrapped as a `ConfigField`
3. Automatically uses `defineInRange` for fields annotated with `@BoundedDiscrete`
4. Supports enum fields (`defineEnum`) and ordinary types (boolean, numeric, string, etc.)

## ConfigRecord

Encapsulates the complete information of a config class.

| Field      | Type                | Description                                                    |
|------------|---------------------|----------------------------------------------------------------|
| group      | `String`            | Config file subdirectory (`@Config.group()`, defaults to `""`) |
| modId      | `String`            | The modId to which the config belongs                          |
| type       | `ModConfig.Type`    | Config type                                                    |
| spec       | `ModConfigSpec`     | The constructed ModConfigSpec                                  |
| object     | `Object`            | Config class instance                                          |
| values     | `List<ConfigField>` | Immutable list containing all config field info                |
| registered | `AtomicBoolean`     | Whether it has been registered with the container              |

### Methods

| Method          | Description                                                                                                |
|-----------------|------------------------------------------------------------------------------------------------------------|
| `load()`        | Iterates through values and calls `ConfigField.load()` on each to inject current config values into fields |
| `getFileName()` | File name. When `group` is empty: `"<modId>-<type>.toml"`; when set: `"<group>/<modId>-<type>.toml"`       |

## ConfigField

A record class that encapsulates the metadata and runtime value injection of a single config field.

| Field       | Type                        | Description                           |
|-------------|-----------------------------|---------------------------------------|
| object      | `Object`                    | The object to which the field belongs |
| field       | `Field`                     | Java reflection Field reference       |
| configValue | `ModConfigSpec.ConfigValue` | The corresponding config value        |

### load()

Retrieves the current config value and writes it to the field based on type detection:

- Supports primitives: `boolean`, `byte`, `short`, `int`, `long`, `float`, `double`
- Supports boxed types: `Boolean`, `Byte`, `Short`, `Integer`, `Long`, `Float`, `Double`, `String`
- Supports enum types (defined via `defineEnum`)

## Usage Example

```java
// Typical pattern: declare directly in the mod main class
@Mod("mymod")
public class MyMod {
    public static final MyConfig CONFIG = ConfigManager.register("mymod", MyConfig::new);

    public MyMod() {
        // Directly use CONFIG.maxSpeed and other fields
    }
}
```
