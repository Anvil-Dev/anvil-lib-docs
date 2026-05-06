---
title: Registrum 变更日志
prev: false
next: false
---

# 变更日志 <Badge type="tip" text=">=1.21.1" />

本文档记录了 Registrum 模块各版本间的 API 变更。

---

## v2.0 (26.1) <Badge type="tip" text="current" />

### 新增 (Added)

| API                                       | 类型       | 说明                                                 |
|-------------------------------------------|----------|----------------------------------------------------|
| `GeneratorType<T>`                        | 接口       | 标记接口，替代匿名 `String` 生成器类型                           |
| `ProviderType.RECIPE_RUNNER`              | Provider | 配方运行器，替代直接使用 `RECIPE`                              |
| `ProviderType.MODEL`                      | Provider | 统一模型入口，替代 `BLOCKSTATE`/`ITEM_MODEL` 独立 provider    |
| `ProviderType.ENCHANTMENT_TAGS`           | Provider | 附魔标签生成                                             |
| `ProviderType.DAMAGE_TYPE_TAGS`           | Provider | 伤害类型标签生成                                           |
| `ProviderType.FLUID_TAGS`                 | Provider | 流体标签生成                                             |
| `ProviderType.ENTITY_TAGS`                | Provider | 实体标签生成                                             |
| `RegistrumModelProvider`                  | 类        | 新的模型生成器（extends `ModelProvider`）                   |
| `RegistrumBlockModelGenerator`            | 类        | 新的方块模型生成器（extends `BlockModelGenerators`）          |
| `RegistrumItemModelGenerator`             | 类        | 新的物品模型生成器（extends `ItemModelGenerators`）           |
| `RegistrumLegacyBlockModelBuilder`        | 类        | 旧版方块模型构建器                                          |
| `RegistrumRecipeRunner`                   | 类        | 配方运行器（extends `RecipeProvider.Runner`）             |
| `RegistrumDatapackProvider`               | 类        | 数据包动态注册支持                                          |
| `DataProviderInitializer.addDependency()` | 方法       | Provider 依赖声明                                      |
| `ProviderType.createGenerator(String)`    | 方法       | 从 ProviderType 创建 GeneratorType                    |
| `GeneratorType` 组合模式                      | 模式       | `RECIPE = RECIPE_RUNNER.createGenerator("recipe")` |
| `@FieldsAreNonnullByDefault`              | 注解       | FieldsAreNonnullByDefault 支持（从 Registrate 迁移）      |

### 修改 (Changed)

| API                             | 变更前 (1.21.1)                          | 变更后 (26.1)                                          | 影响                                       |
|---------------------------------|---------------------------------------|-----------------------------------------------------|------------------------------------------|
| `ProviderType.BLOCKSTATE`       | 直接使用 `RegistrumBlockstateProvider`    | `MODEL.createGenerator("blockstate")`               | <Badge type="danger" text="breaking" />  |
| `ProviderType.ITEM_MODEL`       | 直接使用 `RegistrumItemModelProvider`     | `MODEL.createGenerator("item_model")`               | <Badge type="danger" text="breaking" />  |
| `ProviderType.RECIPE`           | 直接使用 `RegistrumRecipeProvider`        | `RECIPE_RUNNER.createGenerator("recipe")`           | <Badge type="danger" text="breaking" />  |
| `RegistrumBlockstateProvider`   | 存在（extends `BlockStateProvider`）      | 移除                                                  | <Badge type="danger" text="breaking" />  |
| `RegistrumItemModelProvider`    | 存在（extends `ItemModelProvider`）       | 移除                                                  | <Badge type="danger" text="breaking" />  |
| `RegistrumRecipeProvider`       | extends `RecipeProvider`              | extends `RecipeProvider`, implements `RecipeOutput` | <Badge type="warning" text="behavior" /> |
| `RegistrumDataProvider.Context` | 包含 `ExistingFileHelper`               | 不含 `ExistingFileHelper`，直接使用 `PackOutput`           | <Badge type="danger" text="breaking" />  |
| 生成器包结构                          | `providers/RegistrumXxxProvider.java` | `providers/generators/RegistrumXxxGenerator.java`   | <Badge type="info" text="refactor" />    |

### 废弃 (Deprecated)

| API                                           | 说明                                |
|-----------------------------------------------|-----------------------------------|
| 旧版 `register(String, NonNullBiFunction, ...)` | 已被 `SimpleServerDataFactory` 模式替代 |

### 移除 (Removed)

| API                                       | 说明                                 |
|-------------------------------------------|------------------------------------|
| `RegistrumBlockstateProvider`             | 替换为 `RegistrumBlockModelGenerator` |
| `RegistrumItemModelProvider`              | 替换为 `RegistrumItemModelGenerator`  |
| `RegistrumProviderDelegate`               | 不再需要，改用 GeneratorType 组合           |
| `ProviderType.Context.existingFileHelper` | 替换为 `PackOutput`                   |

### 迁移指南

```java
// 1.21.1: 旧版生成器
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumBlockstateProvider;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumItemModelProvider;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumRecipeProvider;

builder.blockstate(() -> (ctx, gen) -> { ... });
builder.model(() -> (ctx, gen) -> { ... });
builder.recipe((ctx, gen) -> { ... });

// 26.1: 新版生成器
import dev.anvilcraft.lib.v2.registrum.providers.generators.RegistrumBlockModelGenerator;
import dev.anvilcraft.lib.v2.registrum.providers.generators.RegistrumItemModelGenerator;
import dev.anvilcraft.lib.v2.registrum.providers.generators.RegistrumRecipeProvider;

// API 调用不变（AbstractRegistrum 内部已适配）
builder.blockstate(() -> (ctx, gen) -> { ... });
builder.model(() -> (ctx, gen) -> { ... });
builder.recipe((ctx, gen) -> { ... });
```

---

## v2.0 (1.21.1) <Badge type="info" text="initial" />

### 初始版本 — 全部新增

| 分类   | API                            | 说明                                                       |
|------|--------------------------------|----------------------------------------------------------|
| 入口   | `Registrum.create(String)`     | 创建 Registrum 实例                                          |
| 核心   | `AbstractRegistrum<S>`         | 注册引擎基类                                                   |
| 核心   | `Builder<R,T,P,S>`             | 构建器根接口                                                   |
| 方块   | `BlockBuilder<T,P>`            | 方块构建器                                                    |
| 物品   | `ItemBuilder<T,P>`             | 物品构建器                                                    |
| 方块实体 | `BlockEntityBuilder<T,P>`      | 方块实体类型构建器                                                |
| 实体   | `EntityBuilder<T,P>`           | 实体类型构建器                                                  |
| 菜单   | `MenuBuilder<T,SC,P>`          | 菜单类型构建器                                                  |
| 流体   | `FluidBuilder<T,P>`            | 流体构建器                                                    |
| 通用   | `NoConfigBuilder<R,T,P>`       | 无配置构建器                                                   |
| 条目   | `RegistryEntry<R,S>`           | 基础注册条目                                                   |
| 条目   | `ItemProviderEntry<R,T>`       | 物品提供条目                                                   |
| 条目   | `BlockEntry<T>`                | 方块条目                                                     |
| 条目   | `ItemEntry<T>`                 | 物品条目                                                     |
| 条目   | `BlockEntityEntry<T>`          | 方块实体条目                                                   |
| 条目   | `EntityEntry<T>`               | 实体条目                                                     |
| 条目   | `MenuEntry<T>`                 | 菜单条目                                                     |
| 条目   | `FluidEntry<T>`                | 流体条目                                                     |
| 条目   | `LazyRegistryEntry<R,T>`       | 延迟条目引用                                                   |
| 生成器  | `RegistrumBlockstateProvider`  | 方块状态提供器 (<Badge type="danger" text="removed in 26.1" />) |
| 生成器  | `RegistrumItemModelProvider`   | 物品模型提供器 (<Badge type="danger" text="removed in 26.1" />) |
| 生成器  | `RegistrumRecipeProvider`      | 配方提供器                                                    |
| 生成器  | `RegistrumLootTableProvider`   | 战利品表提供器                                                  |
| 生成器  | `RegistrumAdvancementProvider` | 进度提供器                                                    |
| 生成器  | `RegistrumDataMapProvider`     | DataMap 提供器                                              |
| 生成器  | `RegistrumLangProvider`        | 语言文件提供器                                                  |
| 生成器  | `RegistrumTagsProvider`        | 标签提供器                                                    |
| 生成器  | `RegistrumItemTagsProvider`    | 物品标签提供器                                                  |
| 生成器  | `RegistrumGenericProvider`     | 通用提供器                                                    |
| 工具   | `CreativeModeTabModifier`      | 创造标签页修改器                                                 |
| 工具   | `DataIngredient`               | 数据生成配方原料                                                 |
| 工具   | `OneTimeEventReceiver`         | 一次性事件接收器                                                 |
| 工具   | `RegistrumDistExecutor`        | 物理端分发执行器                                                 |
| 工具   | `Sequence<T>`                  | 序列构建工具                                                   |
| 工具   | `DebugMarkers`                 | 调试日志标记                                                   |

---

## 版本对比速查表

| 功能                                          | 1.21.1                                        | 26.1                                          | 备注                                      |
|---------------------------------------------|-----------------------------------------------|-----------------------------------------------|-----------------------------------------|
| `Registrum.create()`                        | ✅                                             | ✅                                             |                                         |
| `object()` / `get()` / `getAll()`           | ✅                                             | ✅                                             |                                         |
| `simple()` / `generic()`                    | ✅                                             | ✅                                             |                                         |
| `block()` / `item()`                        | ✅                                             | ✅                                             |                                         |
| `entity()` / `blockEntity()` / `menu()`     | ✅                                             | ✅                                             |                                         |
| `fluid()`                                   | ✅                                             | ✅                                             |                                         |
| `defaultCreativeTab()`                      | ✅                                             | ✅                                             |                                         |
| `addRegisterCallback()`                     | ✅                                             | ✅                                             |                                         |
| `makeRegistry()` / `makeDatapackRegistry()` | ✅                                             | ✅                                             |                                         |
| `addLang()` / `addRawLang()`                | ✅                                             | ✅                                             |                                         |
| `transform()`                               | ✅                                             | ✅                                             |                                         |
| `skipErrors()`                              | ✅                                             | ✅                                             |                                         |
| `getDataProvider()`                         | ✅                                             | ✅                                             | 内部实现变更                                  |
| `setDataGenerator()` / `addDataGenerator()` | ✅                                             | ✅                                             |                                         |
| `getDataGenInitializer()`                   | ✅                                             | ✅                                             | 26.1 支持 addDependency                   |
| `BiomeBuilder`                              | <Badge type="warning" text="commented out" /> | <Badge type="warning" text="commented out" /> | 两版本均未启用                                 |
| 方块模型生成 (`blockstate()`)                     | `RegistrumBlockstateProvider`                 | `RegistrumBlockModelGenerator`                | <Badge type="danger" text="breaking" /> |
| 物品模型生成 (`model()`)                          | `RegistrumItemModelProvider`                  | `RegistrumItemModelGenerator`                 | <Badge type="danger" text="breaking" /> |
| 配方生成 (`recipe()`)                           | `RegistrumRecipeProvider`                     | `RegistrumRecipeProvider` (via Runner)        | <Badge type="warning" text="changed" /> |
| `GeneratorType`                             | ❌                                             | ✅                                             |                                         |
| `ProviderType.createGenerator()`            | ❌                                             | ✅                                             |                                         |
| 附魔标签 `ENCHANTMENT_TAGS`                     | ❌                                             | ✅                                             |                                         |
| 伤害类型标签 `DAMAGE_TYPE_TAGS`                   | ❌                                             | ✅                                             |                                         |
| 流体标签 `FLUID_TAGS`                           | ❌                                             | ✅                                             |                                         |
| 实体标签 `ENTITY_TAGS`                          | ❌                                             | ✅                                             |                                         |
| `DataProviderInitializer.addDependency()`   | ❌                                             | ✅                                             |                                         |
