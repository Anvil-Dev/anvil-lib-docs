---
title: Integration 兼容性集成
prev: false
next: false
---

# 集成模块 (Integration Module)

包 `dev.anvilcraft.lib.v2.integration` 提供了一个轻量级的模组间集成系统。通过注解 `@Integration` 声明集成点，由
`IntegrationManager` 自动发现并加载，支持在指定物理端（客户端/服务端/数据生成）以约定方法的形式执行集成逻辑。

## 1. 核心概念

- **声明端**：在 `@Integration` 注解中指定目标模组 ID、版本范围以及需加载的集成类型。
- **实现端**：被注解的类需提供无参构造以及约定名称的可选方法（`apply`、`applyClient`、`applyClientData`、`applyServerData`
  ），方法签名均为 `void ()`。
- **管理器**：`IntegrationManager` 负责扫描 classpath 中所有 `@Integration` 注解，实例化并调用相应方法。

## 2. 快速开始

### 2.1 定义集成类

```java
import dev.anvilcraft.lib.v2.integration.Integration;
import dev.anvilcraft.lib.v2.integration.IntegrationType;

@Integration(
    value = "targetmod",
    version = "[1.0,2.0)",
    type = { IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER }
)
public class MyIntegration {
    // 公共无参构造

    // 双端通用加载
    public void apply() {
        // 注册代码等
    }

    // 仅客户端加载
    public void applyClient() {
        // ...
    }

    // 客户端数据生成
    public void applyClientData() {
        // ...
    }

    // 服务端数据生成
    public void applyServerData() {
        // ...
    }
}
```

- **注解参数**：
    - `value` – 目标模组 ID（必填）。
    - `version` – 版本说明符（Maven 依赖版本语法），默认 `"*"` 匹配任意版本。
    - `type` – 加载环境集合，可选值：`CLIENT`、`DEDICATED_SERVER`、`CLIENT_DATA`、`SERVER_DATA`；默认同时包含 `CLIENT` 和
      `DEDICATED_SERVER`。

- **方法约定**：至少包含 `apply()`、`applyClient()`、`applyClientData()`、`applyServerData()` 中的一个，否则会输出警告。方法通过反射调用，不依赖接口实现。

### 2.2 注册管理器

在你的模组主类中（需在模组构造时），创建 `IntegrationManager` 并触发扫描与加载：

```java
import dev.anvilcraft.lib.v2.integration.IntegrationManager;

@Mod("your_mod_id")
public class YourMod {
    public static final IntegrationManager MANAGER = new IntegrationManager("your_mod_id");

    public YourMod() {
        // 扫描 classpath，编译集成列表
        MANAGER.compileContent();
    }
}
```

## 3. 类详细说明

### `@Integration`

标记在类上的注解，用于声明集成信息。

| 属性      | 类型                  | 说明                                      |
|---------|---------------------|-----------------------------------------|
| value   | `String`            | 集成的目标模组 ID                              |
| version | `String`            | 兼容的模组版本范围（支持 Maven 版本语法），默认 `"*"` 匹配所有  |
| type    | `IntegrationType[]` | 集成的目标环境，默认 `{CLIENT, DEDICATED_SERVER}` |

### `IntegrationType`

枚举，表示集成适用的环境：

- `CLIENT` – 物理客户端
- `DEDICATED_SERVER` – 专用服务端
- `CLIENT_DATA` – 客户端数据生成
- `SERVER_DATA` – 服务端数据生成

### `IntegrationManager`

核心管理类。

- **构造**：`new IntegrationManager(String modId)` – 绑定到特定模组，扫描自身 classpath 下的所有 `@Integration` 数据。
- **`compileContent()`**：读取模组文件扫描结果，构建 `IntegrationInstance` 列表并缓存。
- **加载方法**：
    - `loadAllIntegrations()` / `loadAllClientIntegrations()` 等批量方法，遍历已编译的集成目标，若匹配当前加载的模组且版本兼容，则实例化并调用相应方法。
    - 细粒度方法 `load(String modid, ModInfo info)` 等可单独触发某个目标模组的集成。
- **依赖注入**：`IntegrationHook` 类提供了静态字段供集成类获取当前运行环境的总线、容器和 `GatherDataEvent`
  （仅数据生成环境）。需在对应生命周期手动设置这些值。

### `IntegrationInstance`

代表一个具体的集成实例，封装了反射信息：

- `newInstance()`：加载类，查找无参构造和四个可选的加载方法。
- `invoke()` / `invokeClient()` / `invokeClientData()` / `invokeServerData()`：调用对应的加载方法。
- `is(ModInfo)`：检查传入的模组信息是否匹配目标模组ID及版本范围。

### `IntegrationHook`

提供静态上下文，供集成类获取当前运行时资源：

| 字段           | 类型              | 说明                  |
|--------------|-----------------|---------------------|
| event        | GatherDataEvent | 数据生成事件 (仅数据生成阶段可用)  |
| modEventBus  | IEventBus       | 当前模组的事件总线 (需在构造时设置) |
| modContainer | ModContainer    | 当前模组容器 (需在构造时设置)    |

**建议**：在模组构造时调用 `IntegrationHook.setModEventBus(...)` 等，以便集成类内部使用。

### `ModVersionRange`

封装 Maven 版本范围 (`VersionRange`)，提供 `of(String spec)` 静态构造，支持 `"*"` 表示任意版本。

## 4. 数据生成集成示例

如果需要在客户端或服务端的数据生成事件中执行代码，可以结合 `IntegrationType.CLIENT_DATA` / `SERVER_DATA` 和
`IntegrationHook`：

```java
@Integration(value = "examplemod", version = "*", type = IntegrationType.CLIENT_DATA)
public class ExampleDataIntegration {
    public void applyClientData() {
        GatherDataEvent event = IntegrationHook.getEvent();
        // 添加数据生成入口
    }
}
```

确保在数据生成事件中提前设置 `IntegrationHook.setEvent(event)`。

## 5. 注意事项

- **类加载**：集成类通过 `Class.forName` 加载，确保目标类在类路径中。若目标模组未加载，`is()` 检查会失败，不会触发加载。
- **线程安全**：`IntegrationManager` 的加载方法应在合适的模组生命周期阶段（如 `FMLCommonSetupEvent` 或对应事件）调用，避免并发问题。
- **方法查找**：仅查找 `void apply*( void )` 方法，若未定义任何方法，实例化后仅输出警告。
- **版本匹配**：`ModVersionRange` 仅当目标模组版本在范围内时才实例化集成类。
