# Integration 模组兼容集成框架 (`module.integration`)

<BranchContextCard branch="26.1" />

`module.integration`（构件名 `anvillib-integration-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.integration`）提供一套基于字节码注解扫描（`ModFileScanData`）与 `MethodHandles` 方法句柄调用的可选模组兼容（Soft Dependency）加载框架。

在为其他模组（如 JEI、EMI、Jade、Curios、Create 等）编写联动代码时，如果直接在主类或事件监听器中 `import` 外部模组的类，一旦玩家未安装该外部模组，JVM 加载类时就会直接抛出 `NoClassDefFoundError` 导致崩溃。使用 `module.integration` 时，只需在独立联动类上标注 `@Integration("目标模组ID")`，框架会先从 NeoForge 预扫描的注解元数据中检查目标模组是否已安装、版本是否在指定 Maven 版本区间内、以及当前运行环境（物理端）是否匹配——**只有全部条件满足时，才会调用 `Class.forName` 加载并实例化该联动类**。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `integration` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-integration-neoforge-26.1:2.0.0")
}
```

---

## 二、 核心约定：4 个无参生命周期方法

被 `@Integration` 标记的集成类**必须具有公开无参构造器（`public YourClass()`）**，且无需实现任何特定接口。`IntegrationInstance` 在加载该类时会通过 `MethodHandles.lookup().findVirtual(...)` 自动查找以下 4 个返回类型为 `void` 的无参实例方法（可按需声明其中任意一个或多个）：

| 方法名与签名 | 触发调用它的 `IntegrationManager` 方法 | 适用场景 |
| :--- | :--- | :--- |
| `public void apply()` | `load(modid, info)` / `loadAllIntegrations()` | 通用（双端）兼容初始化逻辑（如注册联动方块/物品、监听通用事件、可通过 `IntegrationHook.getModEventBus()` 获取总线）。 |
| `public void applyClient()` | `loadClient(modid, info)` / `loadAllClientIntegrations()` | 仅物理客户端兼容初始化逻辑（如注册客户端渲染器、HUD 覆盖层、快捷键）。 |
| `public void applyClientData()` | `loadClientData(modid, info)` / `loadAllClientDataIntegrations()` | 客户端 DataGen 数据生成阶段联动（可通过 `IntegrationHook.getEvent()` 获取 `GatherDataEvent`）。 |
| `public void applyServerData()` | `loadServerData(modid, info)` / `loadAllServerDataIntegrations()` | 服务端 DataGen 数据生成阶段联动（如生成联动模组的自定义配方或标签）。 |

> **警告**：如果一个 `@Integration` 类中以上 4 个方法一个都没有声明，`IntegrationInstance` 会在日志中打印警告：`Integration <className> does not declare any loader method.`。

---

## 三、 完整代码示例

### 1. 编写联动类（以 Curios 与客户端 Jade 联动为例）

```java
package com.example.mymod.integration.curios;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.integration.Integration;
import dev.anvilcraft.lib.v2.integration.IntegrationHook;
import dev.anvilcraft.lib.v2.integration.IntegrationType;
import net.neoforged.bus.api.IEventBus;

// 当安装了 curios 且版本 >= 9.0.0 时，在客户端与专用服务端均生效
@Integration(
    value = "curios",
    version = "[9.0.0,)",
    type = {IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER}
)
public class CuriosIntegration {
    // 1. 通用初始化：由 IntegrationManager#loadAllIntegrations() 触发
    public void apply() {
        IEventBus modBus = IntegrationHook.getModEventBus();
        if (modBus != null) {
            modBus.addListener(this::registerCuriosCapabilities);
        }
        MyMod.LOGGER.info("Curios 通用联动已激活");
    }

    // 2. 客户端初始化：由 IntegrationManager#loadAllClientIntegrations() 触发
    public void applyClient() {
        MyMod.LOGGER.info("Curios 客户端渲染器已注册");
    }

    // 3. 服务端数据生成：由 IntegrationManager#loadAllServerDataIntegrations() 触发
    public void applyServerData() {
        var gatherEvent = IntegrationHook.getEvent();
        if (gatherEvent != null) {
            // 向 gatherEvent.getGenerator() 注册 Curios 槽位 Tag Provider
        }
    }

    private void registerCuriosCapabilities(
        net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent event
    ) {
        // 仅当 Curios 存在时才会加载本类，安全访问外部 API
    }
}
```

### 2. 在模组主类中创建并驱动 `IntegrationManager`

`IntegrationManager` 不会自作主张在后台悄悄执行，而是由你的模组显式控制扫描与各阶段触发时机，并可通过 `IntegrationHook` 向各联动类传递上下文对象：

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.integration.IntegrationHook;
import dev.anvilcraft.lib.v2.integration.IntegrationManager;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLLoader;
import net.neoforged.neoforge.data.event.GatherDataEvent;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";
    public static final IntegrationManager INTEGRATION_MANAGER = new IntegrationManager(MOD_ID);

    public MyMod(IEventBus modEventBus, ModContainer modContainer) {
        // 1. 将当前模组的总线与容器存入 IntegrationHook，方便各 @Integration 类读取
        IntegrationHook.setModEventBus(modEventBus);
        IntegrationHook.setModContainer(modContainer);

        // 2. 扫描当前模组 JAR 内所有带有 @Integration 注解的类
        INTEGRATION_MANAGER.compileContent();

        // 3. 触发所有匹配模组的 apply() 方法
        INTEGRATION_MANAGER.loadAllIntegrations();

        // 4. 若在物理客户端，触发所有匹配模组的 applyClient() 方法
        if (FMLLoader.getCurrent().getDist() == Dist.CLIENT) {
            INTEGRATION_MANAGER.loadAllClientIntegrations();
        }

        // 5. 在数据生成事件中触发 applyClientData() / applyServerData()
        modEventBus.addListener(this::onGatherData);
    }

    private void onGatherData(GatherDataEvent.Client event) {
        IntegrationHook.setEvent(event);
        INTEGRATION_MANAGER.loadAllClientDataIntegrations();
        INTEGRATION_MANAGER.loadAllServerDataIntegrations();
    }
}
```

---

## 四、 公开类、注解与枚举 API 详解

### 1. `@Integration`（集成类声明注解）

标记在类、接口或枚举（`@Target(ElementType.TYPE)`）上。

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `value()` | `String` | **必填** | 目标外部模组的 `modId`（如 `"jei"`、`"jade"`、`"curios"`）。 |
| `version()` | `String` | `"*"` | Maven 规范版本范围表达式（基于 `org.apache.maven.artifact.versioning.VersionRange`）。<br>• `"*"`：匹配任意已安装版本；<br>• `"[19.0,)"`：匹配 `>= 19.0`；<br>• `"[1.0,2.0)"`：匹配 `1.0 <= v < 2.0`。 |
| `type()` | `IntegrationType[]` | `{CLIENT, DEDICATED_SERVER}` | 允许运行的环境类型数组。注意：若在专用服务端（`isDedicatedServer()`）运行，但 `type()` 未包含 `IntegrationType.DEDICATED_SERVER`，`IntegrationManager#load` 会直接跳过该类，从而保护仅客户端联动类不在服务端被 `Class.forName` 加载。 |

### 2. `IntegrationType`（集成环境类型枚举）

位于 `dev.anvilcraft.lib.v2.integration.IntegrationType`：

| 枚举常量 | 含义 |
| :--- | :--- |
| `CLIENT` | 物理客户端运行时集成 |
| `DEDICATED_SERVER` | 专用服务端运行时集成 |
| `CLIENT_DATA` | 客户端数据生成阶段集成 |
| `SERVER_DATA` | 服务端数据生成阶段集成 |

### 3. `IntegrationManager`（集成扫描与加载管理器）

位于 `dev.anvilcraft.lib.v2.integration.IntegrationManager`。每个需要扫描自身 `@Integration` 类的模组应实例化一个传入自身 `modId` 的 `IntegrationManager`。

| 构造器 / 常量 / 方法签名 | 说明 |
| :--- | :--- |
| `public static final String INTEGRATION_NAME` | `@Integration` 注解的字节码描述符 `"Ldev/anvilcraft/lib/v2/integration/Integration;"`。 |
| `public IntegrationManager(String modId)` | 构造绑定指定宿主模组 `modId` 的集成管理器。 |
| `public void compileContent()` | 从 `FMLLoader.getCurrent().getLoadingModList().getModFileById(this.modId)` 获取当前模组文件的 `ModFileScanData`，扫描所有 `@Integration` 注解并构建 `IntegrationInstance` 映射表（同时在启动加载界面显示 `"Load Integrations"` 进度条）。**必须在调用任何 `load*` 方法前先调用此方法**。 |
| `public void loadAllIntegrations()` | 遍历所有已注册的目标 `modid`，若该模组存在于当前 `LoadingModList` 中，则调用 `load(key, modInfo)`。 |
| `public void loadAllClientIntegrations()` | 遍历所有已加载的目标模组并调用 `loadClient(key, modInfo)`。 |
| `public void loadAllClientDataIntegrations()` | 遍历所有已加载的目标模组并调用 `loadClientData(key, modInfo)`。 |
| `public void loadAllServerDataIntegrations()` | 遍历所有已加载的目标模组并调用 `loadServerData(key, modInfo)`。 |
| `public void load(String modid, ModInfo info)` | 对匹配 `modid` 且版本满足 `instance.is(info)` 的所有 `IntegrationInstance`（在专用服务端下额外校验 `containsType(DEDICATED_SERVER)`），反射实例化并调用其 `apply()` 方法。 |
| `public void loadClient(String modid, ModInfo info)` | 对匹配 `modid` 与版本范围的 `IntegrationInstance` 实例化（若尚未实例化则复用单例）并调用其 `applyClient()` 方法。 |
| `public void loadClientData(String modid, ModInfo info)` | 对匹配 `modid` 与版本范围的 `IntegrationInstance` 实例化并调用其 `applyClientData()` 方法。 |
| `public void loadServerData(String modid, ModInfo info)` | 对匹配 `modid` 与版本范围的 `IntegrationInstance` 实例化并调用其 `applyServerData()` 方法。 |

### 4. `IntegrationHook`（全局上下文传递容器）

位于 `dev.anvilcraft.lib.v2.integration.IntegrationHook`。由于 `@Integration` 类必须使用无参构造器与无参 `apply*()` 方法，宿主模组可通过 `IntegrationHook` 的静态 Getter / Setter 向联动类传递事件总线或容器：

| 方法签名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `IntegrationHook.getEvent()` / `setEvent(GatherDataEvent)` | `GatherDataEvent` | 存取当前数据生成事件。 |
| `IntegrationHook.getModEventBus()` / `setModEventBus(IEventBus)` | `IEventBus` | 存取宿主模组的 Mod 事件总线。 |
| `IntegrationHook.getModContainer()` / `setModContainer(ModContainer)` | `ModContainer` | 存取宿主模组的 `ModContainer`。 |

### 5. 内部支撑类：`IntegrationInstance` 与 `ModVersionRange`（`@ApiStatus.Internal`）

| 类名 | 核心职责 |
| :--- | :--- |
| `IntegrationInstance` | 封装单个 `@Integration` 类的元数据、单例 `instance` 及 4 个 `MethodHandle`（`loader`、`clientLoader`、`clientDataLoader`、`serverDataLoader`）。`newInstance()` 是幂等的：同一集成类在 `loadAllIntegrations` 和 `loadAllClientIntegrations` 中只会调用一次无参构造器，共享同一个实例。 |
| `ModVersionRange` | 封装 Maven `VersionRange`。`ModVersionRange.of(String spec)` 支持 `"*"`（返回 `ModVersionRange.ANY`）或标准 Maven 版本范围字符串；若语法非法则记录错误并抛出 `RuntimeException(InvalidVersionSpecificationException)`。 |
