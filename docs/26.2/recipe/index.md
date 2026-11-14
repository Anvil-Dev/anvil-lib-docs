# Recipe 世界内配方系统架构与构建器 (`module.recipe`)

<BranchContextCard branch="26.2" />

`module.recipe`（构件名 `anvillib-recipe-neoforge-26.2`，包名 `dev.anvilcraft.lib.v2.recipe`）提供了一套完整的数据驱动**世界内配方（In-World Recipe）**引擎。不同于原版必须在 GUI 容器或工作台网格中执行的配方，世界内配方直接在三维世界坐标 `pos` 周围检测并消耗方块、掉落物/容器物品及实体，并在世界中生成产物物品、放置/转换方块、召唤实体或产生爆炸。

本模块按功能域拆分为 6 篇子文档：
- **本篇（系统架构、InWorldRecipe 与构建器）**：详解世界内配方的核心组成、`AnvilLibRecipe`、`AnvilLibRecipeConfig`、`InWorldRecipe`、`InWorldRecipeBuilder` 及五大注册表（`LibRegistries` / `LibRecipeTypes`）。
- **[配方触发器 (IRecipeTrigger)](./triggers)**：详解 `IRecipeTrigger`、`LibRecipeTriggers`、触发优先级与自定义触发器注册。
- **[方块、物品与实体谓词 (IRecipePredicate)](./predicates)**：详解 `IRecipePredicate`、`HasBlock` / `HasBlockIngredient`、`HasItem` / `HasItemIngredient`、`HasEntity` / `HasEntityIngredient`、`SaveComponentToTag` 及逻辑组合数据组件谓词（`AndPredicate` / `OrPredicate` / `NotPredicate`）。
- **[配方输出、属性映射与批次规划 (Outcome & BatchPlan)](./outcomes)**：详解 `IRecipeOutcome`、`SpawnItem`、`SetBlock`、`BlockPropertyMapping`、`SpawnEntity`、`ProduceExplosion`、`ChooseOneOutcome`、`ApplyTagToComponent` 及容器受限批次规划器 `ItemBatchPlan`。
- **[世界状态缓存与事务提交 (Cache)](./caches)**：详解 `BlockCache`、`ItemCache`、`ItemResourceHandlerCache`、`EntityCache`、`TagCache` 及缓存槽位操作栈。
- **[配方上下文、优先级、事件与扩展接口](./context-and-events)**：详解 `InWorldRecipeContext`、`InWorldRecipeManager`、`ShapelessMatcher`、生命周期事件与 `RecipeManager` / `RecipeMap` 接口注入扩展。

---

## 一、 接入配置（含接口注入）

`module.recipe` 向原版的 `RecipeManager` 与 `RecipeMap` 注入了 `IRecipeManagerExtension` / `IRecipeMapExtension` 接口（提供 `anvillib$getInWorldRecipeManager()` 方法）。若需在代码中直接调用这些扩展方法，请在 `build.gradle.kts` 中同时配置 `interfaceInjectionData`：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.2:2.0.0")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-26.2:2.0.0")
}
```

---

## 二、 世界内配方的四大核心要素

一个 `InWorldRecipe` 实例由以下核心部分组成：

1. **触发器 (`IRecipeTrigger`)**：标识什么世界动作会触发该配方（如内置的 `anvillib_recipe:item_into_block` 物品掉入方块触发器，或下游模组注册的铁砧砸落、多方块激活触发器）。
2. **非冲突谓词列表 (`nonConflicting`) 与冲突谓词列表 (`conflicting`)**：
   - **非冲突谓词**（`predicate.getType().conflict() == false`）：只读或按固定偏移检测的条件，包括 `HasBlock`、`HasBlockIngredient`、`HasItem`、`HasEntity`；
   - **冲突谓词**（`predicate.getType().conflict() == true`）：会争抢同一池子内资源的条件，包括 `HasItemIngredient`（消耗物品）与 `HasEntityIngredient`（消耗实体）。
   - **兼容模式 (`compatible = true`) vs 不兼容模式 (`compatible = false`)**：
     - 当 `compatible = true` 时，`ShapelessMatcher.compatible` 按声明顺序贪心匹配冲突谓词；
     - 当 `compatible = false` 时（适用于多个原料谓词存在包含关系或交集的场景，如一个要求 `#c:ingots`、另一个要求 `minecraft:iron_ingot`），`ShapelessMatcher.incompatible` 使用**回溯搜索（Backtracking）**配合谓词的 `snapshot` / `rollback` 尝试不同匹配顺序，确保不会因为前一个宽泛谓词吃掉了特定物品而导致整个配方匹配失败。
3. **配方产出列表 (`outcomes`)**：当所有谓词匹配通过并在 `assemble(context)` 中消费完原料后，依次按各自概率执行的 `IRecipeOutcome` 列表（如 `SpawnItem`、`SetBlock`、`SpawnEntity`、`ProduceExplosion`、`ChooseOneOutcome`）。
4. **优先级 (`priority`) 与最大单次批量效率 (`maxEfficiency`)**：
   - `InWorldRecipeManager` 在同一触发器下按 `priority` **降序**尝试配方；若构建时未手动指定 `priority`，会自动调用 `InWorldRecipe.calcPriority(...)` 累加触发器、所有谓词与所有产出的优先级；
   - `maxEfficiency` 限制单次触发最多连续执行多少批次该配方（同时受全局配置 `AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency` 默认 `64` 约束）。

---

## 三、 完整代码示例：使用 `InWorldRecipeBuilder` 生成配方

下面演示如何在 NeoForge DataGen 的 `RecipeProvider` 中使用 `InWorldRecipeBuilder` 构建一个同时包含方块检测、物品原料消耗、实体消耗、方块状态转换与物品产出的世界内配方：

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder;
import dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.data.recipes.RecipeOutput;
import net.minecraft.data.recipes.RecipeProvider;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

public class ModRecipeGenerator extends RecipeProvider {
    private static final Identifier SAVED_CUSTOM_NAME =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "saved_name");

    public ModRecipeGenerator(HolderLookup.Provider registries, RecipeOutput output) {
        super(registries, output);
    }

    @Override
    protected void buildRecipes() {
        // 构建一个不兼容（启用回溯匹配）的世界内配方
        InWorldRecipeBuilder.incompatible(LibRecipeTriggers.ITEM_INTO_BLOCK)
            .icon(new ItemStackTemplate(Items.AMETHYST_SHARD))
            .group("alchemical_infusion")
            // 1. 要求触发点下方 1 格（below()）存在炼药锅，且只读检测不消耗
            .below()
            .hasBlock(Blocks.CAULDRON)
            // 2. 重置偏移回 (0, 0, 0)，消耗 2 个紫水晶碎片，并将物品上的 CUSTOM_NAME 组件保存到 TagCache
            .offset(0, 0, 0)
            .hasItemIngredient(item -> item
                .of(Items.QUARTZ)
                .count(2)
                .saveComponent(DataComponents.CUSTOM_NAME, SAVED_CUSTOM_NAME)
            )
            // 3. 要求存在 1 个下界之星作为催化剂（consume(false) 仅预约不消耗）
            .hasItemIngredient(catalyst -> catalyst
                .of(Items.NETHER_STAR)
                .count(1)
                .consume(false)
            )
            // 4. 将下方 1 格的炼药锅转换为装满水的炼药锅
            .setBlock(0, -1, 0, Blocks.WATER_CAULDRON.defaultBlockState())
            // 5. 在 (0, 0.5, 0) 处生成 2 个紫水晶碎片，并将刚才保存的 CUSTOM_NAME 写回产物
            .spawnItem(out -> out
                .offset(0, 0.5, 0)
                .item(Items.AMETHYST_SHARD)
                .count(2.0f)
                .applyComponent(DataComponents.CUSTOM_NAME, SAVED_CUSTOM_NAME)
            )
            // 6. 单次触发最多执行 16 批
            .maxEfficiency(16)
            .save(this.output, Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "quartz_to_amethyst"));
    }
}
```

---

## 四、 公开类与 API 详解

### 1. `InWorldRecipe`（世界内配方实体类）

实现 `Recipe<InWorldRecipeContext>` 与 `IPrioritized`。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public InWorldRecipe(ItemStackTemplate icon, IRecipeTrigger trigger, List<IRecipePredicate<?>> conflicting, List<IRecipePredicate<?>> nonConflicting, List<IRecipeOutcome<?>> outcomes, int priority, boolean compatible, int maxEfficiency)` | — | 全参数构造器。若 `maxEfficiency < 1` 抛出 `IllegalArgumentException("maxEfficiency must be positive")`。另提供省略 `maxEfficiency`（默认 `Integer.MAX_VALUE`）与省略 `priority`（自动调用 `calcPriority`）的共 4 个构造器重载。 |
| `public static int calcPriority(IRecipeTrigger trigger, List<IRecipePredicate<?>> conflicting, List<IRecipePredicate<?>> nonConflicting, List<IRecipeOutcome<?>> outcomes)` | `int` | 累加触发器、所有冲突/非冲突谓词以及所有产出的 `priority()` 值。 |
| `public boolean matches(InWorldRecipeContext context, Level level)` | `boolean` | 在规划阶段（`context.assertPlanning()`）先用 `ShapelessMatcher.compatible` 匹配 `nonConflicting` 列表，再根据 `this.compatible` 选择 `compatible` 或 `incompatible` 匹配 `conflicting` 列表。若匹配失败或抛出异常，自动回滚本次压入上下文栈的所有谓词快照。 |
| `public ItemStack assemble(InWorldRecipeContext context)` | `ItemStack` | 执行单批配方组装：调用 `context.beginBatch()`，依次执行匹配栈中所有谓词的 `accept(context)`，再依次执行所有 `outcomes` 的 `acceptWithChance(context)`，最后清理谓词栈并返回 `icon.create()`。 |
| `icon()` / `trigger()` / `conflicting()` / `nonConflicting()` / `outcomes()` / `priority()` / `compatible()` / `maxEfficiency()` | 对应字段类型 | 获取配方的各项不可变属性。 |
| `InWorldRecipe.Serializer.CODEC` / `STREAM_CODEC` | `MapCodec` / `StreamCodec` | 世界内配方的 JSON / NBT 编解码器与网络流编解码器。 |

### 2. `InWorldRecipeBuilder<T>`（链式配方构建器）

实现原版 `net.minecraft.data.recipes.RecipeBuilder`。构建器内部维护一个**当前游标偏移量 `offset`（默认 `Vec3.ZERO`）**：调用 `offset(...)`、`below(...)` 或 `above(...)` 会修改该游标，后续调用的无偏移版 `hasBlock`、`hasItem`、`spawnItem` 等方法都会默认继承当前游标的 `offset`。

| 方法分类 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **静态工厂** | `compatible(IRecipeTrigger)` / `compatible(Supplier<IRecipeTrigger>)` | 创建 `compatible = true`（顺序贪心匹配冲突谓词）的构建器。 |
| **静态工厂** | `incompatible(IRecipeTrigger)` / `incompatible(Supplier<IRecipeTrigger>)` | 创建 `compatible = false`（回溯排列匹配冲突谓词）的构建器。 |
| **游标偏移控制** | `offset(Vec3)` / `offset(double x, double y, double z)`<br>`below(double)` / `below()`（即 `(0, -1, 0)`）<br>`above(double)` / `above()`（即 `(0, 1, 0)`） | 修改构建器的当前默认偏移游标 `this.offset`。 |
| **通用添加** | `with(IRecipePredicate<?> predicate)`<br>`out(IRecipeOutcome<?> outcome)` | 添加任意谓词（自动根据 `predicate.getType().conflict()` 分拣到 `conflicting` 或 `nonConflicting` 列表）或任意产出结果。 |
| **方块谓词** | `hasBlock(Consumer<HasBlock.Builder>)` 及按 `Block...`、`Collection<Block>`、`TagKey<Block>`、`BlockState` 的带/不带偏移重载（共 12 个重载） | 添加只读方块检测条件 `HasBlock`。 |
| **方块原料谓词** | `hasBlockIngredient(Consumer<HasBlockIngredient.Builder>)` 及 12 个同上便捷重载 | 添加会移除（消耗）方块的 `HasBlockIngredient` 条件。 |
| **物品谓词** | `hasItem(Consumer<HasItem.Builder>)` 及按 `ItemLike...`、`TagKey<Item>` 的带/不带偏移重载（共 7 个重载） | 添加只读物品存在检测条件 `HasItem`。 |
| **物品原料谓词** | `hasItemIngredient(Consumer<HasItemIngredient.Builder>)` 及 7 个同上便捷重载 | 添加消耗（或催化预约）物品的 `HasItemIngredient` 条件。 |
| **实体谓词与产出** | `hasEntity(Consumer<HasEntity.Builder>)`<br>`hasEntityIngredient(Consumer<HasEntityIngredient.Builder>)`<br>`spawnEntity(Consumer<SpawnEntity.Builder>)` | 添加只读实体检测、实体消耗原料与生成实体结果（默认继承当前 `this.offset`）。 |
| **结果产出** | `chooseOne(Consumer<ChooseOneOutcome.Builder>)`<br>`spawnItem(Consumer<SpawnItem.Builder>)` 及 5 个按 `ItemStackTemplate` / `chance` / `offset` 的重载<br>`setBlock(Consumer<SetBlock.Builder>)` 及 5 个按 `BlockState` / `chance` / `offset` 的重载 | 添加多选一产出、生成物品产出与放置方块产出。 |
| **元数据与保存** | `icon(ItemStackTemplate)`<br>`priority(Integer)`<br>`maxEfficiency(int)`<br>`group(@Nullable String)`<br>`unlockedBy(String, Criterion<?>)`<br>`build()`<br>`save(RecipeOutput, ResourceKey<Recipe<?>>)` / `save(RecipeOutput, Identifier)` | 配置图标、显式优先级、单次触发最大批次上限、配方分组并构建或输出到 `RecipeOutput`。 |

### 3. `AnvilLibRecipe`、`AnvilLibRecipeConfig` 与注册表类

| 类名 | 关键常量 / 字段 | 说明 |
| :--- | :--- | :--- |
| `AnvilLibRecipe` | `MAIN_ID = "anvillib"`<br>`MOD_ID = "anvillib_recipe"`<br>`CONFIG` (`AnvilLibRecipeConfig`)<br>`of(String path)` | 模块主类。`CONFIG.inWorldRecipeMaxEfficiency`（范围 `[1, 128]`，默认 `64`）控制全局单次触发最大执行批次数。 |
| `LibRegistries` | `TRIGGER_REGISTRY` (`anvillib:trigger`)<br>`PREDICATE_TYPE_REGISTRY` (`anvillib:predicate`)<br>`PREDICATE_FUNCTION_TYPE_REGISTRY` (`anvillib:predicate_function`)<br>`OUTCOME_TYPE_REGISTRY` (`anvillib:outcome`)<br>`OUTCOM_FUNCTIONE_TYPE_REGISTRY` (`anvillib:outcome_function`) | 世界内配方的 5 个同步自定义注册表（最大 ID 均为 `512`）。<br>*注：源码中结果函数注册表字段名为 `OUTCOM_FUNCTIONE_TYPE_REGISTRY`（拼写如此），引用时请注意。* |
| `LibRecipeTypes` | `IN_WORLD_RECIPE` (`RecipeType<InWorldRecipe>`)<br>`IN_WORLD_RECIPE_SERIALIZER` (`RecipeSerializer<InWorldRecipe>`) | 注册在 `anvillib_recipe:in_world_recipe` 下的原版 `RecipeType` 与 `RecipeSerializer`。 |
| `LibBlockEntityTags` / `LibEntityTypeTags` | `LibBlockEntityTags.ITEM_CACHE` (`#anvillib:item_cache`)<br>`LibEntityTypeTags.ITEM_CACHE` (`#anvillib:item_cache`) | 标记哪些方块实体或实体允许被 `ItemResourceHandlerCache` 当作外部物品容器接入世界内配方。 |
