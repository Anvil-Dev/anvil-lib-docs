# Config 配置声明、注解与生命周期 (`module.config`)

<BranchContextCard branch="26.3" />

`module.config`（构件名 `anvillib-config-neoforge-26.3`，包名 `dev.anvilcraft.lib.v2.config`）提供基于 Java 字段反射与注解声明的配置管理框架。开发者只需编写普通 POJO 配置类并调用一行 `ConfigManager.register(...)`，框架即可自动完成：

1. 将字段转换为 NeoForge 的 `ModConfigSpec`（含数值边界归一化、枚举、布尔值、字符串/列表及嵌套子节）；
2. 在 `FMLConstructModEvent` 阶段向 `ModContainer` 注册 TOML 配置文件；
3. 在 `ModConfigEvent`（加载与热重载）阶段自动通过反射将 TOML 值写回你的配置类实例字段；
4. 在物理客户端自动注册 NeoForge 原生配置界面或 AnvilLib 的半透明侧栏配置界面（`SidebarConfigScreen`），并支持客户端滑块实时预览。

本模块按功能拆分为 3 篇子文档：
- **本篇（配置声明、注解与生命周期）**：详解 `@Config`、`@Comment`、`@BoundedDiscrete`、`@Slider`、`@CollapsibleObject`、`ConfigScreenStyle`、`ConfigManager`、`ConfigField` 与 `ConfigRecord`。
- **[客户端配置界面与侧栏样式](./client-screen)**：详解 `ConfigScreens`、`SidebarConfigScreen`、`ConfigTabs`、`PanelOptionsList` 与 `FlatButton`。
- **[语言文件生成与枚举本地化](./datagen-and-util)**：详解 `ConfigData`、`ConfigLanguageProvider`、`TranslatableEnum` 与 `FormattingUtil`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.3`，则已自动包含本模块；若仅需单独引入 `config` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-26.3:2.0.0")
}
```

---

## 二、 核心用法与完整代码示例

### 1. 要解决什么问题 / 怎么用

直接使用 NeoForge 原生 `ModConfigSpec.Builder` 时，每个配置项都需要声明 `ModConfigSpec.IntValue` / `BooleanValue` 句柄，且每次读取都要调用 `.get()`，或者手动监听 `ModConfigEvent` 将配置同步到静态缓存变量。

使用 `module.config` 时：
- 配置项直接声明为普通的非 `final` 字段（如 `public int maxRange = 16;`），字段的初始值即为 TOML 的默认值；
- 字段名（驼峰命名 `maxRange`）会自动通过 `FormattingUtil.toLowerCaseUnder` 转换为下划线 TOML 键名（`max_range`）；
- 当配置文件加载、热重载或在客户端配置界面中被拖动滑块修改时，`ConfigManager` 会自动更新配置对象中的字段值，业务代码直接读取字段即可。

### 2. 完整代码示例

下面展示一个包含基本类型、离散范围约束、步进滑块、可翻译枚举与多级嵌套折叠对象的完整配置类及注册流程：

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
    @Comment("是否启用机器工作粒子效果")
    public boolean enableParticles = true;

    @Comment("粒子最大渲染距离（方块）")
    @BoundedDiscrete(min = 4, max = 128)
    public int maxParticleDistance = 32;

    @Comment("机器环境音效音量倍率（在侧栏 UI 中显示为步进滑块，并支持实时预览）")
    @BoundedDiscrete(min = 0.0, max = 2.0)
    @Slider(step = 0.05)
    public float soundVolume = 1.0f;

    @Comment("渲染质量预设")
    public QualityPreset qualityPreset = QualityPreset.HIGH;

    @Comment("高级激光渲染参数分组")
    @CollapsibleObject
    public LaserSection laser = new LaserSection();

    public static class LaserSection {
        @Comment("激光束透明度")
        @BoundedDiscrete(min = 0.1, max = 1.0)
        @Slider(step = 0.1)
        public double beamOpacity = 0.8;

        @Comment("最大反射次数")
        @SerializedName("Max Bounce Limit")
        @BoundedDiscrete(min = 1, max = 16)
        public int maxBounces = 4;

        @Comment("嵌套二级子配置（在侧栏界面中点击“编辑 ›”打开模态弹窗）")
        @CollapsibleObject
        public BloomSubSection bloom = new BloomSubSection();
    }

    public static class BloomSubSection {
        @Comment("泛光强度")
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

在模组主类构造器（或静态初始化块）中调用 `ConfigManager.register`：

```java
package com.example.mymod;

import com.example.mymod.config.MyModClientConfig;
import dev.anvilcraft.lib.v2.config.ConfigManager;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";

    // 在模组类加载或构造阶段直接注册并持有配置单例
    public static final MyModClientConfig CLIENT_CONFIG =
        ConfigManager.register(MOD_ID, MyModClientConfig::new);

    public MyMod() {
        // 业务代码可直接访问 MyMod.CLIENT_CONFIG.soundVolume 等字段
    }
}
```

---

## 三、 注解与枚举 API 详解

### 1. `@Config`（配置类声明注解）

标记在配置类（`ElementType.TYPE`）上，声明该类对应的 TOML 文件路径、配置类型与客户端界面风格。

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `name()` | `String` | **必填** | 配置文件基础名称（通常填写模组 ID，如 `"my_mod"`），同时用作翻译键前缀 `<name>.configuration.*`。 |
| `group()` | `String` | `""` | 配置文件所在的子目录名。若为空字符串，文件生成在 `config/<name>-<type>.toml`；若设为 `"my_mod"`，则生成在 `config/my_mod/<name>-<type>.toml`。 |
| `type()` | `ModConfig.Type` | `ModConfig.Type.LOCAL` | NeoForge 配置类型：可选 `LOCAL`、`CLIENT`、`SYNCED`、`STARTUP`。 |
| `screenStyle()` | `ConfigScreenStyle` | `ConfigScreenStyle.DEFAULT` | 客户端配置界面风格：`DEFAULT` 使用 NeoForge 原生 `ConfigurationSectionScreen`；`SIDEBAR` 使用 AnvilLib 半透明侧栏界面 `SidebarConfigScreen`。 |

### 2. `ConfigScreenStyle`（配置界面风格枚举）

位于 `dev.anvilcraft.lib.v2.config.ConfigScreenStyle`，不依赖任何客户端类，可在服务端安全加载：

| 枚举常量 | 说明 |
| :--- | :--- |
| `DEFAULT` | 使用 NeoForge 原生居中列表式配置编辑界面（`ConfigurationScreen.ConfigurationSectionScreen`）。 |
| `SIDEBAR` | 使用 AnvilLib 提供的 `SidebarConfigScreen`：支持左侧一级分类导航栏、顶栏多配置文件下拉切换、步进滑块实时预览、二级子节模态弹窗编辑以及游戏中半透明背景。 |

### 3. `@Comment`（字段注释注解）

标记在配置字段（`ElementType.FIELD`）上，为生成的 TOML 配置项添加注释，并在 `ConfigData.readConfigClass` 数据生成时自动生成 `.tooltip` 翻译条目。

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `value()` | `String` | `""` | 写入 TOML 的注释文本，同时作为数据生成时的默认英文 Tooltip 文本。 |

### 4. `@BoundedDiscrete`（数值范围约束注解）

标记在数值类型字段（`byte`、`short`、`int`、`long`、`float`、`double` 及其包装类）上，限定 `ModConfigSpec.Builder#defineInRange` 的最小值与最大值。

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `min()` | `double` | `Double.NEGATIVE_INFINITY` | 允许的最小值。未指定时按字段类型自动回退为对应类型的 `MIN_VALUE`（如 `Integer.MIN_VALUE`、`-Infinity`）。 |
| `max()` | `double` | `Double.POSITIVE_INFINITY` | 允许的最大值。未指定时按字段类型自动回退为对应类型的 `MAX_VALUE`（如 `Integer.MAX_VALUE`、`+Infinity`）。 |

> **内部工具类 `BoundedDiscrete.Util`（`@ApiStatus.Internal`）**：
> 提供 `minInt` / `maxInt`、`minLong` / `maxLong`、`minFloat` / `maxFloat`、`minDouble` / `maxDouble`、`minShort` / `maxShort`、`minByte` / `maxByte` 静态方法，对 `min()` 下界执行 `Math.floor` 并 `Math.clamp` 到目标整数类型范围，对 `max()` 上界执行 `Math.ceil` 并 `Math.clamp`。
> **注意**：由于 TOML 格式不区分 `Byte`、`Short`、`Float`，`ConfigManager.defineInRange` 内部会将 `Byte` / `Short` 归一化为 `int` 范围 `ConfigValue`，将 `Float` 归一化为 `double` 范围 `ConfigValue`（通过 `Double.parseDouble(value.toString())` 避免 `float -> double` 二进制浮点尾数毛刺），并在加载回写字段时由 `ConfigField` 安全窄化回原始 Java 字段类型。

### 5. `@Slider`（步进滑块注解）

标记在 `float` / `Float` 或 `double` / `Double` 字段（`ElementType.FIELD`）上，使该字段在 `ConfigScreenStyle.SIDEBAR` 侧栏界面中渲染为固定步长的离散滑块，而非文本输入框。

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `step()` | `double` | **必填** | 滑块每次移动的步长（如 `0.05`、`0.1`），必须为有限正数（`step > 0`）。 |

**前置约束与边界条件（极其重要）**：
1. **必须同时标注有限范围的 `@BoundedDiscrete`**：`@Slider` 只能用于 `float`/`double`（含包装类）字段，且必须配合有限的 `@BoundedDiscrete(min = ..., max = ...)`（满足 `Double.isFinite(min) && Double.isFinite(max) && min < max`）。若缺少 `@BoundedDiscrete` 或用于 `int` 字段，`ConfigManager.define` 会在注册时直接抛出 `IllegalArgumentException("@Slider requires a float/double field with @BoundedDiscrete: ...")`。
2. **步数上限校验**：内部记录 `Slider.Range(double min, double max, double step)` 使用 `BigDecimal` 精确计算总步数 `ceil((max - min) / step)`，若步数超过 `Integer.MAX_VALUE - 1` 会抛出 `IllegalArgumentException("Slider has too many steps")`。
3. **非对齐现有值的保护**：如果玩家手动在 TOML 文件中填入了一个处于两个步长之间的数值（例如 `step = 0.1` 但手写了 `0.15`），打开 `SidebarConfigScreen` 时滑块仍会原样显示 `"0.15"`，且只要玩家未拖动该滑块，退出保存时 `PanelOptionsList` 不会强制将其四舍五入覆盖。

### 6. `@CollapsibleObject`（嵌套配置分组注解）

标记在自定义对象字段（`ElementType.FIELD`）上，将该字段对应的内部类展开为 TOML 的一个子表（`builder.push(fieldName)` ... `builder.pop()`）。

- **在 `ConfigScreenStyle.SIDEBAR` 界面中的表现**：
  - **顶层 `@CollapsibleObject` 字段**：自动提取为左侧导航栏的独立标签页（Tab）；普通非折叠字段则汇总在第一个“常规（General）”标签页中。
  - **二级及更深层 `@CollapsibleObject` 字段**：在当前页渲染为带有“编辑 ›”按钮的行，点击后打开居中模态弹窗（支持多层 `modalPath` 栈式返回）。

---

## 四、 `ConfigManager` 与内部运行时类详解

### 1. `ConfigManager` 公开与内部 API 表

| 方法签名 | 可见性与状态 | 调用时机与行为说明 |
| :--- | :--- | :--- |
| `public static <T> T register(String modId, Supplier<T> configFactory)` | **Public API** | **核心注册入口**。必须在 `FMLConstructModEvent` 触发前（如 `@Mod` 构造器或静态字段初始化时）调用。<br>1. 通过 `ModList.get().getModContainerById(modId)` 查找容器（若找不到则打印警告并直接返回 `configFactory.get()`）。<br>2. 为该 `modId` 创建或复用 `ConfigManager` 单例并注册到 Mod 事件总线（`container.getEventBus()`）。<br>3. 解析 `configFactory.get()` 实例上的 `@Config` 及所有声明字段，构建 `ModConfigSpec`。<br>4. 若当前物理端为客户端（`FMLLoader.getCurrent().getDist().isClient()`），自动调用 `registerScreen(container)` 注册配置界面工厂。 |
| `public <T> T register(T configObj)` | `@ApiStatus.Internal` | 解析传入的配置实例并构建 `ConfigRecord` 存入 `configSpecMap`。 |
| `public void register(IEventBus bus)` | `@ApiStatus.Internal` | 将当前 `ConfigManager` 注册至模组事件总线。 |
| `public void onModConstruct(FMLConstructModEvent event)` | `@ApiStatus.Internal` | 监听模组构造事件，调用 `container.registerConfig(value.type(), value.spec(), value.getFileName())` 完成 NeoForge 配置文件注册（通过 `AtomicBoolean registered` 保证幂等）。 |
| `public void loading(ModConfigEvent event)` | `@ApiStatus.Internal` | 监听 `ModConfigEvent.Loading` 与 `ModConfigEvent.Reloading`，将已加载的 `ModConfigSpec` 值反射写回配置对象字段。 |
| `public void registerScreen(ModContainer container)` | `@ApiStatus.Internal` | 向 `ModContainer` 注册 `IConfigScreenFactory` 扩展点，根据每个 `@Config(screenStyle = ...)` 分发界面风格。 |
| `public static void previewClientValue(ModConfigSpec spec, List<String> path)` | `@ApiStatus.Internal` | **客户端实时预览**：当用户在 `SidebarConfigScreen` 中修改 `ModConfig.Type.CLIENT` 类型的配置项（如拖动滑块）时，立即将新值写回配置对象的 Java 字段，无需等到关闭界面保存 TOML 文件即可在游戏画面中看到实时效果。 |
| `public static @Nullable Slider.Range slider(ModConfigSpec.ConfigValue<?> value)` | `@ApiStatus.Internal` | 查询某个 `ConfigValue` 绑定的 `@Slider` 步进范围元数据。 |

### 2. `ConfigField` 与 `ConfigRecord`（`@ApiStatus.Internal`）

| 类名 | 签名 | 说明 |
| :--- | :--- | :--- |
| `ConfigField` | `public record ConfigField(Object object, Field field, ModConfigSpec.ConfigValue<?> value)` | 维护单个配置字段与 `ModConfigSpec.ConfigValue` 的绑定关系。调用 `load()` 时会自动跳过 `final` 字段，兼容实例字段与 `static` 字段，以及非 `public` 字段，并通过 `castToLong` / `castToDouble` 将 TOML 中的 `Number` 安全写回 `byte`、`short`、`int`、`long`、`float`、`double`、`boolean`、`char`、`String` 或枚举字段。 |
| `ConfigRecord` | `public record ConfigRecord(String group, String modId, ModConfig.Type type, ModConfigSpec spec, Object object, List<ConfigField> values, AtomicBoolean registered)` | 维护单个 `@Config` 对象的完整注册记录。`getFileName()` 生成形如 `<group>/<modId>-<type>.toml` 或 `<modId>-<type>.toml` 的配置文件相对路径；`load()` 在 `spec.isLoaded()` 为真时遍历所有 `ConfigField` 执行回写。 |

---

## 五、 常见坑点与注意事项

1. **配置字段严禁声明为 `final`**：`ConfigField.load()` 检测到字段带有 `AccessFlag.FINAL` 时会直接 `return` 跳过赋值；同时，带有 `@CollapsibleObject` 的字段必须在声明处初始化非空实例（如 `public LaserSection laser = new LaserSection();`），否则反射读取字段默认值时会传入 `null` 导致 `NullPointerException`。
2. **同一个 Mod 注册多个配置文件**：一个 `modId` 可以多次调用 `ConfigManager.register(MOD_ID, ...)` 注册不同 `type`（如一个 `LOCAL`、一个 `CLIENT`）或不同 `name` 的配置类。当存在多个配置文件且启用了 `ConfigScreenStyle.SIDEBAR` 时，侧栏界面右上角会自动渲染配置文件下拉切换菜单。
3. **自定义翻译显示名**：如果希望某个字段或枚举常量的默认英文显示名不同于字段名拆词结果，可在该字段或枚举常量上标注 Gson 的 `@SerializedName("Custom Display Name")`，`ConfigData` 生成语言文件时会优先采用 `@SerializedName` 的值。
