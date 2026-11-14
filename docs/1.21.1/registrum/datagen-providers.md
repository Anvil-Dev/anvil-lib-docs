# 数据生成体系与 Provider 详解 (`GatherDataEvent`)

`module.registrum` 对 NeoForge `GatherDataEvent` 进行了完整托管。无需手动为每类资源编写并逐个注册原版 `DataProvider`——一旦调用 `Registrum.create(modid)`，监听在 Mod 总线上的 `RegistrumDataProvider` 就会自动在数据生成阶段拉起所有按拓扑依赖排好序的子 Provider，并把 Builder 上收集到的 `setData` / `addMiscData` / `addDataGenerator` 回调准确分发到各个生成器中。

## 调度机制：`RegistrumDataProvider` 与 `DataProviderInitializer`

### 初始化与拓扑排序

每个 `AbstractRegistrum` 内部都维护一个可通过 `getDataGenInitializer()` 访问的 `DataProviderInitializer`：

- `add(ResourceKey<Registry<T>> registry, RegistrySetBuilder.RegistryBootstrap<T> provider)`：向动态数据包注册表构造器 (`RegistrySetBuilder`) 注册生成规则，供 `ProviderType.DYNAMIC` (`RegistrumDatapackProvider`) 使用。
- `addDependency(ProviderType<?> dependent, ProviderType<? extends RegistrumLookupFillerProvider> parent)`：声明 `dependent` Provider 必须在 `parent` 填充好查找表之后构造并接收 `parent.getFilledProvider()` 作为自身的 `CompletableFuture<HolderLookup.Provider>` 上游依赖。内置默认依赖为：`ITEM_TAGS` 依赖 `BLOCK_TAGS`（以便实现方块的标签复制 `copy(blockTag, itemTag)`）。

`RegistrumDataProvider` 在构造时会根据 `event.includeServer()` 与 `event.includeClient()` 收集目标逻辑端 (`LogicalSide`)，按 `getSortedProviders()` 拓扑顺序实例化各子 Provider；若存在循环依赖，直接抛出 `IllegalStateException`。运行阶段则通过 `AbstractRegistrum.genData(ProviderType<T> type, T gen)` 将属于该 `type` 的全局任务与单条目任务统一执行。

### 注册回调接口

除了常规链式 Builder 上的 `.setData(...)`、`.addMiscData(...)`、`.dataMap(...)` 外，可以直接在 `REGISTRUM` 上调用：

- `REGISTRUM.addDataGenerator(ProviderType<? extends T> type, NonNullConsumer<? extends T> cons)`：追加面向全局的数据生成回调（例如额外配方、全局语言或跨条目标签）。
- `REGISTRUM.getDataProvider(ProviderType<T> type)`：在另一个子 Provider 执行期间，通过 `Optional<T>` 检索同次运行中已经创建的同级 Provider 实例（例如 `BlockBuilder` 生成默认方块物品模型时从 `ProviderType.BLOCKSTATE` 读取已生成的状态模型）。

### 数据生成上下文：`DataGenContext<R, E>`

`setData(ProviderType, (ctx, prov) -> ...)` 回调中的首参数 `DataGenContext<R, E>` 实现了 `NonNullSupplier<E>` 并通过 `@Delegate` 转发了条目供应，常用访问成员如下：

- `ctx.getEntry()` / `ctx.get()`：返回正在生成数据的实际注册条目 `E`。
- `ctx.getName()`：返回该条目的路径名 `String`（例如 `"crusher"`）。
- `ctx.getId()`：返回完整 `ResourceLocation`（`<modid>:<name>`）。

## 内置 `ProviderType` 列表与自定义扩展

`ProviderType<T extends RegistrumProvider>` 接口集中定义了框架内置的所有数据生成类型键，分为 **SERVER DATA (`LogicalSide.SERVER`)** 与 **CLIENT DATA (`LogicalSide.CLIENT`)**：

| 常量键 | 对应 Provider 实现 | `LogicalSide` | 用途 |
| :--- | :--- | :--- | :--- |
| `DYNAMIC` | `RegistrumDatapackProvider` | `SERVER` | 通过 `DataProviderInitializer` 的 `RegistrySetBuilder` 生成数据包动态注册表条目（如生物群系修改器、附魔、附带自定义注册表的 JSON） |
| `DATA_MAP` | `RegistrumDataMapProvider` | `SERVER` | 生成 NeoForge DataMaps（熔炉燃料、堆肥概率及自定义 `DataMapType`） |
| `RECIPE` | `RegistrumRecipeProvider` | `SERVER` | 生成合成、烧炼、切石及自定义模组配方与解锁进度 |
| `ADVANCEMENT` | `RegistrumAdvancementProvider` | `SERVER` | 生成模组进度（支持 `WithConditions` 条件化进度） |
| `LOOT` | `RegistrumLootTableProvider` | `SERVER` | 生成方块、实体或任意 `LootContextParamSet` 战利品表 |
| `BLOCK_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Block>` | `SERVER` | 生成 `tags/block` 方块标签 |
| `ENCHANTMENT_TAGS` | `RegistrumTagsProvider.Impl<Enchantment>` | `SERVER` | 生成 `tags/enchantment` 附魔标签 |
| `DAMAGE_TYPE_TAGS` | `RegistrumTagsProvider.Impl<DamageType>` | `SERVER` | 生成 `tags/damage_type` 伤害类型标签 |
| `ITEM_TAGS` | `RegistrumItemTagsProvider` | `SERVER` | 生成 `tags/item` 物品标签，并支持 `copy` 方块标签 |
| `FLUID_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Fluid>` | `SERVER` | 生成 `tags/fluid` 流体标签 |
| `ENTITY_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | `SERVER` | 生成 `tags/entity_type` 实体类型标签 |
| `GENERIC_SERVER` | `RegistrumGenericProvider` | `SERVER` | 挂载任意自定义服务端原版 `DataProvider` |
| `BLOCKSTATE` | `RegistrumBlockstateProvider` | `CLIENT` | 生成方块状态与方块模型 JSON |
| `ITEM_MODEL` | `RegistrumItemModelProvider` | `CLIENT` | 生成物品模型 JSON |
| `LANG` | `RegistrumLangProvider` | `CLIENT` | 同时生成 `en_us.json` 与自动转换后的倒置英文 `en_ud.json` |
| `GENERIC_CLIENT` | `RegistrumGenericProvider` | `CLIENT` | 挂载任意自定义客户端原版 `DataProvider` |

### 注册自定义 `ProviderType`

如果 Mod 引入了自定义注册表标签或独立 JSON 生成器，可通过 `ProviderType` 静态工厂方法注册新的 `ProviderType`（**必须在 `GatherDataEvent` 触发前完成类初始化**）：

- `ProviderType.registerServerData(String name, SimpleServerDataFactory<T> factory)`：便捷创建仅接收 `(parent, output, provider)` 的服务端生成器。
- `ProviderType.registerProvider(String name, DependencyAwareProviderType<T> type)`：完全访问 `ProviderType.Context<T>`（包含 `output`、`fileHelper`、`provider`、`existing` 同级表与已标记 `@Deprecated` 的 `event`）。
- `ProviderType.registerIntrinsicTag(String providerName, String typeName, ResourceKey<? extends Registry<T>> registry, Function<T, ResourceKey<T>> keyExtractor)`：为内建静态注册表新增标签 ProviderType。
- `ProviderType.registerDynamicTag(String providerName, String typeName, ResourceKey<Registry<T>> registry)`：为动态数据包注册表新增标签 ProviderType。
- `ProviderType.registerTag(String name, ResourceKey<? extends Registry<T>> key, DependencyAwareProviderType<R> type)`：自定义标签子类的注册入口（注意：`RegistrumDataProvider` 要求所有 `RegistrumTagsProvider` 必须通过 `registerTag` 系列注册，否则会抛出异常）。

## 各细分 Provider 核心 API 详解

### 1. 模型与方块状态 (`RegistrumBlockstateProvider` & `RegistrumItemModelProvider`)

- `RegistrumBlockstateProvider` 继承自 NeoForge `BlockStateProvider`，追加：
  - `getExistingVariantBuilder(Block block)` -> `Optional<VariantBlockStateBuilder>`
  - `getExistingMultipartBuilder(Block block)` -> `Optional<MultiPartBlockStateBuilder>`
- `RegistrumItemModelProvider` 继承自 NeoForge `ItemModelProvider`，追加常用捷径：
  - `modid(item)` / `name(item)` / `itemTexture(item)`（`modLoc("item/" + name(item))`）
  - `blockItem(block)` / `blockItem(block, suffix)` / `blockWithInventoryModel(block)`（父级指向 `block/<name>_inventory`）
  - `blockSprite(block)` / `blockSprite(block, texture)`（用 `item/generated` + `block/` 纹理生成平面方块物品模型）
  - `generated(item)` / `generated(item, ResourceLocation... layers)`（多层 `layer0`、`layer1`...）
  - `handheld(item)` / `handheld(item, texture)`（工具/武器手持模型 `item/handheld`）

### 2. 语言生成 (`RegistrumLangProvider`)

同时输出标准 `en_us` 与基于字母映射表和 printf 占位符保序反转的 `en_ud`：

- `toEnglishName(String internalName)`：将蛇形命名（如 `"copper_ingot"`）转为 `"Copper Ingot"`。
- `getAutomaticName(NonNullSupplier<? extends T> sup, ResourceKey<? extends Registry<T>> registry)`：按注册表 Key 自动转写。
- 快捷翻译：`addBlock(block)`、`addItem(item)`、`addEntityType(entity)`、`add(CreativeModeTab tab, String name)`。
- Tooltip 支持：`addBlockWithTooltip(...)`、`addItemWithTooltip(...)`、`addTooltip(item, String)`（Key 为 `<descId>.desc`）、`addTooltip(item, List<String>)`（Key 为 `<descId>.desc.0`, `...desc.1`）。
- `toUpsideDown(String)`：保留 `%s`、`%1$s` 等格式占位符完整性的英文上下倒置字符串转换器。

### 3. 配方与原料包装 (`RegistrumRecipeProvider` & `DataIngredient`)

`RegistrumRecipeProvider` 继承原版 `RecipeProvider` 并实现 `RecipeOutput`，将原本是 `protected static` 的大量原版辅助方法重新以 `public` / `public static` 暴露出来以便在 Lambda 外部直接调用，并针对常见合成模式提供高级封装：

- **命名规范工具**：`safeId(...)`、`safeName(...)`（将路径中的 `/` 转为 `_` 避免非法文件名）。
- **烹饪系**：`cooking(...)`、`smelting(...)`、`blasting(...)`、`smoking(...)`、`campfire(...)`、`smeltingAndBlasting(...)`、`food(...)`（同时生成熔炼/烟熏/营火）。内置默认时长常量 `DEFAULT_SMELT_TIME = 200`、`DEFAULT_BLAST_TIME = 100`、`DEFAULT_SMOKE_TIME = 100`、`DEFAULT_CAMPFIRE_TIME = 600`。
- **切石与压块系列**：`stonecutting(...)`、`square(source, category, output, small)`（2x2 或 3x3 合成）、`storage(source, category, output)`（双向 9 合 1 + 1 分 9）、`singleItemUnfinished(...)`、`singleItem(...)`。
- **建材套组**：`planks(...)`、`stairs(...)`、`slab(...)`、`fence(...)`、`fenceGate(...)`、`wall(...)`、`door(...)`、`trapDoor(...)`；另有 1.21.1 手工补齐的非原版静态辅助 `shelf(result, strippedLogs)`、`colorItemWithDye(...)`、`colorWithDye(...)`、`dryGhast(result)`。
- **动态注册表查询**：`resolve(ResourceKey<T> key)` 直接在 `provider` 上解析 `Holder<T>`。

`DataIngredient` 将 `Ingredient` 与配方名/解锁条件 `InventoryChangeTrigger.TriggerInstance` 捆绑，避免重复手写 `.unlockedBy("has_xxx", has(xxx))`（仅限数据生成期间使用）：
- `DataIngredient.items(NonNullSupplier...)` / `DataIngredient.items(T first, T... others)`
- `DataIngredient.stacks(ItemStack first, ItemStack... others)`
- `DataIngredient.tag(TagKey<Item> tag)`
- `DataIngredient.ingredient(Ingredient, ItemLike / TagKey / ResourceLocation + ItemPredicate...)`
- `getCriterion(RegistrumRecipeProvider)` 与 `toVanilla()`

### 4. 进度生成 (`RegistrumAdvancementProvider`)

实现 `Consumer<AdvancementHolder>`，允许通过 `provider.accept(holder)` 或带条件版 `provider.withConditions(holder, conditions)` 输出至 `data/<ns>/advancement/<path>.json`：
- `title(String category, String name, String title)` -> 通过 `owner.addLang("advancements", ...)` 生成 `advancements.<category>.<name>.title` 并返回组件。
- `desc(String category, String name, String desc)` -> 生成 `.description` 并返回组件。
- `resolve(ResourceKey<T> key)` -> 从 `HolderLookup.Provider` 解析 `Holder<T>`。

### 5. 标签生成 (`RegistrumTagsProvider` & `RegistrumItemTagsProvider`)

- `RegistrumTagsProvider<T>` 具备两类实现：`Impl<T>`（对应 `TagsProvider<T>`，常用于附魔、伤害类型或动态注册表）与 `IntrinsicImpl<T>`（对应 `IntrinsicHolderTagsProvider<T>`，可直接通过 `addTag(tag).add(entry)` 填入对象）。
- `RegistrumItemTagsProvider` 增加原版 `copy(TagKey<Block>, TagKey<Item>)`，在完成 `BLOCK_TAGS` 构建后异步将方块标签项复制写入对应物品标签。

### 6. DataMap 与动态数据包 (`RegistrumDataMapProvider` & `RegistrumDatapackProvider`)

- `RegistrumDataMapProvider` 继承自 NeoForge `DataMapProvider`，在 `gather(HolderLookup.Provider)` 执行期间提供 `getProvider()` 方法，使单条 Builder 上的 `.dataMap(type, (ctx, lookup) -> ...)` 可安全获取当前注册查找表（脱离 `gather` 调用会抛出 `IllegalStateException`）。
- `RegistrumDatapackProvider` 将 `DataProviderInitializer.getDatapackRegistryProviders()` 中的全部 `RegistrySetBuilder` 条目打包通过 `RegistryPatchGenerator.createLookup(...)` 输出数据包文件，并通过 `getFilledProvider()` 把补全后的动态注册表暴露给依赖它的下游标签 Provider（例如附魔或伤害类型标签）。

### 7. 战利品表 (`loot` 子包)

`RegistrumLootTableProvider` 支持两类扩展方式：
- **`LootType<T extends RegistrumLootTables>`**：内置 `LootType.BLOCK`（`RegistrumBlockLootTables`，已把原版 `VanillaBlockLoot` 的 `protected` 方法重新以 `public` 暴露，如 `createSilkTouchDispatchTable`、`createOreDrop`、`dropSelf`、`dropOther` 等，并限制 `getKnownBlocks()` 只校验本 `Registrum` 注册的方块）与 `LootType.ENTITY`（`RegistrumEntityLootTables`，限制 `getKnownEntityTypes()` 只校验本 `Registrum` 实体）。支持通过 `LootType.register(name, paramSet, factory)` 扩展自定义类型。
- **任意 `LootContextParamSet`**：通过 `addLootAction(LootContextParamSet, Consumer<BiConsumer<ResourceKey<LootTable>, LootTable.Builder>>)` 直接注册宝箱/钓鱼/考古等任意战利品上下文。

### 8. 通用扩展 (`RegistrumGenericProvider`)

通过 `REGISTRUM.addDataGenerator(ProviderType.GENERIC_SERVER, gen -> gen.add(data -> new MyCustomProvider(data.output(), data.registries(), data.existingFileHelper())))` 或 `GENERIC_CLIENT`，无需自行处理 `GatherDataEvent` 监听即可接入任意原版或第三方 `DataProvider`。`RegistrumProviderDelegate` 提供了与单个条目绑定的 `DataProvider` 轻量标识接口（含 `getName()`、`getId()`、`getEntry()`）。

## 完整实用示例：数据包动态注册表 + 附带条件的进度 + 物品标签复制

```java
package com.example.examplemod.data;

import com.example.examplemod.ExampleMod;
import com.example.examplemod.registry.ModBlocks;
import com.example.examplemod.registry.ModItems;
import dev.anvilcraft.lib.v2.registrum.providers.ProviderType;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumDataProvider;
import dev.anvilcraft.lib.v2.registrum.util.DataIngredient;
import net.minecraft.advancements.Advancement;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.advancements.AdvancementType;
import net.minecraft.advancements.critereon.InventoryChangeTrigger;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.recipes.RecipeCategory;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.damagesource.DamageScaling;
import net.minecraft.world.damagesource.DamageType;
import net.neoforged.neoforge.common.conditions.ModLoadedCondition;

import java.util.List;

public class ModDataGenerators {
    public static final ResourceKey<DamageType> CRUSHING_DAMAGE = ResourceKey.create(
        Registries.DAMAGE_TYPE,
        ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "crushing")
    );

    public static void init() {
        // 1. 声明动态数据包注册表（DamageType）生成逻辑及标签依赖
        ExampleMod.REGISTRUM.getDataGenInitializer().add(
            Registries.DAMAGE_TYPE,
            ctx -> ctx.register(CRUSHING_DAMAGE, new DamageType("crushing", DamageScaling.WHEN_CAUSED_BY_LIVING_NON_PLAYER, 0.1f))
        );
        ExampleMod.REGISTRUM.getDataGenInitializer().addDependency(ProviderType.DAMAGE_TYPE_TAGS, ProviderType.DYNAMIC);

        // 2. 物品标签复制：将自定义方块标签复制到同名物品标签
        ExampleMod.REGISTRUM.addDataGenerator(ProviderType.ITEM_TAGS, prov -> {
            prov.copy(BlockTags.STORAGE_BLOCKS_IRON, ItemTags.create(BlockTags.STORAGE_BLOCKS_IRON.location()));
        });

        // 3. 全局配方（使用 DataIngredient 自动推导解锁条件与安全路径 ID）
        ExampleMod.REGISTRUM.addDataGenerator(ProviderType.RECIPE, prov -> {
            prov.smeltingAndBlasting(
                DataIngredient.items(ModItems.EXAMPLE_INGOT),
                RecipeCategory.MISC,
                ModBlocks.CRUSHER,
                0.7f
            );
        });

        // 4. 带加载条件的新手进度（仅在 anvilcraft 加载时生效）
        ExampleMod.REGISTRUM.addDataGenerator(ProviderType.ADVANCEMENT, prov -> {
            AdvancementHolder root = Advancement.Builder.advancement()
                .display(
                    ModBlocks.CRUSHER.get(),
                    prov.title(ExampleMod.MODID, "root", "Anvil & Gear"),
                    prov.desc(ExampleMod.MODID, "root", "Obtain a Mechanical Crusher"),
                    ResourceLocation.withDefaultNamespace("textures/gui/advancements/backgrounds/stone.png"),
                    AdvancementType.TASK,
                    true, true, false
                )
                .addCriterion("has_crusher", InventoryChangeTrigger.TriggerInstance.hasItems(ModBlocks.CRUSHER.get()))
                .build(ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "main/root"));

            prov.withConditions(root, List.of(new ModLoadedCondition("anvilcraft")));
        });
    }
}
```
