---
title: Util 工具
prev: false
next: false
---

# AnvilLib Util 工具库文档 <Badge type="tip" text="1.21.1" /> <Badge type="info" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

::: warning Availability
本模块在 Minecraft **1.21.1** 和 **26.1** 版本中作为独立模块存在。1.21.2 至 1.21.11 版本中因开发产能限制，`module.util` 未作为独立模块发布。在此期间，`nullness` 函数式接口（`NonNullSupplier` 等）被内嵌到 `module.registrum` 中（路径 `dev.anvilcraft.lib.v2.registrum.util.nullness`），其余工具类不可用。
:::

AnvilLib Util 是一个 Minecraft 模组开发辅助库，提供大量常用工具类、序列化接口、UI 滚动辅助、谓词系统及组件渲染工具。

本目录包含以下模块的文档：

- **核心工具**：`Lazy`、集合与列表工具、数学工具、通用工具
- **方块形状工具**：`ShapeUtil`（含多线程合并、旋转镜像等）
- **物品/物品栈工具**：`InventoryUtil`、`UnlimitedItemStack`
- **谓词系统**：`NbtPredicate`、`ItemPredicate`、`BlockStatePredicate` 等
- **UI 滚动**：`Scrollable`
- **环境与分发**：`DistExecutor`、`ClientTickRecorder`
- **文本组件**：`ComponentUtil`、`MultilineComponentHelper`、`IComponentInfo`
- **空值安全**：`NonNull*` / `Nullable*` 函数式接口与注解

点击左侧目录浏览各模块详细说明。
