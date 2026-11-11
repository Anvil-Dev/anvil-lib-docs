# Integration 模组兼容集成框架 (`module.integration`)

<BranchContextCard branch="1.21.1" />

`module.integration`（构件名 `anvillib-integration-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.integration`）提供了一套**基于类注解扫描、支持 Maven 范围语法版本过滤与物理端分离的跨模组软依赖集成（Soft-Dependency Integration）框架**。

在开发大型模组时，经常需要为 JEI、Jade、Curios、Create 或 KubeJS 等第三方模组编写联动代码。如果直接在主类里 `import` 联动类，当玩家未安装该第三方模组时就会抛出 `NoClassDefFoundError` 崩溃。使用 `module.integration`，只需在独立的联动入口类上标注 **`@Integration("target_mod_id")`**，由 `IntegrationManager` 在目标模组已安装且版本匹配时才动态加载并调用对应生命周期方法，彻底隔离软依赖类加载。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `integration` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-integration-neoforge-1.21.1:2.0.0")
}
```

---

## 二、 完整代码示例：编写跨模组联动类并交由 `IntegrationManager` 加载

### 1. 编写联动入口类（标注 `@Integration`）

联动类中**可以安全地直接引用目标模组的类**，因为只有当目标模组存在且版本满足 `version` 约束时，`IntegrationInstance` 才会通过 `Class.forName` 加载该类：

```java
package com.example.mymod.integration.jei;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.integration.Integration;
import dev.anvilcraft.lib.v2.integration.IntegrationType;

// 仅当安装了 "jei" 模组，且其版本号 >= 19.0.0、< 20.0.0 时在客户端激活
@Integration(
    value = "jei",
    version = "[19.0.0,20.0.0)",
    type = {IntegrationType.CLIENT}
)
public class JeiModIntegration {
    // 要求必须有公共无参构造器（默认构造器即可）

    /**
     * 通用/服务端集成入口：当 IntegrationManager#loadAllIntegrations() 调用时执行
     */
    public void apply() {
        MyMod.LOGGER.info("正在激活 JEI 通用联动逻辑...");
    }

    /**
     * 客户端专用集成入口：当 IntegrationManager#loadAllClientIntegrations() 调用时执行
     */
    public void applyClient() {
        MyMod.LOGGER.info("正在激活 JEI 客户端渲染与界面联动...");
    }

    /**
     * 数据生成专用集成入口：当 IntegrationManager#loadAllDataIntegrations() 调用时执行
     */
    public void applyData() {
        MyMod.LOGGER.info("正在激活 JEI 数据生成联动...");
    }
}
```

### 2. 在你的模组主类中触发 `IntegrationManager`

注意：`IntegrationManager` 需要传入**你自己的模组 ID**（以便扫描你模组 JAR 包内的 `@Integration` 注解）：

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.integration.IntegrationManager;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.data.event.GatherDataEvent;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";
    public static final IntegrationManager INTEGRATIONS = new IntegrationManager(MOD_ID);

    public MyMod(IEventBus modEventBus) {
        // 1. 扫描当前模组 JAR 包内所有的 @Integration 注解类
        INTEGRATIONS.compileContent();

        // 2. 在对应生命周期阶段触发加载
        modEventBus.addListener(this::onCommonSetup);
        if (FMLEnvironment.dist == Dist.CLIENT) {
            modEventBus.addListener(this::onClientSetup);
        }
        modEventBus.addListener(this::onGatherData);
    }

    private void onCommonSetup(FMLCommonSetupEvent event) {
        INTEGRATIONS.loadAllIntegrations();
    }

    private void onClientSetup(FMLClientSetupEvent event) {
        INTEGRATIONS.loadAllClientIntegrations();
    }

    private void onGatherData(GatherDataEvent event) {
        INTEGRATIONS.loadAllDataIntegrations();
    }
}
```

---

## 三、 版本范围语法 (`ModVersionRange`)

`@Integration(version = "...")` 使用 **`ModVersionRange`** 解析并校验目标模组的版本号：
- `"*"`（默认值）：匹配任意版本；
- **Maven 区间语法**（必须以 `[` 或 `(` 开头，以 `]` 或 `)` 结尾，且包含逗号 `,`）：
  - `[1.0.0,2.0.0)`：表示 $1.0.0 \le \text{version} < 2.0.0$；
  - `[1.2.0,)`：表示 $\text{version} \ge 1.2.0$（无上限）；
  - `(,2.0.0]`：表示 $\text{version} \le 2.0.0$（无下限）；
  - `[1.5.2,1.5.2]`：精确匹配版本 `1.5.2`；
- **纯版本号字符串**（如 `"1.2.0"`，不带括号）：等价于精确匹配 `1.2.0`。

---

## 四、 公开类、注解与枚举 API 详解

### 1. `@Integration` 与 `IntegrationType`

| 名称 | 类型 / 属性签名 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| **`@Integration`** | • `String value()`<br>• `String version()`<br>• `IntegrationType[] type()` | *必填*<br>`"*"`<br>`{DEDICATED_SERVER, CLIENT}` | 标注在联动类（`ElementType.TYPE`）上。`value` 为目标模组的 `modId`。注意：如果在专用服务端（Dedicated Server）运行，且 `type` 中不包含 `IntegrationType.DEDICATED_SERVER`，`IntegrationManager#load` 会自动跳过该联动类！ |
| **`IntegrationType`** | 枚举常量：<br>• `CLIENT`<br>• `DEDICATED_SERVER`<br>• `DATA` | — | 标识该集成类适用的运行环境类型。 |

### 2. `IntegrationManager`

位于 `dev.anvilcraft.lib.v2.integration.IntegrationManager`。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public IntegrationManager(String modId)` | `IntegrationManager` | 创建绑定到宿主模组 `modId` 的集成管理器。 |
| `public void compileContent()` | `void` | 从 `LoadingModList.get().getModFileById(this.modId)` 读取 `ModFileScanData`，扫描所有 `@Integration` 类并构建 `IntegrationInstance` 映射表。 |
| `public void loadAllIntegrations()` | `void` | 遍历所有已声明的目标 `modId`，若该模组当前已加载且版本匹配，实例化集成类并调用其无参 **`apply()`** 方法。 |
| `public void loadAllClientIntegrations()` | `void` | 遍历所有已加载且版本匹配的目标模组，实例化集成类并调用其无参 **`applyClient()`** 方法。 |
| `public void loadAllDataIntegrations()` | `void` | 遍历所有已加载且版本匹配的目标模组，实例化集成类并调用其无参 **`applyData()`** 方法。 |
| `public void load(String modid, ModInfo info)`<br>`public void loadClient(String modid, ModInfo info)`<br>`public void loadData(String modid, ModInfo info)` | `void` | 针对单个指定 `modid` 与 `ModInfo` 执行通用、客户端或数据生成集成方法。 |

### 3. `IntegrationInstance`、`ModVersionRange` 与 `IntegrationHook`

| 类名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| **`IntegrationInstance`** | • `public IntegrationInstance(String modid, ModVersionRange versionRange, String className, List<IntegrationType> types)`<br>• `public boolean is(ModInfo mod)`：判断 `mod.getModId()` 与 `mod.getVersion()` 是否匹配<br>• `public void newInstance()`：通过无参构造器反射创建单例并查找 `apply` / `applyClient` / `applyData` 的 `MethodHandle`<br>• `public void invoke()` / `invokeClient()` / `invokeData()`<br>• `public boolean containsType(IntegrationType type)` | 封装单个 `@Integration` 类的元数据与 `MethodHandle` 调用句柄。 |
| **`ModVersionRange`** | • `public static final ModVersionRange ANY`<br>• `public static ModVersionRange of(@Nullable String spec)`<br>• `public boolean contains(ArtifactVersion version)` / `contains(String version)` | Maven 版本区间解析与比较器。 |
| **`IntegrationHook`** | `public static void setModEventBus(IEventBus bus)` / `getModEventBus()`<br>`public static void setModContainer(ModContainer container)` / `getModContainer()` | 静态上下文持有器，供集成类在需要访问当前宿主模组的 `IEventBus` 或 `ModContainer` 时读取。 |
