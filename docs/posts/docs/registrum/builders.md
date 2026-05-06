---
title: Registrum 构建器
prev: false
next: false
---

# 构建器

## Builder 接口

所有构建器的根接口，扩展 `NonNullSupplier<RegistryEntry<R, T>>`。

```java
public interface Builder<R, T extends R, P, S extends Builder<R, T, P, S>>
        extends NonNullSupplier<RegistryEntry<R, T>> {
    RegistryEntry<R, T> register();
    AbstractRegistrum<?> getOwner();
    P getParent();
    String getName();
    ResourceKey<? extends Registry<R>> getRegistryKey();
    NonNullSupplier<T> asSupplier();
}
```

### 通用方法

| 方法             | 说明                            |
|----------------|-------------------------------|
| `register()`   | 完成注册，返回 `RegistryEntry`       |
| `get()`        | 从 Owner 获取已注册条目               |
| `getEntry()`   | 获取实际对象（通过 `get().get()`）      |
| `asSupplier()` | 返回 `NonNullSupplier<T>` 供延迟获取 |
| `build()`      | 调用 `register()` 后返回 Parent    |

### 回调与变换

```java
// 注册后回调
builder.onRegister(block -> LOGGER.info("Registered: {}", block));

// 等待其他注册表完成后回调
builder.onRegisterAfter(Registries.ITEM, block -> { ... });

// Transform 变换
builder.transform(b -> someCondition ? b.tag(MyTags.SPECIAL) : b);
```

### 数据生成配置

```java
// 设置数据生成回调（替换）
builder.setData(GeneratorType type, (ctx, gen) -> { ... });

// 追加非覆盖数据生成回调
builder.addMiscData(GeneratorType type, gen -> { ... });

// 注册 DataMap 附件
builder.dataMap(DataMapType type, value);
```

## BlockBuilder

构建 `Block` 注册条目。

### 创建

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
```

### 属性配置

```java
// 修改方块属性（如硬度、抗阻）
builder.properties(props -> props.strength(3.0f).requiresCorrectToolForDrops());

// 从参考方块复制初始属性
builder.initialProperties(Blocks.STONE);
```

### BlockItem 创建

```java
// 自动创建标准 BlockItem
builder.simpleItem();

// 标准 BlockItem + 更多配置
builder.item()  // → ItemBuilder<BlockItem, BlockBuilder<T, P>>
    .tab(CreativeModeTabs.BUILDING_BLOCKS)
    .lang("My Block");

// 自定义 BlockItem 子类
builder.item(MyCustomBlockItem::new);
```

### BlockEntity 集成

```java
// 快速创建（无法配置更多）
builder.simpleBlockEntity(MyBlockEntity::new);

// 返回 BlockEntityBuilder 供进一步配置
builder.blockEntity(MyBlockEntity::new)
    .renderer(MyRenderer::new)
    .validBlock(MY_BLOCK);
```

### 渲染与颜色

```java
// 客户端方块颜色处理器
builder.color(() -> () -> List.of(BlockTintSource.tint(...)));
```

### 模型、战利品表、配方

```java
// 默认立方体模型
builder.defaultBlockstate();

// 自定义模型
builder.blockstate(() -> (ctx, gen) -> gen.create(ctx.getEntry().get(), TexturedModel.CUBE));

// 默认自掉落战利品表
builder.defaultLoot();

// 自定义战利品表
builder.loot((tables, block) -> tables.add(block, tables.createSingleItemTable(Items.DIAMOND)));

// 配方
builder.recipe((ctx, gen) -> gen.stairs(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS)));
```

### 标签

```java
// 添加标签
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL);
```

### 注册

```java
// 返回 BlockEntry<T>
BlockEntry<MyBlock> entry = builder.register();
```

### BlockBuilder 特有方法

| 方法                           | 返回值                                    | 说明                   |
|------------------------------|----------------------------------------|----------------------|
| `simpleItem()`               | `BlockBuilder<T,P>`                    | 快速创建 BlockItem       |
| `item()`                     | `ItemBuilder<BlockItem, BlockBuilder>` | 标准 BlockItem Builder |
| `item(factory)`              | `ItemBuilder<I, BlockBuilder>`         | 自定义 BlockItem 工厂     |
| `simpleBlockEntity(factory)` | `BlockBuilder<T,P>`                    | 快速创建 BlockEntity     |
| `blockEntity(factory)`       | `BlockEntityBuilder<BE, BlockBuilder>` | BlockEntity Builder  |
| `color(supplier)`            | `BlockBuilder<T,P>`                    | 方块颜色处理器              |
| `clientExtension(supplier)`  | `BlockBuilder<T,P>`                    | 客户端扩展                |
| `defaultBlockstate()`        | `BlockBuilder<T,P>`                    | 默认 blockstate 模型     |
| `blockstate(supplier)`       | `BlockBuilder<T,P>`                    | 自定义 blockstate 模型    |
| `defaultLoot()`              | `BlockBuilder<T,P>`                    | 默认战利品表               |
| `loot(consumer)`             | `BlockBuilder<T,P>`                    | 自定义战利品表              |
| `recipe(consumer)`           | `BlockBuilder<T,P>`                    | 自定义配方                |
| `tag(TagKey...)`             | `BlockBuilder<T,P>`                    | 添加方块标签               |
| `register()`                 | `BlockEntry<T>`                        | 完成注册                 |

## ItemBuilder

构建 `Item` 注册条目。

### 创建

```java
REGISTRUM.object("my_item")
    .item(MyItem::new)
```

### 属性配置

```java
builder.properties(props -> props.stacksTo(16).fireResistant());
builder.initialProperties(() -> new Item.Properties().stacksTo(1));
```

### 创造性标签页

```java
// 添加到标签页（使用默认栈）
builder.tab(CreativeModeTabs.TOOLS);

// 添加到标签页并自定义行为
builder.tab(CreativeModeTabs.TOOLS, (ctx, modifier) -> {
    modifier.accept(ctx.getEntry().asStack());
});

// 移除标签页
builder.removeTab(CreativeModeTabs.FOOD);
```

### 模型与配方

```java
// 默认 flat 物品模型
builder.defaultModel();

// 自定义模型
builder.model(() -> (ctx, gen) -> gen.withExistingModel(ctx.getEntry().get(), otherModel));

// 配方
builder.recipe((ctx, gen) -> gen.singleItem(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT)));
```

### DataMap

```java
// 熔炉燃料
builder.burnTime(200);  // 200 ticks = 10 秒

// 堆肥概率
builder.compostable(0.65f);
```

### 标签

```java
builder.tag(ItemTags.SWORDS, ItemTags.CREEPER_DROP_MUSIC_DISCS);
```

### 注册

```java
ItemEntry<MyItem> entry = builder.register();
```

### ItemBuilder 特有方法

| 方法                          | 返回值                | 说明         |
|-----------------------------|--------------------|------------|
| `tab(key)`                  | `ItemBuilder<T,P>` | 加入创造性标签页   |
| `tab(key, consumer)`        | `ItemBuilder<T,P>` | 标签页 + 上下文  |
| `removeTab(key)`            | `ItemBuilder<T,P>` | 移除标签页      |
| `defaultModel()`            | `ItemBuilder<T,P>` | 默认 flat 模型 |
| `model(supplier)`           | `ItemBuilder<T,P>` | 自定义模型      |
| `recipe(consumer)`          | `ItemBuilder<T,P>` | 配方生成       |
| `burnTime(int)`             | `ItemBuilder<T,P>` | 燃料时间（tick） |
| `compostable(float)`        | `ItemBuilder<T,P>` | 堆肥概率       |
| `clientExtension(supplier)` | `ItemBuilder<T,P>` | 客户端扩展      |
| `tag(TagKey...)`            | `ItemBuilder<T,P>` | 添加物品标签     |
| `register()`                | `ItemEntry<T>`     | 完成注册       |

## 完整示例

```java
public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
    .object("my_block")
    .block(MyBlock::new)
        .properties(p -> p.strength(3.0f, 6.0f).sound(SoundType.METAL))
        .simpleItem()
        .defaultBlockstate()
        .defaultLoot()
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL)
        .lang("My Special Block")
        .register();

public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
    .object("my_item")
    .item(MyItem::new)
        .properties(p -> p.stacksTo(16))
        .tab(CreativeModeTabs.TOOLS)
        .defaultModel()
        .recipe((ctx, gen) -> gen.singleItem(
            ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT)))
        .lang("My Special Item")
        .register();
```
