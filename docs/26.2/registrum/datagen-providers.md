# 数据生成連携：Provider 体系与模板生成 (`dev.anvilcraft.lib.v2.registrum.providers`)

<BranchContextCard branch="26.2" />

`module.registrum` 的另一大核心价值是将分散的数据生成器（Data Providers）全部纳入 `RegistrumDataProvider` 统一调度。除了在 `BlockBuilder` / `ItemBuilder` 链上直接声明 `.blockstate(...)`、`.model(...)`、`.loot(...)`、`.recipe(...)`、`.tag(...)`、`.lang(...)` 外，你还可以随时通过 `REGISTRUM.addDataGenerator(ProviderType, callback)` 或 `REGISTRUM.getDataGenInitializer()` 注入全局的数据包注册表条目（如世界生成、附魔、多方块定义）、全局合成表、进度（Advancement）以及第三方自定义 `DataProvider`。

---

## 一、 内置 `ProviderType` 与 `GeneratorType` 一览

位于 `dev.anvilcraft.lib.v2.registrum.providers.ProviderType`。

| 常量名 (`ProviderType.*`) | 逻辑端 (`LogicalSide`) | 关联的 Provider / Generator 类型 | 说明 |
| :--- | :---: | :--- | :--- |
| **`DYNAMIC`** | `SERVER` | `RegistrumDatapackProvider` | 继承自 NeoForge `DatapackBuiltinEntriesProvider`，输出通过 `DataProviderInitializer#add` 注册的数据包内置注册表条目，并向依赖它的子 Provider 提供含新注册项的 `HolderLookup.Provider`。 |
| **`DATA_MAP`** | `SERVER` | `RegistrumDataMapProvider` | 继承自 NeoForge `DataMapProvider`，生成燃料、堆肥、氧化等 DataMap JSON。 |
| **`RECIPE_RUNNER`** / **`RECIPE`** | `SERVER` | `RegistrumRecipeRunner` / `RegistrumRecipeProvider` | `RECIPE` 是挂在 `RECIPE_RUNNER` 下的 `GeneratorType<RegistrumRecipeProvider>`，用于生成全部配方。 |
| **`ADVANCEMENT`** | `SERVER` | `RegistrumAdvancementProvider` | 生成进度（`data/<ns>/advancement/*.json`），支持 `withConditions(AdvancementHolder, List<ICondition>)` 条件进度。 |
| **`LOOT`** | `SERVER` | `RegistrumLootTableProvider` | 生成方块战利品表（`LootType.BLOCK` → `RegistrumBlockLootTables`）、实体战利品表（`LootType.ENTITY` → `RegistrumEntityLootTables`）及任意 `ContextKeySet` 战利品表。 |
| **`BLOCK_TAGS`** | `SERVER` | `RegistrumTagsProvider.IntrinsicImpl<Block>` | 方块标签生成器。 |
| **`ITEM_TAGS`** | `SERVER` | `RegistrumItemTagsProvider` | 物品标签生成器（默认声明了对 `BLOCK_TAGS` 的拓扑依赖，支持调用 `prov.copy(blockTag, itemTag)` 直接将方块标签复制到物品标签）。 |
| **`FLUID_TAGS`** | `SERVER` | `RegistrumTagsProvider.IntrinsicImpl<Fluid>` | 流体标签生成器。 |
| **`ENTITY_TAGS`** | `SERVER` | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | 实体类型标签生成器。 |
| **`ENCHANTMENT_TAGS`** | `SERVER` | `RegistrumTagsProvider.Impl<Enchantment>` | 附魔动态注册表标签生成器。 |
| **`DAMAGE_TYPE_TAGS`** | `SERVER` | `RegistrumTagsProvider.Impl<DamageType>` | 伤害类型动态注册表标签生成器。 |
| **`GENERIC_SERVER`** | `SERVER` | `RegistrumGenericProvider` | 挂载任意第三方服务端 `DataProvider`。 |
| **`MODEL`** / **`BLOCKSTATE`** / **`ITEM_MODEL`** | `CLIENT` | `RegistrumModelProvider` / `RegistrumBlockModelGenerator` / `RegistrumItemModelGenerator` | 客户端模型与方块状态生成器。 |
| **`LANG`** | `CLIENT` | `RegistrumLangProvider` | 语言文件生成器：在生成 `en_us.json` 的同时，会自动将所有英文文本倒置转换为 `en_ud.json`（Upside-Down English，自动保留 `%s` / `%1$d` 格式化占位符不被翻转）。 |
| **`GENERIC_CLIENT`** | `CLIENT` | `RegistrumGenericProvider` | 挂载任意第三方客户端 `DataProvider`。 |

---

## 二、 完整代码示例

### 1. 注册数据包内置注册表条目（如多方块定义、附魔、世界生成）并配置标签依赖

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.multiblock.init.LibRegistries;
import dev.anvilcraft.lib.v2.registrum.providers.DataProviderInitializer;
import dev.anvilcraft.lib.v2.registrum.providers.ProviderType;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;

public final class ModDataGenSetup {
    public static void configure() {
        DataProviderInitializer init = MyMod.REGISTRUM.getDataGenInitializer();

        // 1. 向 DYNAMIC 数据包生成器添加 Bootstrap（如前文编写的 ModMultiblockDefinitions::bootstrap）
        init.add(LibRegistries.DEFINITIONS_KEY, ModMultiblockDefinitions::bootstrap);

        // 2. 若某个动态标签 Provider 需要引用 DYNAMIC 生成的注册表项，可声明拓扑依赖：
        init.addDependency(ProviderType.ENCHANTMENT_TAGS, ProviderType.DYNAMIC);

        // 3. 添加不绑定具体单个注册项的全局数据生成回调（例如复制方块标签到物品标签）
        MyMod.REGISTRUM.addDataGenerator(ProviderType.ITEM_TAGS, prov -> {
            prov.copy(BlockTags.SLABS, ItemTags.SLABS);
            prov.copy(BlockTags.STAIRS, ItemTags.STAIRS);
        });
    }
}
```

### 2. 使用 `RegistrumRecipeProvider` 与 `DataIngredient` 快速生成全套家族配方

`RegistrumRecipeProvider` 继承自原版 `RecipeProvider` 并额外实现了 `RecipeOutput`（因此可直接将 `prov` 作为 `save(prov)` 的目标传入！），同时提供了一整套基于 `DataIngredient` 自动命名并自动挂载解锁准则（`unlockedBy("has_...", ...)`）的模板方法：

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import com.example.mymod.init.ModItems;
import dev.anvilcraft.lib.v2.registrum.providers.ProviderType;
import dev.anvilcraft.lib.v2.registrum.util.DataIngredient;
import net.minecraft.data.recipes.RecipeCategory;
import net.minecraft.world.item.crafting.CookingBookCategory;

public final class ModExtraRecipes {
    public static void register() {
        MyMod.REGISTRUM.addDataGenerator(ProviderType.RECIPE, prov -> {
            DataIngredient rubyOre = DataIngredient.items(ModBlocks.RUBY_ORE);
            DataIngredient pinecone = DataIngredient.items(ModItems.PINECONE);

            // 1. 一键生成熔炉烧炼 + 高炉冶炼两条配方（自动命名为 <result>_from_<source>_smelting / _blasting）
            prov.smeltingAndBlasting(
                rubyOre,
                RecipeCategory.MISC,
                CookingBookCategory.MISC,
                ModItems.PINECONE,
                0.7f
            );

            // 2. 一键生成 9 合 1 压缩块与 1 拆 9 还原配方
            prov.storage(ModItems.PINECONE, RecipeCategory.BUILDING_BLOCKS, ModBlocks.RUBY_ORE);
        });
    }
}
```

---

## 三、 核心 Provider 与 Generator API 详解

### 1. `DataGenContext<R, E>` 与 `DataProviderInitializer`

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `DataGenContext<R, E>` | • `public E getEntry()` / `public E get()`<br>• `public String getName()`<br>• `public Identifier getId()`<br>• `public static <R, E extends R> DataGenContext<R, E> from(Builder<R, E, ?, ?> builder)` | 传递给各构建器数据生成回调的上下文对象，包含当前条目实例、注册名与 `Identifier`。 |
| `DataProviderInitializer` | • `public <T> void add(ResourceKey<Registry<T>> registry, RegistrySetBuilder.RegistryBootstrap<T> provider)`<br>• `public void addDependency(ProviderType<?> dependent, ProviderType<? extends RegistrumLookupFillerProvider> parent)` | 管理数据包 `RegistrySetBuilder` 以及各 `ProviderType` 之间的 `HolderLookup.Provider` 依赖顺序（每个 `dependent` 最多允许声明 1 个前置 `parent`，检测到循环依赖时抛出 `IllegalStateException`）。 |

### 2. `RegistrumBlockModelGenerator` 与 `RegistrumItemModelGenerator`

分别继承自原版 `net.minecraft.client.data.models.BlockModelGenerators` 与 `ItemModelGenerators`（已把原版大量 `protected` / 包级方法及 `blockStateOutput`、`itemModelOutput`、`modelOutput` 暴露供回调直接使用）：

| 类名 | 扩展方法签名 | 说明 |
| :--- | :--- | :--- |
| `RegistrumBlockModelGenerator` | • `public void create(Block block, Identifier model)`<br>• `public void create(Block block, TexturedModel.Provider texture)`<br>• `public Identifier mcLoc(String id)` / `public Identifier modLoc(String id)`<br>• `withBuilder(...)` / `getBuilder()` / `withParent(ModelTemplate / TexturedModel, ...)` → 返回 `RegistrumLegacyBlockModelBuilder` | 方块状态与方块模型生成器。 |
| `RegistrumItemModelGenerator` | • `public void createWithExistingModel(Item item, Identifier id)`<br>• `public void generateTintedModel(Item entry, Identifier model, ItemTintSource tint)`<br>• `public Identifier mcLoc(String id)` / `public Identifier modLoc(String id)`<br>• `public String modid(NonNullSupplier<? extends ItemLike> item)` / `public String name(NonNullSupplier<? extends ItemLike> item)` | 客户端物品模型生成器。 |

### 3. `RegistrumRecipeProvider` 与 `DataIngredient`

| 类名 | 关键方法签名 | 说明 |
| :--- | :--- | :--- |
| `DataIngredient` | • `public static <T extends ItemLike> DataIngredient items(NonNullSupplier<? extends T> first, NonNullSupplier<? extends T>... others)`<br>• `public static <T extends ItemLike> DataIngredient items(T first, T... others)`<br>• `public static DataIngredient tag(TagKey<Item> tag)`<br>• `public static DataIngredient ingredient(Ingredient parent, ItemLike / TagKey<Item> / Identifier, ...)`<br>• `public Ingredient toVanilla()` / `public Identifier getId()` / `public Criterion<...> getCriterion(RegistrumRecipeProvider prov)` | 专为 DataGen 设计的原料包装器：同时记住原料的主 `Identifier`（用于拼接配方文件名）和自动生成的物品栏获取解锁准则 `Criterion`。 |
| `RegistrumRecipeProvider` | • 命名辅助：`safeId(...)`、`safeKey(...)`、`safeName(...)`、`resolve(ResourceKey<T>)`<br>• 烹饪配方：`cooking(...)`、`smelting(...)`、`blasting(...)`、`smoking(...)`、`campfire(...)`、`smeltingAndBlasting(...)`、`food(...)`（一键生成熔炉+烟熏炉+营火）<br>• 切石与合成：`stonecutting(...)`、`square(..., boolean small)`、`storage(source, category, output)`、`singleItem(...)`、`singleItemUnfinished(...)`<br>• 建筑变体：`planks(...)`、`stairs(..., boolean stone)`、`slab(..., boolean stone)`、`fence(...)`、`fenceGate(...)`、`wall(...)`、`door(...)`、`trapDoor(...)`<br>• 以及全部公开化的原版 `RecipeProvider` 方法（`shaped`、`shapeless`、`nineBlockStorageRecipes`、`copySmithingTemplate`、`waxRecipes` 等） | 配方数据生成器，本身直接实现 `RecipeOutput`。 |

### 4. `RegistrumLootTableProvider`、`RegistrumLangProvider` 与 `RegistrumGenericProvider`

| 类名 | 关键方法签名 | 说明 |
| :--- | :--- | :--- |
| `RegistrumLootTableProvider` | • `LootType.BLOCK` / `LootType.ENTITY` / `LootType.register(name, set, factory)`<br>• `public <T extends RegistrumLootTables> void addLootAction(LootType<T> type, NonNullConsumer<T> action)`<br>• `public void addLootAction(ContextKeySet set, Consumer<BiConsumer<ResourceKey<LootTable>, LootTable.Builder>> action)` | 战利品表生成器。`RegistrumBlockLootTables` 公开了原版 `BlockLootSubProvider` 的全部 `create*Drops`、`dropSelf`、`dropOther`、`dropWhenSilkTouch`、`add` 等方法。 |
| `RegistrumLangProvider` | • `public static String toEnglishName(String internalName)`<br>• `addBlock(block)` / `addBlockWithTooltip(block, [name,] tooltip)`<br>• `addItem(item)` / `addItemWithTooltip(item, name, List<String> tooltip)`<br>• `addTooltip(item, String / List<String>)`（自动生成 `<descId>.desc` 或 `<descId>.desc.0`、`1`...）<br>• `add(CreativeModeTab, String name)` / `addEntityType(entity)` | 语言文件生成器，同时输出 `en_us` 与自动倒置的 `en_ud`。 |
| `RegistrumGenericProvider` | `public RegistrumGenericProvider add(Generator generator)`（其中 `Generator` 为 `DataProvider generate(GeneratorData data)`） | 允许在 `ProviderType.GENERIC_SERVER` 或 `ProviderType.GENERIC_CLIENT` 回调中挂载任意标准的 Minecraft / NeoForge `DataProvider`。 |
| `RegistrumProvider` / `RegistrumProviderDelegate` | • `RegistrumProvider#getSide()`（返回 `LogicalSide`）<br>• `RegistrumProviderDelegate#getId()` / `#getEntry()` / `#getName()` | Registrum 数据生成器的公共顶层接口与条目委托接口（继承 `DataProvider`），用于统一标识生成侧与条目关联关系。 |
| `RegistrumTagsProvider<T>` & `IntrinsicAppender<T>` | • `Key#tag(TagKey<T>)` → 返回 `TagAppender<T>`<br>• `Intrinsic#tag(TagKey<T>)` → 返回 `IntrinsicAppender<T>`<br>• `record IntrinsicAppender<T>(TagAppender<T> delegate, Function<T, ResourceKey<T>> keyExtractor)`：实现 `TagAppender<T>` 的同时补充 `add(T)` 与 `add(T...)` | 标签生成器体系。`Impl<T>` 与 `IntrinsicImpl<T>` 均继承自原版 `TagsProvider<T>`；其中 `IntrinsicImpl<T>` 通过 `IntrinsicAppender<T>` 在原版键名式标签 API 基础上保留直接传入注册表对象实例的便利性。 |
