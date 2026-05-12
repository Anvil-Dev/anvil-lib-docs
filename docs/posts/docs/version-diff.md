---
title: 版本差分
prev: false
next: false
---

# 版本差分文档

本文档记录 AnvilLib 各 Minecraft 版本之间的 API 差异、模块可用性和代码级变更，帮助开发者快速识别版本间的兼容性差异和迁移成本。

> 所有版本均属于 AnvilLib `2.0.0`，**同步并行开发**，仅编译目标 Minecraft 版本不同。部分模块因开发产能限制，未同步到全部
> Minecraft 版本。以下按版本号排列仅为检索便利，不代表发布先后顺序。

---

## 模块可用性矩阵

下表展示各模块在 12 个 Minecraft 版本中的**存在状态**。

| 模块                    | 1.21.1 | 1.21.2–1.21.11 | 26.1 | 说明                                                    |
|-----------------------|--------|----------------|------|-------------------------------------------------------|
| codec                 | ✅ 3    | ✅ 3            | ✅ 3  |                                                       |
| config                | ✅ 11   | ✅ 11           | ✅ 11 |                                                       |
| integration           | ✅ 7    | ✅ 7            | ✅ 7  |                                                       |
| collision             | —      | —              | ✅    |                                                       |
| main                  | ✅ 2    | ✅ 2            | ✅ 2  |                                                       |
| network               | ✅ 14   | ✅ 12           | ✅ 14 | 1.21.2–1.21.11 缺少 `NetworkUtil`                       |
| recipe                | ✅ 88   | ✅ 99           | ✅ 89 |                                                       |
| registrum             | ✅ 55   | ✅ 68–71        | ✅ 60 | 1.21.2+ 内嵌了 nullness 包（11 文件）                         |
| wheel                 | ✅ 20   | ✅ 22–30        | ✅ 26 |                                                       |
| moveable-entity-block | ✅ 7    | ✅ 7            | ✅ 8  |                                                       |
| **multiblock**        | ✅ 26   | —              | ✅ 26 | 因产能限制，未同步到 1.21.2–1.21.11                             |
| **util**              | ✅ 43   | —              | ✅ 43 | 因产能限制，未同步到 1.21.2–1.21.11；nullness 包内嵌到 registrum 中过渡 |
| **rendering**         | —      | —              | ✅ 19 | 仅 26.1 版本存在                                           |
| test                  | ✅ 17   | ✅ 6            | ✅ 12 |                                                       |
| **总计**                | 273    | 240–248        | 312  |                                                       |

> `—` 表示该模块在此版本范围内**不存在**。数字为 Java 源文件数。
>
> **util 模块的 nullness 包内嵌**：`module.util` 被移除的版本（1.21.2–1.21.11）中，`NonNullSupplier`、`NonNullFunction`
> 等函数式接口被临时内嵌到 `module.registrum` 的 `registrum.util.nullness` 包下，确保 Registrum 模块可独立编译。26.1 中
`module.util` 恢复为独立模块后，这些类迁回 `util.nullness`。

---

## 代码级变更对比

以下按 Minecraft 版本列出各版本与前一版本之间的**源码差异**。仅列出版本间实际存在变更的条目；无变更的版本跃迁此处省略。

### 1.21.1 → 1.21.2

编译目标变更: `[1.21.1,1.21.2)` → `[1.21.2,1.21.3)`，Parchment `2024.11.17`。

**模块可用性变更:**

- `module.multiblock` — 未同步到此版本
- `module.util` — 未同步到此版本；nullness 包内嵌到 registrum
- `module.network` — `NetworkUtil.java` 及 `util/` 包未同步（14→12 文件）
- `module.test` — Multiblock 测试、Datagen 测试、wheel/lang 未同步（17→6 文件）

**recipe 模块代码变更:**

| 文件                              | 变更                                                                                                                                               |
|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `InWorldRecipe.java`            | 新增 `placementInfo()`、`recipeBookCategory()`；移除 `canCraftInDimensions()`                                                                          |
| `InWorldRecipeBuilder.java`     | `save()` 第二参数: `ResourceLocation` → `ResourceKey<Recipe<?>>`；新增 `save(RecipeOutput, ResourceLocation)` 重载                                        |
| (新增) `IRecipeMapExtension.java` | 注入接口，提供 `anvillib$addRecipes()`                                                                                                                  |
| (新增) `RecipeMapMixin.java`      | Mixin 注入 RecipeMap                                                                                                                               |
| (新增) `ISerializer.java`         | 通用序列化接口                                                                                                                                          |
| (新增) `NumberProviderUtil.java`  | NumberProvider 工具方法                                                                                                                              |
| (新增) `component/` 包             | `BlockStatePredicate`、`ChanceBlockState`、`ChanceItemStack`、`IItemStackPredicate`、`ItemIngredientPredicate`、`ItemPredicate`、`NbtPredicate` (7 文件) |
| `init/` 包路径                     | `init/recipe/` → `init/reicpe/`（拼写错误持续至 1.21.11）                                                                                                 |

**registrum 模块代码变更:**

| 文件                         | 变更                                                                                   |
|----------------------------|--------------------------------------------------------------------------------------|
| `AbstractRegistrum.java`   | 完全重写：License 头更新、`Registration` 内部类重组、导入顺序变更                                         |
| (新增) `GeneratorType.java`  | GeneratorType 标记接口                                                                   |
| (新增) `nullness/` 包 (11 文件) | 从 `module.util` 内嵌：`NonNullSupplier`、`NonNullConsumer` 等                             |
| Builder/DataGen 方法签名       | `setDataGenerator()`/`addDataGenerator()` 使用 `GeneratorType<?>` 替代 `ProviderType<?>` |

**wheel 模块代码变更:**

| 文件                        | 变更     |
|---------------------------|--------|
| (新增) `util/MathUtil.java` | 轮盘数学工具 |

**Bug 修复:**

- Recipe: `LibRegistries.*_REGISTRY.get()` → `.getValue()` — 统一注册表查询 API

---

### 1.21.3

编译目标变更: `[1.21.3,1.21.4)`，Parchment `2024.12.07`。

**无源码差异** — 文件清单与 1.21.2 完全一致。仅编译目标适配。

---

### 1.21.4

编译目标变更: `[1.21.4,1.21.5)`，Parchment `2025.03.23`。

**registrum 模块生成器重构:**

| 文件                                 | 变更                                                                                                                              |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `RegistrumBlockstateProvider.java` | 移除 — 替换为 `generators/RegistrumBlockModelGenerator.java`                                                                         |
| `RegistrumItemModelProvider.java`  | 移除 — 替换为 `generators/RegistrumItemModelGenerator.java`                                                                          |
| (新增) `providers/generators/` 子包    | `RegistrumBlockModelGenerator`、`RegistrumItemModelGenerator`、`RegistrumLegacyBlockModelBuilder`、`RegistrumModelProvider` (4 文件) |
| `RegistrumRecipeProvider`          | 从 `providers/` 迁移到 `providers/generators/`                                                                                      |
| `RegistrumRecipeRunner`            | 同上                                                                                                                              |
| `AbstractRegistrum.java`           | License 头重格式化、移除 `RegistrumProvider` 导入、添加 `@Accessors`                                                                         |

---

### 1.21.5

编译目标变更: `[1.21.5,1.21.6)`，Parchment `2025.06.15`。

| 文件                          | 模块     | 变更                                                                                              |
|-----------------------------|--------|-------------------------------------------------------------------------------------------------|
| `LibItemSubPredicates.java` | recipe | 替换为 `LibDataComponentPredicates.java` — `ItemSubPredicate.Type` → `DataComponentPredicate.Type` |
| `LibShaders.java`           | wheel  | 替换为 `LibRenders.java` — 类重命名                                                                    |

---

### 1.21.6

编译目标变更: `[1.21.6,1.21.7)`，Parchment `2025.06.29`。

**wheel 模块渲染系统升级:**

| 文件                                 | 变更                                                                                                 |
|------------------------------------|----------------------------------------------------------------------------------------------------|
| (新增) `render/state/` 包 (5 文件)      | `RingRenderState`、`SelectionRenderState`、`LibGuiElementRenderState`、`LibQuadGuiElementRenderState` |
| (新增) `LibDynamicUniforms.java`     | GPU Uniform 动态存储 (Std140)                                                                          |
| (新增) `mixin/GuiRendererMixin.java` | GUI 渲染 Mixin                                                                                       |
| (移除) `shaders/core/ring.json`      | 替换为 Java `RingRenderState`                                                                         |
| (移除) `shaders/core/selection.json` | 替换为 Java `SelectionRenderState`                                                                    |

---

### 1.21.7

编译目标变更: `[1.21.7,1.21.8)`，Parchment `2025.07.18`。

| 文件                      | 模块      | 变更                                                                                                          |
|-------------------------|---------|-------------------------------------------------------------------------------------------------------------|
| `NetworkRegistrar.java` | network | `*Bidirectional(type, codec, handler)` → `*Bidirectional(type, codec, handler, handler)` — 增加第二个 handler 参数 |

---

### 1.21.8

编译目标变更: `[1.21.8,1.21.9)`，Parchment `2025.09.14`。**无源码差异。**

---

### 1.21.9

编译目标变更: `[1.21.9,1.21.10)`，Parchment `2025.10.05`。

| 文件                        | 模块          | 变更                                                                     |
|---------------------------|-------------|------------------------------------------------------------------------|
| `IntegrationManager.java` | integration | `LoadingModList.get()` → `FMLLoader.getCurrent().getLoadingModList()`  |
| `NetworkRegistrar.java`   | network     | 同上                                                                     |
| `AbstractRegistrum.java`  | registrum   | `!FMLLoader.isProduction()` → `!FMLLoader.getCurrent().isProduction()` |

---

### 1.21.10

编译目标变更: `[1.21.10,1.21.11)`，Parchment `2025.10.12`。

| 文件                             | 模块     | 变更                                                                                                         |
|--------------------------------|--------|------------------------------------------------------------------------------------------------------------|
| `IItemHandlerCache.java`       | recipe | 移除 — 替换为 `ItemResourceHandlerCache.java`（`I` 前缀移除、`Handler`→`ResourceHandler`）                             |
| `ItemHandlerCacheElement.java` | recipe | 替换为 `ItemResourceHandlerCacheElement.java`                                                                 |
| 缓存 API 方法                      | recipe | `getStackInSlot`→`extract`、`getSlotLimit`→`getCapacityAsInt`、`isItemValid`→`isValid`、`insertItem`→`insert` |

---

### 1.21.11

编译目标变更: `[1.21.11,26.1)`，Parchment `2025.12.20`。

| 文件   | 变更                                                                                         |
|------|--------------------------------------------------------------------------------------------|
| 全局   | `ResourceLocation` → `Identifier` 全项目迁移（适配 NeoForge 1.21.5+ 映射变更）                          |
| 影响文件 | `CodecUtil`、`StreamCodecUtil`、`InWorldRecipe`、`InWorldRecipeBuilder`、`AbstractRegistrum` 等 |

---

### 26.1

编译目标变更: `[26.1,26.2)`，无 Parchment（NeoForge 26.1 不再使用 MCP 映射）。

**模块可用性变更:**

| 模块             | 状态 | 说明                                              |
|----------------|----|-------------------------------------------------|
| **rendering**  | 新增 | 泛光后处理、UBO 框架、GUI Mixin、renderdoc-loader (19 文件) |
| **multiblock** | 同步 | 1.21.2–1.21.11 中未同步，26.1 中恢复同步 (26 文件)          |
| **util**       | 同步 | 1.21.2–1.21.11 中未同步，26.1 中恢复同步 (43 文件)          |
| **network**    | 恢复 | `NetworkUtil.java` 回归 (12→14 文件)                |
| **registrum**  | 重组 | nullness 包迁出 (−11 文件)，回到独立 `util` 模块            |

**API 重设计 (Breaking Changes):**

| 变更                                         | 模块                    | 详情                                                                                                                         |
|--------------------------------------------|-----------------------|----------------------------------------------------------------------------------------------------------------------------|
| `IMoveableEntityBlock`                     | moveable-entity-block | `clearData`/`setData` (CompoundTag) → `storeData`/`loadData` (ValueInput/ValueOutput)                                      |
| `PistonBaseBlockMixin`                     | moveable-entity-block | `anvillib$nbt` 类型: `CompoundTag` → `TagValueOutput`                                                                        |
| `IntegrationType`                          | integration           | `DATA` → `CLIENT_DATA` + `SERVER_DATA`                                                                                     |
| `IntegrationInstance`/`IntegrationManager` | integration           | `invokeData`/`loadData` → `invokeClientData`+`invokeServerData` / `loadClientData`+`loadServerData`                        |
| `InWorldRecipe`                            | recipe                | `icon` 字段: `ItemStack` → `ItemStackTemplate`；Serializer 不再实现 `RecipeSerializer`；`assemble()` 移除 `HolderLookup.Provider` 参数 |
| `InWorldRecipeBuilder`                     | recipe                | `icon`/`spawnItem()` 使用 `ItemStackTemplate`；新增 `defaultId()`                                                               |
| `AbstractRegistrum`                        | registrum             | nullness 导入路径迁回 `dev.anvilcraft.lib.v2.util.nullness.*`                                                                    |

**新增特性:**

| 新增项                                      | 模块                    |
|------------------------------------------|-----------------------|
| `AnvilLibMoveableEntityBlock`            | moveable-entity-block |
| `WheelSelectionEffect` 枚举                | wheel                 |
| `AnnularSectorRenderState`               | wheel                 |
| `LibEntityTypeTags`                      | recipe                |
| `IRecipeMapExtension` + `RecipeMapMixin` | recipe                |
| 整个 `rendering` 模块                        | rendering             |

---

## util.nullness 导入路径变迁

由于 `module.util` 在各版本中的存在状态不同，`NonNullSupplier` 等类的导入路径存在变化：

| 版本范围           | 导入路径                                                                    |
|----------------|-------------------------------------------------------------------------|
| 1.21.1         | `import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;`           |
| 1.21.2–1.21.11 | `import dev.anvilcraft.lib.v2.registrum.util.nullness.NonNullSupplier;` |
| 26.1           | `import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;`（恢复）       |

受影响的类（共 9 个）：`NonNullSupplier`、`NonNullConsumer`、`NonNullBiConsumer`、`NonNullFunction`、`NonNullBiFunction`、
`NonNullUnaryOperator`、`NonnullType`、`NullableType`、`NullableSupplier`。

> 1.21.2 起额外包含 `FieldsAreNonnullByDefault` 注解。

---

## API 稳定性评级

基于各版本的变更频率和影响范围：

| API                                                 | 评级                                       | 说明                                           |
|-----------------------------------------------------|------------------------------------------|----------------------------------------------|
| `CodecUtil` / `StreamCodecUtil`                     | <Badge type="tip" text="stable" />       | 仅 1.21.11 发生过 ResourceLocation→Identifier 迁移 |
| `ConfigManager` / `@Config` 注解                      | <Badge type="tip" text="stable" />       | 无 API 变更                                     |
| `IPacket` 接口体系                                      | <Badge type="tip" text="stable" />       | 无 API 变更                                     |
| Registrum Builder（Block/Item/Entity 等）              | <Badge type="tip" text="stable" />       | 无 API 变更                                     |
| `MultiblockDefinition` / `DynamicMultiblockManager` | <Badge type="tip" text="stable" />       | API 一致，仅可用版本不同（1.21.1、26.1）                  |
| `NetworkRegistrar`                                  | <Badge type="warning" text="volatile" /> | 1.21.7 (双向)、1.21.9 (FMLLoader)               |
| `InWorldRecipe`                                     | <Badge type="warning" text="volatile" /> | 1.21.2、1.21.11、26.1 各有变更                     |
| `InWorldRecipeBuilder`                              | <Badge type="warning" text="volatile" /> | 同上                                           |
| `AbstractRegistrum`                                 | <Badge type="warning" text="volatile" /> | 几乎所有版本跃迁都有内部变更                               |
| `WheelMenuBuilder`                                  | <Badge type="warning" text="volatile" /> | 1.21.5、1.21.6、26.1 各有变更                      |
| `IMoveableEntityBlock`                              | <Badge type="danger" text="26.1 重设计" />  | 26.1 完全重设计                                   |
| `IntegrationType`                                   | <Badge type="danger" text="26.1 拆分" />   | DATA → CLIENT_DATA + SERVER_DATA             |
| util 工具类（Lazy/MathUtil/ShapeUtil 等）                 | <Badge type="info" text="可用版本有限" />      | 仅 1.21.1 和 26.1 中有独立 `module.util`           |
| nullness 函数式接口                                      | <Badge type="warning" text="导入路径变化" />   | 3 种导入路径                                      |
| rendering 模块全部 API                                  | <Badge type="tip" text="26.1+" />        | 仅 26.1 存在                                    |

---

## 依赖坐标

所有版本共享 Groovy DSL 模式：

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-<module>-neoforge-<mc_version>:2.0.0"
}
```

示例：`dev.anvilcraft.lib:anvillib-registrum-neoforge-1.21.1:2.0.0`（每个版本的 `<mc_version>` 后缀与版本号一致）

| 模块 Artifact                                     | 1.21.1 | 1.21.2–1.21.11 | 26.1 |
|-------------------------------------------------|--------|----------------|------|
| `anvillib-neoforge-<ver>`                       | ✅      | ✅              | ✅    |
| `anvillib-codec-neoforge-<ver>`                 | ✅      | ✅              | ✅    |
| `anvillib-config-neoforge-<ver>`                | ✅      | ✅              | ✅    |
| `anvillib-integration-neoforge-<ver>`           | ✅      | ✅              | ✅    |
| `anvillib-moveable-entity-block-neoforge-<ver>` | ✅      | ✅              | ✅    |
| `anvillib-network-neoforge-<ver>`               | ✅      | ✅              | ✅    |
| `anvillib-recipe-neoforge-<ver>`                | ✅      | ✅              | ✅    |
| `anvillib-registrum-neoforge-<ver>`             | ✅      | ✅              | ✅    |
| `anvillib-wheel-neoforge-<ver>`                 | ✅      | ✅              | ✅    |
| `anvillib-test-neoforge-<ver>`                  | ✅      | ✅              | ✅    |
| `anvillib-multiblock-neoforge-<ver>`            | ✅      | —              | ✅    |
| `anvillib-util-neoforge-<ver>`                  | ✅      | —              | ✅    |
| `anvillib-rendering-neoforge-<ver>`             | —      | —              | ✅    |
