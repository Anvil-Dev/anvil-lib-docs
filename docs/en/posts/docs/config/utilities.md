---
title: Config Utilities
prev: false
next: false
---

# Utilities

## ConfigData

Used for automatic generation of config translation keys. Traverses config classes and their annotations via
`readConfigClass`, automatically adding translation keys to the language provider.

```java
ConfigData.readConfigClass(languageProvider, ExampleConfig.class);
```

### Generated Translation Key Types

| Purpose              | Translation Key Format                                                            |
|----------------------|-----------------------------------------------------------------------------------|
| Config title         | `<modid>.configuration.title`                                                     |
| TOML title           | `<modid>.configuration.section.<modid>.<type>.toml`                               |
| Option name          | `<modid>.configuration.<fieldpath>`                                               |
| Option tooltip       | `<modid>.configuration.<fieldpath>.tooltip` (when `@Comment` is present)          |
| Collapse button text | `<modid>.configuration.<fieldpath>.button` (when `@CollapsibleObject` is present) |

All key values are generated as human-readable names by `FormattingUtil`.

### Translation Example

```java
// In data generation
@SubscribeEvent
public static void gatherData(GatherDataEvent.Client event) {
    event.getGenerator().addProvider(true, new LanguageProvider(
        event.getGenerator().getPackOutput(), "mymod", "en_us"
    ) {
        @Override
        protected void addTranslations() {
            ConfigData.readConfigClass(this, MyConfig.class);
        }
    });
}
```

## FormattingUtil

String formatting utility for converting Java naming conventions to human-readable formats.

### Methods

| Method                  | Input                  | Output                   | Description                       |
|-------------------------|------------------------|--------------------------|-----------------------------------|
| `toLowerCaseUnder(str)` | `"maragingSteel300"`   | `"maraging_steel_300"`   | camelCase to lowercase_underscore |
| `toEnglishName(str)`    | `"apple_orange.juice"` | `"Apple Orange (Juice)"` | Underscore/dot to English name    |

### Usage Examples

```java
// camelCase -> lowercase_underscore
String key = FormattingUtil.toLowerCaseUnder("maxSpeed");
// -> "max_speed"

// lowercase_underscore -> English display name
String name = FormattingUtil.toEnglishName("max_speed");
// -> "Max Speed"
```

`ConfigData` internally uses these methods to automatically convert field names into readable translation values.
