# 语言文件生成与枚举本地化 (`ConfigData` / `TranslatableEnum`)

<BranchContextCard branch="26.1" />

在配置界面中，每个配置项的标题、鼠标悬停提示（Tooltip）、折叠子节按钮以及枚举下拉选项都需要对应的语言文件翻译键。`module.config` 提供了 `ConfigData`、`TranslatableEnum`、`FormattingUtil` 与内置的 `ConfigLanguageProvider`，用于在 NeoForge DataGen（数据生成）阶段一键生成全部配置翻译条目。

---

## 一、 要解决什么问题 / 怎么用

手动维护 TOML 配置项在客户端界面中的 `en_us.json` 翻译键非常繁琐且容易漏写。通过 `ConfigData.readConfigClass(provider, MyModConfig.class)`：

1. 自动扫描 `@Config` 类及其所有递归 `@CollapsibleObject` 内部类的字段；
2. 将驼峰字段名（如 `maxParticleDistance`）转为 `max_particle_distance`，并自动拆词生成英文名 `"Max Particle Distance"`（或在标注了 `@SerializedName` 时使用指定名称）；
3. 将 `@Comment("...")` 的内容自动注册为 `<modid>.configuration.<path>.tooltip` 翻译键；
4. 若字段类型是实现了 `dev.anvilcraft.lib.v2.config.util.TranslatableEnum` 的枚举类，还会自动扫描所有枚举常量并注册 `anvillib.configuration.enum.<class_path>.<value_name>` 翻译键。

---

## 二、 完整代码示例

### 1. 定义实现 `TranslatableEnum` 的配置枚举

```java
package com.example.mymod.config;

import com.google.gson.annotations.SerializedName;
import dev.anvilcraft.lib.v2.config.util.TranslatableEnum;

public enum RenderMode implements TranslatableEnum {
    // 默认生成翻译值: "Fast"
    FAST,
    // 默认生成翻译值: "Balanced"
    BALANCED,
    // 使用 @SerializedName 覆盖英文翻译值: "Shader Fabulous"
    @SerializedName("Shader Fabulous")
    FABULOUS
}
```

### 2. 在模组的 `LanguageProvider` 中调用 `ConfigData.readConfigClass`

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
        // 自动扫描并生成两个配置类的全部英文标题、字段名、Tooltip 与 TranslatableEnum 翻译
        ConfigData.readConfigClass(this, MyModCommonConfig.class);
        ConfigData.readConfigClass(this, MyModClientConfig.class);
    }
}
```

---

## 三、 翻译键命名规则（中文语言包对照表）

`ConfigData.readConfigClass` 主要用于自动生成英文（`en_us`）语言文件。在编写中文（`zh_cn.json`）或其他语种语言文件时，可参照 `ConfigData` 中定义的格式常量编写对应的键名：

| 常量名 | 键格式模板 | 示例（假设 `@Config(name = "my_mod", type = CLIENT)`） |
| :--- | :--- | :--- |
| `ConfigData.TITLE_STRING` | `%s.configuration.title` | `"my_mod.configuration.title": "我的模组配置"` |
| `ConfigData.TOML_STRING` | `%s.configuration.section.%s.%s.toml` | `"my_mod.configuration.section.my.mod.client.toml": "客户端配置"` |
| `ConfigData.TOML_TITLE_STRING` | `%s.configuration.section.%s.%s.toml.title` | `"my_mod.configuration.section.my.mod.client.toml.title": "客户端配置"` |
| `ConfigData.OPTION_STRING` | `%s.configuration.%s` | `"my_mod.configuration.enable_particles": "启用粒子效果"`<br>嵌套字段示例：`"my_mod.configuration.laser.beam_opacity": "激光束透明度"` |
| `ConfigData.TOOLTIP_STRING` | `%s.configuration.%s.tooltip` | `"my_mod.configuration.enable_particles.tooltip": "是否启用机器工作粒子效果"` |
| `ConfigData.COLLAPSIBLE_OBJECT_BUTTON_STRING` | `%s.configuration.%s.button` | `"my_mod.configuration.laser.button": "激光设置"` |
| `ConfigData.COLLAPSIBLE_OBJECT_TOOLTIP_STRING` | `%s.configuration.%s.tooltip` | `"my_mod.configuration.laser.tooltip": "高级激光渲染参数分组"` |
| `ConfigData.ENUM_STRING` | `anvillib.configuration.enum.%s.%s` | `"anvillib.configuration.enum.com.example.mymod.config.render_mode.fast": "流畅"` |

---

## 四、 公开类与接口 API 详解

### 1. `ConfigData`（`dev.anvilcraft.lib.v2.config.ConfigData`）

| 字段 / 方法签名 | 说明 |
| :--- | :--- |
| `public static final Set<String> ADDED` | 记录当前进程已向 `LanguageProvider` 注册过的翻译键集合，防止多个配置类共享同一个 `TranslatableEnum` 或同名配置键时触发 `LanguageProvider` 的重复键异常（`Duplicate translation key`）。 |
| `public static void readConfigClass(LanguageProvider provider, Class<?> configClass)` | 扫描带有 `@Config` 注解的 `configClass`，向 `provider` 写入配置标题、TOML 分节标题、所有字段名称、Tooltip、折叠对象按钮以及实现了 `TranslatableEnum` 的枚举项翻译。若传入的类未标注 `@Config` 则直接返回。 |

### 2. `TranslatableEnum`（`dev.anvilcraft.lib.v2.config.util.TranslatableEnum`）

继承自 `net.neoforged.neoforge.common.TranslatableEnum`，为配置枚举提供统一的翻译键生成逻辑。

| 方法签名 | 默认实现与说明 |
| :--- | :--- |
| `default Component getTranslatedName()` | 返回 `Component.translatableWithFallback(this.getTranslationKey(), ((Enum<?>) this).name())`。当语言文件中未提供翻译时，安全回退显示枚举常量的原始名称。 |
| `default String getTranslationKey()` | 将枚举类的规范全限定名（`getCanonicalName()`）按 `.` 和 `$` 拆分，逐段调用 `FormattingUtil.toLowerCaseUnder` 后以 `.` 拼接为 `<className>`，再将枚举常量名转为小写下划线 `<valueName>`，最终返回 `"anvillib.configuration.enum.%s.%s".formatted(className, valueName)`。 |

### 3. `FormattingUtil`（`dev.anvilcraft.lib.v2.config.util.FormattingUtil`）

提供字段名与标识符的字符串命名转换工具：

| 方法签名 | 输入输出示例与说明 |
| :--- | :--- |
| `public static String toLowerCaseUnder(String string)` | 将驼峰字符串转换为 `lower_underscore` 下划线命名（内部调用 Guava `CaseFormat.UPPER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, string)`）。例如：`"maxParticleDistance"` → `"max_particle_distance"`。 |
| `public static String toEnglishName(Object internalName)` | 将下划线分隔的内部名称转换为首字母大写的空格分隔英文短语。例如：`"max_particle_distance"` → `"Max Particle Distance"`。 |
| `public static String toPointSplitName(String name)` | 按所有非字母数字字符（`[^A-Za-z0-9]`）切分字符串并过滤空段，再以 `.` 拼接。例如：`"my_mod"` → `"my.mod"`（用于生成 NeoForge 规范的 `.section.my.mod.client.toml` 翻译键）。 |

### 4. `ConfigLanguageProvider`（`dev.anvilcraft.lib.v2.config.data.ConfigLanguageProvider`）

| 类 / 方法签名 | 说明 |
| :--- | :--- |
| `public final class ConfigLanguageProvider extends LanguageProvider` | `anvillib_config` 模组自身的界面固定文本语言生成器（生成 `anvillib_config.ui.general`、`anvillib_config.ui.open`、`anvillib_config.ui.back`、`anvillib_config.ui.empty` 的中英文翻译）。该类仅绑定在 `modid = "anvillib_config"` 的 `GatherDataEvent.Client` 上，下游模组无需重复注册。 |
