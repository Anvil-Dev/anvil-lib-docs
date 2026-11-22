# Integration Mod Compatibility Framework (`module.integration`)

<BranchContextCard branch="26.2" />

`module.integration` (artifact `anvillib-integration-neoforge-26.2`, package `dev.anvilcraft.lib.v2.integration`) provides an optional mod compatibility (soft dependency) loading framework based on bytecode annotation scanning (`ModFileScanData`) and `MethodHandles`.

When writing compat code for other mods (such as JEI, EMI, Jade, Curios, Create), directly `import`ing external mod classes in your main class or event listeners causes `NoClassDefFoundError` crashes if the player does not have that mod installed. With `module.integration`, you annotate standalone compat classes with `@Integration("target_mod_id")`, and the framework checks NeoForge's pre-scanned annotation metadata for mod presence, Maven version range, and physical side—**loading and instantiating the compat class via `Class.forName` only when all conditions are met**.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.2`, this module is included automatically. To depend on `integration` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-integration-neoforge-26.2:2.0.0")
}
```

---

## 2. Core Convention: 4 No-Arg Lifecycle Methods

A class annotated with `@Integration` **must have a public no-arg constructor (`public YourClass()`)** and does not need to implement any interface. When loading the class, `IntegrationInstance` looks up up to 4 `void` no-arg instance methods via `MethodHandles.lookup().findVirtual(...)` (declare whichever ones you need):

| Method Signature | Triggering `IntegrationManager` Method | Use Case |
| :--- | :--- | :--- |
| `public void apply()` | `load(modid, info)` / `loadAllIntegrations()` | Common (both sides) compat init logic (e.g., registering compat blocks/items, common events; access bus via `IntegrationHook.getModEventBus()`). |
| `public void applyClient()` | `loadClient(modid, info)` / `loadAllClientIntegrations()` | Physical client-only compat init logic (e.g., client renderers, HUD overlays, keybindings). |
| `public void applyClientData()` | `loadClientData(modid, info)` / `loadAllClientDataIntegrations()` | Client DataGen compat (access `GatherDataEvent` via `IntegrationHook.getEvent()`). |
| `public void applyServerData()` | `loadServerData(modid, info)` / `loadAllServerDataIntegrations()` | Server DataGen compat (e.g., generating compat recipes or tags for the target mod). |

> **Warning**: If an `@Integration` class declares none of the 4 methods above, `IntegrationInstance` logs a warning: `Integration <className> does not declare any loader method.`.

---

## 3. Full Code Example

### 1. Writing a Compat Class (Example: Curios & Client Jade Compat)

```java
package com.example.mymod.integration.curios;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.integration.Integration;
import dev.anvilcraft.lib.v2.integration.IntegrationHook;
import dev.anvilcraft.lib.v2.integration.IntegrationType;
import net.neoforged.bus.api.IEventBus;

// Active on both client and dedicated server when curios >= 9.0.0 is installed
@Integration(
    value = "curios",
    version = "[9.0.0,)",
    type = {IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER}
)
public class CuriosIntegration {
    // 1. Common init: triggered by IntegrationManager#loadAllIntegrations()
    public void apply() {
        IEventBus modBus = IntegrationHook.getModEventBus();
        if (modBus != null) {
            modBus.addListener(this::registerCuriosCapabilities);
        }
        MyMod.LOGGER.info("Curios common integration activated");
    }

    // 2. Client init: triggered by IntegrationManager#loadAllClientIntegrations()
    public void applyClient() {
        MyMod.LOGGER.info("Curios client renderers registered");
    }

    // 3. Server DataGen: triggered by IntegrationManager#loadAllServerDataIntegrations()
    public void applyServerData() {
        var gatherEvent = IntegrationHook.getEvent();
        if (gatherEvent != null) {
            // Register Curios slot Tag Provider to gatherEvent.getGenerator()
        }
    }

    private void registerCuriosCapabilities(
        net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent event
    ) {
        // Only loaded when Curios is present, safe to access external APIs
    }
}
```

### 2. Creating and Driving `IntegrationManager` in Your Mod Main Class

`IntegrationManager` does not run silently on its own; your mod explicitly controls when scanning and each phase are triggered, and passes context objects via `IntegrationHook`:

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.integration.IntegrationHook;
import dev.anvilcraft.lib.v2.integration.IntegrationManager;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLLoader;
import net.neoforged.neoforge.data.event.GatherDataEvent;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";
    public static final IntegrationManager INTEGRATION_MANAGER = new IntegrationManager(MOD_ID);

    public MyMod(IEventBus modEventBus, ModContainer modContainer) {
        // 1. Store mod bus and container in IntegrationHook for @Integration classes to read
        IntegrationHook.setModEventBus(modEventBus);
        IntegrationHook.setModContainer(modContainer);

        // 2. Scan all @Integration-annotated classes inside this mod's JAR
        INTEGRATION_MANAGER.compileContent();

        // 3. Trigger apply() for all matching mods
        INTEGRATION_MANAGER.loadAllIntegrations();

        // 4. On physical client, trigger applyClient() for all matching mods
        if (FMLLoader.getCurrent().getDist() == Dist.CLIENT) {
            INTEGRATION_MANAGER.loadAllClientIntegrations();
        }

        // 5. Trigger applyClientData() / applyServerData() during DataGen events
        modEventBus.addListener(this::onGatherData);
    }

    private void onGatherData(GatherDataEvent.Client event) {
        IntegrationHook.setEvent(event);
        INTEGRATION_MANAGER.loadAllClientDataIntegrations();
        INTEGRATION_MANAGER.loadAllServerDataIntegrations();
    }
}
```

---

## 4. Public Classes, Annotations & Enums API Reference

### 1. `@Integration` (Integration Class Declaration Annotation)

Placed on classes, interfaces, or enums (`@Target(ElementType.TYPE)`).

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `value()` | `String` | **Required** | Target external mod's `modId` (e.g., `"jei"`, `"jade"`, `"curios"`). |
| `version()` | `String` | `"*"` | Maven version range expression (based on `org.apache.maven.artifact.versioning.VersionRange`).<br>• `"*"`: matches any installed version;<br>• `"[19.0,)"`: matches `>= 19.0`;<br>• `"[1.0,2.0)"`: matches `1.0 <= v < 2.0`. |
| `type()` | `IntegrationType[]` | `{CLIENT, DEDICATED_SERVER}` | Allowed runtime environment types. Note: when running on a dedicated server (`isDedicatedServer()`), if `type()` does not include `IntegrationType.DEDICATED_SERVER`, `IntegrationManager#load` skips the class, protecting client-only compat classes from `Class.forName` on servers. |

### 2. `IntegrationType` (Integration Environment Enum)

Located in `dev.anvilcraft.lib.v2.integration.IntegrationType`:

| Enum Constant | Meaning |
| :--- | :--- |
| `CLIENT` | Physical client runtime integration |
| `DEDICATED_SERVER` | Dedicated server runtime integration |
| `CLIENT_DATA` | Client DataGen phase integration |
| `SERVER_DATA` | Server DataGen phase integration |

### 3. `IntegrationManager` (Integration Scanner & Loader)

Located in `dev.anvilcraft.lib.v2.integration.IntegrationManager`. Each mod that scans its own `@Integration` classes should instantiate an `IntegrationManager` with its own `modId`.

| Constructor / Constant / Method Signature | Description |
| :--- | :--- |
| `public static final String INTEGRATION_NAME` | Bytecode descriptor of `@Integration`: `"Ldev/anvilcraft/lib/v2/integration/Integration;"`. |
| `public IntegrationManager(String modId)` | Constructs an integration manager bound to the host `modId`. |
| `public void compileContent()` | Obtains `ModFileScanData` from `FMLLoader.getCurrent().getLoadingModList().getModFileById(this.modId)`, scans all `@Integration` annotations, and builds the `IntegrationInstance` map (showing a `"Load Integrations"` progress bar on startup). **Must be called before any `load*` method**. |
| `public void loadAllIntegrations()` | Iterates all registered target `modid`s and calls `load(key, modInfo)` if present in `LoadingModList`. |
| `public void loadAllClientIntegrations()` | Iterates all loaded target mods and calls `loadClient(key, modInfo)`. |
| `public void loadAllClientDataIntegrations()` | Iterates all loaded target mods and calls `loadClientData(key, modInfo)`. |
| `public void loadAllServerDataIntegrations()` | Iterates all loaded target mods and calls `loadServerData(key, modInfo)`. |
| `public void load(String modid, ModInfo info)` | For every `IntegrationInstance` matching `modid` and version `instance.is(info)` (and checking `containsType(DEDICATED_SERVER)` on dedicated servers), reflectively instantiates it and invokes `apply()`. |
| `public void loadClient(String modid, ModInfo info)` | Instantiates matching `IntegrationInstance`s (reusing singleton if already instantiated) and invokes `applyClient()`. |
| `public void loadClientData(String modid, ModInfo info)` | Instantiates matching `IntegrationInstance`s and invokes `applyClientData()`. |
| `public void loadServerData(String modid, ModInfo info)` | Instantiates matching `IntegrationInstance`s and invokes `applyServerData()`. |

### 4. `IntegrationHook` (Global Context Passing Container)

Located in `dev.anvilcraft.lib.v2.integration.IntegrationHook`. Since `@Integration` classes must use no-arg constructors and no-arg `apply*()` methods, the host mod can pass the event bus or container via `IntegrationHook`'s static getters/setters:

| Method Signature | Type | Description |
| :--- | :--- | :--- |
| `IntegrationHook.getEvent()` / `setEvent(GatherDataEvent)` | `GatherDataEvent` | Gets/sets the current DataGen event. |
| `IntegrationHook.getModEventBus()` / `setModEventBus(IEventBus)` | `IEventBus` | Gets/sets the host mod's Mod event bus. |
| `IntegrationHook.getModContainer()` / `setModContainer(ModContainer)` | `ModContainer` | Gets/sets the host mod's `ModContainer`. |

### 5. Internal Support Classes: `IntegrationInstance` & `ModVersionRange` (`@ApiStatus.Internal`)

| Class | Core Responsibility |
| :--- | :--- |
| `IntegrationInstance` | Wraps metadata, singleton `instance`, and 4 `MethodHandle`s (`loader`, `clientLoader`, `clientDataLoader`, `serverDataLoader`) for a single `@Integration` class. `newInstance()` is idempotent: the no-arg constructor is invoked only once across `loadAllIntegrations` and `loadAllClientIntegrations`, sharing the same instance. |
| `ModVersionRange` | Wraps Maven `VersionRange`. `ModVersionRange.of(String spec)` supports `"*"` (returning `ModVersionRange.ANY`) or standard Maven version range strings; logs an error and throws `RuntimeException(InvalidVersionSpecificationException)` on invalid syntax. |
