---
title: Main 聚合模块
prev: false
next: false
---

# AnvilLib 聚合模块 <Badge type="tip" text=">=1.21.1" />

该模块是 AnvilLib 的聚合模块，代表整个库的基座。它本身不包含功能代码，而是作为所有子模块的聚合入口，统一版本管理、构建发布与依赖协调。

## 项目结构

AnvilLib 采用多模块 Gradle 项目组织。根项目 `anvillib` 通过 `build.gradle` 统一配置所有子模块的构建信息。

目前已有的子模块：

| 模块名称                                           | 功能                   |
|------------------------------------------------|----------------------|
| `anvillib-config-neoforge-26.1`                | 配置系统（注解、反射、语言生成）     |
| `anvillib-codec-neoforge-26.1`                 | Codec/StreamCodec 工具 |
| `anvillib-integration-neoforge-26.1`           | 模组间集成系统              |
| `anvillib-moveable-entity-block-neoforge-26.1` | 活塞移动时保留方块实体数据        |
| `anvillib-network-neoforge-26.1`               | 网络包抽象与自动注册           |
| `anvillib-recipe-neoforge-26.1`                | 配方工具（谓词、概率物品等）       |
| `anvillib-registrum-neoforge-26.1`             | 注册系统                 |
| `anvillib-wheel-neoforge-26.1`                 | 轮盘菜单 UI 系统           |
| `anvillib-rendering-neoforge-26.1`             | 功能不多的渲染库             |
| `anvillib-multiblock-neoforge-26.1`            | 动态多方块系统              |
| `anvillib-util-neoforge-26.1`                  | 可共享的工具方法             |

所有子模块均以 `jarJar` 方式包含，即内嵌到最终发布的 Jar 中，并使用 `api` 进行依赖传递，无需模组单独依赖。
