---
title: Integration 管理器与钩子
prev: false
next: false
---

# 管理器与钩子

## IntegrationManager

核心管理类，负责扫描 classpath 中所有 `@Integration` 注解，实例化并调用相应方法。

### 构造与编译

```java
// 创建管理器（绑定到特定 modId）
IntegrationManager manager = new IntegrationManager("your_mod_id");

// 扫描 classpath，编译集成列表
manager.compileContent();
```

`compileContent()` 内部流程：

1. 获取当前模组的 `ModFileScanData`
2. 过滤出 `@Integration` 注解的所有类
3. 解析 `value`（modId）、`version`、`type` 属性
4. 创建 `IntegrationInstance` 并按目标 modId 分组存入 `Multimap`

### 加载方法

| 方法                                           | 说明                 |
|----------------------------------------------|--------------------|
| `load(String modid, ModInfo info)`           | 加载指定目标模组的集成（检查物理端） |
| `loadClient(String modid, ModInfo info)`     | 加载客户端逻辑            |
| `loadClientData(String modid, ModInfo info)` | 加载客户端数据生成          |
| `loadServerData(String modid, ModInfo info)` | 加载服务端数据生成          |
| `loadAllIntegrations()`                      | 批量加载所有已编译集成的双端逻辑   |
| `loadAllClientIntegrations()`                | 批量加载所有客户端逻辑        |
| `loadAllClientDataIntegrations()`            | 批量加载所有客户端数据生成      |
| `loadAllServerDataIntegrations()`            | 批量加载所有服务端数据生成      |

### 加载流程

单次 `load()` 流程：

1. 从 `instances` 中查找目标 modId 的所有集成实例
2. 专用服务端环境自动跳过不含 `DEDICATED_SERVER` 类型的实例
3. `instance.is(modInfo)` 检查版本兼容性
4. `instance.newInstance()` 加载类、查找构造和方法
5. `instance.invoke()` 调用对应方法

### 使用示例

```java
@Mod("your_mod_id")
public class YourMod {
    public static final IntegrationManager MANAGER = new IntegrationManager("your_mod_id");

    public YourMod() {
        MANAGER.compileContent();
    }

    // 在合适的生命周期事件中调用
    @SubscribeEvent
    public static void onCommonSetup(FMLCommonSetupEvent event) {
        MANAGER.loadAllIntegrations();
        MANAGER.loadAllClientIntegrations(); // 通过 DistExecutor 限制
    }
}
```

## IntegrationHook

提供静态上下文，供集成类获取当前运行时资源。

```java
public class IntegrationHook {
    @Getter @Setter
    private static GatherDataEvent event = null;

    @Getter @Setter
    private static IEventBus modEventBus = null;

    @Getter @Setter
    private static ModContainer modContainer = null;
}
```

| 字段           | 类型                | 说明                |
|--------------|-------------------|-------------------|
| event        | `GatherDataEvent` | 数据生成事件（仅数据生成阶段可用） |
| modEventBus  | `IEventBus`       | 当前模组的事件总线         |
| modContainer | `ModContainer`    | 当前模组容器            |

### 设置方式

```java
// 在模组构造中设置
IntegrationHook.setModEventBus(modEventBus);
IntegrationHook.setModContainer(modContainer);

// 在数据生成事件中设置
IntegrationHook.setEvent(gatherDataEvent);
```

## ModVersionRange

封装 Maven `VersionRange`，支持 `"*"` 表示任意版本。

```java
// 解析版本说明符
ModVersionRange range = ModVersionRange.of("[1.0,2.0)");
ModVersionRange any = ModVersionRange.of("*"); // → ANY 单例

// 版本匹配
boolean matches = range.containsVersion(modInfo.getVersion());
```

支持的版本语法与 Maven 依赖版本一致：`"1.0"`, `"[1.0,2.0)"`, `"[1.0,]"`, `"(,2.0]"` 等。

## 数据生成集成示例

```java
@Integration(value = "examplemod", version = "*",
             type = IntegrationType.CLIENT_DATA)
public class ExampleDataIntegration {
    public void applyClientData() {
        GatherDataEvent event = IntegrationHook.getEvent();
        DataGenerator generator = event.getGenerator();
        // 注册数据生成器
        generator.addProvider(true, new MyDataProvider(generator.getPackOutput()));
    }
}
```

确保在数据生成事件中提前设置 `IntegrationHook.setEvent(event)`。
