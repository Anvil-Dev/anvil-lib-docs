---
title: Config Annotations
prev: false
next: false
---

# Annotation System

## `@Config`

Marks a class as a configuration class. You must specify the config name and type.

```java
@Config(name = "mymod", type = ModConfig.Type.COMMON)
public class MyConfig { ... }
```

| Attribute | Type             | Description                                                              |
|-----------|------------------|--------------------------------------------------------------------------|
| name      | `String`         | Config primary key name, used to generate the file name and translation key prefix |
| type      | `ModConfig.Type` | Config type: `COMMON` / `CLIENT` / `SERVER`, defaults to `COMMON`        |

## `@Comment`

Provides a comment for a config field, generating both a TOML comment and a tooltip translation key.

```java
@Comment("The maximum speed of the machine.")
public int maxSpeed = 10;
```

Translation key format: `<modid>.configuration.<fieldpath>.tooltip`

## `@CollapsibleObject`

Marks a nested object field so that its internal fields are displayed in a collapsible group within the config GUI.

```java
@CollapsibleObject
public NestedConfig nested = new NestedConfig();
```

Fields inside the nested object also support annotations such as `@Comment` and `@BoundedDiscrete`.

## `@BoundedDiscrete`

Restricts the value range of numeric type fields.

```java
@BoundedDiscrete(min = 0, max = 100)
public int volume = 80;

@BoundedDiscrete(min = 1, max = Double.POSITIVE_INFINITY)
public double scale = 1.0;
```

| Attribute | Type     | Default       | Description          |
|-----------|----------|---------------|----------------------|
| min       | `double` | `-Infinity`   | Minimum value (incl.) |
| max       | `double` | `+Infinity`   | Maximum value (incl.) |

Supported field types: `byte`, `short`, `int`, `long`, `float`, `double`.

### BoundedDiscrete.Util

Internal utility class that converts the `double` bounds from the annotation into the actual range for each type:

```java
// Called internally
BoundedDiscrete.Util.parseIntRange(min, max);  // -> int
BoundedDiscrete.Util.parseLongRange(min, max); // -> long
// etc.
```

Automatically uses `defineInRange` during `ConfigManager.register`.

## Full Example

```java
@Config(name = "example", type = ModConfig.Type.COMMON)
public class ExampleConfig {
    @Comment("The number of uses.")
    @BoundedDiscrete(min = 1, max = 64)
    public int durability = 10;

    @Comment("The speed multiplier.")
    @BoundedDiscrete(min = 0.1, max = 10.0)
    public double speed = 1.0;

    @Comment("Enable experimental mode.")
    public boolean experimental = false;

    @CollapsibleObject
    public Inner inner = new Inner();

    public static class Inner {
        @Comment("Inner factor value")
        public double factor = 1.0;
    }
}
```
