---
title: Config 注解系统
prev: false
next: false
---

# 注解系统

## `@Config`

标记一个类为配置类，必须指定配置名称和类型。

```java
@Config(name = "mymod", type = ModConfig.Type.COMMON)
public class MyConfig { ... }
```

| 属性   | 类型               | 说明                                              |
|------|------------------|-------------------------------------------------|
| name | `String`         | 配置主键名，用于生成文件名及翻译键前缀                             |
| type | `ModConfig.Type` | 配置类型：`COMMON` / `CLIENT` / `SERVER`，默认 `COMMON` |

## `@Comment`

为配置字段提供注释，同时生成 TOML 注释和工具提示翻译键。

```java
@Comment("The maximum speed of the machine.")
public int maxSpeed = 10;
```

翻译键格式：`<modid>.configuration.<fieldpath>.tooltip`

## `@CollapsibleObject`

标记嵌套对象字段，在配置 GUI 中以折叠方式展示其内部字段。

```java
@CollapsibleObject
public NestedConfig nested = new NestedConfig();
```

嵌套对象内的字段同样适用 `@Comment`、`@BoundedDiscrete` 等注解。

## `@BoundedDiscrete`

限定数值类型字段的取值范围。

```java
@BoundedDiscrete(min = 0, max = 100)
public int volume = 80;

@BoundedDiscrete(min = 1, max = Double.POSITIVE_INFINITY)
public double scale = 1.0;
```

| 属性  | 类型       | 默认值         | 说明     |
|-----|----------|-------------|--------|
| min | `double` | `-Infinity` | 最小值（含） |
| max | `double` | `+Infinity` | 最大值（含） |

支持的字段类型：`byte`、`short`、`int`、`long`、`float`、`double`。

### BoundedDiscrete.Util

内部工具类，将注解中的 `double` 范围转换为各类型的实际范围：

```java
// 内部自动调用
BoundedDiscrete.Util.parseIntRange(min, max);  // → int
BoundedDiscrete.Util.parseLongRange(min, max); // → long
// etc.
```

在 `ConfigManager.register` 时自动使用 `defineInRange`。

## 完整示例

```java
@Config(name = "example", type = ModConfig.Type.COMMON)
public class ExampleConfig {
    @Comment("The number of uses.")
    @BoundedDiscrete(min = 1, max = 64)
    public int durability = 10;

    @Comment("The speed multiplier.")
    @BoundedDiscrete(min = 0.1, max = 10.0)
    public double speed = 1.0;

    @Comment("Enable experimental mode.")
    public boolean experimental = false;

    @CollapsibleObject
    public Inner inner = new Inner();

    public static class Inner {
        @Comment("Inner factor value")
        public double factor = 1.0;
    }
}
```
