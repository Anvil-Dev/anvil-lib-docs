---
title: 文档
prev: false
next: false
---

# AnvilLib

[![Minecraft](https://img.shields.io/badge/Minecraft-26.1-green.svg)](https://minecraft.net/)
[![Maven Central](https://img.shields.io/maven-central/v/dev.anvilcraft.lib/anvillib-neoforge-26.1)](https://central.sonatype.com/search?q=anvillib)
[![NeoForge](https://img.shields.io/badge/NeoForge-26.1.x-orange.svg)](https://neoforged.net/)
[![License](https://img.shields.io/badge/License-MIT%20License-blue.svg)](https://opensource.org/licenses/MIT)

**AnvilLib** 是一个由 [Anvil Dev](https://github.com/Anvil-Dev) 开发的 NeoForge 模组库，为 Minecraft 模组开发者提供一系列实用的工具和框架。

## 特性

AnvilLib 采用模块化设计，包含以下功能模块：

| 模块                        | 说明              |
|---------------------------|-----------------|
| **Config**                | 基于注解的配置系统       |
| **Codec**                 | 数据编解码与网络序列化工具   |
| **Integration**           | 模组兼容性集成框架       |
| **Network**               | 网络通信与数据包自动注册框架  |
| **Recipe**                | 世界内配方系统         |
| **Moveable Entity Block** | 可被活塞推动的方块实体支持   |
| **Multiblock**            | 动态多方块系统         |
| **Registrum**             | 简化的注册系统         |
| **Util**                  | 可共享的工具方法        |
| **Wheel**                 | 轮盘菜单客户端 API     |
| **Rendering**             | 功能不多的渲染库        |
| **Main**                  | 聚合模块（包含全部子模块）   |
| **版本差分**                  | 版本间 API 变更与迁移指南 |

## 依赖引入

### Gradle (Groovy DSL)

```groovy
repositories {
    mavenCentral() // 本项目已经上传至 Maven Central
}

dependencies {
    // 完整库
    implementation "dev.anvilcraft.lib:anvillib-neoforge-26.1:2.0.0"

    // 或按需引入单独模块
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
}
```

### Gradle (Kotlin DSL)

```kotlin
repositories {
    mavenCentral() // 本项目已经上传至 Maven Central
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-26.1:2.0.0")

    // 按需引入示例
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
}
```

> 版本号建议与项目发布版本保持一致（当前工程配置为 `mod_version=2.0.0`）。

## 构建项目

```bash
# 克隆仓库
git clone https://github.com/Anvil-Dev/AnvilLib.git
cd AnvilLib

# macOS / Linux 构建
./gradlew build

# Windows PowerShell / CMD 构建
gradlew.bat build
```

## 许可证

本项目采用 [MIT License](https://www.opensource.org/licenses/MIT) 许可证。

Registrum 模块部分代码基于 [Registrate](https://github.com/tterrag1098/Registrate)，遵循 Mozilla Public License 2.0。

## 作者

- **Gugle** - 主要开发者

## 相关链接

- [GitHub 仓库](https://github.com/Anvil-Dev/AnvilLib)
- [问题反馈](https://github.com/Anvil-Dev/AnvilLib/issues)
