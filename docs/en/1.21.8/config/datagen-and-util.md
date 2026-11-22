# Language Generation & Formatting Utilities (`data` / `util`)

<BranchContextCard branch="1.21.8" />

In NeoForge config screens, each entry's display name and tooltip map to `<name>.configuration.<path>` and `<name>.configuration.<path>.tooltip` language keys, while section pages also use title, TOML section, and enum keys.

`module.config` provides the **`ConfigData`** static utility to scan `@Config` classes during DataGen, supporting Gson `@SerializedName` custom display names or `FormattingUtil` auto-prettified field names, and extracting `@Comment` into `.tooltip` entries.

---

## 1. Full Code Example: Generating Config Language Files in 1.21.8 DataGen

In Minecraft `1.21.8`, the client DataGen event is **`GatherDataEvent.Client`**; register a language provider via `event.addProvider(...)` and call **`ConfigData.readConfigClass`**:

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.config.MyModConfig;
import dev.anvilcraft.lib.v2.config.ConfigData;
import net.minecraft.data.PackOutput;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.common.data.LanguageProvider;
import net.neoforged.neoforge.data.event.GatherDataEvent;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public class ModLangGenerator extends LanguageProvider {
    public ModLangGenerator(PackOutput output) {
        super(output, MyMod.MOD_ID, "en_us");
    }

    @SubscribeEvent
    public static void onGatherData(GatherDataEvent.Client event) {
        event.addProvider(new ModLangGenerator(event.getGenerator().getPackOutput()));
    }

    @Override
    protected void addTranslations() {
        // Automatically scans MyModConfig and all @CollapsibleObject subconfigs and TranslatableEnum constants
        ConfigData.readConfigClass(this, MyModConfig.class);
    }
}
```

> **Tip**: If using `Registrum` for DataGen, you can call during initialization:
> ```java
> REGISTRUM.addDataGenerator(ProviderType.LANG, provider -> ConfigData.readConfigClass(provider, MyModConfig.class));
> ```

---

## 2. Public Classes & Interfaces API Reference

### 1. `ConfigData` (`dev.anvilcraft.lib.v2.config.ConfigData`)

| Constant / Method Signature | Parameters & Return Value | Description |
| :--- | :--- | :--- |
| `public static final String TITLE_STRING = "%s.configuration.title"` | `String` | Config screen main title translation key template |
| `public static final String ENUM_STRING = "anvillib.configuration.enum.%s.%s"` | `String` | Default key template for translatable enum entries |
| `public static final String TOML_STRING = "%s.configuration.section.%s.%s.toml"` | `String` | NeoForge TOML config file entry translation key template |
| `public static final String TOML_TITLE_STRING = "%s.configuration.section.%s.%s.toml.title"` | `String` | TOML file subpage title translation key template |
| `public static final String OPTION_STRING = "%s.configuration.%s"` | `String` | Config entry name key template (1st `%s` is `@Config(name)`, 2nd `%s` is dot-separated lower_underscore path) |
| `public static final String TOOLTIP_STRING = OPTION_STRING + ".tooltip"` | `String` | Config entry tooltip translation key template |
| `public static final String COLLAPSIBLE_OBJECT_BUTTON_STRING = "%s.configuration.%s.button"` | `String` | `@CollapsibleObject` group button translation key template |
| `public static final String COLLAPSIBLE_OBJECT_TOOLTIP_STRING = "%s.configuration.%s.tooltip"` | `String` | `@CollapsibleObject` group tooltip translation key template |
| `public static final Set<String> ADDED` | `Set<String>` | Global deduplication set of emitted keys (checked internally by `ProviderProxy` to avoid `IllegalStateException` on duplicate keys) |
| `public static void readConfigClass(LanguageProvider provider, Class<?> configClass)` | `void` | Verifies `@Config` on the class, writes `title` and `toml` section titles, and recursively walks declared fields (supporting `@SerializedName` overrides, `@CollapsibleObject` nested classes, and `TranslatableEnum` constants) and `@Comment` tooltips |

### 2. `TranslatableEnum` (`dev.anvilcraft.lib.v2.config.util.TranslatableEnum`)

```java
public interface TranslatableEnum extends net.neoforged.neoforge.common.TranslatableEnum
```

Extends NeoForge's `TranslatableEnum` interface for localized display of config enums and automatic key extraction in `ConfigData` (supports `@SerializedName` on fields for custom default English names).

### 3. `FormattingUtil` (`dev.anvilcraft.lib.v2.config.util.FormattingUtil`)

| Method Signature | Example | Description |
| :--- | :--- | :--- |
| `public static String toLowerCaseUnder(String string)` | `"maragingSteel300"` -> `"maraging_steel_300"` | Converts to lower_underscore using `CaseFormat.UPPER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, string)` |
| `public static String toEnglishName(Object internalName)` | `"max_radius"` -> `"Max Radius"` | Splits the object's string on `_`, lowercases, and Title Cases each word |
| `public static String toPointSplitName(String name)` | `"anvillib_explosion"` -> `"anvillib.explosion"` | Splits on non-alphanumeric chars, drops empty segments, and joins with `.` |

### 4. `ConfigLanguageProvider` (`dev.anvilcraft.lib.v2.config.data.ConfigLanguageProvider`)

| Member Signature | Description |
| :--- | :--- |
| `public ConfigLanguageProvider(PackOutput output, String locale)` | Generates `anvillib_config`'s built-in UI keys (supports `"en_us"` and `"zh_cn"`) |
| `public static void gatherData(GatherDataEvent.Client event)` | Automatically attached via `@SubscribeEvent` during client DataGen |
