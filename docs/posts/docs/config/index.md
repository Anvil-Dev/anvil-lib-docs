---
title: Config 配置
prev: false
next: false
---

# 配置模块 <Badge type="tip" text=">=1.21.1" />

包 `dev.anvilcraft.lib.v2.config` 提供了一套基于 NeoForge 配置系统的声明式配置框架，通过注解和反射简化配置类的定义、注册、语言生成以及运行时值注入。

## 文档索引

| 文档                    | 内容                                                           |
|-----------------------|--------------------------------------------------------------|
| [注解系统](./annotations) | `@Config`、`@Comment`、`@CollapsibleObject`、`@BoundedDiscrete` |
| [配置管理](./manager)     | `ConfigManager`、`ConfigRecord`、`ConfigField`                 |
| [辅助工具](./utilities)   | `ConfigData`（语言生成）、`FormattingUtil`（字符串格式化）                  |

## 快速开始

```java
@Config(name = "mymod", type = ModConfig.Type.COMMON)
public class MyConfig {
    @Comment("The maximum speed of the machine.")
    @BoundedDiscrete(min = 0, max = 100)
    public int maxSpeed = 10;

    @Comment("Enable experimental mode.")
    public boolean experimental = false;
}

// 注册
MyConfig cfg = ConfigManager.register("mymod", MyConfig::new);
```

## 注意事项

- 配置字段建议为 `public`、非 `static`、非 `final`
- 配置文件名遵循 `<modId>-<type>.toml` 格式
- `BoundedDiscrete` 边界为 `double`，内部根据实际类型截断并 clamp
- 配置屏幕在客户端自动注册
