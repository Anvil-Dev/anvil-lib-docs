# 数据生成連携：模型、配方、战利品表、标签与语言

`module.registrum` 对 Minecraft 1.21.4 与 NeoForge 新版数据生成管线做了完整适配：取消了旧版依赖文件校验（`ExistingFileHelper`）的 `BlockStateProvider` / `ItemModelProvider`，改为统一通过 **`ProviderType.MODEL` (`RegistrumModelProvider`)** 驱动原版风格的 **`RegistrumBlockModelGenerator`**（方块状态与模型）与 **`RegistrumItemModelGenerator`**（物品客户端模型定义）。同样，配方生成器改由 **`ProviderType.RECIPE_RUNNER` (`RegistrumRecipeRunner`)** 托管。

## `ProviderType` 与 `GeneratorType` 调度体系

每个数据生成动作都以 `GeneratorType<D>` 作为路由键。`ProviderType<T extends RegistrumProvider>` 本身继承自 `GeneratorType<T>`，既可作为独立的 `DataProvider` 运行，也可通过 `createGenerator(String)` 拆分子生成器。

### 内置 Server / Client Generator 键一览

| 类型键 | 目标生成对象 | 所属逻辑侧 | 常见用途 |
| --- | --- | --- | --- |
| `ProviderType.DYNAMIC` | `RegistrumDatapackProvider` | Server | 注册数据包注册表条目（如生物群系、结构、维度类型、附魔） |
| `ProviderType.DATA_MAP` | `RegistrumDataMapProvider` | Server | 生成 NeoForge `DataMap` JSON（如燃料时长、堆肥几率、自定义数据映射） |
| `ProviderType.RECIPE_RUNNER` | `RegistrumRecipeRunner` | Server | NeoForge `RecipeProvider.Runner` 容器 |
| `ProviderType.RECIPE`（子键） | `RegistrumRecipeProvider` | Server | 在 `buildRecipes()` 中实际编写所有合成配方，附带快捷配方工具方法 |
| `ProviderType.ADVANCEMENT` | `RegistrumAdvancementProvider` | Server | 成就 JSON 生成（支持 `WithConditions` 条件化成就） |
| `ProviderType.LOOT` | `RegistrumLootTableProvider` | Server | 战利品表总入口（内置 `LootType.BLOCK` / `LootType.ENTITY` 及任意 `ContextKeySet`） |
| `ProviderType.BLOCK_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Block>` | Server | 方块标签生成器（`tags/block`） |
| `ProviderType.ITEM_TAGS` | `RegistrumItemTagsProvider` | Server | 物品标签生成器，自动依赖于 `BLOCK_TAGS` 并支持 `copy(BlockTag, ItemTag)` |
| `ProviderType.ENCHANTMENT_TAGS` | `RegistrumTagsProvider.Impl<Enchantment>` | Server | 附魔动态注册表标签（`tags/enchantment`） |
| `ProviderType.FLUID_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<Fluid>` | Server | 流体标签生成器（`tags/fluid`） |
| `ProviderType.ENTITY_TAGS` | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | Server | 实体类型标签生成器（`tags/entity`） |
| `ProviderType.GENERIC_SERVER` | `RegistrumGenericProvider` | Server | 向通用数据输出口追加任意标准 `DataProvider`（如声音 `sounds.json` 或模组自定义数据） |
| `ProviderType.MODEL` | `RegistrumModelProvider` | Client | 原版风格客户端模型总包容器 |
| `ProviderType.BLOCKSTATE`（子键） | `RegistrumBlockModelGenerator` | Client | 编写方块状态 (`blockstates/*.json`) 及对应方块/模板模型 |
| `ProviderType.ITEM_MODEL`（子键） | `RegistrumItemModelGenerator` | Client | 编写 1.21.4 新版物品模型描述 (`items/*.json`) 及模型本体 |
| `ProviderType.LANG` | `RegistrumLangProvider` | Client | 生成 `en_us.json` 与自动倒转语言文件 `en_ud.json` |
| `ProviderType.GENERIC_CLIENT` | `RegistrumGenericProvider` | Client | 挂载任意客户端自定义 `DataProvider` |

### 注册自定义 `ProviderType` 与依赖排序 (`DataProviderInitializer`)

通过 `ProviderType` 静态工厂方法与 `AbstractRegistrum#getDataGenInitializer()`，可以注册第三方自定义 Provider 及其拓扑前驱依赖：

```java
ProviderType<MyCustomProvider> CUSTOM_DATA = ProviderType.registerServerData(
    "my_custom_data",
    (parent, packOutput, lookup) -> new MyCustomProvider(parent, packOutput, lookup)
);

// 声明依赖关系（例如自定义 Provider 必须在 BLOCK_TAGS 完成之后构建 CompletableFuture）
MyMod.REGISTRUM.getDataGenInitializer().addDependency(CUSTOM_DATA, ProviderType.BLOCK_TAGS);

// 登记动态 Datapack 注册表（如 RegistrySetBuilder#add）
MyMod.REGISTRUM.getDataGenInitializer().add(Registries.CONFIGURED_FEATURE, bootstrap -> {
    // 填充动态特性注册项
});
```

`ProviderType` 静态注册方法列表：
- `registerServerData(String name, SimpleServerDataFactory<T> factory)`
- `registerProvider(String name, ProviderType<T> type)`
- `registerClientProvider(String name, NonNullSupplier<ProviderType<T>> supplier)`（非 Datagen 环境下直接安全返回空实现，不触发客户端类加载）
- `registerIntrinsicTag(String providerName, String typeName, ResourceKey<? extends Registry<T>> registry, Function<T, ResourceKey<T>> keyExtractor)`
- `registerDynamicTag(String providerName, String typeName, ResourceKey<Registry<T>> registry)`
- `registerTag(String name, ResourceKey<? extends Registry<T>> key, ProviderType<R> type)`

## 模型生成：`RegistrumBlockModelGenerator` 与 `RegistrumItemModelGenerator`

`RegistrumModelProvider` 继承自原版 `ModelProvider`，执行时会把 `RegistrumBlockModelGenerator`（继承原版 `BlockModelGenerators`）注入 `ProviderType.BLOCKSTATE`，把 `RegistrumItemModelGenerator`（继承原版 `ItemModelGenerators`）注入 `ProviderType.ITEM_MODEL`。

### 方块状态与兼容旧式建模器 (`RegistrumLegacyBlockModelBuilder`)

除了可以使用原版 `BlockModelGenerators` 的全套模板方法（例如 `createTrivialCube(block)`、`createNonTemplateModelBlock(block)`、`createRotatedPillarWithHorizontalVariant(...)`），`RegistrumBlockModelGenerator` 还提供了与过去 `ModelBuilder` 习惯衔接的辅助 API：

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `family(Block block)` | `BlockModelGenerators.BlockFamilyProvider` | 复用或创建方块家族构建器生成楼梯、台阶、栅栏等关联模型 |
| `create(Block block, ResourceLocation modelLocation)` | `BlockVariantGenerator` | 基于既有模型 ID 快速创建一个通用变体生成器 |
| `create(Block block, TexturedModel.Provider provider)` | `ResourceLocation` | 根据 `TexturedModel.Provider` 生成对应模型并返回路径 |
| `mcLoc(String path)` / `modLoc(String path)` | `ResourceLocation` | 分别构造 `minecraft:<path>` 与 `<modid>:<path>` 资源定位 |
| `getBuilder()` / `withBuilder(Function<ResourceLocation, ResourceLocation> nameDecorator)` | `RegistrumLegacyBlockModelBuilder` | 进入兼容版方块模型模板构建链，允许自由配置贴图槽、父模板、渲染类型与物品展示变换 |
| `withParent(ResourceLocation parent)` | `RegistrumLegacyBlockModelBuilder` | 直接以指定父模型（如 `block/cube_all` 或自定义模板）创建兼容模型构建器 |
| `withParent(String name, ResourceLocation parent)` | `RegistrumLegacyBlockModelBuilder` | 指定模型输出路径名并继承指定父模型 |

`RegistrumLegacyBlockModelBuilder` 支持的链式配置方法：
- `texture(TextureSlot slot, ResourceLocation texture)`（多次调用累加纹理映射，会自动根据所绑定槽位构建对应的原版 `TextureMapping`）
- `parent(ResourceLocation parent)`、`suffix(String suffix)`、`transformTemplate(UnaryOperator<ModelTemplate>)`、`transformTexture(UnaryOperator<TextureMapping>)`
- `renderType(String renderType)` / `renderType(ResourceLocation renderType)`（向扩展模型写入 `"render_type"`，例如 `"cutout"`、`"translucent"`）
- `ambientOcclusion(boolean)`、`guiLight(UnbakedModel.GuiLight)`、`rootTransforms(Consumer<RootTransformsBuilder>)`、`transform(ItemDisplayContext, Consumer<TransformVecBuilder>)`、`customLoader(...)`（基于 NeoForge `ExtendedModelTemplateBuilder` 输出扩展属性）
- **终结生成方法**：`build(Block target)`（以目标方块命名并注册）或 `build(ResourceLocation modelId)`（直接返回生成好的模型 `ResourceLocation`）

```java
// 借助兼容构建器生成带自定义贴图和 cutout 渲染层的立方体方块
MyMod.REGISTRUM.block("copper_grate", Block::new)
    .blockstate(() -> (ctx, prov) -> {
        ResourceLocation model = prov.withParent(ctx.getName(), prov.mcLoc("block/cube_all"))
            .texture(TextureSlot.ALL, prov.modLoc("block/copper_grate"))
            .renderType("cutout")
            .build(ctx.getId());
        prov.blockStateOutput.accept(
            net.minecraft.client.data.models.BlockModelGenerators.createSimpleBlock(ctx.getEntry(), model)
        );
    })
    .simpleItem()
    .register();
```

### 物品模型与染色模型：`RegistrumItemModelGenerator`

`RegistrumItemModelGenerator` 直接继承原版 `ItemModelGenerators`，并提供额外常用封装：

| 方法 | 说明 |
| --- | --- |
| `generateFlatItem(Item item, ModelTemplate template)` | 原版继承方法，通常配合 `ModelTemplates.FLAT_ITEM` 或 `HANDHELD_ITEM` |
| `createWithExistingModel(Item item, ResourceLocation modelId)` | 为 `items/<name>.json` 写入指向现有模型 ID（例如某个方块模型或特制模型）的 `Plain` 模型定义 |
| `generateTintedModel(Item item, ResourceLocation modelId, ItemTintSource... tintSources)` | 为 `items/<name>.json` 生成携带 `ItemTintSource`（如 `Constant`、`Dye`、`Firework`）的着色模型定义 |
| `mcLoc(String)` / `modLoc(String)` | 快速拼接原版或本模组资源 ID |
| `modid(NonNullSupplier<String> modid)` / `name(NonNullSupplier<String> name)` | 组合路径辅助工具 |

## 配方生成：`RegistrumRecipeProvider` 与 `DataIngredient`

`RegistrumRecipeRunner` 在服务端 Datagen 阶段自动创建 `RegistrumRecipeProvider`（继承 `RecipeProvider` 并直接实现 `RecipeOutput`，可直接传给原版 `.save(prov, ...)`）。

### `DataIngredient`：将配方材料与解锁条件打包

在 1.21.4 中，`DataIngredient` 不再直接代理原版 `Ingredient` 的所有方法，在传给原版 `RecipeBuilder` 时请使用 `toVanilla()`；而它的解锁判据仍能一键自动推导：

| 工厂 / 实例方法 | 说明 |
| --- | --- |
| `DataIngredient.items(NonNullSupplier<? extends ItemLike> first, NonNullSupplier<? extends ItemLike>... others)` | 将一个或多个延迟物品注册项包装为 `DataIngredient`（支持直接输入标签或物品） |
| `DataIngredient.items(ItemLike first, ItemLike... others)` | 包装现有原版或静态物品实例 |
| `DataIngredient.stacks(ItemStack first, ItemStack... others)` | 从物品堆抽取对应 `Item` 构造材料与解锁判据 |
| `DataIngredient.tag(TagKey<Item> tag)` | 包装物品标签，解锁判据会自动基于该 `TagKey` 创建 |
| `DataIngredient.ingredient(Ingredient parent, ItemLike / TagKey<Item> / ResourceLocation, ItemPredicate...)` | 包装自定义原版 `Ingredient`（例如附带 NBT/Component 校验的混合材料） |
| `toVanilla()` | 提取内部原版 `Ingredient` 实例 |
| `getCriterion(RegistrumRecipeProvider prov)` | 生成对应的解锁条件 `Criterion<InventoryChangeTrigger.TriggerInstance>` |
| `getId()` | 返回材料标识名，可用于生成唯一配方名 `prov.safeName(source)` |

### `RegistrumRecipeProvider` 常用便捷配方方法

除原版 `RecipeProvider` 的 `shaped(...)`、`shapeless(...)`、`has(...)`、`tag(TagKey)` 外，`RegistrumRecipeProvider` 提供了大量一键生成并自动命名与配对解锁条件的封装：

- **路径安全工具**：`resolve(ResourceKey<T>)`、`safeId(...)`、`safeKey(...)`、`safeName(...)`
- **烹饪与冶炼**：`smelting(...)`、`blasting(...)`、`smoking(...)`、`campfire(...)`、`cooking(...)`、`smeltingAndBlasting(...)`、`food(...)`（内置常量 `DEFAULT_SMELT_TIME = 200` 等）
- **切石机**：`stonecutting(source, category, result[, resultAmount])`
- **压缩块与合成**：`square(source, category, output, small)`（2x2 或 3x3）、`storage(sourceSupplier, category, outputSupplier)`（自动同时生成 3x3 合成与 1->9 拆解双向配方）、`singleItem(...)`、`singleItemUnfinished(...)`、`planks(...)`
- **建筑系列方框**：`stairs(...)`、`slab(...)`、`wall(...)`、`fence(...)`、`fenceGate(...)`、`trapDoor(...)`、`door(...)`、`pressurePlate(...)`、`button(...)` 等均可自动附带对应石切方案

```java
MyMod.REGISTRUM.item("alloy_ingot", Item::new)
    .recipe((ctx, prov) -> {
        DataIngredient rawAlloy = DataIngredient.items(ModItems.RAW_ALLOY);
        // 烧炼与高炉双配方
        prov.smeltingAndBlasting(rawAlloy, RecipeCategory.MISC, ctx, 0.7F);
        // 双向 9 合 1 存储块配方
        prov.storage(ctx, RecipeCategory.BUILDING_BLOCKS, ModBlocks.ALLOY_BLOCK);
    })
    .register();
```

## 战利品表：`RegistrumLootTableProvider`、`Block` 与 `Entity`

`RegistrumLootTableProvider` 在 1.21.4 中基于 `ContextKeySet`（替代了旧版 `LootContextParamSet`）聚合战利品生成动作：
- **`LootType.BLOCK` (`RegistrumBlockLootTables`)**：透传并扩展原版 `VanillaBlockLoot`，所有常用受限 protected/public 方法（如 `dropSelf`、`dropOther`、`dropWhenSilkTouch`、`otherWhenSilkTouch`、`createSingleItemTable`、`createOreDrop`、`createSilkTouchDispatchTable`、`createSlabItemTable`、`createDoorTable`、`createCropDrops`、`createMultifaceBlockDrops`、`createMossyCarpetBlockDrops` 等）已开放为 `public`。
- **`LootType.ENTITY` (`RegistrumEntityLootTables`)**：面向生物实体的战利品生成器，`add(EntityType<?>, LootTable.Builder)` / `add(EntityType<?>, ResourceKey<LootTable>, LootTable.Builder)` 均公开。
- **自定义战利品类型**：可使用 `prov.addLootAction(LootContextParamSets.CHEST, callback -> ...)` 注册箱子、钓鱼或考古战利品。

> [!WARNING]
> 注册到 `RegistrumBlockLootTables` 的自定义方块必须在 `BlockBehaviour.Properties` 上保留战利品表（不要调用 `.noLootTable()`）；如果某方块既不调用 `.noLootTable()` 又未被写入战利品映射，`LootTableProvider` 验证会报错。对装饰型或流体等不需要掉落物的方块请在 `BlockBuilder#properties` 中加上 `.noLootTable()`，或在 `BlockBuilder#loot` 中生成显式空表。

## 标签 (`Tags`)、语言 (`Lang`)、成就 (`Advancement`) 与通用数据 (`Generic`)

- **标签生成 (`RegistrumTagsProvider`)**：支持常规标签生成 `Builder#tag(...)` 及全局增补 `REGISTRUM.addDataGenerator(ProviderType.BLOCK_TAGS, prov -> prov.addTag(...).add(...))`。在 `ProviderType.ITEM_TAGS`（`RegistrumItemTagsProvider`）中可调用 `prov.copy(BlockTags.FENCES, ItemTags.FENCES)` 同步复制方块标签到物品标签，无需旧版 `ExistingFileHelper`。
- **语言生成 (`RegistrumLangProvider`)**：所有 `Builder#lang(...)` 与 `addRawLang` 都会同时生成 `assets/<modid>/lang/en_us.json` 与自动将文本字母倒转（保留 `%1$s` 等格式化占位符）生成的测试语言 `en_ud.json`；公开静态工具方法 `toEnglishName(String)`、`toUpsideDown(String)` 及 `add(ResourceKey, ...)` / `addBlock` / `addItem` 等全部方法可直接调用。
- **成就生成 (`RegistrumAdvancementProvider`)**：实现 `Consumer<AdvancementHolder>`，不仅能直接传入原版 `Advancement.Builder#save(prov, id)`，还可通过 `prov.save(Consumer<AdvancementHolder>, AdvancementHolder, List<ICondition>)` 生成附带 NeoForge `ICondition` 的条件成就（内部使用 `Advancement.CONDITIONAL_CODEC`）。
- **数据地图 (`RegistrumDataMapProvider`) & 数据包注册表 (`RegistrumDatapackProvider`)**：分别对应 `ProviderType.DATA_MAP` 和 `ProviderType.DYNAMIC`；`RegistrumDatapackProvider` 会自动从 `AbstractRegistrum#getDataGenInitializer()` 提取全部已登记的 `RegistrySetBuilder` 条目与标签生成一体的静态注册表 JSON。
- **通用自定义输出 (`RegistrumGenericProvider`)**：通过 `ProviderType.GENERIC_SERVER` 或 `ProviderType.GENERIC_CLIENT`，调用 `prov.add(data -> new CustomJsonProvider(data.output(), data.registries()))` 即可无缝接入任何实现原版 `DataProvider` 的生成器。
