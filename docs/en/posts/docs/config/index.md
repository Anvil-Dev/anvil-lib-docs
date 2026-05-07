---
title: Config
prev: false
next: false
---

# Config Module <Badge type="tip" text=">=1.21.1" />

The package `dev.anvilcraft.lib.v2.config` provides a declarative configuration framework built on top of the NeoForge config system. It simplifies the definition, registration, language generation, and runtime value injection of configuration classes through annotations and reflection.

## Documentation Index

| Document                    | Content                                                               |
|-----------------------------|-----------------------------------------------------------------------|
| [Annotation System](./annotations) | `@Config`, `@Comment`, `@CollapsibleObject`, `@BoundedDiscrete`       |
| [Config Management](./manager)     | `ConfigManager`, `ConfigRecord`, `ConfigField`                        |
| [Utilities](./utilities)           | `ConfigData` (language generation), `FormattingUtil` (string formatting) |

## Quick Start

```java
@Config(name = "mymod", type = ModConfig.Type.COMMON)
public class MyConfig {
    @Comment("The maximum speed of the machine.")
    @BoundedDiscrete(min = 0, max = 100)
    public int maxSpeed = 10;

    @Comment("Enable experimental mode.")
    public boolean experimental = false;
}

// Registration
MyConfig cfg = ConfigManager.register("mymod", MyConfig::new);
```

## Notes

- Config fields should be `public`, non-`static`, non-`final`
- Config file names follow the `<modId>-<type>.toml` format
- `BoundedDiscrete` bounds are `double`; they are internally truncated and clamped based on the actual field type
- Config screens are automatically registered on the client
