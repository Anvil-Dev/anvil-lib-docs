# 语言生成与格式化工具 (`data` / `util`)

<BranchContextCard branch="1.21.1" />

在 NeoForge 的配置界面中，每个配置项的显示名称和悬停提示分别对应 `<modid>.configuration.<path>` 和 `<modid>.configuration.<path>.tooltip` 两个语言键。如果手动在 `en_us.json` 中维护几十个配置项的翻译键非常繁琐。

`module.config` 提供了 **`ConfigData`** 静态工具类，可以在 DataGen（数据生成）阶段直接扫描你的 `@Config` 类，将字段名自动美化为英文标题（如 `maxTransmissionRadius` → `"Max Transmission Radius"`），并将 `@Comment` 注解的内容自动合并生成 `.tooltip` 翻译条目！

---

## 一、 完整代码示例：在 DataGen 中自动生成配置语言文件

在 `1.21.1` 中，你可以在自己的 `LanguageProvider`（或者 `Registrum` 的 `addDataGenerator(ProviderType.LANG, ...)`）中调用 **`ConfigData.readConfigClass`** 自动生成所有配置项的英文默认翻译：

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
        // 在 1.21.1 中使用 event.getGenerator().addProvider(event.includeClient(), ...)
        event.getGenerator().addProvider(
            event.includeClient(),
            new ModLangGenerator(event.getGenerator().getPackOutput())
        );
    }

    @Override
    protected void addTranslations() {
        // 自动扫描 MyModConfig 及其所有 @CollapsibleObject 子配置类，
        // 生成 <name>.configuration.<path> 与 <name>.configuration.<path>.tooltip 翻译
        ConfigData.readConfigClass(this, MyModConfig.class);
    }
}
```

> **提示**：如果你使用 `Registrum` 模块管理注册与数据生成，也可以在初始化时直接调用：
> ```java
> REGISTRUM.addDataGenerator(ProviderType.LANG, provider -> ConfigData.readConfigClass(provider, MyModConfig.class));
> ```

---

## 二、 公开类与接口 API 详解

### 1. `ConfigData`（`dev.anvilcraft.lib.v2.config.ConfigData`）

| 常量 / 方法签名 | 参数与返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final String OPTION_STRING = "%s.configuration.%s"` | `String` | 配置项名称翻译键模板（第 1 个 `%s` 为 `@Config(name)`，第 2 个 `%s` 为点号分隔的下划线字段路径）。 |
| `public static final String OPTION_TOOLTIP_STRING = "%s.configuration.%s.tooltip"` | `String` | 配置项悬停提示（Tooltip）翻译键模板。 |
| `public static void readConfigClass(BiConsumer<String, String> consumer, Class<?> configClass)` | • `consumer`：接收 `(translationKey, englishValue)` 的回调<br>• `configClass`：标注了 `@Config` 的配置类 | 反射实例化 `configClass`（若无参构造失败则仅扫描顶层字段，不递归 `@CollapsibleObject`），为所有字段生成英文标题翻译，并将标注了 `@Comment` 的字段注释按 `\n` 拼接生成 `.tooltip` 翻译。 |
| `public static void readConfigClass(LanguageProvider provider, Class<?> configClass)` | • `provider`：NeoForge `LanguageProvider` 实例<br>• `configClass`：配置类 | `readConfigClass(provider::add, configClass)` 的便捷重载。 |

### 2. `TranslatableEnum`（`dev.anvilcraft.lib.v2.config.util.TranslatableEnum`）

```java
public interface TranslatableEnum extends net.neoforged.neoforge.common.TranslatableEnum
```

继承自 NeoForge 的 `TranslatableEnum` 接口（需实现 `Component getTranslatedName()`）。当配置类中的枚举字段实现了此接口时，无论是 NeoForge 默认配置界面还是 `SidebarConfigScreen` 的下拉菜单，都会调用 `getTranslatedName()` 显示本地化名称。

### 3. `FormattingUtil`（`dev.anvilcraft.lib.v2.config.util.FormattingUtil`）

提供命名风格转换工具方法：

| 方法签名 | 输入示例 | 输出示例 | 说明 |
| :--- | :--- | :--- | :--- |
| `public static String toEnglishName(String internalName)` | `"max_transmission_radius"` | `"Max Transmission Radius"` | 将下划线分隔的小写全称转换为首字母大写的英文词组（跳过 `"_" ` 空段）。 |
| `public static String toLowerCaseUnder(String string)` | `"maxTransmissionRadius"` | `"max_transmission_radius"` | 使用 Guava `CaseFormat.LOWER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, string)` 将小驼峰命名转为小写下划线命名。 |

### 4. `ConfigLanguageProvider`（`dev.anvilcraft.lib.v2.config.data.ConfigLanguageProvider`）

`module.config` 自身的内置语言生成器（为 `anvillib_config` 命名空间生成 `anvillib_config.ui.general`、`anvillib_config.ui.open`、`anvillib_config.ui.back`、`anvillib_config.ui.empty` 的中英文翻译），下游模组无需重复生成这 4 个内置 UI 键。
