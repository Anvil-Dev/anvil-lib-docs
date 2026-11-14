# 语言生成与格式化工具 (`data` / `util`)

<BranchContextCard branch="1.21.4" />

在 NeoForge 的配置界面中，每个配置项的显示名称和悬停提示分别对应 `<name>.configuration.<path>` 和 `<name>.configuration.<path>.tooltip` 语言键，分节页面还涉及标题、TOML section 与枚举键。

`module.config` 提供了 **`ConfigData`** 静态工具类，可以在 DataGen（数据生成）阶段扫描 `@Config` 类，支持结合 Gson `@SerializedName` 自定义显示名称或由 `FormattingUtil` 自动美化字段名，并把 `@Comment` 提取为 `.tooltip` 翻译条目。

---

## 一、 完整代码示例：在 1.21.4 DataGen 中自动生成配置语言文件

在 `1.21.4` 中，DataGen 客户端事件拆分为 **`GatherDataEvent.Client`**，通过 `event.addProvider(...)` 注册语言生成器并调用 **`ConfigData.readConfigClass`**：

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
    public static void onGatherData(GatherDataEvent.Client event) {
        event.addProvider(new ModLangGenerator(event.getGenerator().getPackOutput()));
    }

    @Override
    protected void addTranslations() {
        // 自动扫描 MyModConfig 及其所有 @CollapsibleObject 子配置类与 TranslatableEnum 枚举项
        ConfigData.readConfigClass(this, MyModConfig.class);
    }
}
```

> **提示**：若使用 `Registrum` 模块管理数据生成，可在初始化时调用：
> ```java
> REGISTRUM.addDataGenerator(ProviderType.LANG, provider -> ConfigData.readConfigClass(provider, MyModConfig.class));
> ```

---

## 二、 公开类与接口 API 详解

### 1. `ConfigData`（`dev.anvilcraft.lib.v2.config.ConfigData`）

| 常量 / 方法签名 | 参数与返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final String TITLE_STRING = "%s.configuration.title"` | `String` | 配置界面总标题翻译键模板 |
| `public static final String ENUM_STRING = "anvillib.configuration.enum.%s.%s"` | `String` | 可翻译枚举条目默认键模板 |
| `public static final String TOML_STRING = "%s.configuration.section.%s.%s.toml"` | `String` | NeoForge TOML 配置文件入口翻译键模板 |
| `public static final String TOML_TITLE_STRING = "%s.configuration.section.%s.%s.toml.title"` | `String` | TOML 文件子页标题翻译键模板 |
| `public static final String OPTION_STRING = "%s.configuration.%s"` | `String` | 配置项名称翻译键模板（第 1 个 `%s` 为 `@Config(name)`，第 2 个 `%s` 为点号分隔的小写下划线路径） |
| `public static final String TOOLTIP_STRING = OPTION_STRING + ".tooltip"` | `String` | 配置项悬停提示（Tooltip）翻译键模板 |
| `public static final String COLLAPSIBLE_OBJECT_BUTTON_STRING = "%s.configuration.%s.button"` | `String` | `@CollapsibleObject` 折叠分组入口按钮翻译键模板 |
| `public static final String COLLAPSIBLE_OBJECT_TOOLTIP_STRING = "%s.configuration.%s.tooltip"` | `String` | `@CollapsibleObject` 分组悬停提示翻译键模板 |
| `public static final Set<String> ADDED` | `Set<String>` | 全局已写入翻译键去重集合（内部由 `ProviderProxy` 检查，避免重复添加相同翻译键触发 `IllegalStateException`） |
| `public static void readConfigClass(LanguageProvider provider, Class<?> configClass)` | `void` | 校验类上是否存在 `@Config`，依次写入 `title`、`toml` 节标题，并递归遍历声明字段（支持 `@SerializedName` 覆盖默认英文名称、`@CollapsibleObject` 嵌套类与 `TranslatableEnum` 枚举常量）与 `@Comment` 提示 |

### 2. `TranslatableEnum`（`dev.anvilcraft.lib.v2.config.util.TranslatableEnum`）

```java
public interface TranslatableEnum extends net.neoforged.neoforge.common.TranslatableEnum
```

继承自 NeoForge 的 `TranslatableEnum` 接口，用于配置枚举项的本地化显示及 `ConfigData` 自动提取所有枚举值语言键（支持字段上标注 `@SerializedName` 指定默认英文名）。

### 3. `FormattingUtil`（`dev.anvilcraft.lib.v2.config.util.FormattingUtil`）

| 方法签名 | 示例 | 说明 |
| :--- | :--- | :--- |
| `public static String toLowerCaseUnder(String string)` | `"maragingSteel300"` -> `"maraging_steel_300"` | 使用 `CaseFormat.UPPER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, string)` 转小写下划线 |
| `public static String toEnglishName(Object internalName)` | `"max_radius"` -> `"Max Radius"` | 将传入对象的字符串按 `_` 切分、转小写并逐词首字母大写 |
| `public static String toPointSplitName(String name)` | `"anvillib_explosion"` -> `"anvillib.explosion"` | 按非字母数字字符切分并过滤空段后以 `.` 拼接 |

### 4. `ConfigLanguageProvider`（`dev.anvilcraft.lib.v2.config.data.ConfigLanguageProvider`）

| 成员签名 | 说明 |
| :--- | :--- |
| `public ConfigLanguageProvider(PackOutput output, String locale)` | 生成 `anvillib_config` 内置 UI 键（支持 `"en_us"` 与 `"zh_cn"`） |
| `public static void gatherData(GatherDataEvent.Client event)` | 内部通过 `@SubscribeEvent` 在客户端 DataGen 时自动挂载 |
