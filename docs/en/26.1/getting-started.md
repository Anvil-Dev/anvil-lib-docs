# Dependencies & Build Setup (`module.main`)

<BranchContextCard branch="26.1" />

This section explains how to configure Maven repositories, add `AnvilLib` (either the aggregate bundle or individual submodules), and enable Interface Injection in a Minecraft 26.1.2 (NeoForge) mod project.

---

## 1. Configuring Maven Repositories (Critical)

Official `AnvilLib` releases are published to both `Maven Central` and `Cjsah Maven`. Because **the NeoForge Maven mirror does not completely sync all artifacts and metadata from Maven Central**, relying on default repository order causes Gradle to fail when resolving `AnvilLib` (especially `interfaceInjectionData` or transitive submodule dependencies).

Therefore, whether using `Cjsah Maven` or `Maven Central`, you must pin `dev.anvilcraft.lib` to the chosen repository using Gradle's `exclusiveContent` filter. **`Cjsah Maven` is strongly recommended** for the most up-to-date sync.

### 1. Recommended: Using Cjsah Maven (`build.gradle.kts`)

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

### 2. Groovy DSL (`build.gradle`)

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

### 3. Alternative: Official Releases from Maven Central

If using only official releases on Maven Central, you must still wrap `mavenCentral()` in `exclusiveContent` so requests are not intercepted by NeoForge Maven:

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

## 2. Adding Dependencies

### Option A: Aggregate `main` Module (Recommended for Most Mods)

`anvillib-neoforge-26.1` is the aggregate distribution module, re-exporting all 20 feature submodules (excluding `test`) via `slimJarJar` and `api`.

If your code directly calls interface-injected extension methods from `font`, `moveable-entity-block`, or `recipe` on vanilla classes (`GuiGraphicsExtractor`, `PistonMovingBlockEntity`, `RecipeManager` / `RecipeMap`), you must also declare `interfaceInjectionData` in `dependencies`:

```kotlin
val anvillibVersion = "2.0.0" // Replace with the actual release version

dependencies {
    // Include the aggregate bundle containing all submodules
    implementation("dev.anvilcraft.lib:anvillib-neoforge-26.1:$anvillibVersion")
    jarJar("dev.anvilcraft.lib:anvillib-neoforge-26.1:$anvillibVersion")

    // Add these as needed if using interface-injected extension methods at compile time:
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-font-neoforge-26.1:$anvillibVersion")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.1:$anvillibVersion")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.1:$anvillibVersion")
}
```

### Option B: Individual Submodules on Demand

If you only need specific `AnvilLib` features (such as `config`, `registrum`, or `codec`), you can depend on those submodules individually:

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-26.1:$anvillibVersion")
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-26.1:$anvillibVersion")
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:$anvillibVersion")

    // If using @Sync / @LazySync for automatic field sync, also configure the compile-time processor (see Sync section):
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-26.1:$anvillibVersion")
}
```

---

## 3. `module.main` Structure & API

### 1. Exported Submodules

`anvillib-neoforge-26.1`'s `build.gradle` packages and exports the following 20 modules:

| Category | Included Module ArtifactIds |
| :--- | :--- |
| **Core & Serialization** | `anvillib-util-neoforge-26.1`, `anvillib-codec-neoforge-26.1`, `anvillib-math-neoforge-26.1` |
| **Registration, Config & Compat** | `anvillib-registrum-neoforge-26.1`, `anvillib-config-neoforge-26.1`, `anvillib-integration-neoforge-26.1` |
| **Networking & Cross-Side** | `anvillib-network-neoforge-26.1`, `anvillib-rpc-neoforge-26.1`, `anvillib-sync-neoforge-26.1` |
| **World Mechanics & Recipes** | `anvillib-recipe-neoforge-26.1`, `anvillib-multiblock-neoforge-26.1`, `anvillib-explosion-neoforge-26.1`, `anvillib-moveable-entity-block-neoforge-26.1`, `anvillib-space-select-neoforge-26.1`, `anvillib-collision-neoforge-26.1` |
| **Client Rendering & UI** | `anvillib-rendering-neoforge-26.1`, `anvillib-cube-neoforge-26.1`, `anvillib-font-neoforge-26.1`, `anvillib-ui-neoforge-26.1`, `anvillib-wheel-neoforge-26.1` |

> **Notes**:
> 1. `anvillib-sync-processor-neoforge-26.1` is a compile-time bytecode injection tool and is not bundled in the runtime aggregate jar.
> 2. `anvillib-test-neoforge-26.1` and `renderdoc-loader-internal` are internal to `AnvilLib` development/debugging and are not published in runtime aggregate artifacts.

### 2. `dev.anvilcraft.lib.v2.AnvilLib` Class

`module.main` contains only a single `@ApiStatus.Internal` placeholder main class:

| Class | Signature | Description |
| :--- | :--- | :--- |
| `AnvilLib` | `@ApiStatus.Internal public class AnvilLib` | Internal placeholder class for the aggregate module with no public fields or static methods; downstream mods should not reference it directly and should use the APIs under each submodule package. |
