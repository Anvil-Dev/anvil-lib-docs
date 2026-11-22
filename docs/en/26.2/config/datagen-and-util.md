# Language File Generation & Enum Localization (`ConfigData` / `TranslatableEnum`)

<BranchContextCard branch="26.2" />

In config screens, every entry title, tooltip, collapsible section button, and enum dropdown option requires a language file translation key. `module.config` provides `ConfigData`, `TranslatableEnum`, `FormattingUtil`, and the built-in `ConfigLanguageProvider` to generate all config translation entries in one step during NeoForge DataGen.

---

## 1. Problem & Usage

Manually maintaining `en_us.json` translation keys for TOML config entries is tedious and error-prone. With `ConfigData.readConfigClass(provider, MyModConfig.class)`:

1. Automatically scans fields of the `@Config` class and all recursive `@CollapsibleObject` inner classes;
2. Converts camelCase field names (e.g., `maxParticleDistance`) to `max_particle_distance` and auto-splits words into English names `"Max Particle Distance"` (or uses `@SerializedName` if annotated);
3. Automatically registers `@Comment("...")` contents as `<modid>.configuration.<path>.tooltip` translation keys;
4. If a field's type is an enum implementing `dev.anvilcraft.lib.v2.config.util.TranslatableEnum`, automatically scans all enum constants and registers `anvillib.configuration.enum.<class_path>.<value_name>` translation keys.

---

## 2. Full Code Examples

### 1. Defining a Config Enum Implementing `TranslatableEnum`

```java
package com.example.mymod.config;

import com.google.gson.annotations.SerializedName;
import dev.anvilcraft.lib.v2.config.util.TranslatableEnum;

public enum RenderMode implements TranslatableEnum {
    // Default generated translation: "Fast"
    FAST,
    // Default generated translation: "Balanced"
    BALANCED,
    // Override English translation via @SerializedName: "Shader Fabulous"
    @SerializedName("Shader Fabulous")
    FABULOUS
}
```

### 2. Calling `ConfigData.readConfigClass` in Your Mod's `LanguageProvider`

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.config.MyModClientConfig;
import com.example.mymod.config.MyModCommonConfig;
import dev.anvilcraft.lib.v2.config.ConfigData;
import net.minecraft.data.PackOutput;
import net.neoforged.neoforge.common.data.LanguageProvider;

public class ModEnglishLangProvider extends LanguageProvider {
    public ModEnglishLangProvider(PackOutput output) {
        super(output, MyMod.MOD_ID, "en_us");
    }

    @Override
    protected void addTranslations() {
        // Automatically scan and generate all English titles, field names, tooltips, and TranslatableEnum entries for both config classes
        ConfigData.readConfigClass(this, MyModCommonConfig.class);
        ConfigData.readConfigClass(this, MyModClientConfig.class);
    }
}
```

---

## 3. Translation Key Naming Rules (Reference Table for Other Locales)

`ConfigData.readConfigClass` is primarily used to generate the English (`en_us`) language file. When writing Chinese (`zh_cn.json`) or other locale files, follow the format constants defined in `ConfigData`:

| Constant | Key Format Template | Example (assuming `@Config(name = "my_mod", type = CLIENT)`) |
| :--- | :--- | :--- |
| `ConfigData.TITLE_STRING` | `%s.configuration.title` | `"my_mod.configuration.title": "My Mod Config"` |
| `ConfigData.TOML_STRING` | `%s.configuration.section.%s.%s.toml` | `"my_mod.configuration.section.my.mod.client.toml": "Client Config"` |
| `ConfigData.TOML_TITLE_STRING` | `%s.configuration.section.%s.%s.toml.title` | `"my_mod.configuration.section.my.mod.client.toml.title": "Client Config"` |
| `ConfigData.OPTION_STRING` | `%s.configuration.%s` | `"my_mod.configuration.enable_particles": "Enable Particles"`<br>Nested field example: `"my_mod.configuration.laser.beam_opacity": "Beam Opacity"` |
| `ConfigData.TOOLTIP_STRING` | `%s.configuration.%s.tooltip` | `"my_mod.configuration.enable_particles.tooltip": "Whether to enable machine working particles"` |
| `ConfigData.COLLAPSIBLE_OBJECT_BUTTON_STRING` | `%s.configuration.%s.button` | `"my_mod.configuration.laser.button": "Laser Settings"` |
| `ConfigData.COLLAPSIBLE_OBJECT_TOOLTIP_STRING` | `%s.configuration.%s.tooltip` | `"my_mod.configuration.laser.tooltip": "Advanced laser rendering parameters"` |
| `ConfigData.ENUM_STRING` | `anvillib.configuration.enum.%s.%s` | `"anvillib.configuration.enum.com.example.mymod.config.render_mode.fast": "Fast"` |

---

## 4. Public Classes & Interfaces API Reference

### 1. `ConfigData` (`dev.anvilcraft.lib.v2.config.ConfigData`)

| Field / Method Signature | Description |
| :--- | :--- |
| `public static final Set<String> ADDED` | Tracks translation keys already registered to `LanguageProvider` in the current process, preventing `Duplicate translation key` exceptions when multiple config classes share the same `TranslatableEnum` or key name. |
| `public static void readConfigClass(LanguageProvider provider, Class<?> configClass)` | Scans a `@Config`-annotated `configClass` and writes the config title, TOML section title, all field names, tooltips, collapsible object buttons, and `TranslatableEnum` constant translations to `provider`. Returns immediately if `@Config` is absent. |

### 2. `TranslatableEnum` (`dev.anvilcraft.lib.v2.config.util.TranslatableEnum`)

Extends `net.neoforged.neoforge.common.TranslatableEnum` to provide unified translation key generation for config enums.

| Method Signature | Default Implementation & Description |
| :--- | :--- |
| `default Component getTranslatedName()` | Returns `Component.translatableWithFallback(this.getTranslationKey(), ((Enum<?>) this).name())`. Safely falls back to the raw enum constant name when no translation is provided. |
| `default String getTranslationKey()` | Splits the enum class's canonical name (`getCanonicalName()`) by `.` and `$`, applies `FormattingUtil.toLowerCaseUnder` to each segment and joins with `.` as `<className>`, converts the enum constant name to lower_underscore `<valueName>`, and returns `"anvillib.configuration.enum.%s.%s".formatted(className, valueName)`. |

### 3. `FormattingUtil` (`dev.anvilcraft.lib.v2.config.util.FormattingUtil`)

Provides string case-conversion utilities for field names and identifiers:

| Method Signature | Input/Output Examples & Description |
| :--- | :--- |
| `public static String toLowerCaseUnder(String string)` | Converts camelCase to `lower_underscore` (internally calls Guava `CaseFormat.UPPER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, string)`). Example: `"maxParticleDistance"` → `"max_particle_distance"`. |
| `public static String toEnglishName(Object internalName)` | Converts an underscore-separated internal name to a Title Cased space-separated English phrase. Example: `"max_particle_distance"` → `"Max Particle Distance"`. |
| `public static String toPointSplitName(String name)` | Splits on all non-alphanumeric characters (`[^A-Za-z0-9]`), filters empty segments, and joins with `.`. Example: `"my_mod"` → `"my.mod"` (used for NeoForge `.section.my.mod.client.toml` keys). |

### 4. `ConfigLanguageProvider` (`dev.anvilcraft.lib.v2.config.data.ConfigLanguageProvider`)

| Class / Method Signature | Description |
| :--- | :--- |
| `public final class ConfigLanguageProvider extends LanguageProvider` | Fixed UI text language generator for `anvillib_config` itself (generating English and Chinese translations for `anvillib_config.ui.general`, `anvillib_config.ui.open`, `anvillib_config.ui.back`, and `anvillib_config.ui.empty`). Bound only to `GatherDataEvent.Client` for `modid = "anvillib_config"`; downstream mods do not need to register it. |
