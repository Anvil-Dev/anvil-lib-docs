---
title: Registrum 注册
prev: false
next: false
---

# 注册系统模块

包 `dev.anvilcraft.lib.v2.registrum` 提供了一套基于流式构建器的声明式注册系统，大幅简化 Minecraft 模组中物品、方块、实体、方块实体、菜单、流体等的注册与数据生成流程。

> 本模块部分代码基于 [Registrate](https://github.com/tterrag1098/Registrate)，遵循 Mozilla Public License 2.0。

## 架构概览

1. **入口** — `Registrum.create("modid")` 创建实例，自动注册事件总线
2. **构建器** — 流式 API 链式声明注册项（`BlockBuilder`、`ItemBuilder` 等）
3. **条目** — 注册完成后获得类型安全的引用（`BlockEntry<T>`、`ItemEntry<T>` 等）
4. **数据生成** — 内建模型、战利品表、配方、标签、语言文件生成器

## 文档索引

| 文档 | 内容 |
|------|------|
| [核心 API](./core) | `Registrum`、`AbstractRegistrum` 核心方法 |
| [构建器](./builders) | `Builder` 接口、`BlockBuilder`、`ItemBuilder` |
| [实体与菜单构建器](./entity-builders) | `BlockEntityBuilder`、`EntityBuilder`、`MenuBuilder`、`FluidBuilder` |
| [条目类型](./entries) | `RegistryEntry`、`ItemProviderEntry`、`BlockEntry`、`ItemEntry` 等 |
| [数据生成](./datagen) | `GeneratorType`、Provider 类型、模型/配方/战利品生成 |

## 快速开始

```java
public static final Registrum REGISTRUM = Registrum.create("mymod");

public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
    .object("my_block")
    .block(MyBlock::new)
        .defaultItem()
        .lang("My Block")
        .register();

public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
    .object("my_item")
    .item(MyItem::new)
        .tab(CreativeModeTabs.TOOLS)
        .register();
```

## 注意事项

- 注册操作应在模组构造阶段完成，避免在生命周期事件中动态调用
- `object(String)` 设置的名称持续生效直到下次调用
- `skipErrors(true)` 仅在开发环境有效，用于调试
