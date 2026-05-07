---
title: Integration Core API
prev: false
next: false
---

# Core API

## `@Integration`

A class-level annotation that declares integration information.

```java
@Target(ElementType.TYPE)
public @interface Integration {
    String value();                    // Target mod ID (required)
    String version() default "*";      // Version range
    IntegrationType[] type() default {IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER};
}
```

| Attribute | Type                | Description                                                        |
|-----------|---------------------|--------------------------------------------------------------------|
| value     | `String`            | Target mod ID to integrate with                                    |
| version   | `String`            | Compatible mod version range (Maven version syntax), defaults to `"*"` |
| type      | `IntegrationType[]` | Target environment for the integration, defaults to `{CLIENT, DEDICATED_SERVER}` |

## IntegrationType <Badge type="info" text="changed in 26.1" />

An enum representing the environment the integration applies to:

**1.21.1**: `CLIENT`, `DEDICATED_SERVER`, `DATA`

**26.1**: `CLIENT`, `DEDICATED_SERVER`, `CLIENT_DATA`, `SERVER_DATA` <Badge type="danger" text="breaking" />

| Value              | Description          |
|--------------------|----------------------|
| `CLIENT`           | Physical client      |
| `DEDICATED_SERVER` | Dedicated server     |
| `CLIENT_DATA`      | Client data generation |
| `SERVER_DATA`      | Server data generation |

## IntegrationInstance

Represents a concrete integration instance, encapsulating reflection information.

### Construction and Initialization

```java
IntegrationInstance instance = new IntegrationInstance(
    "targetmod",                    // Target modId
    ModVersionRange.of("[1.0,2.0)"), // Version range
    "com.example.MyIntegration",     // Fully qualified class name
    List.of(IntegrationType.CLIENT)  // List of environment types
);
```

### Methods

| Method                            | Description                                                             |
|-----------------------------------|-------------------------------------------------------------------------|
| `newInstance()`                   | Loads the class, uses `MethodHandles.Lookup` to find the no-arg constructor and four optional load methods |
| `invoke()`                        | Invokes the `apply()` method (via MethodHandle reflection)              |
| `invokeClient()`                  | Invokes the `applyClient()` method                                      |
| `invokeClientData()`              | Invokes the `applyClientData()` method                                  |
| `invokeServerData()`              | Invokes the `applyServerData()` method                                  |
| `containsType(IntegrationType)`   | Checks whether this instance includes the specified environment type    |
| `is(ModInfo)`                     | Matches the target mod ID and version range                             |

### Method Convention

Integration classes must provide a no-arg constructor and the following optional methods (all must be `void ()`):

| Method Name          | Invocation Context       |
|----------------------|--------------------------|
| `apply()`            | Common load (both sides) |
| `applyClient()`      | Physical client load     |
| `applyClientData()`  | Client data generation   |
| `applyServerData()`  | Server data generation   |

At least one of these methods must be defined, otherwise a warning is emitted. Methods are invoked via `MethodHandle` reflection and do not depend on interface implementation.

## Full Example

```java
@Integration(
    value = "targetmod",
    version = "[1.0,2.0)",
    type = { IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER }
)
public class MyIntegration {
    // Public no-arg constructor (implicit)

    public void apply() {
        // Common registration code for both sides
    }

    public void applyClient() {
        // Client only: register renderers, key bindings, etc.
    }

    public void applyClientData() {
        // Client data generation
        GatherDataEvent event = IntegrationHook.getEvent();
    }

    public void applyServerData() {
        // Server data generation
    }
}
```
