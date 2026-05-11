---
title: Registrum 注册
prev: false
next: false
---

# 注册系统模块 <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="changed: 1.21.2 / 1.21.4 / 1.21.9 / 1.21.11 / 26.1" />

包 `dev.anvilcraft.lib.v2.registrum` 提供了一套基于流式构建器的声明式注册系统，大幅简化 Minecraft
模组中物品、方块、实体、方块实体、菜单、流体等的注册与数据生成流程。

::: info
本模块部分代码基于 [Registrate](https://github.com/tterrag1098/Registrate)，遵循 Mozilla Public License 2.0。
:::

## 架构概览

1. **入口** — `Registrum.create("modid")` 创建实例，自动注册事件总线
2. **构建器** — 流式 API 链式声明注册项（`BlockBuilder`、`ItemBuilder` 等）
3. **条目** — 注册完成后获得类型安全的引用（`BlockEntry<T>`、`ItemEntry<T>` 等）
4. **数据生成** — 内建模型、战利品表、配方、标签、语言文件生成器

## 文档索引

| 文档                            | 内容                                                                |
|-------------------------------|-------------------------------------------------------------------|
| [核心 API](./core)              | `Registrum`、`AbstractRegistrum` 核心方法、事件生命周期                       |
| [构建器](./builders)             | `Builder` 接口、`BlockBuilder`、`ItemBuilder`                         |
| [实体与菜单构建器](./entity-builders) | `BlockEntityBuilder`、`EntityBuilder`、`MenuBuilder`、`FluidBuilder` |
| [条目类型](./entries)             | `RegistryEntry`、`ItemProviderEntry`、`BlockEntry`、`ItemEntry` 等    |
| [数据生成](./datagen)             | `GeneratorType`、Provider 类型、1.21.1→26.1 迁移                        |
| [变更日志](./changelog)           | 各版本的 API 变更、新增、废弃和移除记录                                            |

## 快速开始

```java
public static final Registrum REGISTRUM = Registrum.create("mymod");

public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
    .object("my_block")
    .block(MyBlock::new)
        .simpleItem()           // 自动创建 BlockItem
        .lang("My Block")
        .tag(BlockTags.MINEABLE_WITH_PICKAXE)
        .register();

public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
    .object("my_item")
    .item(MyItem::new)
        .tab(CreativeModeTabs.TOOLS)
        .register();
```

## 依赖管理

### Gradle (Groovy DSL)

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:2.0.0"
}
```

### Gradle (Kotlin DSL)

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-26.1:2.0.0")
}
```

### 传递依赖

Registrum 模块内部依赖以下 AnvilLib 子模块：

- `anvillib-util` — 工具方法（`NonNullSupplier`、`NonNullFunction` 等）
- `anvillib-config` — 配置系统（用于生成器配置）

## 核心概念

### object() 名称状态

`object("name")` 设置的是**持续状态**，后续构建器调用会沿用该名称直到下次 `object()` 调用。

```java
// 推荐：每个条目显式 object()
REGISTRUM.object("my_block").block(MyBlock::new).register();
REGISTRUM.object("my_item").item(MyItem::new).register();

// 也可：连续使用相同名称
REGISTRUM.object("my_block")
    .block(MyBlock::new).register()  // 注册方块
    .object("my_block")              // 名称为 "my_block"（BlockEntry 不改变状态）
    .blockEntity(MyBE::new).register(); // 同名的方块实体
```

### register() vs build()

- `register()` — 完成注册链，返回 `RegistryEntry`（终止构建器）
- `build()` — 等同于 `register()` 但返回 Parent 对象（继续链式调用）

```java
// register() → 获得 BlockEntry
BlockEntry<MyBlock> entry = builder.register();

// build() → 返回父级，可继续配置
BlockBuilder<...> parent = builder.blockEntity(MyBE::new)
    .renderer(MyRenderer::new)
    .build(); // 返回 BlockBuilder，可继续 .lang() .tag() 等
```

## 错误码与故障排查

| 错误                                                                 | 原因                                            | 解决                                                 |
|--------------------------------------------------------------------|-----------------------------------------------|----------------------------------------------------|
| `"Current name not set"`                                           | 未调用 `object()` 即在 `AbstractRegistrum` 上调用构建方法 | 先调用 `object("name")`                               |
| `"Unknown registration <name> for type <registry>"`                | `get(name, type)` 找不到对应注册项                    | 确保 `object(name)` 和构建器调用在 `get()` 之前               |
| `"Cannot get data provider before datagen is started"`             | 在非 datagen 阶段调用 `getDataProvider()`           | 仅在 `GatherDataEvent` 期间调用                          |
| `"Cannot add data generator after construction of root generator"` | `addDataGenerator` 在 provider 构建之后调用          | 在 `GatherDataEvent` 前注册所有 data generator           |
| `"Attempt to get non IController..."` (Multiblock)                 | 控制器未注册且方块未实现 `IController`                    | 调用 `ControllerRecord.register(controller)`         |
| `"Failed to register eventListeners for mod"`                      | `Registrum.create()` 找不到对应 ModContainer       | 检查 modId 拼写，确保模组已正确加载                              |
| `"Found unused register callbacks"` (dev)                          | 部分注册回调引用的条目从未被注册                              | 检查所有 `addRegisterCallback()` 调用是否有对应的 `register()` |

## 版本兼容性

| 特性 | 1.21.1 | 1.21.2–1.21.11 | 26.1 | 说明 |
|------|--------|----------------|------|------|
| 核心 Builder API | ✅ | ✅ | ✅ | Block/Item/Entity/BlockEntity/Menu/Fluid 构建器通用 |
| `GeneratorType` 接口 | — | ✅ | ✅ | 1.21.2 引入 |
| `providers/generators/` 子包 | — | — (1.21.4+) | ✅ | 1.21.4 引入 |
| 旧版 `RegistrumBlockstateProvider` | ✅ | ✅ (至 1.21.3) | — | 1.21.4 起替换为 `RegistrumBlockModelGenerator` |
| nullness 包归属 | `util.nullness` | `registrum.util.nullness` | `util.nullness` | 随 `module.util` 存在状态变化 |
| `NonNullSupplier` 导入路径 | `v2.util.nullness` | `v2.registrum.util.nullness` | `v2.util.nullness` | |
| BIOME 构建器 | <Badge type="warning" text="commented" /> | <Badge type="warning" text="commented" /> | <Badge type="warning" text="commented" /> | 三版本均被注释，未启用 |

## 注意事项

- 注册操作应在模组构造阶段完成（`@Mod` 构造函数或 `FMLCommonSetupEvent` 之前）
- `object(String)` 设置的名称持续生效直到下次调用
- `skipErrors(true)` 仅在开发环境有效，生产环境会自动忽略
- 线程安全：`AbstractRegistrum` 并非线程安全，所有注册操作应在主线程完成
- 条目名称为全局唯一（在 modId 命名空间内），重复注册同名条目会覆盖前一个
