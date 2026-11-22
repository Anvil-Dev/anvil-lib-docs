# Integration Mod Compatibility Framework (`module.integration`)

<BranchContextCard branch="1.21.8" />

`module.integration` (artifact `anvillib-integration-neoforge-1.21.8`, package `dev.anvilcraft.lib.v2.integration`) provides a **soft-dependency integration framework based on class annotation scanning, Maven range version filtering, and physical side / client & server Datagen separation**.

When writing cross-mod compat for JEI, Jade, Curios, Create, or KubeJS, simply annotate standalone compat entry classes with **`@Integration("target_mod_id")`**; `IntegrationManager` dynamically loads and invokes the corresponding lifecycle methods only when the target mod is installed and its version matches, completely isolating soft-dependency classloading.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.8`, this module is included automatically. To depend on `integration` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-integration-neoforge-1.21.8:2.0.0")
}
```

---

## 2. Full Code Example: Writing a Compat Entry Class & Driving It via `IntegrationManager`

### 1. Writing a Compat Entry Class (Annotated with `@Integration`)

Inside the compat class, **you can safely reference the target mod's classes directly**, because `IntegrationInstance` only loads it via `Class.forName` when the target mod is present and satisfies `version`:

```java
package com.example.mymod.integration.jei;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.integration.Integration;
import dev.anvilcraft.lib.v2.integration.IntegrationType;

// Active on client only when "jei" >= 19.0.0 and < 25.0.0 is installed
@Integration(
    value = "jei",
    version = "[19.0.0,25.0.0)",
    type = {IntegrationType.CLIENT, IntegrationType.CLIENT_DATA}
)
public class JeiModIntegration {
    // Must have a public no-arg constructor

    /**
     * Common/server integration entry: executed when IntegrationManager#loadAllIntegrations() is called
     */
    public void apply() {
        MyMod.LOGGER.info("Activating common JEI integration...");
    }

    /**
     * Client-only integration entry: executed when IntegrationManager#loadAllClientIntegrations() is called
     */
    public void applyClient() {
        MyMod.LOGGER.info("Activating client JEI integration...");
    }

    /**
     * Client Datagen entry: executed when IntegrationManager#loadAllClientDataIntegrations() is called
     */
    public void applyClientData() {
        MyMod.LOGGER.info("Activating client datagen JEI integration...");
    }

    /**
     * Server Datagen entry: executed when IntegrationManager#loadAllServerDataIntegrations() is called
     */
    public void applyServerData() {
        MyMod.LOGGER.info("Activating server datagen JEI integration...");
    }
}
```

### 2. Triggering `IntegrationManager` in Your Mod Main Class

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.integration.IntegrationHook;
import dev.anvilcraft.lib.v2.integration.IntegrationManager;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.data.event.GatherDataEvent;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";
    public static final IntegrationManager INTEGRATIONS = new IntegrationManager(MOD_ID);

    public MyMod(IEventBus modEventBus, ModContainer modContainer) {
        IntegrationHook.setModEventBus(modEventBus);
        IntegrationHook.setModContainer(modContainer);

        // 1. Scan all @Integration-annotated classes inside this mod's JAR
        INTEGRATIONS.compileContent();

        // 2. Trigger loading at the corresponding lifecycle phases
        modEventBus.addListener(this::onCommonSetup);
        if (FMLEnvironment.dist == Dist.CLIENT) {
            modEventBus.addListener(this::onClientSetup);
        }
        modEventBus.addListener(this::onGatherClientData);
        modEventBus.addListener(this::onGatherServerData);
    }

    private void onCommonSetup(FMLCommonSetupEvent event) {
        INTEGRATIONS.loadAllIntegrations();
    }

    private void onClientSetup(FMLClientSetupEvent event) {
        INTEGRATIONS.loadAllClientIntegrations();
    }

    private void onGatherClientData(GatherDataEvent.Client event) {
        IntegrationHook.setEvent(event);
        INTEGRATIONS.loadAllClientDataIntegrations();
    }

    private void onGatherServerData(GatherDataEvent.Server event) {
        IntegrationHook.setEvent(event);
        INTEGRATIONS.loadAllServerDataIntegrations();
    }
}
```

---

## 3. Version Range Syntax (`ModVersionRange`)

`@Integration(version = "...")` parses and validates target mod versions via `ModVersionRange`:
- `"*"` (default): matches any version;
- **Maven range syntax** (must start with `[` or `(`, end with `]` or `)`, and contain `,`):
  - `[1.0.0,2.0.0)`: $1.0.0 \le \text{version} < 2.0.0$;
  - `[1.2.0,)`: $\text{version} \ge 1.2.0$ (no upper bound);
  - `(,2.0.0]`: $\text{version} \le 2.0.0$ (no lower bound);
  - `[1.5.2,1.5.2]`: exact match `1.5.2`;
- **Plain version string** (e.g., `"1.2.0"`, no brackets): equivalent to exact match `1.2.0`.

---

## 4. Public Classes, Annotations & Enums API Reference

### 1. `@Integration` & `IntegrationType`

| Name | Type / Attribute Signature | Default | Description |
| :--- | :--- | :--- | :--- |
| **`@Integration`** | • `String value()`<br>• `String version()`<br>• `IntegrationType[] type()` | *Required*<br>`"*"`<br>`{CLIENT, DEDICATED_SERVER}` | Placed on compat classes (`ElementType.TYPE`). `value` is the target mod's `modId`. On dedicated servers, if `type` does not include `DEDICATED_SERVER`, `load(...)` skips the class. |
| **`IntegrationType`** | Enum constants: `CLIENT`, `DEDICATED_SERVER`, `CLIENT_DATA`, `SERVER_DATA` | — | Identifies the runtime environment and Datagen phase for this integration class. |

### 2. `IntegrationManager`

Located in `dev.anvilcraft.lib.v2.integration.IntegrationManager`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public IntegrationManager(String modId)` | `IntegrationManager` | Creates an integration manager bound to host mod `modId`. |
| `public void compileContent()` | `void` | Reads `ModFileScanData` from `LoadingModList.get().getModFileById(this.modId)`, scans all `@Integration` classes, and builds the `IntegrationInstance` map. |
| `public void loadAllIntegrations()` | `void` | Iterates declared target `modId`s and instantiates/calls `apply()` if loaded and version-matched. |
| `public void loadAllClientIntegrations()` | `void` | Iterates target mods and calls `applyClient()`. |
| `public void loadAllClientDataIntegrations()` | `void` | Iterates target mods and calls `applyClientData()`. |
| `public void loadAllServerDataIntegrations()` | `void` | Iterates target mods and calls `applyServerData()`. |
| `public void load(String modid, ModInfo info)`<br>`public void loadClient(String modid, ModInfo info)`<br>`public void loadClientData(String modid, ModInfo info)`<br>`public void loadServerData(String modid, ModInfo info)` | `void` | Runs common, client, client-datagen, or server-datagen integration for a specific `modid` and `ModInfo`. |

### 3. `IntegrationHook` & `@ApiStatus.Internal` Internals

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`IntegrationHook`** | • `public static void setEvent(GatherDataEvent event)` / `getEvent()`<br>• `public static void setModEventBus(IEventBus modEventBus)` / `getModEventBus()`<br>• `public static void setModContainer(ModContainer modContainer)` / `getModContainer()` | Static context holder allowing integration classes to access the host mod's `GatherDataEvent`, `IEventBus`, or `ModContainer`. |
| **`IntegrationInstance`** | `@ApiStatus.Internal` | Encapsulates metadata and `MethodHandle`s (`apply`/`applyClient`/`applyClientData`/`applyServerData`) for a single `@Integration` class. |
| **`ModVersionRange`** | `@ApiStatus.Internal` | Maven version range parser and comparator. |
