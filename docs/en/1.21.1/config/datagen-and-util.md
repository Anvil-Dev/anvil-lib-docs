# Language Generation & Formatting Utilities (`data` / `util`)

<BranchContextCard branch="1.21.1" />

In NeoForge config screens, each entry's display name and tooltip map to `<modid>.configuration.<path>` and `<modid>.configuration.<path>.tooltip`. Maintaining dozens of keys manually in `en_us.json` is tedious.

`module.config` provides the **`ConfigData`** static utility to scan your `@Config` class during DataGen, automatically prettifying field names into English titles (e.g., `maxTransmissionRadius` → `"Max Transmission Radius"`) and merging `@Comment` annotations into `.tooltip` translation entries!

---

## 1. Full Code Example: Generating Config Language Files in DataGen

In `1.21.1`, call **`ConfigData.readConfigClass`** in your `LanguageProvider` (or `Registrum`'s `addDataGenerator(ProviderType.LANG, ...)`) to automatically generate default English translations for all config entries:

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

@EventBusSubscriber(modid = MyMod.MOD_ID, bus = EventBusSubscriber.Bus.MOD)
public class ModLangGenerator extends LanguageProvider {
    public ModLangGenerator(PackOutput output) {
        super(output, MyMod.MOD_ID, "en_us");
    }

    @SubscribeEvent
    public static void onGatherData(GatherDataEvent event) {
        // In 1.21.1, use event.getGenerator().addProvider(event.includeClient(), ...)
        event.getGenerator().addProvider(
            event.includeClient(),
            new ModLangGenerator(event.getGenerator().getPackOutput())
        );
    }

    @Override
    protected void addTranslations() {
        // Automatically scans MyModConfig and all @CollapsibleObject subconfigs,
        // generating <name>.configuration.<path> and <name>.configuration.<path>.tooltip translations
        ConfigData.readConfigClass(this, MyModConfig.class);
    }
}
```

> **Tip**: If using `Registrum` for registration and DataGen, you can call directly during initialization:
> ```java
> REGISTRUM.addDataGenerator(ProviderType.LANG, provider -> ConfigData.readConfigClass(provider, MyModConfig.class));
> ```

---

## 2. Public Classes & Interfaces API Reference

### 1. `ConfigData` (`dev.anvilcraft.lib.v2.config.ConfigData`)

| Constant / Method Signature | Parameters & Return Value | Description |
| :--- | :--- | :--- |
| `public static final String OPTION_STRING = "%s.configuration.%s"` | `String` | Config entry name key template (1st `%s` is `@Config(name)`, 2nd `%s` is dot-separated snake_case field path). |
| `public static final String OPTION_TOOLTIP_STRING = "%s.configuration.%s.tooltip"` | `String` | Config entry tooltip translation key template. |
| `public static void readConfigClass(BiConsumer<String, String> consumer, Class<?> configClass)` | • `consumer`: callback receiving `(translationKey, englishValue)`<br>• `configClass`: `@Config`-annotated config class | Reflectively instantiates `configClass` (if no-arg construction fails, scans top-level fields only without recursing `@CollapsibleObject`), generates English title translations for all fields, and joins `@Comment` lines with `\n` for `.tooltip` translations. |
| `public static void readConfigClass(LanguageProvider provider, Class<?> configClass)` | • `provider`: NeoForge `LanguageProvider` instance<br>• `configClass`: config class | Convenience overload for `readConfigClass(provider::add, configClass)`. |

### 2. `TranslatableEnum` (`dev.anvilcraft.lib.v2.config.util.TranslatableEnum`)

```java
public interface TranslatableEnum extends net.neoforged.neoforge.common.TranslatableEnum
```

Extends NeoForge's `TranslatableEnum` interface (must implement `Component getTranslatedName()`). When a config enum implements this interface, both NeoForge's default config screen and `SidebarConfigScreen`'s dropdown call `getTranslatedName()` for localized display.

### 3. `FormattingUtil` (`dev.anvilcraft.lib.v2.config.util.FormattingUtil`)

Provides naming-convention conversion utilities:

| Method Signature | Input Example | Output Example | Description |
| :--- | :--- | :--- | :--- |
| `public static String toEnglishName(String internalName)` | `"max_transmission_radius"` | `"Max Transmission Radius"` | Converts underscore-separated lowercase names into Title Cased English phrases (skipping empty `"_"` segments). |
| `public static String toLowerCaseUnder(String string)` | `"maxTransmissionRadius"` | `"max_transmission_radius"` | Converts camelCase to lower_underscore using Guava `CaseFormat.LOWER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, string)`. |

### 4. `ConfigLanguageProvider` (`dev.anvilcraft.lib.v2.config.data.ConfigLanguageProvider`)

Built-in language generator for `module.config` itself (generating English and Chinese translations for `anvillib_config.ui.general`, `anvillib_config.ui.open`, `anvillib_config.ui.back`, and `anvillib_config.ui.empty` under `anvillib_config`); downstream mods do not need to regenerate these 4 built-in UI keys.
