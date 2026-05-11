---
title: Registrum 数据生成
prev: false
next: false
---

# 数据生成

Registrum 深度集成 NeoForge 数据生成系统，通过 `GeneratorType` 和 `ProviderType` 管理各类数据生成器。

## ProviderType（内置类型）

`ProviderType<T>` 是模块内置的数据生成器类型注册表，每个实例定义了对应的生成器工厂。

### 服务端数据生成器

| 类型                                                  | 生成器                                                  | 说明                                        |
|-----------------------------------------------------|------------------------------------------------------|-------------------------------------------|
| `DYNAMIC`                                           | `RegistrumDatapackProvider`                          | 数据包动态注册（`DatapackBuiltinEntriesProvider`） |
| `DATA_MAP`                                          | `RegistrumDataMapProvider`                           | DataMap（燃料、堆肥等数据附件）                       |
| `RECIPE_RUNNER`                                     | `RegistrumRecipeRunner`                              | 配方运行器（`RecipeProvider.Runner`）            |
| `ADVANCEMENT`                                       | `RegistrumAdvancementProvider`                       | 进度 JSON                                   |
| `LOOT`                                              | `RegistrumLootTableProvider`                         | 战利品表                                      |
| `BLOCK_TAGS`                                        | `RegistrumTagsProvider.IntrinsicImpl<Block>`         | 方块标签                                      |
| `ENCHANTMENT_TAGS` <Badge type="tip" text="26.1" /> | `RegistrumTagsProvider.Impl<Enchantment>`            | 附魔标签                                      |
| `DAMAGE_TYPE_TAGS` <Badge type="tip" text="26.1" /> | `RegistrumTagsProvider.Impl<DamageType>`             | 伤害类型标签                                    |
| `ITEM_TAGS`                                         | `RegistrumItemTagsProvider`                          | 物品标签                                      |
| `FLUID_TAGS` <Badge type="tip" text="26.1" />       | `RegistrumTagsProvider.IntrinsicImpl<Fluid>`         | 流体标签                                      |
| `ENTITY_TAGS` <Badge type="tip" text="26.1" />      | `RegistrumTagsProvider.IntrinsicImpl<EntityType<?>>` | 实体标签                                      |
| `GENERIC_SERVER`                                    | `RegistrumGenericProvider`                           | 通用服务端数据                                   |

### 客户端数据生成器

| 类型                                       | 生成器                        | 说明                      |
|------------------------------------------|----------------------------|-------------------------|
| `MODEL` <Badge type="tip" text="26.1" /> | `RegistrumModelProvider`   | 统一模型入口（`ModelProvider`） |
| `LANG`                                   | `RegistrumLangProvider`    | 语言文件 (`en_us.json`)     |
| `GENERIC_CLIENT`                         | `RegistrumGenericProvider` | 通用客户端数据                 |

### GeneratorType 组合

下列类型由 `ProviderType` 通过 `createGenerator()` 方法派生：

| GeneratorType                                 | 派生自                                       | 生成器                            |
|-----------------------------------------------|-------------------------------------------|--------------------------------|
| `RECIPE`                                      | `RECIPE_RUNNER.createGenerator("recipe")` | `RegistrumRecipeProvider`      |
| `BLOCKSTATE` <Badge type="tip" text="26.1" /> | `MODEL.createGenerator("blockstate")`     | `RegistrumBlockModelGenerator` |
| `ITEM_MODEL` <Badge type="tip" text="26.1" /> | `MODEL.createGenerator("item_model")`     | `RegistrumItemModelGenerator`  |

## 1.21.1 → 26.1 迁移

### 核心变更

| 方面    | 1.21.1                                                                         | 26.1                                                                         |
|-------|--------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| 模型框架  | `BlockStateProvider` / `ItemModelProvider`                                     | `ModelProvider` + `BlockModelGenerators` / `ItemModelGenerators`             |
| 方块模型类 | `RegistrumBlockstateProvider`                                                  | `RegistrumBlockModelGenerator`                                               |
| 物品模型类 | `RegistrumItemModelProvider`                                                   | `RegistrumItemModelGenerator`                                                |
| 配方类   | `RegistrumRecipeProvider` (extends RecipeProvider)                             | `RegistrumRecipeProvider` (extends RecipeProvider + implements RecipeOutput) |
| 配方入口  | 直接通过 `ProviderType.RECIPE`                                                     | 通过 `RECIPE_RUNNER` → `ProviderType.RECIPE.createGenerator("recipe")`         |
| 标签类型  | BLOCK_TAGS / ITEM_TAGS                                                         | + ENCHANTMENT_TAGS / DAMAGE_TYPE_TAGS / FLUID_TAGS / ENTITY_TAGS             |
| 上下文   | `Context` 包含 `ExistingFileHelper`                                              | `Context` 不含 `ExistingFileHelper`，直接使用 `PackOutput`                          |
| 扩展点   | `SimpleServerDataFactory.create(parent, output, provider, existingFileHelper)` | `SimpleServerDataFactory.create(parent, output, provider)`                   |

### 迁移示例

```java
// 1.21.1: 方块模型
builder.blockstate(() -> (ctx, gen) -> {
    gen.simpleBlock(ctx.getEntry().get());
});

// 26.1: API 调用不变（AbstractRegistrum 内部已适配）
builder.blockstate(() -> (ctx, gen) -> {
    // ctx: DataGenContext<Block, T>
    // gen: RegistrumBlockModelGenerator
    gen.create(ctx.getEntry().get(), TexturedModel.CUBE);
});
```

### 兼容性说明

- **Builder API** (`blockstate()`, `model()`, `recipe()`) 在两个版本中**调用方式不变**
- 内部的 `GeneratorType`/`ProviderType` 实现**不兼容**（直接使用旧的 `RegistrumBlockstateProvider` 引用的代码会编译失败）
- 如果你的模组在数据生成中直接引用了 `RegistrumBlockstateProvider`、`RegistrumItemModelProvider` 等类，需要迁移到新的
  `RegistrumBlockModelGenerator`、`RegistrumItemModelGenerator`

## GeneratorType

<Badge type="tip" text="26.1" />

`GeneratorType<T>` 是标记接口，没有方法定义。它作为数据生成器回调的类型键：

```java
public interface GeneratorType<T> { }
```

`ProviderType<T>` 实现了此接口。你可以通过 `createGenerator()` 创建独立的生成器类型：

```java
// 在 ProviderType 上创建 GeneratorType
GeneratorType<RegistrumRecipeProvider> RECIPE =
    ProviderType.RECIPE_RUNNER.createGenerator("recipe");
GeneratorType<RegistrumBlockModelGenerator> BLOCKSTATE =
    ProviderType.MODEL.createGenerator("blockstate");
```

### 注册自定义 Generator

```java
// 创建自定义生成器类型
ProviderType<MyGenerator> MY_GEN_TYPE = ProviderType.registerProvider(
    "my_gen",
    ProviderType.GENERIC_SERVER  // 复用已有的创建模式
);

GeneratorType<MyGenerator> MY_GEN = MY_GEN_TYPE.createGenerator("gen_id");
```

## DataGenContext

数据生成上下文，提供条目引用。

```java
@Value
public class DataGenContext<R, E extends R> implements NonNullSupplier<E> {
    NonNullSupplier<E> entry; // 条目 Supplier（@Delegate 委托）
    String name;              // 条目注册名
    Identifier id;            // 条目完整 Identifier (modid:name)

    // 从 Builder 创建
    public static <R, E extends R> DataGenContext<R, E> from(Builder<R, E, ?, ?> builder);
}
```

通过 `@Delegate` 注解，`DataGenContext` 直接暴露 `entry.get()` 作为 `getEntry()`。

## 模型生成

### RegistrumBlockModelGenerator

```java
// 简单方块模型
gen.create(block, modLoc("block/my_texture"));
gen.create(block, TexturedModel.CUBE);

// 使用 Legacy Builder 进行高级定制
RegistrumLegacyBlockModelBuilder leg = gen.withBuilder(
    new ModelTemplates().cubeBottomTop(), textureMapping
);
leg.texture(TextureSlot.SIDE, modLoc("block/my_side"), false);
leg.build(block);

// Legacy Builder 链式方法
leg.parent(modelTemplate)           // 设置父模型
   .suffix("_on")                   // 添加后缀
   .ambientOcclusion(false)         // 禁用环境光遮蔽
   .guiLight(GuiLight.FRONT)        // GUI 光照方向
   .rootTransforms(transforms);     // 根变换
```

### RegistrumItemModelGenerator

```java
// 使用现有模型
gen.createWithExistingModel(item, modLoc("item/my_item"));

// 带色调模型的物品
gen.generateTintedModel(item, modLoc("item/my_item"), tintSource);
```

## 配方生成

`RegistrumRecipeProvider` 提供与 Minecraft 原版一致的配方 API，同时通过 `@Delegate` 委托到 `RecipeOutput`：

```java
builder.recipe((ctx, gen) -> {
    // 标准建筑配方
    gen.stairs(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.slab(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.fence(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.fenceGate(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.wall(ctx.getEntry(), DataIngredient.items(Items.STONE_BRICKS));
    gen.door(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
    gen.trapDoor(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));

    // 烧炼
    gen.smeltingAndBlasting(DataIngredient.items(Items.IRON_ORE),
        ctx.getEntry());

    // 切石
    gen.stonecutting(ctx.getEntry(),
        DataIngredient.items(Items.STONE));

    // 单物品配方
    gen.singleItem(ctx.getEntry(),
        DataIngredient.items(Items.IRON_INGOT, Items.GOLD_INGOT));

    // 压缩与分解
    gen.storage(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
    gen.planks(DataIngredient.items(Items.OAK_LOG), ctx.getEntry());

    // 食物
    gen.food(ctx.getEntry(), DataIngredient.items(Items.WHEAT, Items.SUGAR));

    // 方形合成（2×2）
    gen.square(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
});
```

### DataIngredient

配方输入辅助类，记录原料的注册名和判据工厂：

```java
// 从物品创建
DataIngredient.items(Items.OAK_PLANKS, Items.BIRCH_PLANKS);
DataIngredient.items(MY_ITEM_ENTRY);

// 从 Tag 创建
DataIngredient.tag(ItemTags.PLANKS);

// 从通用 Ingredient + 判据创建
DataIngredient.ingredient(
    Ingredient.of(Items.DIAMOND),
    Identifier.fromNamespaceAndPath("mymod", "has_diamond"),
    ItemPredicate.Builder.item().of(Items.DIAMOND).build()
);
```

::: tip Note
`DataIngredient` 仅用于数据生成，试图通过网络序列化时会抛出异常。
:::

## 标签生成

通过 `AbstractBuilder.tag()` 添加的标签会自动在数据生成阶段应用：

```java
// 方块标签
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL);

// 物品标签
builder.tag(ItemTags.SWORDS, ItemTags.CREEPER_DROP_MUSIC_DISCS);

// 实体标签
builder.tag(EntityTypeTags.SKELETONS, EntityTypeTags.FREEZE_IMMUNE_ENTITY_TYPES);

// 流体标签
builder.tag(FluidTags.WATER);

// 附魔标签 <Badge type="tip" text="26.1" />
builder.tag(EnchantmentTags.IN_ENCHANTING_TABLE);

// 伤害类型标签 <Badge type="tip" text="26.1" />
builder.tag(DamageTypeTags.BYPASSES_ARMOR);
```

### 标签去重

- `tag()` 使用 `asTag()` 方法生成 `TagEntry.element(id, false)`
- `asOptional()` 方法将标签标记为可选，生成 `TagEntry.optionalElement(id)`
- `removeTag()` 移除之前添加的标签

```java
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE)
       .asOptional()  // 这个 BlockTag 可能不存在于其他模组
       .removeTag(BlockTags.NEEDS_DIAMOND_TOOL);  // 移除之前添加的标签
```

## 战利品表

### 方块战利品

```java
builder.loot((tables, block) -> {
    tables.dropSelf(block);                             // 掉落自身
    tables.add(block, tables.createSingleItemTable(     // 固定掉落
        Items.DIAMOND));
    tables.createOreDrop(block, Items.RAW_IRON);        // 矿石掉落（含时运）
    tables.createSilkTouchDispatchTable(block,          // 精准采集判定
        tables.createSingleItemTable(block.asItem()));
    tables.dropOther(block, Items.STICK);               // 掉落其他物品
    tables.dropWhenSilkTouch(block);                    // 仅精准采集掉落
    tables.createCropDrops(block, Items.WHEAT,          // 作物掉落
        Items.WHEAT_SEEDS, builder);
    tables.createSlabItemTable(block);                  // 半砖掉落
    tables.createDoorTable(block);                      // 门掉落
    tables.createLeavesDrops(block, Blocks.OAK_SAPLING, // 树叶掉落
        NORMAL_LEAVES_SAPLING_CHANCES);
});
```

### 实体战利品

```java
builder.loot((tables, type) -> {
    tables.add(type, LootTable.lootTable()
        .withPool(LootPool.lootPool()
            .setRolls(ConstantValue.exactly(1))
            .add(LootItem.lootTableItem(Items.BONE)
                .apply(SetItemCountFunction.setCount(
                    UniformGenerator.between(0, 2)))
                .apply(LootingEnchantFunction.lootingMultiplier(
                    UniformGenerator.between(0, 1))))
        ));
});
```

## 自定义数据生成

### 使用 addDataGenerator

```java
// 使用 ProviderType 的 createGenerator 创建自定义生成类型
GeneratorType<MyGenerator> MY_GEN = ProviderType.RECIPE.createGenerator("my_gen");

// 添加非关联的数据生成（追加，不替换已有）
registrum.addDataGenerator(MY_GEN, gen -> {
    // 自定义数据生成逻辑
    gen.generate();
});
```

### 使用 setDataGenerator

```java
// 为指定条目设置数据生成（替换已有）
builder.setData(MY_GEN, (ctx, gen) -> {
    // ctx: DataGenContext 提供条目的 name/id
    // gen: 你的生成器实例
    gen.generateFor(ctx.getEntry().get());
});
```

### addMiscData vs setData

| 方法                                       | 行为      | 适用场景           |
|------------------------------------------|---------|----------------|
| `builder.setData(type, cons)`            | 替换已有回调  | 为特定条目生成特定数据    |
| `builder.addMiscData(type, cons)`        | 追加不替换   | 通用数据生成，不关联特定条目 |
| `registrum.addDataGenerator(type, cons)` | 注册表级别追加 | 全局数据生成逻辑       |

## DataProviderInitializer

管理数据包注册表和 Provider 依赖：

```java
DataProviderInitializer init = registrum.getDataGenInitializer();

// 添加数据包注册表 Entry
init.add(registryKey, bootstrap);

// 添加 Provider 依赖
init.addDependency(ProviderType.ITEM_TAGS, ProviderType.BLOCK_TAGS);

// 默认依赖: ITEM_TAGS → BLOCK_TAGS（自动设置）
```

`getSortedProviders()` 使用拓扑排序解析依赖链，确保数据生成器按正确顺序执行。
