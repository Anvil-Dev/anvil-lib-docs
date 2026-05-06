---
title: Integration 核心 API
prev: false
next: false
---

# 核心 API

## `@Integration`

标记在类上的注解，声明集成信息。

```java
@Target(ElementType.TYPE)
public @interface Integration {
    String value();                    // 目标模组 ID（必填）
    String version() default "*";      // 版本范围
    IntegrationType[] type() default {IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER};
}
```

| 属性      | 类型                  | 说明                                      |
|---------|---------------------|-----------------------------------------|
| value   | `String`            | 集成的目标模组 ID                              |
| version | `String`            | 兼容的模组版本范围（Maven 版本语法），默认 `"*"`          |
| type    | `IntegrationType[]` | 集成的目标环境，默认 `{CLIENT, DEDICATED_SERVER}` |

## IntegrationType

枚举，表示集成适用的环境：

| 值                  | 说明      |
|--------------------|---------|
| `CLIENT`           | 物理客户端   |
| `DEDICATED_SERVER` | 专用服务端   |
| `CLIENT_DATA`      | 客户端数据生成 |
| `SERVER_DATA`      | 服务端数据生成 |

## IntegrationInstance

代表一个具体的集成实例，封装反射信息。

### 构造与初始化

```java
IntegrationInstance instance = new IntegrationInstance(
    "targetmod",                    // 目标 modId
    ModVersionRange.of("[1.0,2.0)"), // 版本范围
    "com.example.MyIntegration",     // 类全限定名
    List.of(IntegrationType.CLIENT)  // 环境类型列表
);
```

### 方法

| 方法                              | 说明                                            |
|---------------------------------|-----------------------------------------------|
| `newInstance()`                 | 加载类，使用 `MethodHandles.Lookup` 查找空参构造和四个可选加载方法 |
| `invoke()`                      | 调用 `apply()` 方法（通过 MethodHandle 反射）           |
| `invokeClient()`                | 调用 `applyClient()` 方法                         |
| `invokeClientData()`            | 调用 `applyClientData()` 方法                     |
| `invokeServerData()`            | 调用 `applyServerData()` 方法                     |
| `containsType(IntegrationType)` | 检查该实例是否包含指定环境类型                               |
| `is(ModInfo)`                   | 匹配目标模组 ID 和版本范围                               |

### 方法约定

集成类需提供无参构造以及以下可选方法（均需为 `void ()`）：

| 方法名                 | 调用时机    |
|---------------------|---------|
| `apply()`           | 双端通用加载  |
| `applyClient()`     | 物理客户端加载 |
| `applyClientData()` | 客户端数据生成 |
| `applyServerData()` | 服务端数据生成 |

至少定义其中一个方法，否则输出警告。方法通过 `MethodHandle` 反射调用，不依赖接口实现。

## 完整示例

```java
@Integration(
    value = "targetmod",
    version = "[1.0,2.0)",
    type = { IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER }
)
public class MyIntegration {
    // 公共无参构造（隐式）

    public void apply() {
        // 双端通用注册代码
    }

    public void applyClient() {
        // 仅客户端：注册渲染、按键绑定等
    }

    public void applyClientData() {
        // 客户端数据生成
        GatherDataEvent event = IntegrationHook.getEvent();
    }

    public void applyServerData() {
        // 服务端数据生成
    }
}
```
