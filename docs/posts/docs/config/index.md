---
title: Config 配置
prev: false
next: false
---

# 配置模块 (Config Module)

包 `dev.anvilcraft.lib.v2.config` 提供了一套基于 NeoForge 配置系统的声明式配置框架，通过注解和反射简化配置类的定义、注册、语言生成以及运行时值注入。

## 1. 核心注解

### `@Config`

标记一个类为配置类，必须指定配置名称和类型。

```java
@Config(name = "mymod", type = ModConfig.Type.COMMON)
public class MyConfig {
    // 配置字段...
}
```

| 属性   | 类型             | 说明                                       |
|------|----------------|------------------------------------------|
| name | String         | 配置主键名，用于生成文件名及翻译键前缀                      |
| type | ModConfig.Type | 配置类型（COMMON / CLIENT / SERVER），默认 COMMON |

### `@Comment`

为配置字段提供注释（TOML 注释和工具提示翻译键）。

```java
@Comment("The maximum speed of the machine.")
public int maxSpeed = 10;
```

### `@CollapsibleObject`

标记一个字段为可折叠对象。当配置类中包含嵌套对象时，在配置 GUI 中会以折叠方式展示。

```java
@CollapsibleObject
public NestedConfig nested = new NestedConfig();
```

### `@BoundedDiscrete`

限定数值类型字段（`byte`, `short`, `int`, `long`, `float`, `double`）的取值范围。通过 `min()` 和 `max()` 指定边界，
`-Infinity` 和 `+Infinity` 表示无限制。

内部类 `BoundedDiscrete.Util` 提供了一组静态方法将注解中的 `double` 范围转换为各类型的实际范围。

```java
@BoundedDiscrete(min = 0, max = 100)
public int volume = 80;
```

## 2. 配置管理

### `ConfigManager`

管理配置注册与加载的核心类。每个 modId 对应一个全局单例。

**使用步骤**：

1. **定义配置类**（使用上面的注解）
2. **注册配置**：
   ```java
   MyConfig cfg = ConfigManager.register("mymod", MyConfig::new);
   ```
   或在已有对象上注册：
   ```java
   MyConfig cfg = new MyConfig();
   manager.register(cfg);
   ```

3. **自动行为**：
    - 在 `FMLConstructModEvent` 时自动将 `ModConfigSpec` 注册到对应的 `ModContainer`。
    - 在 `ModConfigEvent.Loading/Reloading` 时自动将配置值写入字段。
    - 在客户端自动注册配置屏幕扩展点。

**内部机制**：

- `ConfigManager` 使用反射扫描字段，为每个字段生成 `ModConfigSpec.ConfigValue`，并封装为 `ConfigField`。
- 通过 `BoundedDiscrete` 注解自动使用 `defineInRange`。
- 支持枚举字段（`defineEnum`）和普通类型（布尔、数值、字符串等）。

### `ConfigRecord`

封装一个配置类的完整信息：

| 字段         | 类型                  | 说明                 |
|------------|---------------------|--------------------|
| modId      | String              | 配置所属 modId         |
| type       | ModConfig.Type      | 配置类型               |
| spec       | ModConfigSpec       | 构建好的 ModConfigSpec |
| object     | Object              | 配置类实例              |
| values     | `List<ConfigField>` | 不可变列表，包含所有配置字段信息   |
| registered | AtomicBoolean       | 是否已向容器注册           |

方法：

- `load()` – 遍历 values，调用每个 `ConfigField.load()` 将当前配置值注入字段。
- `getFileName()` – 返回 `"modId-type.toml"` 格式的文件名。

### `ConfigField`

记录类，包含字段所属对象、`Field` 引用和对应的 `ModConfigSpec.ConfigValue`。

- `load()`：获取当前配置值，通过类型判断写入字段（支持基本类型、包装类型、String 等）。

## 3. 辅助工具

### `ConfigData`

用于生成默认翻译键。通过 `readConfigClass(LanguageProvider, Class<?> configClass)` 遍历配置类及其注解，自动向语言生成器添加以下类型的翻译键：

- 配置标题：`"<modid>.configuration.title"`
- 配置文件 TOML 标题：`"<modid>.configuration.section.<modid>.<type>.toml"`
- 选项名称：`"<modid>.configuration.<fieldpath>"`
- 选项工具提示：`"<modid>.configuration.<fieldpath>.tooltip"`（当字段有 `@Comment` 时）
- 可折叠对象按钮文本：`"<modid>.configuration.<fieldpath>.button"`（当字段有 `@CollapsibleObject` 时）

所有这些键的值都由 `FormattingUtil` 生成的人类可读名称组成。

### `FormattingUtil`

字符串格式化方法：

| 方法                      | 说明                                                                       |
|-------------------------|--------------------------------------------------------------------------|
| `toLowerCaseUnder(str)` | 将驼峰式或大驼峰式字符串转为小写下划线格式（`"maragingSteel300"` → `"maraging_steel_300"`）     |
| `toEnglishName(obj)`    | 将下划线分隔的字符串转为首字母大写的英文名（`"apple_orange.juice"` → `"Apple Orange (Juice)"`） |

## 4. 使用示例

```java
@Config(name = "example", type = ModConfig.Type.COMMON)
public class ExampleConfig {
    @Comment("The number of uses.")
    @BoundedDiscrete(min = 1, max = 64)
    public int durability = 10;

    @Comment("Enable experimental mode.")
    public boolean experimental = false;

    @CollapsibleObject
    public Inner inner = new Inner();

    public static class Inner {
        @Comment("Inner value")
        public double factor = 1.0;
    }
}
```

注册配置：

```java
ExampleConfig cfg = ConfigManager.register("examplemod", ExampleConfig::new);
```

你可以直接在你的模组主类中声明

```java
public static final ExampleConfig CONFIG = ConfigManager.register("examplemod", ExampleConfig::new);
```

如果需要生成语言文件：

```java
ConfigData.readConfigClass(languageProvider, ExampleConfig.class);
```

客户端无需额外操作，配置屏幕会自动注册。

## 注意事项

1. 配置字段建议为 `public`，以确保反射注入能正常工作（非 `static`，非 `final`）。
2. 使用 `BoundedDiscrete` 时，边界为 `double`，内部会根据实际类型截断并 clamp 到目标类型的范围内。
3. `CollapsibleObject` 标记的字段应在配置类中初始化，其内部字段也适用相同的注解处理。
4. 配置文件名遵循 `<modId>-<type>.toml`，由 `ConfigRecord.getFileName()` 生成。
5. 动态注册的配置屏幕基于 Forge 的 `IConfigScreenFactory` 扩展点，仅客户端调用。
