---
title: Config 辅助工具
prev: false
next: false
---

# 辅助工具

## ConfigData

用于自动生成配置翻译键。通过 `readConfigClass` 遍历配置类及其注解，自动向语言生成器添加翻译键。

```java
ConfigData.readConfigClass(languageProvider, ExampleConfig.class);
```

### 生成的翻译键类型

| 用途      | 翻译键格式                                                                |
|---------|----------------------------------------------------------------------|
| 配置标题    | `<modid>.configuration.title`                                        |
| TOML 标题 | `<modid>.configuration.section.<modid>.<type>.toml`                  |
| 选项名称    | `<modid>.configuration.<fieldpath>`                                  |
| 选项工具提示  | `<modid>.configuration.<fieldpath>.tooltip`（有 `@Comment` 时）          |
| 折叠按钮文本  | `<modid>.configuration.<fieldpath>.button`（有 `@CollapsibleObject` 时） |

所有键的值由 `FormattingUtil` 生成人类可读名称。

### 翻译示例

```java
// 在数据生成中
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

字符串格式化工具，用于将 Java 命名转换为人类可读格式。

### 方法

| 方法                      | 输入                     | 输出                       | 说明       |
|-------------------------|------------------------|--------------------------|----------|
| `toLowerCaseUnder(str)` | `"maragingSteel300"`   | `"maraging_steel_300"`   | 驼峰转小写下划线 |
| `toEnglishName(str)`    | `"apple_orange.juice"` | `"Apple Orange (Juice)"` | 下划线转英文名  |

### 使用示例

```java
// 驼峰 → 下划线
String key = FormattingUtil.toLowerCaseUnder("maxSpeed");
// → "max_speed"

// 下划线 → 英文显示名
String name = FormattingUtil.toEnglishName("max_speed");
// → "Max Speed"
```

`ConfigData` 内部使用这些方法将字段名自动转换为可读的翻译值。
