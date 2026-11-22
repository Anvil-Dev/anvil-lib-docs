# Config Annotation System: Declaration & Registration (`module.config`)

<BranchContextCard branch="1.21.11" />

`module.config` (artifact `anvillib-config-neoforge-1.21.11`, package `dev.anvilcraft.lib.v2.config`) provides a **declarative annotation-driven config framework**. Simply define a plain Java POJO, annotate fields with `@Comment`, `@BoundedDiscrete`, `@Slider`, `@CollapsibleObject`, and call `ConfigManager.register(MOD_ID, MyConfig::new)` once to automatically:
1. Generate NeoForge's `ModConfigSpec` and register the TOML config file on `ModContainer` during `FMLConstructModEvent`;
2. Listen to `ModConfigEvent` (load and hot-reload) to reflectively write TOML values back into POJO fields;
3. Register the config screen on the physical client (supporting NeoForge's `ConfigScreenStyle.DEFAULT` or AnvilLib's `ConfigScreenStyle.SIDEBAR`).

This module is split into 3 sub-documents:
- **This page (Annotations & `ConfigManager` Registration)**: Covers `@Config`, `@Comment`, `@BoundedDiscrete`, `@Slider`, `@CollapsibleObject`, `ConfigScreenStyle`, and `ConfigManager`.
- **[Client Config Screen & Sidebar](./client-screen)**: Covers `ConfigScreens`, `SidebarConfigScreen`, `ConfigTabs`, `FlatButton`, and `PanelOptionsList`.
- **[Language Generation & Formatting Utilities](./datagen-and-util)**: Covers `ConfigData`, `ConfigLanguageProvider`, `FormattingUtil`, and `TranslatableEnum`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.11`, this module is included automatically. To depend on `config` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-1.21.11:2.0.0")
}
```

---

## 2. Full Code Example: Defining & Registering a Multi-Level Config Class

### 1. Defining `MyModConfig.java`

```java
package com.example.mymod.config;

import dev.anvilcraft.lib.v2.config.BoundedDiscrete;
import dev.anvilcraft.lib.v2.config.CollapsibleObject;
import dev.anvilcraft.lib.v2.config.Comment;
import dev.anvilcraft.lib.v2.config.Config;
import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import dev.anvilcraft.lib.v2.config.Slider;
import dev.anvilcraft.lib.v2.config.util.TranslatableEnum;
import net.minecraft.network.chat.Component;
import net.neoforged.fml.config.ModConfig;

@Config(
    name = "my_mod",
    group = "my_mod",
    type = ModConfig.Type.COMMON,
    screenStyle = ConfigScreenStyle.SIDEBAR
)
public class MyModConfig {
    @Comment("Enable automatic power grid load balancing")
    public boolean enableGridBalance = true;

    @Comment("Maximum grid transmission radius in blocks")
    @BoundedDiscrete(min = 1, max = 256)
    public int maxTransmissionRadius = 64;

    @Comment("Machine sound volume multiplier")
    @BoundedDiscrete(min = 0.0, max = 2.0)
    @Slider(step = 0.05)
    public double machineVolumeScale = 1.0;

    @Comment("Rendering quality preset")
    public QualityMode qualityMode = QualityMode.HIGH;

    @Comment("Reactor subsystem parameters")
    @CollapsibleObject
    public ReactorSubConfig reactor = new ReactorSubConfig();

    public static class ReactorSubConfig {
        @Comment("Overheat protection threshold in Kelvin")
        @BoundedDiscrete(min = 300, max = 5000)
        public int overheatThreshold = 1500;

        @Comment("Coolant consumption multiplier")
        @BoundedDiscrete(min = 0.1, max = 10.0)
        @Slider(step = 0.1)
        public float coolantConsumptionFactor = 1.0f;
    }

    public enum QualityMode implements TranslatableEnum {
        LOW,
        MEDIUM,
        HIGH;

        @Override
        public Component getTranslatedName() {
            return Component.translatable("my_mod.configuration.quality_mode." + this.name().toLowerCase());
        }
    }
}
```

### 2. Registering the Config in Your Mod Main Class

Call `ConfigManager.register` in a static field or constructor of your mod main class (**must be called before or during `FMLConstructModEvent`**):

```java
package com.example.mymod;

import com.example.mymod.config.MyModConfig;
import dev.anvilcraft.lib.v2.config.ConfigManager;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";

    // One line handles ModConfigSpec building, TOML binding, ModConfigEvent hot-reload, and client screen registration
    public static final MyModConfig CONFIG = ConfigManager.register(MOD_ID, MyModConfig::new);

    public MyMod() {
    }
}
```

---

## 3. Core Annotations Reference

### 1. `@Config` (Class-Level Annotation)

Placed on the root config class to declare file name, subdirectory, config type, and client screen style.

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `String` | *Required* | Config file name and translation key prefix (typically your `modId` or `"my_mod-client"`). |
| `group` | `String` | `""` | Subdirectory name: if empty or equal to `name`, generated at `config/<name>-<type>.toml`; otherwise at `config/<group>/<name>-<type>.toml`. |
| `type` | `ModConfig.Type` | `ModConfig.Type.COMMON` | Config type: `COMMON`, `CLIENT`, `SERVER`, or `STARTUP`. |
| `screenStyle` | `ConfigScreenStyle` | `ConfigScreenStyle.DEFAULT` | Client screen style: `DEFAULT` uses NeoForge's native section screen; `SIDEBAR` uses AnvilLib's `SidebarConfigScreen`. |

### 2. Field-Level Annotations (`@Comment` / `@BoundedDiscrete` / `@Slider` / `@CollapsibleObject`)

| Annotation | Target Field Types | Attributes & Constraints |
| :--- | :--- | :--- |
| **`@Comment`** | Any config field | `String value() default ""`: single string written as TOML comment and extracted by `ConfigData.readConfigClass` for `.tooltip` language keys. |
| **`@BoundedDiscrete`** | `byte`/`short`/`int`/`long`/`float`/`double` and boxed types | `double min()`, `double max()`: constrains numeric fields to `[min, max]`. Defaults to the type's `MIN_VALUE ~ MAX_VALUE` (`-Infinity ~ +Infinity` for floats).<br>`@ApiStatus.Internal` `BoundedDiscrete.Util` clamps `double` bounds safely to the target numeric type. |
| **`@Slider`** | **`float` / `double` only** (including boxed) | `double step()` (required): renders the float field as a drag slider in `SidebarConfigScreen` (internal `Slider.Range` validates finite `min < max`, finite `step > 0`, and total steps `<= Integer.MAX_VALUE - 1`).<br>**Hard constraint**: `@Slider` fields **must be `float`/`double` AND also annotated with `@BoundedDiscrete`**, otherwise `ConfigManager.define` throws `IllegalArgumentException`. |
| **`@CollapsibleObject`** | Nested subconfig POJO fields | No attributes. Marks the field as a subconfig group (`builder.push(fieldName)` recursively scans its fields, generating a sidebar tab or modal subpage in `SidebarConfigScreen`). |

> **Field Name Conversion Rule**:
> Java fields use camelCase (e.g., `maxTransmissionRadius`). If annotated with `@com.google.gson.annotations.SerializedName`, `ConfigData` uses that for the display name, while `ConfigManager` converts the field name to snake_case (`max_transmission_radius`) via `FormattingUtil.toLowerCaseUnder` for the TOML key.

---

## 4. `ConfigManager` & Internal Records API Reference

### 1. `ConfigManager` Public & Internal Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static <T> T register(String modId, Supplier<T> configFactory)` | `T` (config instance) | **Recommended entry point**: finds `ModContainer` by `modId`, binds to the mod event bus, builds `ModConfigSpec`, and registers the screen on the physical client via `registerScreen(container)`. Calling multiple times for the same `modId` reuses the same `ConfigManager` instance. |
| `public static @Nullable Slider.Range slider(ModConfigSpec.ValueSpec spec)` | `@Nullable Slider.Range` | Queries the slider step and range metadata associated with `spec`. |
| `public static boolean previewClientValue(String modId, ModConfig config, List<String> path, Object value)` | `boolean` | Client live-preview helper that temporarily syncs edited values into the in-memory `ConfigField` object. |
| `@ApiStatus.Internal`<br>`public <T> T register(T configObj)`<br>`public void register(IEventBus bus)`<br>`public void registerScreen(ModContainer container)` | — | Internal lifecycle methods: builds `ConfigRecord`, subscribes to `FMLConstructModEvent`/`ModConfigEvent`, and registers `IConfigScreenFactory` on `ModContainer`. |
| `@ApiStatus.Internal`<br>`public static ModConfigSpec.ConfigValue<?> define(...)` / `defineEnum(...)` / `defineInRange(...)` | — | Internal spec builders. Since TOML does not preserve `Byte`/`Short`/`Float`, `defineInRange` normalizes them to `int` or `double` ranges and `ConfigField#load` narrows them back on load. |

### 2. `ConfigScreenStyle` & Internal Records (`@ApiStatus.Internal`)

| Class / Enum | Signature & Description |
| :--- | :--- |
| `ConfigScreenStyle` | Enum: `DEFAULT` (NeoForge native config page), `SIDEBAR` (AnvilLib sidebar config page). |
| `ConfigRecord` | `@ApiStatus.Internal public record ConfigRecord(String group, String modId, String name, ModConfig.Type type, ModConfigSpec spec, Object object, @Unmodifiable List<ConfigField> values, AtomicBoolean registered, ConfigScreenStyle screenStyle)`. |
| `ConfigField` | `@ApiStatus.Internal public record ConfigField(Object object, Field field, ModConfigSpec.ConfigValue<?> value)`, responsible for writing config values back to POJO fields with narrowing numeric conversions. |
