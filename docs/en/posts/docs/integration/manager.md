---
title: Integration Manager & Hooks
prev: false
next: false
---

# Manager & Hooks

## IntegrationManager

The core management class responsible for scanning the classpath for all `@Integration` annotations, instantiating them,
and invoking the appropriate methods.

### Construction and Compilation

```java
// Create a manager (bound to a specific modId)
IntegrationManager manager = new IntegrationManager("your_mod_id");

// Scan the classpath and compile the integration list
manager.compileContent();
```

`compileContent()` internal flow:

1. Retrieves the current mod's `ModFileScanData`
2. Filters all classes annotated with `@Integration`
3. Parses the `value` (modId), `version`, and `type` attributes
4. Creates `IntegrationInstance` objects and groups them by target modId into a `Multimap`

### Load Methods

| Method                                       | Description                                                            |
|----------------------------------------------|------------------------------------------------------------------------|
| `load(String modid, ModInfo info)`           | Loads integrations for the specified target mod (checks physical side) |
| `loadClient(String modid, ModInfo info)`     | Loads client-side logic                                                |
| `loadClientData(String modid, ModInfo info)` | Loads client data generation                                           |
| `loadServerData(String modid, ModInfo info)` | Loads server data generation                                           |
| `loadAllIntegrations()`                      | Batch-loads common logic for all compiled integrations                 |
| `loadAllClientIntegrations()`                | Batch-loads all client-side logic                                      |
| `loadAllClientDataIntegrations()`            | Batch-loads all client data generation                                 |
| `loadAllServerDataIntegrations()`            | Batch-loads all server data generation                                 |

### Load Flow

Single `load()` flow:

1. Looks up all integration instances for the target modId from `instances`
2. On a dedicated server environment, automatically skips instances without the `DEDICATED_SERVER` type
3. `instance.is(modInfo)` checks version compatibility
4. `instance.newInstance()` loads the class, finds the constructor and methods
5. `instance.invoke()` calls the corresponding method

### Usage Example

```java
@Mod("your_mod_id")
public class YourMod {
    public static final IntegrationManager MANAGER = new IntegrationManager("your_mod_id");

    public YourMod() {
        MANAGER.compileContent();
    }

    // Invoke during the appropriate lifecycle event
    @SubscribeEvent
    public static void onCommonSetup(FMLCommonSetupEvent event) {
        MANAGER.loadAllIntegrations();
        MANAGER.loadAllClientIntegrations(); // Restricted via DistExecutor
    }
}
```

## IntegrationHook

Provides a static context so that integration classes can access current runtime resources.

```java
public class IntegrationHook {
    @Getter @Setter
    private static GatherDataEvent event = null;

    @Getter @Setter
    private static IEventBus modEventBus = null;

    @Getter @Setter
    private static ModContainer modContainer = null;
}
```

| Field        | Type              | Description                                                   |
|--------------|-------------------|---------------------------------------------------------------|
| event        | `GatherDataEvent` | Data generation event (only available during data generation) |
| modEventBus  | `IEventBus`       | Current mod's event bus                                       |
| modContainer | `ModContainer`    | Current mod container                                         |

### How to Set

```java
// Set in the mod constructor
IntegrationHook.setModEventBus(modEventBus);
IntegrationHook.setModContainer(modContainer);

// Set in the data generation event
IntegrationHook.setEvent(gatherDataEvent);
```

## ModVersionRange

Encapsulates a Maven `VersionRange`, with `"*"` representing any version.

```java
// Parse a version specifier
ModVersionRange range = ModVersionRange.of("[1.0,2.0)");
ModVersionRange any = ModVersionRange.of("*"); // -> ANY singleton

// Version matching
boolean matches = range.containsVersion(modInfo.getVersion());
```

Supported version syntax is identical to Maven dependency versions: `"1.0"`, `"[1.0,2.0)"`, `"[1.0,]"`, `"(,2.0]"`, etc.

## Data Generation Integration Example

```java
@Integration(value = "examplemod", version = "*",
             type = IntegrationType.CLIENT_DATA)
public class ExampleDataIntegration {
    public void applyClientData() {
        GatherDataEvent event = IntegrationHook.getEvent();
        DataGenerator generator = event.getGenerator();
        // Register a data provider
        generator.addProvider(true, new MyDataProvider(generator.getPackOutput()));
    }
}
```

Ensure `IntegrationHook.setEvent(event)` is called beforehand during the data generation event.
