# Integration Mod Compatibility Framework (`module.integration`)

<BranchContextCard branch="1.21.1" />

`module.integration` (artifact `anvillib-integration-neoforge-1.21.1`, package `dev.anvilcraft.lib.v2.integration`) provides a **soft-dependency integration framework based on class annotation scanning, Maven range version filtering, and physical side separation**.

When developing large mods, you often need compat code for third-party mods like JEI, Jade, Curios, Create, or KubeJS. Directly `import`ing compat classes in your main class causes `NoClassDefFoundError` crashes when players lack that mod. With `module.integration`, simply annotate standalone compat entry classes with **`@Integration("target_mod_id")`**; `IntegrationManager` dynamically loads and invokes the corresponding lifecycle methods only when the target mod is installed and its version matches, completely isolating soft-dependency classloading.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.1`, this module is included automatically. To depend on `integration` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-integration-neoforge-1.21.1:2.0.0")
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

// Active on client only when "jei" >= 19.0.0 and < 20.0.0 is installed
@Integration(
    value = "jei",
    version = "[19.0.0,20.0.0)",
    type = {IntegrationType.CLIENT}
)
public class JeiModIntegration {
    // Must have a public no-arg constructor (default constructor works)

    /**
     * Common/server integration entry: executed when IntegrationManager#loadAllIntegrations() is called
     */
    public void apply() {
        MyMod.LOGGER.info("Activating JEI common integration...");
    }

    /**
     * Client-only integration entry: executed when IntegrationManager#loadAllClientIntegrations() is called
     */
    public void applyClient() {
        MyMod.LOGGER.info("Activating JEI client rendering & UI integration...");
    }

    /**
     * DataGen-only integration entry: executed when IntegrationManager#loadAllDataIntegrations() is called
     */
    public void applyData() {
        MyMod.LOGGER.info("Activating JEI DataGen integration...");
    }
}
```

### 2. Triggering `IntegrationManager` in Your Mod Main Class

Note: `IntegrationManager` must be given **your own mod's ID** (so it scans `@Integration` annotations inside your mod's JAR):

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.integration.IntegrationManager;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.data.event.GatherDataEvent;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";
    public static final IntegrationManager INTEGRATIONS = new IntegrationManager(MOD_ID);

    public MyMod(IEventBus modEventBus) {
        // 1. Scan all @Integration-annotated classes inside this mod's JAR
        INTEGRATIONS.compileContent();

        // 2. Trigger loading at the corresponding lifecycle phases
        modEventBus.addListener(this::onCommonSetup);
        if (FMLEnvironment.dist == Dist.CLIENT) {
            modEventBus.addListener(this::onClientSetup);
        }
        modEventBus.addListener(this::onGatherData);
    }

    private void onCommonSetup(FMLCommonSetupEvent event) {
        INTEGRATIONS.loadAllIntegrations();
    }

    private void onClientSetup(FMLClientSetupEvent event) {
        INTEGRATIONS.loadAllClientIntegrations();
    }

    private void onGatherData(GatherDataEvent event) {
        INTEGRATIONS.loadAllDataIntegrations();
    }
}
```

---

## 3. Version Range Syntax (`ModVersionRange`)

`@Integration(version = "...")` parses and validates target mod versions using **`ModVersionRange`**:
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
| **`@Integration`** | • `String value()`<br>• `String version()`<br>• `IntegrationType[] type()` | *Required*<br>`"*"`<br>`{DEDICATED_SERVER, CLIENT}` | Placed on compat classes (`ElementType.TYPE`). `value` is the target mod's `modId`. Note: on a Dedicated Server, if `type` does not include `IntegrationType.DEDICATED_SERVER`, `IntegrationManager#load` skips the compat class automatically! |
| **`IntegrationType`** | Enum constants:<br>• `CLIENT`<br>• `DEDICATED_SERVER`<br>• `DATA` | — | Identifies the runtime environment types for this integration class. |

### 2. `IntegrationManager`

Located in `dev.anvilcraft.lib.v2.integration.IntegrationManager`.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public IntegrationManager(String modId)` | `IntegrationManager` | Creates an integration manager bound to host mod `modId`. |
| `public void compileContent()` | `void` | Reads `ModFileScanData` from `LoadingModList.get().getModFileById(this.modId)`, scans all `@Integration` classes, and builds the `IntegrationInstance` map. |
| `public void loadAllIntegrations()` | `void` | Iterates all declared target `modId`s; if loaded and version-matched, instantiates the class and calls its no-arg **`apply()`** method. |
| `public void loadAllClientIntegrations()` | `void` | Iterates all loaded and version-matched target mods, instantiates the class, and calls its no-arg **`applyClient()`** method. |
| `public void loadAllDataIntegrations()` | `void` | Iterates all loaded and version-matched target mods, instantiates the class, and calls its no-arg **`applyData()`** method. |
| `public void load(String modid, ModInfo info)`<br>`public void loadClient(String modid, ModInfo info)`<br>`public void loadData(String modid, ModInfo info)` | `void` | Runs common, client, or datagen integration for a specific `modid` and `ModInfo`. |

### 3. `IntegrationInstance`, `ModVersionRange` & `IntegrationHook`

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`IntegrationInstance`** | • `public IntegrationInstance(String modid, ModVersionRange versionRange, String className, List<IntegrationType> types)`<br>• `public boolean is(ModInfo mod)`: checks `mod.getModId()` and `mod.getVersion()`<br>• `public void newInstance()`: reflectively creates a singleton via no-arg constructor and looks up `MethodHandle`s for `apply` / `applyClient` / `applyData`<br>• `public void invoke()` / `invokeClient()` / `invokeData()`<br>• `public boolean containsType(IntegrationType type)` | Encapsulates metadata and `MethodHandle`s for a single `@Integration` class. |
| **`ModVersionRange`** | • `public static final ModVersionRange ANY`<br>• `public static ModVersionRange of(@Nullable String spec)`<br>• `public boolean contains(ArtifactVersion version)` / `contains(String version)` | Maven version range parser and comparator. |
| **`IntegrationHook`** | `public static void setModEventBus(IEventBus bus)` / `getModEventBus()`<br>`public static void setModContainer(ModContainer container)` / `getModContainer()` | Static context holder allowing integration classes to access the host mod's `IEventBus` or `ModContainer`. |
