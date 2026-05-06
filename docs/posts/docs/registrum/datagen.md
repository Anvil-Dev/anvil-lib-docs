---
title: Registrum 数据生成
prev: false
next: false
---

# 数据生成

Registrum 深度集成 NeoForge 数据生成系统，通过 `GeneratorType` 和 `ProviderType` 管理各类数据生成器。

## ProviderType（内置类型）

`ProviderType<T>` 是模块内置的数据生成器类型注册表。

| 类型 | 生成器 | Side | 说明 |
|------|--------|------|------|
| `LANG` | `RegistrumLangProvider` | CLIENT | 语言文件 (`en_us.json`) |
| `MODEL` | `RegistrumModelProvider` | CLIENT | 模型 JSON |
| `BLOCKSTATE` | `RegistrumBlockModelGenerator` | CLIENT | 方块状态/模型 |
| `ITEM_MODEL` | `RegistrumItemModelGenerator` | CLIENT | 物品模型 |
| `RECIPE` | `RegistrumRecipeProvider` | SERVER | 配方 JSON |
| `RECIPE_RUNNER` | `RegistrumRecipeRunner` | SERVER | 配方运行器 |
| `LOOT` | `RegistrumLootTableProvider` | SERVER | 战利品表 |
| `ADVANCEMENT` | `RegistrumAdvancementProvider` | SERVER | 进度 |
| `DATA_MAP` | `RegistrumDataMapProvider` | SERVER | DataMap |
| `DYNAMIC` | `RegistrumDatapackProvider` | SERVER | 数据包动态注册 |
| `BLOCK_TAGS` | `RegistrumTagsProvider` | SERVER | 方块标签 |
| `ITEM_TAGS` | `RegistrumItemTagsProvider` | SERVER | 物品标签 |
| `FLUID_TAGS` | `RegistrumTagsProvider` | SERVER | 流体标签 |
| `ENTITY_TAGS` | `RegistrumTagsProvider` | SERVER | 实体标签 |
| `ENCHANTMENT_TAGS` | `RegistrumTagsProvider` | SERVER | 附魔标签 |
| `DAMAGE_TYPE_TAGS` | `RegistrumTagsProvider` | SERVER | 伤害类型标签 |
| `GENERIC_SERVER` | `RegistrumGenericProvider` | SERVER | 通用服务端数据 |
| `GENERIC_CLIENT` | `RegistrumGenericProvider` | CLIENT | 通用客户端数据 |

## GeneratorType

`GeneratorType<T>` 是标记接口，没有方法。`ProviderType` 实现了它。你可以通过 `ProviderType.createGenerator(String)` 创建匿名生成器类型。

## DataGenContext

数据生成上下文，提供条目引用。

```java
@Data
public class DataGenContext<R, E extends R> implements NonNullSupplier<E> {
    NonNullSupplier<E> entry;  // 条目 supplier
    String name;                // 条目名称
    Identifier id;              // 条目完整 ID
}
```

通过 `DataGenContext.from(builder)` 从构建器创建。

## 模型生成

### RegistrumBlockModelGenerator

```java
// 简单方块模型
gen.create(block, Identifier modLoc("block/my_texture"));
gen.create(block, TexturedModel.CUBE);

// 使用 Legacy Builder 进行高级定制
RegistrumLegacyBlockModelBuilder leg = gen.withBuilder(
    new ModelTemplates().cubeBottomTop(), textureMapping
);
leg.texture(TextureSlot.SIDE, modLoc("block/my_side"), false);
leg.build(block);
```

### RegistrumItemModelGenerator

```java
// 使用现有模型
gen.createWithExistingModel(item, modLoc("item/my_item"));

// 带色彩模型的物品
gen.generateTintedModel(item, modLoc("item/my_item"), tintSource);
```

## 配方生成

`RegistrumRecipeProvider` 提供与 Minecraft 原版 API 一致的配方生成方法，同时添加了 Registrum 特有功能。

```java
builder.recipe((ctx, gen) -> {
    // 标准配方
    gen.stairs(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.slab(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    gen.fence(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS));
    
    // 烧炼
    gen.smeltingAndBlasting(DataIngredient.items(Items.IRON_ORE), ctx.getEntry());
    
    // 切石
    gen.stonecutting(ctx.getEntry(), DataIngredient.items(Items.STONE));
    
    // 单物品配方
    gen.singleItem(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT, Items.GOLD_INGOT));
    
    // 合成与分解
    gen.storage(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT));
    gen.planks(DataIngredient.items(Items.OAK_LOG), ctx.getEntry());
});
```

## 标签生成

通过 `AbstractBuilder.tag()` 添加的标签会自动在数据生成阶段应用到对应文件：

```java
// 方块标签 — 自动添加 block tag
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE);

// 物品标签 — 自动添加 item tag
builder.tag(ItemTags.SWORDS);

// 实体标签 — 自动添加 entity type tag
builder.tag(EntityTypeTags.SKELETONS);

// 流体标签
builder.tag(FluidTags.WATER);
```

## 战利品表

### 方块战利品

```java
builder.loot((tables, block) -> {
    tables.dropSelf(block);                          // 掉落自身
    tables.add(block, tables.createSingleItemTable(Items.DIAMOND)); // 固定掉落
    tables.createOreDrop(block, Items.RAW_IRON);     // 矿石掉落
    tables.createSilkTouchDispatchTable(block, ...);  // 精准采集判定
});
```

### 实体战利品

```java
builder.loot((tables, type) -> {
    tables.add(type, LootTable.lootTable()
        .withPool(LootPool.lootPool()
            .add(LootItem.lootTableItem(Items.BONE))));
});
```

## 自定义数据生成

使用 `addDataGenerator` 或 `setDataGenerator` 添加非标准数据生成：

```java
// 使用 ProviderType 的 createGenerator 创建自定义生成类型
GeneratorType<MyGenerator> MY_GEN = ProviderType.RECIPE.createGenerator("my_gen");

builder.addMiscData(MY_GEN, gen -> {
    // 自定义数据生成逻辑
});

// 设置指定条目的数据生成（替换已有）
builder.setData(MY_GEN, (ctx, gen) -> {
    // ctx 提供 entry 的 name/id
});
```

## 数据生成入口

在模组 data generation 主类中，通过 `abstractRegistrum.genData(type, generator)` 调用所有已注册的数据生成回调。

### DataProviderInitializer

管理数据包注册表和 Provider 依赖：

```java
DataProviderInitializer init = registrum.getDataGenInitializer();

// 添加数据包注册表
init.add(registryKey, bootstrap);

// 添加 Provider 依赖（如 ITEM_TAGS 依赖 BLOCK_TAGS）
init.addDependency(ProviderType.ITEM_TAGS, ProviderType.BLOCK_TAGS);
```
