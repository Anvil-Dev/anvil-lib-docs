---
title: Documentation
prev: false
next: false
---

# AnvilLib

[![Minecraft](https://img.shields.io/badge/Minecraft-26.1-green.svg)](https://minecraft.net/)
[![Maven Central](https://img.shields.io/maven-central/v/dev.anvilcraft.lib/anvillib-neoforge-26.1)](https://central.sonatype.com/search?q=anvillib)
[![NeoForge](https://img.shields.io/badge/NeoForge-26.1.x-orange.svg)](https://neoforged.net/)
[![License](https://img.shields.io/badge/License-MIT%20License-blue.svg)](https://opensource.org/licenses/MIT)

**AnvilLib** is a NeoForge mod library developed by [Anvil Dev](https://github.com/Anvil-Dev), providing a collection of
practical utilities and frameworks for Minecraft mod developers.

## Features

AnvilLib adopts a modular design with the following functional modules:

| Module                    | Description                                                       |
|---------------------------|-------------------------------------------------------------------|
| **Config**                | Annotation-based configuration system                             |
| **Codec**                 | Data codec and network serialization utilities                    |
| **Integration**           | Mod compatibility integration framework                           |
| **Network**               | Network communication and automatic packet registration framework |
| **Recipe**                | In-world recipe system                                            |
| **Moveable Entity Block** | Piston-movable block entity support                               |
| **Multiblock**            | Dynamic multiblock system                                         |
| **Registrum**             | Simplified registration system                                    |
| **Util**                  | Shareable utility methods                                         |
| **Wheel**                 | Radial menu client API                                            |
| **Rendering**             | Lightweight rendering library                                     |
| **Sync**                  | Declarative field synchronization system                          |
| **Font**                  | SDF font rendering system                                         |
| **Collision**             | AABB/Triangle SAT collision detection                             |
| **Space Select**          | Visual space selection system                                     |
| **Main**                  | Aggregate module (includes all submodules)                        |
| **Version Diff**          | Version-to-version API changes and migration guide                |

## Dependency Setup

### Gradle

:::code-group

```groovy [Groovy DSL]
repositories {
    mavenCentral() // This project has been published to Maven Central
    maven { url = "https://server.cjsah.net:1002/maven/" } // Use this if you need the latest builds
    // If your module uses interface injection, NeoForge's MavenCentral mirror is incomplete;
    // you need to use the exclusiveContent format below:
    exclusiveContent {
        forRepositories(
                // Choose one of the following:
                mavenCentral()
                maven { // Anvil Lib
                    name = "Cjsah Maven"
                    url = "https://server.cjsah.net:1002/maven/"
                }
        )
        filter {
            includeGroup "dev.anvilcraft.lib"
        }
    }
}

dependencies {
    // Full library
    implementation "dev.anvilcraft.lib:anvillib-neoforge-26.1:2.0.0"

    // Or include individual modules as needed
    implementation "dev.anvilcraft.lib:anvillib-config-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-codec-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-integration-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-multiblock-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-network-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-recipe-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-util-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-wheel-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-rendering-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-sync-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-font-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-collision-neoforge-26.1:2.0.0"
    implementation "dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0"
}
```

```kotlin [Kotlin DSL]
repositories {
    mavenCentral() // This project has been published to Maven Central
    maven("https://server.cjsah.net:1002/maven/") // Use this if you need the latest builds
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-26.1:2.0.0")

    // Example: include only what you need
    implementation("dev.anvilcraft.lib:anvillib-config-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-codec-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-integration-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-moveable-entity-block-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-multiblock-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-network-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-util-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-wheel-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-rendering-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-font-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-collision-neoforge-26.1:2.0.0")
    implementation("dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0")
}
```

:::

::: tip
It is recommended to keep the version number consistent with the project release version (the current project
configuration is `mod_version=2.0.0`).
:::

## Building the Project

```bash
# Clone the repository
git clone https://github.com/Anvil-Dev/AnvilLib.git
cd AnvilLib

# Build on macOS / Linux
./gradlew build

# Build on Windows PowerShell / CMD
gradlew.bat build
```

## License

This project is licensed under the [MIT License](https://www.opensource.org/licenses/MIT).

Portions of the Registrum module are based on [Registrate](https://github.com/tterrag1098/Registrate), licensed under
the Mozilla Public License 2.0.

## Author

- **Gugle** - Primary Developer
- **QiuShui1012** - Multiblock, Util, Network Module Contributor
- **ZhuRuoLing** - Rendering Module Contributor
- **LouisQuepierts** - Rendering Module Contributor
- **MercuryGryph** - Wheel Module Contributor

## Related Links

- [GitHub Repository](https://github.com/Anvil-Dev/AnvilLib)
- [Issue Tracker](https://github.com/Anvil-Dev/AnvilLib/issues)
