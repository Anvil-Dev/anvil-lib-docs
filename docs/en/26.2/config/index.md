# Config Declaration, Annotations & Lifecycle (`module.config`)

<BranchContextCard branch="26.2" />

`module.config` (artifact `anvillib-config-neoforge-26.2`, package `dev.anvilcraft.lib.v2.config`) provides a reflection- and annotation-driven configuration management framework. Developers simply write a plain POJO config class and call `ConfigManager.register(...)` once; the framework automatically:

1. Converts fields into NeoForge's `ModConfigSpec` (including numeric range normalization, enums, booleans, strings/lists, and nested subsections);
2. Registers the TOML config file with `ModContainer` during `FMLConstructModEvent`;
3. Reflectively writes loaded/reloaded TOML values back into your config instance fields during `ModConfigEvent`;
4. Automatically registers either NeoForge's native config screen or AnvilLib's translucent sidebar config screen (`SidebarConfigScreen`) on the physical client, with live slider preview support.

This module is split into 3 sub-documents by functionality:
- **This page (Declaration, Annotations & Lifecycle)**: Covers `@Config`, `@Comment`, `@BoundedDiscrete`, `@Slider`, `@CollapsibleObject`, `ConfigScreenStyle`, `ConfigManager`, `ConfigField`, and `ConfigRecord`.
- **[Client Config Screen & Sidebar Style](./client-screen)**: Covers `ConfigScreens`, `SidebarConfigScreen`, `ConfigTabs`, `PanelOptionsList`, and `FlatButton`.
- **[Language File Generation & Enum Localization](./datagen-and-util)**: Covers `ConfigData`, `ConfigLanguageProvider`, `TranslatableEnum`, and `FormattingUtil`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.2`, this module is included automatically. To depend on `config` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-26.2:2.0.0")
}
```

---

## 2. Core Usage & Full Code Example

### 1. Problem & Usage

When using NeoForge's native `ModConfigSpec.Builder` directly, every entry requires a `ModConfigSpec.IntValue` / `BooleanValue` handle and calling `.get()` on every read, or manually listening to `ModConfigEvent` to sync into static cache fields.

With `module.config`:
- Config entries are declared as plain non-`final` fields (e.g., `public int maxRange = 16;`), whose initial values serve as the TOML defaults;
- Field names (camelCase `maxRange`) are automatically converted via `FormattingUtil.toLowerCaseUnder` to snake_case TOML keys (`max_range`);
- When the config file loads, hot-reloads, or is modified via sliders in the client config screen, `ConfigManager` automatically updates the fields on the config object so business code can read them directly.

### 2. Full Code Example

The example below shows a complete config class and registration flow with primitives, discrete bounds, step sliders, translatable enums, and multi-level nested collapsible objects:

```java
package com.example.mymod.config;

import com.google.gson.annotations.SerializedName;
import dev.anvilcraft.lib.v2.config.BoundedDiscrete;
import dev.anvilcraft.lib.v2.config.CollapsibleObject;
import dev.anvilcraft.lib.v2.config.Comment;
import dev.anvilcraft.lib.v2.config.Config;
import dev.anvilcraft.lib.v2.config.ConfigManager;
import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import dev.anvilcraft.lib.v2.config.Slider;
import dev.anvilcraft.lib.v2.config.util.TranslatableEnum;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;

@Config(
    name = "my_mod",
    group = "my_mod",
    type = ModConfig.Type.CLIENT,
    screenStyle = ConfigScreenStyle.SIDEBAR
)
public class MyModClientConfig {
    @Comment("Whether to enable machine working particle effects")
    public boolean enableParticles = true;

    @Comment("Maximum particle render distance (blocks)")
    @BoundedDiscrete(min = 4, max = 128)
    public int maxParticleDistance = 32;

    @Comment("Machine ambient sound volume multiplier (rendered as a step slider in Sidebar UI with live preview)")
    @BoundedDiscrete(min = 0.0, max = 2.0)
    @Slider(step = 0.05)
    public float soundVolume = 1.0f;

    @Comment("Render quality preset")
    public QualityPreset qualityPreset = QualityPreset.HIGH;

    @Comment("Advanced laser rendering parameters")
    @CollapsibleObject
    public LaserSection laser = new LaserSection();

    public static class LaserSection {
        @Comment("Laser beam opacity")
        @BoundedDiscrete(min = 0.1, max = 1.0)
        @Slider(step = 0.1)
        public double beamOpacity = 0.8;

        @Comment("Maximum reflection count")
        @SerializedName("Max Bounce Limit")
        @BoundedDiscrete(min = 1, max = 16)
        public int maxBounces = 4;

        @Comment("Nested level-2 subconfig (click 'Edit ›' in Sidebar UI to open modal)")
        @CollapsibleObject
        public BloomSubSection bloom = new BloomSubSection();
    }

    public static class BloomSubSection {
        @Comment("Bloom intensity")
        @BoundedDiscrete(min = 0.0, max = 5.0)
        @Slider(step = 0.25)
        public double intensity = 1.5;
    }

    public enum QualityPreset implements TranslatableEnum {
        LOW,
        MEDIUM,
        @SerializedName("Ultra High")
        HIGH
    }
}
```

Call `ConfigManager.register` in your mod main class constructor (or static initializer block):

```java
package com.example.mymod;

import com.example.mymod.config.MyModClientConfig;
import dev.anvilcraft.lib.v2.config.ConfigManager;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";

    // Register and hold the config singleton directly during mod class loading or construction
    public static final MyModClientConfig CLIENT_CONFIG =
        ConfigManager.register(MOD_ID, MyModClientConfig::new);

    public MyMod() {
        // Business code can directly read fields like MyMod.CLIENT_CONFIG.soundVolume
    }
}
```

---

## 3. Annotation & Enum API Reference

### 1. `@Config` (Config Class Declaration Annotation)

Placed on a config class (`ElementType.TYPE`) to declare its TOML file path, config type, and client screen style.

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name()` | `String` | **Required** | Base config file name (typically the mod ID, e.g. `"my_mod"`), also used as the translation key prefix `<name>.configuration.*`. |
| `group()` | `String` | `""` | Subdirectory for the config file. If empty, generated at `config/<name>-<type>.toml`; if set to `"my_mod"`, generated at `config/my_mod/<name>-<type>.toml`. |
| `type()` | `ModConfig.Type` | `ModConfig.Type.COMMON` | NeoForge config type: `COMMON`, `CLIENT`, `SERVER`, or `STARTUP`. |
| `screenStyle()` | `ConfigScreenStyle` | `ConfigScreenStyle.DEFAULT` | Client config screen style: `DEFAULT` uses NeoForge's native `ConfigurationSectionScreen`; `SIDEBAR` uses AnvilLib's translucent `SidebarConfigScreen`. |

### 2. `ConfigScreenStyle` (Config Screen Style Enum)

Located in `dev.anvilcraft.lib.v2.config.ConfigScreenStyle` with no client dependencies, safe to load on dedicated servers:

| Enum Constant | Description |
| :--- | :--- |
| `DEFAULT` | Uses NeoForge's native centered list-style config editor (`ConfigurationScreen.ConfigurationSectionScreen`). |
| `SIDEBAR` | Uses AnvilLib's `SidebarConfigScreen`: left-side top-level category tabs, top-bar multi-file switcher dropdown, live slider preview, modal dialogs for nested subsections, and translucent in-game background. |

### 3. `@Comment` (Field Comment Annotation)

Placed on config fields (`ElementType.FIELD`) to add comments to the generated TOML entry and automatically generate `.tooltip` translation entries in `ConfigData.readConfigClass`.

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `value()` | `String` | `""` | Comment text written to TOML, also used as the default English tooltip text during DataGen. |

### 4. `@BoundedDiscrete` (Numeric Range Constraint Annotation)

Placed on numeric fields (`byte`, `short`, `int`, `long`, `float`, `double`, and their boxed counterparts) to constrain the min and max values of `ModConfigSpec.Builder#defineInRange`.

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `min()` | `double` | `Double.NEGATIVE_INFINITY` | Minimum allowed value. When unspecified, falls back to the corresponding type's `MIN_VALUE` (e.g., `Integer.MIN_VALUE`, `-Infinity`). |
| `max()` | `double` | `Double.POSITIVE_INFINITY` | Maximum allowed value. When unspecified, falls back to the corresponding type's `MAX_VALUE` (e.g., `Integer.MAX_VALUE`, `+Infinity`). |

> **Internal Utility `BoundedDiscrete.Util` (`@ApiStatus.Internal`)**:
> Provides static methods `minInt` / `maxInt`, `minLong` / `maxLong`, `minFloat` / `maxFloat`, `minDouble` / `maxDouble`, `minShort` / `maxShort`, and `minByte` / `maxByte`, applying `Math.floor` + `Math.clamp` for `min()` and `Math.ceil` + `Math.clamp` for `max()`.
> **Note**: Since TOML does not distinguish `Byte`, `Short`, or `Float`, `ConfigManager.defineInRange` normalizes `Byte` / `Short` into `int` range `ConfigValue`s and `Float` into `double` range `ConfigValue`s (via `Double.parseDouble(value.toString())` to avoid binary `float -> double` mantissa artifacts), and `ConfigField` safely narrows back to the original Java field type on load.

### 5. `@Slider` (Step Slider Annotation)

Placed on `float` / `Float` or `double` / `Double` fields (`ElementType.FIELD`) to render the entry as a discrete fixed-step slider instead of a text box in `ConfigScreenStyle.SIDEBAR`.

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `step()` | `double` | **Required** | Step increment per slider tick (e.g., `0.05`, `0.1`); must be a finite positive number (`step > 0`). |

**Preconditions & Boundary Conditions (Critical)**:
1. **Must be paired with a finite `@BoundedDiscrete`**: `@Slider` can only be used on `float`/`double` (or boxed) fields and requires a finite `@BoundedDiscrete(min = ..., max = ...)` (`Double.isFinite(min) && Double.isFinite(max) && min < max`). Otherwise `ConfigManager.define` throws `IllegalArgumentException("@Slider requires a float/double field with @BoundedDiscrete: ...")` at registration.
2. **Maximum step count validation**: The internal record `Slider.Range(double min, double max, double step)` computes total steps `ceil((max - min) / step)` accurately using `BigDecimal`, throwing `IllegalArgumentException("Slider has too many steps")` if steps exceed `Integer.MAX_VALUE - 1`.
3. **Protection for unaligned manual values**: If a player manually writes a value between two steps in the TOML file (e.g., `0.15` when `step = 0.1`), `SidebarConfigScreen` displays `"0.15"` as-is, and as long as the player does not drag that slider, `PanelOptionsList` will not forcibly round and overwrite it on save.

### 6. `@CollapsibleObject` (Nested Config Group Annotation)

Placed on custom object fields (`ElementType.FIELD`) to expand that inner class as a TOML subtable (`builder.push(fieldName)` ... `builder.pop()`).

- **Behavior in `ConfigScreenStyle.SIDEBAR`**:
  - **Top-level `@CollapsibleObject` fields**: Automatically extracted as dedicated tabs in the left navigation bar; regular ungrouped fields are placed in the first "General" tab.
  - **Level-2 and deeper `@CollapsibleObject` fields**: Rendered as rows with an "Edit ›" button that opens a centered modal dialog (supporting multi-level `modalPath` stack navigation).

---

## 4. `ConfigManager` & Internal Runtime Classes

### 1. `ConfigManager` Public & Internal API

| Method Signature | Visibility & Status | Timing & Behavior |
| :--- | :--- | :--- |
| `public static <T> T register(String modId, Supplier<T> configFactory)` | **Public API** | **Primary registration entry point**. Must be called before `FMLConstructModEvent` fires (e.g., in `@Mod` constructor or static field initialization).<br>1. Looks up the container via `ModList.get().getModContainerById(modId)` (logs a warning and returns `configFactory.get()` directly if not found).<br>2. Creates or reuses the `ConfigManager` singleton for `modId` and registers it to the mod event bus (`container.getEventBus()`).<br>3. Parses `@Config` and all declared fields on `configFactory.get()` to build `ModConfigSpec`.<br>4. On the physical client (`FMLLoader.getCurrent().getDist().isClient()`), automatically calls `registerScreen(container)` to register the config screen factory. |
| `public <T> T register(T configObj)` | `@ApiStatus.Internal` | Parses the given config instance and builds a `ConfigRecord` stored in `configSpecMap`. |
| `public void register(IEventBus bus)` | `@ApiStatus.Internal` | Registers this `ConfigManager` to the mod event bus. |
| `public void onModConstruct(FMLConstructModEvent event)` | `@ApiStatus.Internal` | Listens for mod construction and calls `container.registerConfig(value.type(), value.spec(), value.getFileName())` to register NeoForge config files (idempotent via `AtomicBoolean registered`). |
| `public void loading(ModConfigEvent event)` | `@ApiStatus.Internal` | Listens for `ModConfigEvent.Loading` and `ModConfigEvent.Reloading`, reflectively writing loaded `ModConfigSpec` values back to config object fields. |
| `public void registerScreen(ModContainer container)` | `@ApiStatus.Internal` | Registers `IConfigScreenFactory` on `ModContainer`, dispatching screen styles per `@Config(screenStyle = ...)`. |
| `public static void previewClientValue(ModConfigSpec spec, List<String> path)` | `@ApiStatus.Internal` | **Client live preview**: When the user modifies a `ModConfig.Type.CLIENT` entry in `SidebarConfigScreen` (e.g., dragging a slider), immediately writes the new value to the Java field without waiting for screen close/TOML save. |
| `public static @Nullable Slider.Range slider(ModConfigSpec.ConfigValue<?> value)` | `@ApiStatus.Internal` | Queries the `@Slider` step-range metadata bound to a `ConfigValue`. |

### 2. `ConfigField` & `ConfigRecord` (`@ApiStatus.Internal`)

| Class | Signature | Description |
| :--- | :--- | :--- |
| `ConfigField` | `public record ConfigField(Object object, Field field, ModConfigSpec.ConfigValue<?> value)` | Maintains the binding between a single config field and `ModConfigSpec.ConfigValue`. `load()` skips `final` fields, supports instance, `static`, and non-`public` fields, and safely writes TOML `Number`s back to `byte`, `short`, `int`, `long`, `float`, `double`, `boolean`, `char`, `String`, or enum fields via `castToLong` / `castToDouble`. |
| `ConfigRecord` | `public record ConfigRecord(String group, String modId, ModConfig.Type type, ModConfigSpec spec, Object object, List<ConfigField> values, AtomicBoolean registered)` | Holds the full registration record for a `@Config` object. `getFileName()` generates relative paths like `<group>/<modId>-<type>.toml` or `<modId>-<type>.toml`; `load()` iterates all `ConfigField`s to write back values when `spec.isLoaded()` is true. |

---

## 5. Common Pitfalls & Notes

1. **Never declare config fields as `final`**: `ConfigField.load()` returns immediately when `AccessFlag.FINAL` is present. Also, `@CollapsibleObject` fields must be initialized to a non-null instance at declaration (e.g., `public LaserSection laser = new LaserSection();`), otherwise reading default values reflectively encounters `null` and throws `NullPointerException`.
2. **Registering multiple config files for one mod**: A single `modId` can call `ConfigManager.register(MOD_ID, ...)` multiple times with different `type`s (e.g., one `COMMON`, one `CLIENT`) or `name`s. When multiple config files exist with `ConfigScreenStyle.SIDEBAR`, a file switcher dropdown appears in the top-right corner.
3. **Custom translated display names**: If you want a field or enum constant's default English display name to differ from the split field name, annotate it with Gson's `@SerializedName("Custom Display Name")`; `ConfigData` prefers `@SerializedName` when generating language files.
