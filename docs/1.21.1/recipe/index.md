# Recipe 世界内配方系统：核心架构与构建器 (`module.recipe`)

<BranchContextCard branch="1.21.1" />

`module.recipe`（构件名 `anvillib-recipe-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.recipe`）是 AnvilLib 的核心业务模块之一，提供了一套**完整的数据驱动世界内配方（In-World Recipe）引擎**。

原版 Minecraft 的 `Recipe` 系统是为 GUI 容器（如工作台、熔炉）设计的；而在世界中直接发生的合成——例如**铁砧砸击合成、物品掉入流体/炼药锅转化、多方块祭坛献祭生物与周围箱子/地面物品生成新方块或结构**——需要同时检测并修改世界中的**地面掉落物实体（`ItemEntity`）、容器能力槽位（`IItemHandler`）、世界方块状态（`BlockState`）、周围生物实体（`Entity`）以及跨阶段的临时 NBT 标签（`TagCache`）**。

本模块按功能域拆分为 6 篇子文档：
- **本篇（核心架构、`InWorldRecipe` 与 `InWorldRecipeBuilder`）**：详解世界内配方的组成结构、优先级计算、冲突与非冲突匹配算法以及 DataGen 链式构建器全套 API。
- **[触发器系统 (Triggers)](./triggers)**：详解 `IRecipeTrigger`、内置触发器 `ITEM_INTO_BLOCK`、自定义触发器注册与触发入口。
- **[配方条件谓词与谓词函数 (Predicates)](./predicates)**：详解 `IRecipePredicate`、`HasItem`、`HasItemIngredient`、`HasBlock`、`HasBlockIngredient`、`HasEntity`、`HasEntityIngredient`、`SaveComponentToTag` 以及 `AndPredicate` / `OrPredicate` / `NotPredicate` 物品子谓词。
- **[配方结果与结果函数 (Outcomes)](./outcomes)**：详解 `IRecipeOutcome`、`SpawnItem`、`SetBlock`（含属性保留与映射）、`SpawnEntity`、`ProduceExplosion`、`ChooseOneOutcome`、`ApplyTagToComponent` 与 `ItemBatchPlan`。
- **[世界状态缓存与批次规划 (Caches & BatchPlan)](./caches)**：详解 `ItemCache`、`BlockCache`、`EntityCache`、`TagCache`、`IItemHandlerCache`、`ItemCacheSlotProvider` 与 `EntityDropCapture`。
- **[执行上下文、剪枝管理器与事件 (Context & Events)](./context-and-events)**：详解 `InWorldRecipeContext` 两阶段提交协议、`InWorldRecipeManager` 二部图方块剪枝器与 5 大配方事件。

---

## 一、 接入配置（含接口注入声明）

`module.recipe` 向原版 `RecipeManager` 注入了扩展接口 `IRecipeManagerExtension`。若需在代码中直接调用 `recipeManager.anvillib$getInWorldRecipeManager()` 等方法，请在 `build.gradle.kts` 中声明 `interfaceInjectionData`：

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-recipe-neoforge-1.21.1:$anvillibVersion")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-recipe-neoforge-1.21.1:$anvillibVersion")
}
```

---

## 二、 `InWorldRecipe` 核心模型解析

一个 `InWorldRecipe`（实现 `Recipe<InWorldRecipeContext>` 与 `IPrioritized`）由以下 8 个核心属性构成：

| 属性名 | 类型 | JSON 字段名 | 说明 |
| :--- | :--- | :--- | :--- |
| `icon` | `ItemStack` | `"icon"` | 配方图标（默认铁砧 `Items.ANVIL.getDefaultInstance()`），供 JEI 等配方查看器作为主图标展示。 |
| `trigger` | `IRecipeTrigger` | `"trigger"` | 配方触发器（决定该配方在什么世界事件下被检索，如 `anvillib_recipe:item_into_block`）。 |
| `conflicting` | `List<IRecipePredicate<?>>` | `"conflicting"` | **冲突性谓词列表**（`predicate.getType().conflict() == true` 的条件，如消耗物品的 `HasItemIngredient`、消耗方块的 `HasBlockIngredient`、消耗实体的 `HasEntityIngredient`）。 |
| `nonConflicting` | `List<IRecipePredicate<?>>` | `"non_conflicting"` | **非冲突性谓词列表**（仅检查不消耗的条件，如 `HasItem`、`HasBlock`、`HasEntity`）。 |
| `outcomes` | `List<IRecipeOutcome<?>>` | `"outcomes"` | 配方匹配成功后执行的产出结果列表（如 `SpawnItem`、`SetBlock`、`SpawnEntity`、`ProduceExplosion`、`ChooseOneOutcome`）。 |
| `priority` | `int` | `"priority"` | 配方优先级（**值越大越先匹配**，JSON 未显式指定时默认 `1`；构建器未显式指定时由 `InWorldRecipe.calcPriority` 自动累加触发器、所有谓词和所有结果的 `priority()`）。 |
| `compatible` | `boolean` | `"compatible"` | **冲突谓词匹配策略**：<br>• `true`（兼容模式，`ShapelessMatcher.compatible`）：按顺序贪心匹配 `conflicting` 谓词；<br>• `false`（不兼容模式，`ShapelessMatcher.incompatible`）：先经 `checkItemCapacity` 做快速容量判定，存在共用槽位时使用全排列回溯搜索（Backtracking）寻找互不冲突的组合。 |
| `maxEfficiency` | `int` | `"max_efficiency"` | 单次触发允许连续执行的最大批次数（`>= 1`，默认 `Integer.MAX_VALUE`；实际执行上限取 `Math.min(recipe.maxEfficiency(), AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency)`，全局配置默认为 `64`）。 |

### 构造器与生命周期方法

| 方法 / 构造器 | 说明 |
| :--- | :--- |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible, maxEfficiency)` | 全参构造器，`maxEfficiency < 1` 时抛出 `IllegalArgumentException`。 |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible)` | 默认 `maxEfficiency = Integer.MAX_VALUE`。 |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible, maxEfficiency)` | 自动调用 `calcPriority(trigger, conflicting, nonConflicting, outcomes)` 计算优先级。 |
| `InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible)` | 自动计算优先级且 `maxEfficiency = Integer.MAX_VALUE`。 |
| `static int calcPriority(trigger, conflicting, nonConflicting, outcomes)` | 累加 `trigger.priority()` 与全部谓词、结果的 `priority()`。 |
| `boolean matches(InWorldRecipeContext context, Level level)` | 先匹配 `nonConflicting`，再按 `compatible` 匹配 `conflicting`；失败时自动弹出并回滚本轮压入的谓词快照；发生异常时回滚并使 `context.invalidate()` 失效。 |
| `ItemStack assemble(InWorldRecipeContext context, HolderLookup.Provider provider)` | 调用 `context.beginBatch()`，对栈内每个谓词调用 `accept(context)`，再对每个结果调用 `acceptWithChance(context)`，最后 `clearStack(context)` 并清空栈，返回 `icon.copy()`。 |

---

## 三、 完整代码示例：使用 `InWorldRecipeBuilder` 生成世界内配方 JSON

在 DataGen 的 `RecipeProvider#buildRecipes(RecipeOutput)` 中，使用 `InWorldRecipeBuilder.compatible(trigger)` 或 `InWorldRecipeBuilder.incompatible(trigger)` 构建配方：

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder;
import dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.data.PackOutput;
import net.minecraft.data.recipes.RecipeOutput;
import net.minecraft.data.recipes.RecipeProvider;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;

import java.util.concurrent.CompletableFuture;

public class ModInWorldRecipeProvider extends RecipeProvider {
    public ModInWorldRecipeProvider(PackOutput output, CompletableFuture<HolderLookup.Provider> registries) {
        super(output, registries);
    }

    @Override
    protected void buildRecipes(RecipeOutput output) {
        ResourceLocation customNamePath = ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "saved_sword_name");

        // 示例：当物品掉入装满水的炼药锅时：
        // 1. 要求触发点 (0, 0, 0) 为满水炼药锅，下方 (0, -1, 0) 有营火加热
        // 2. 消耗 1 把铁剑（并将铁剑的自定义名称保存到临时 NBT 路径 saved_sword_name）+ 4 颗钻石
        // 3. 要求周围 3x3x3 内存在至少 1 只溺尸 (Drowned) 并将其献祭消耗
        // 4. 产出 1 把继承了原铁剑自定义名称的钻石剑，并将满水炼药锅变为普通空炼药锅
        InWorldRecipeBuilder.compatible(LibRecipeTriggers.ITEM_INTO_BLOCK)
            .icon(new ItemStack(Items.DIAMOND_SWORD))
            .maxEfficiency(1)
            // 检查当前坐标 (0, 0, 0) 为 3 级满水炼药锅
            .hasBlock(
                Blocks.WATER_CAULDRON.defaultBlockState()
                    .setValue(LayeredCauldronBlock.LEVEL, 3)
            )
            // 切换当前构建器的默认偏移为下方 1 格 (0, -1, 0)，检查是否有营火（不消耗）
            .below()
            .hasBlock(BlockTags.CAMPFIRES)
            // 切回原点 (0, 0, 0)
            .offset(0, 0, 0)
            // 消耗 1 把铁剑，并提取其 CUSTOM_NAME 组件暂存到 TagCache
            .hasItemIngredient(item -> item
                .of(Items.IRON_SWORD)
                .count(1)
                .saveComponent(DataComponents.CUSTOM_NAME, customNamePath)
            )
            // 消耗 4 颗钻石
            .hasItemIngredient(item -> item
                .of(Items.DIAMOND)
                .count(4)
            )
            // 消耗周围 3x3x3 范围内的 1 只溺尸
            .hasEntityIngredient(entity -> entity
                .of(EntityType.DROWNED)
                .range(3.0, 3.0, 3.0)
                .count(1)
            )
            // 产出 1 把钻石剑，并将刚才暂存的 CUSTOM_NAME 写回产物上
            .spawnItem(item -> item
                .item(Items.DIAMOND_SWORD)
                .applyComponent(DataComponents.CUSTOM_NAME, customNamePath)
            )
            // 将 (0, 0, 0) 的装水炼药锅替换为普通空炼药锅
            .setBlock(Blocks.CAULDRON.defaultBlockState())
            .group("cauldron_forging")
            // 保存到 data/my_mod/recipe/cauldron_forging/drowned_diamond_sword.json
            .save(output, ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "drowned_diamond_sword"));
    }
}
```

---

## 四、 `InWorldRecipeBuilder` 全量方法速查表

位于 `dev.anvilcraft.lib.v2.recipe.builder.InWorldRecipeBuilder<T extends InWorldRecipeBuilder<T>>`，实现了原版 `net.minecraft.data.recipes.RecipeBuilder`。

> **有状态偏移游标与 `group` 路径提示**：
> 1. `InWorldRecipeBuilder` 内部维护了当前偏移字段 `protected Vec3 offset = Vec3.ZERO`。调用 `.offset(x, y, z)`、`.below()` 或 `.above()` 会修改该游标，后续调用未显式传 `offset` 的 `.hasItem(...)`、`.hasBlock(...)`、`.spawnItem(...)`、`.setBlock(...)` 时都会默认继承当前游标位置。
> 2. `save(RecipeOutput, ResourceLocation)` 会将最终配方 ID 拼装为 `ResourceLocation.fromNamespaceAndPath(id.getNamespace(), this.group + "/" + id.getPath())`（同时生成 `recipes/<group>/<path>` 进度），因此**务必显式调用 `.group(...)`** 设置分组子目录名（避免默认 `null` 变成 `"null/..."`）。
> 3. 在 `1.21.1` 分支中，快捷重载 `hasItem(Vec3, TagKey<Item>)` 与 `hasItem(double, double, double, TagKey<Item>)` 内部未向 `HasItem.Builder` 传入标签参数；若需带显式偏移的物品标签检查，请使用 `.hasItem(b -> b.offset(...).of(tag))` 或先调用 `.offset(...)` 再调用 `.hasItem(tag)`。

| 方法分类 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| **静态工厂** | • `compatible(IRecipeTrigger)` / `compatible(Supplier<IRecipeTrigger>)`<br>• `incompatible(IRecipeTrigger)` / `incompatible(Supplier<IRecipeTrigger>)` | 创建兼容模式（`compatible = true`）或不兼容回溯模式（`compatible = false`）的世界内配方构建器。 |
| **偏移游标** | • `offset(Vec3 offset)` / `offset(double x, double y, double z)`<br>• `below()`（设为 `(0, -1, 0)`） / `below(double below)`<br>• `above()`（设为 `(0, 1, 0)`） / `above(double above)` | 设置后续谓词与结果的默认相对偏移量。 |
| **元数据配置** | • `icon(ItemStack icon)`<br>• `priority(Integer priority)`<br>• `maxEfficiency(int maxEfficiency)`<br>• `group(@Nullable String groupName)`<br>• `unlockedBy(String name, Criterion<?> criterion)`<br>• `Item getResult()` | 设置图标、显式优先级、单次触发最大批次数、配方分组路径前缀与解锁准则。 |
| **通用添加** | • `with(IRecipePredicate<?> predicate)`<br>• `out(IRecipeOutcome<?> outcome)`<br>• `T self()` | 添加任意自定义谓词（自动根据 `predicate.getType().conflict()` 分流到 `conflicting` 或 `nonConflicting`）或结果。 |
| **物品谓词（不消耗）** | • `hasItem(Consumer<HasItem.Builder> consumer)`<br>• `hasItem([Vec3 / x,y,z,] ItemLike... items)`<br>• `hasItem([Vec3 / x,y,z,] TagKey<Item> items)` | 添加 `HasItem` 非冲突检查条件。 |
| **物品原料（消耗/催化剂）** | • `hasItemIngredient(Consumer<HasItemIngredient.Builder> consumer)`<br>• `hasItemIngredient([Vec3 / x,y,z,] ItemLike... items)`<br>• `hasItemIngredient([Vec3 / x,y,z,] TagKey<Item> items)` | 添加 `HasItemIngredient` 原料条件。 |
| **方块谓词（不消耗）** | • `hasBlock(Consumer<HasBlock.Builder> consumer)`<br>• `hasBlock([Vec3 / x,y,z,] Block... / Collection<Block> / TagKey<Block> / BlockState)` | 添加 `HasBlock` 方块检查条件；传入 `BlockState` 时会自动对比 `defaultBlockState()` 提取所有非默认属性。 |
| **方块原料（消耗替换）** | • `hasBlockIngredient(Consumer<HasBlockIngredient.Builder> consumer)`<br>• `hasBlockIngredient([Vec3 / x,y,z,] Block... / Collection<Block> / TagKey<Block> / BlockState)` | 添加 `HasBlockIngredient` 方块消耗条件（配方提交时将该位置方块置为空气）。 |
| **实体条件与实体原料** | • `hasEntity(Consumer<HasEntity.Builder> consumer)`<br>• `hasEntityIngredient(Consumer<HasEntityIngredient.Builder> consumer)` | 添加 `HasEntity`（不消耗实体）或 `HasEntityIngredient`（预约并移除实体）条件。 |
| **产物结果** | • `spawnItem(Consumer<SpawnItem.Builder> consumer)`<br>• `spawnItem([Vec3 / x,y,z,] [double chance,] ItemStack stack)`<br>• `setBlock(Consumer<SetBlock.Builder> consumer)`<br>• `setBlock([Vec3 / x,y,z,] [double chance,] BlockState state)`<br>• `spawnEntity(Consumer<SpawnEntity.Builder> consumer)`<br>• `chooseOne(Consumer<ChooseOneOutcome.Builder> consumer)` | 添加生成物品、设置方块、生成实体或加权多选一结果。注意 `spawnItem(pos, chance, stack)` 内部将该浮点数传给 `SpawnItem.Builder#count(float)`，若需设置概率或随机数量请使用 `Consumer<SpawnItem.Builder>`。 |
| **构建与写出** | • `InWorldRecipe build()`<br>• `void save(RecipeOutput recipeOutput, ResourceLocation id)` | 构建 `InWorldRecipe` 实例，或将其与对应解锁进度写入 `RecipeOutput`。 |
