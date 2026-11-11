# Config 注解配置系统：声明与注册 (`module.config`)

<BranchContextCard branch="1.21.1" />

`module.config`（构件名 `anvillib-config-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.config`）提供了一套**声明式注解驱动配置框架**。开发者只需定义一个普通的 Java POJO 类并在字段上标注 `@Comment`、`@BoundedDiscrete`、`@Slider`、`@CollapsibleObject`，调用一行 `ConfigManager.register(MOD_ID, MyConfig::new)`，即可自动完成：
1. 生成对应的 NeoForge `ModConfigSpec` 并在 `FMLConstructModEvent` 中向 `ModContainer` 注册 TOML 配置文件；
2. 监听 `ModConfigEvent`（加载与热重载），将 TOML 文件中的值自动反射写回 POJO 字段；
3. 在物理客户端自动注册配置编辑界面（支持 NeoForge 默认样式 `ConfigScreenStyle.DEFAULT` 与 AnvilLib 侧边栏分栏样式 `ConfigScreenStyle.SIDEBAR`）。

本模块拆分为 3 篇子文档：
- **本篇（注解声明与 `ConfigManager` 注册）**：详解 `@Config`、`@Comment`、`@BoundedDiscrete`、`@Slider`、`@CollapsibleObject`、`ConfigScreenStyle` 与 `ConfigManager`。
- **[客户端配置界面与侧栏](./client-screen)**：详解 `ConfigScreens`、`SidebarConfigScreen`、`ConfigTabs`、`FlatButton`、`PanelOptionsList`。
- **[语言生成与格式化工具](./datagen-and-util)**：详解 `ConfigData`、`ConfigLanguageProvider`、`FormattingUtil`、`TranslatableEnum`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `config` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-1.21.1:2.0.0")
}
```

---

## 二、 完整代码示例：定义并注册多层级配置类

### 1. 定义配置类 `MyModConfig.java`

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
    @Comment("是否启用自动电网负载均衡")
    public boolean enableGridBalance = true;

    @Comment({"最大电网传输距离（格）", "调大此值会略微增加服务端 Tick 开销"})
    @BoundedDiscrete(min = 1, max = 256)
    public int maxTransmissionRadius = 64;

    @Comment("机器工作音量倍率（拖动滑条调整）")
    @BoundedDiscrete(min = 0.0, max = 2.0)
    @Slider(step = 0.05)
    public double machineVolumeScale = 1.0;

    @Comment("渲染质量预设")
    public QualityMode qualityMode = QualityMode.HIGH;

    @Comment("反应堆子系统高级参数")
    @CollapsibleObject
    public ReactorSubConfig reactor = new ReactorSubConfig();

    public static class ReactorSubConfig {
        @Comment("过热保护阈值温度 (K)")
        @BoundedDiscrete(min = 300, max = 5000)
        public int overheatThreshold = 1500;

        @Comment("冷却液消耗倍率")
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

### 2. 在模组主类中注册配置

请在模组主类的静态字段或构造器中调用 `ConfigManager.register`（**必须在 `FMLConstructModEvent` 触发前或触发期间调用**）：

```java
package com.example.mymod;

import com.example.mymod.config.MyModConfig;
import dev.anvilcraft.lib.v2.config.ConfigManager;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";

    // 一行代码完成 ModConfigSpec 构建、TOML 文件绑定、ModConfigEvent 热重载监听与客户端界面注册
    public static final MyModConfig CONFIG = ConfigManager.register(MOD_ID, MyModConfig::new);

    public MyMod() {
    }
}
```

---

## 三、 核心注解详解

### 1. `@Config`（类级别注解）

标注在配置根类上，声明配置文件名、子目录、配置类型与客户端界面风格。

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `name` | `String` | *必填* | 配置文件名及翻译键前缀（通常填模组 `modId` 或 `"my_mod-client"`）。 |
| `group` | `String` | `""` | 配置文件所属分组子目录名：若为空或与 `name` 相同，则文件生成在 `config/<name>-<type>.toml`；若不为空且与 `name` 不同，则生成在 `config/<group>/<name>-<type>.toml`。 |
| `type` | `ModConfig.Type` | `ModConfig.Type.COMMON` | 配置类型：可选 `COMMON`、`CLIENT`、`SERVER`、`STARTUP`。 |
| `screenStyle` | `ConfigScreenStyle` | `ConfigScreenStyle.DEFAULT` | 客户端配置界面风格：`DEFAULT` 使用 NeoForge 原生分段页面；`SIDEBAR` 使用 AnvilLib 侧栏分栏界面 `SidebarConfigScreen`。 |

### 2. 字段级别注解 (`@Comment` / `@BoundedDiscrete` / `@Slider` / `@CollapsibleObject`)

| 注解名 | 适用字段类型 | 属性说明与边界约束 |
| :--- | :--- | :--- |
| **`@Comment`** | 任意配置字段 | `String[] value()`：写入 TOML 文件的英文注释，同时供 `ConfigData.readConfigClass` 提取以生成 `.tooltip` 语言键。 |
| **`@BoundedDiscrete`** | `byte`/`short`/`int`/`long`/`float`/`double` 及其包装类 | `double min()`、`double max()`：限制数值字段的闭区间范围 `[min, max]`。未标注时默认取对应数值类型的 `MIN_VALUE ~ MAX_VALUE`（浮点数为 `-Infinity ~ +Infinity`）。<br>内部工具类 `BoundedDiscrete.Util` 提供 `minByte`/`maxByte`/`minShort`/`maxShort`/`minInt`/`maxInt`/`minLong`/`maxLong`/`minDouble`/`maxDouble` 自动将 `double` 边界裁剪到目标数值类型的安全范围内。 |
| **`@Slider`** | **仅限 `float` / `double`**（及其包装类） | `double step() default 0`：在 `SidebarConfigScreen` 中将该浮点字段渲染为拖拽滑块控件（`step > 0` 时按步长量化并按 `BigDecimal` 精度格式化显示文本）。<br>**强制约束**：标注 `@Slider` 的字段**必须同时为 `float`/`double` 类型且同时标注 `@BoundedDiscrete`**，否则 `ConfigManager.define` 会直接抛出 `IllegalArgumentException("@Slider requires a float/double field with @BoundedDiscrete: ...")`！ |
| **`@CollapsibleObject`** | 嵌套子配置 POJO 对象字段 | 无属性。标记该字段为一个子配置分组（调用 `builder.push(fieldName)` 递归扫描其内部字段，并在 `SidebarConfigScreen` 中生成独立的侧栏 Tab 页或弹窗子页）。 |

> **字段名命名转换规则**：
> Java 字段名采用小驼峰（如 `maxTransmissionRadius`），`ConfigManager` 内部会通过 `FormattingUtil.toLowerCaseUnder` 自动将其转换为下划线蛇形命名（`max_transmission_radius`）写入 TOML 键名与语言翻译键（`<name>.configuration.max_transmission_radius`）。

---

## 四、 `ConfigManager` 与内部数据记录 API 详解

### 1. `ConfigManager` 公开方法

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static <T> T register(String modId, Supplier<T> configFactory)` | `T`（配置实例） | **推荐主入口**：按 `modId` 查找 `ModContainer`，自动绑定模组事件总线，构建 `ModConfigSpec`，并在物理客户端自动调用 `registerScreen(container)`。若同一个 `modId` 注册多个配置类（如 `COMMON` + `CLIENT`），会自动复用同一个 `ConfigManager` 实例。 |
| `public <T> T register(T configObj)` | `T` | 将单个标注了 `@Config` 的对象解析为 `ConfigRecord` 存入当前管理器。 |
| `public void register(IEventBus bus)` | `void` | 将当前 `ConfigManager` 实例注册到模组事件总线以监听 `FMLConstructModEvent` 和 `ModConfigEvent`。 |
| `@OnlyIn(Dist.CLIENT)`<br>`public void registerScreen(ModContainer container)` | `void` | 向 `ModContainer` 注册 `IConfigScreenFactory` 扩展点。 |
| `public static ModConfigSpec.ConfigValue<?> define(ModConfigSpec.Builder builder, String name, Field field, Object object)` | `ConfigValue<?>` | 根据字段初始值类型（`Number`、`Enum<?>`、`Boolean` 或其他）定义 `ModConfigSpec` 配置项并记录 `@Slider` 范围。 |
| `public static <E extends Enum<E>> ModConfigSpec.EnumValue<E> defineEnum(ModConfigSpec.Builder builder, String name, Enum<?> enumValue)` | `EnumValue<E>` | 定义枚举配置项。 |
| `public static ModConfigSpec.ConfigValue<?> defineInRange(ModConfigSpec.Builder builder, String name, Field field, Number number)` | `ConfigValue<?>` | 定义数值范围配置项。由于 NightConfig TOML 不区分 `Byte`/`Short`/`Float`，内部会将 `Byte`/`Short` 归一化为 `int` 范围、`Float` 归一化为 `double` 范围存储，加载时再由 `ConfigField#load` 还原为字段的实际声明类型。 |

### 2. `ConfigRecord`、`ConfigField` 与 `ConfigScreenStyle`

| 类 / 枚举名 | 签名与说明 |
| :--- | :--- |
| `ConfigScreenStyle` | 枚举：`DEFAULT`（NeoForge 原生配置页）、`SIDEBAR`（AnvilLib 侧栏分栏配置页）。 |
| `ConfigRecord` | `public record ConfigRecord(String group, String name, ModConfig.Type type, ModConfigSpec spec, Object object, List<ConfigField> values, AtomicBoolean registered)`<br>• `getFileName()`：返回 `"<name>-<type>.toml"` 或 `"<group>/<name>-<type>.toml"`；<br>• `load()`：遍历所有 `ConfigField` 将 `spec` 中的值写回 `object`。 |
| `ConfigField` | `public record ConfigField(Object parent, Field field, ModConfigSpec.ConfigValue<?> value)`<br>• `load()`：读取 `value.get()`，若字段类型为 `Byte`/`Short`/`Float` 则将 `Number` 转换为对应窄化类型后通过反射 `field.set(parent, raw)` 写回。 |
