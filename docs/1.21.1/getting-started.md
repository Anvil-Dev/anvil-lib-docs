# 依赖引入与构建配置 (`module.main`)

<BranchContextCard branch="1.21.1" />

本节介绍如何在 Minecraft 1.21.1（NeoForge `21.1.x`）模组工程中配置 Maven 仓库、引入 `AnvilLib` 聚合包或按需引入独立子模块，并开启接口注入（Interface Injection）支持。

---

## 一、 配置 Maven 仓库（关键）

`AnvilLib` 的正式版会同步发布至 `Maven Central` 与 `Cjsah Maven`。由于 **NeoForge Maven 镜像仓库并未完整同步 Maven Central 的全部构件与附加元数据**，直接依赖普通仓库顺序会导致 Gradle 在解析 `AnvilLib`（特别是 `interfaceInjectionData` 接口注入配置或子模块传递依赖）时拉取失败。

因此，无论使用 `Cjsah Maven` 还是 `Maven Central`，都必须使用 Gradle 的 `exclusiveContent` 过滤组将 `dev.anvilcraft.lib` 锁定到指定仓库。**强烈推荐使用 `Cjsah Maven` 仓库**以获得最及时的版本同步。

### 1. 推荐配置：使用 Cjsah Maven (`build.gradle.kts`)

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}
```

### 2. Groovy DSL 写法 (`build.gradle`)

```groovy
repositories {
    exclusiveContent {
        forRepository {
            maven {
                name = "Cjsah Maven"
                url = "https://server.cjsah.net:1002/maven/releases"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}
```

### 3. 备选配置：从 Maven Central 获取正式版

若仅使用已上架 Maven Central 的正式版，同样必须将 `mavenCentral()` 包裹在 `exclusiveContent` 中，防止请求被排在前面的 NeoForge Maven 拦截：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            mavenCentral()
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
}
```

---

## 二、 引入依赖

### 方案 A：引入 `main` 聚合模块（推荐大多数模组使用）

`anvillib-neoforge-1.21.1` 是聚合发行模块，内部通过 `slimJarJar` 与 `api` 重导出了除 `test` 以外的全部 20 个功能子模块。

如果在代码中需要直接调用 `font`、`moveable-entity-block` 或 `recipe` 模块注入到原版类（如 `GuiGraphics`、`PistonMovingBlockEntity`、`RecipeManager`）上的扩展接口方法，还需要在 `dependencies` 中声明对应的 `interfaceInjectionData`：

```kotlin
val anvillibVersion = "2.0.0" // 请替换为实际使用的发行版本号

dependencies {
    // 引入包含全部子模块的聚合包
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:$anvillibVersion")
    jarJar("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:$anvillibVersion")

    // 如需在编译期使用对应模块的接口注入扩展方法，按需添加以下声明：
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-font-neoforge-1.21.1:$anvillibVersion")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-1.21.1:$anvillibVersion")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-1.21.1:$anvillibVersion")
}
```

### 方案 B：按需引入独立子模块

如果你只需要 `AnvilLib` 的部分功能（例如仅使用 `config`、`registrum` 或 `codec`），可以单独引入对应的子模块：

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-1.21.1:$anvillibVersion")
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-1.21.1:$anvillibVersion")
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-1.21.1:$anvillibVersion")

    // 若使用 @Sync / @LazySync 注解自动同步字段，还需引入字节码转换处理器（详见 Sync 章节）：
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-1.21.1:$anvillibVersion")
    runtimeOnly("dev.anvilcraft.lib:anvillib-sync-processor-neoforge-1.21.1:$anvillibVersion")
}
```

---

## 三、 `module.main` 模块结构与 API 说明

### 1. 聚合导出的子模块清单

`anvillib-neoforge-1.21.1` 的 `build.gradle` 打包并导出了以下 20 个模块：

| 类别 | 包含模块 ArtifactId |
| :--- | :--- |
| **基础与序列化** | `anvillib-util-neoforge-1.21.1`、`anvillib-codec-neoforge-1.21.1`、`anvillib-math-neoforge-1.21.1` |
| **注册、配置与兼容** | `anvillib-registrum-neoforge-1.21.1`、`anvillib-config-neoforge-1.21.1`、`anvillib-integration-neoforge-1.21.1` |
| **网络与跨端通信** | `anvillib-network-neoforge-1.21.1`、`anvillib-rpc-neoforge-1.21.1`、`anvillib-sync-neoforge-1.21.1` |
| **世界机制与配方** | `anvillib-recipe-neoforge-1.21.1`、`anvillib-multiblock-neoforge-1.21.1`、`anvillib-explosion-neoforge-1.21.1`、`anvillib-moveable-entity-block-neoforge-1.21.1`、`anvillib-space-select-neoforge-1.21.1`、`anvillib-collision-neoforge-1.21.1` |
| **客户端渲染与交互** | `anvillib-rendering-neoforge-1.21.1`、`anvillib-cube-neoforge-1.21.1`、`anvillib-font-neoforge-1.21.1`、`anvillib-ui-neoforge-1.21.1`、`anvillib-wheel-neoforge-1.21.1` |

### 2. `dev.anvilcraft.lib.v2.AnvilLib` 类说明

| 类名 | 签名 | 说明 |
| :--- | :--- | :--- |
| `AnvilLib` | `public class AnvilLib` | 聚合模块的占位类，不包含任何公开字段或静态方法；下游模组直接使用各子模块包下的 API 即可。 |
