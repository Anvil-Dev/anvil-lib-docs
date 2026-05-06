---
title: Config 配置管理
prev: false
next: false
---

# 配置管理

## ConfigManager

管理配置注册与加载的核心类，每个 modId 对应一个全局单例。

### 使用步骤

```java
// 1. 定义配置类（使用 @Config 等注解）

// 2. 注册配置
MyConfig cfg = ConfigManager.register("mymod", MyConfig::new);

// 或在已有对象上注册
MyConfig cfg = new MyConfig();
ConfigManager manager = ConfigManager.get("mymod");
manager.register(cfg);
```

### 自动行为

- `FMLConstructModEvent` — 自动将 `ModConfigSpec` 注册到 `ModContainer`
- `ModConfigEvent.Loading` / `Reloading` — 自动将配置值写入字段
- 客户端 — 自动注册配置屏幕扩展点（基于 `IConfigScreenFactory`）

### 内部机制

1. 使用反射扫描字段
2. 为每个字段生成 `ModConfigSpec.ConfigValue`，封装为 `ConfigField`
3. 通过 `@BoundedDiscrete` 自动使用 `defineInRange`
4. 支持枚举字段（`defineEnum`）和普通类型（布尔、数值、字符串等）

## ConfigRecord

封装一个配置类的完整信息。

| 字段         | 类型                  | 说明                 |
|------------|---------------------|--------------------|
| modId      | `String`            | 配置所属 modId         |
| type       | `ModConfig.Type`    | 配置类型               |
| spec       | `ModConfigSpec`     | 构建好的 ModConfigSpec |
| object     | `Object`            | 配置类实例              |
| values     | `List<ConfigField>` | 不可变列表，包含所有配置字段信息   |
| registered | `AtomicBoolean`     | 是否已向容器注册           |

### 方法

| 方法              | 说明                                             |
|-----------------|------------------------------------------------|
| `load()`        | 遍历 values，调用每个 `ConfigField.load()` 将当前配置值注入字段 |
| `getFileName()` | 返回 `"modId-type.toml"` 格式的文件名                  |

## ConfigField

记录类，封装单个配置字段的元数据和运行时值注入。

| 字段          | 类型                          | 说明               |
|-------------|-----------------------------|------------------|
| object      | `Object`                    | 字段所属对象           |
| field       | `Field`                     | Java 反射 Field 引用 |
| configValue | `ModConfigSpec.ConfigValue` | 对应的配置值           |

### load()

获取当前配置值，通过类型判断写入字段：

- 支持基本类型：`boolean`、`byte`、`short`、`int`、`long`、`float`、`double`
- 支持包装类型：`Boolean`、`Byte`、`Short`、`Integer`、`Long`、`Float`、`Double`、`String`
- 支持枚举类型（通过 `defineEnum` 定义的）

## 使用示例

```java
// 典型模式：在模组主类中直接声明
@Mod("mymod")
public class MyMod {
    public static final MyConfig CONFIG = ConfigManager.register("mymod", MyConfig::new);

    public MyMod() {
        // 直接使用 CONFIG.maxSpeed 等字段即可
    }
}
```
