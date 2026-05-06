---
title: Registrum 注册
prev: false
next: false
---

# 注册系统模块 (Registrum Module)

包 `dev.anvilcraft.lib.v2.registrum` 提供了一套基于流式构建器的声明式注册系统，大幅简化 Minecraft 模组中物品、方块、实体、方块实体、菜单等的注册与数据生成流程。

> 本模块部分代码基于 [Registrate](https://github.com/tterrag1098/Registrate)，遵循 Mozilla Public License 2.0。

## 1. 快速开始

```java
public class MyMod {
    public static final Registrum REGISTRUM = Registrum.create("mymod");

    public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
        .object("my_block")
        .block(MyBlock::new)
            .defaultItem()
            .lang("My Block")
            .tag(BlockTags.MINEABLE_WITH_PICKAXE)
            .register();

    public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
        .object("my_item")
        .item(MyItem::new)
            .tab(CreativeModeTabs.TOOLS)
            .lang("My Item")
            .register();

    public MyMod(IEventBus modBus) {
        REGISTRUM.object("mymod").generic(...);
    }
}
```

## 2. 核心类

### Registrum / AbstractRegistrum

`Registrum` 是入口类，`AbstractRegistrum<S>` 是实际的引擎基类。

```java
// 创建实例（自动注册事件总线）
Registrum registrum = Registrum.create("mymod");

// 开发环境检测
boolean isDev = AbstractRegistrum.isDevEnvironment();
```

| 方法 | 说明 |
|------|------|
| `create(String modid)` | 工厂方法，创建实例并自动注册事件监听 |
| `object(String name)` | 设置后续 builder 使用的条目名称，直到下次调用 |
| `get(String name, ResourceKey)` | 获取已注册条目的 `RegistryEntry` |
| `getOptional(String name, ResourceKey)` | 同上，返回 `Optional` |
| `getAll(ResourceKey)` | 获取某注册表的所有已知条目 |
| `addRegisterCallback(...)` | 注册回调（条目注册后 / 注册表完成时触发） |
| `addLang(String type, Identifier, String)` | 添加语言翻译 |
| `addRawLang(String key, String value)` | 添加原始翻译键 |
| `defaultCreativeTab(ResourceKey)` | 设置默认创造模式标签页 |
| `modifyCreativeModeTab(...)` | 注册创造模式标签页修改回调 |
| `skipErrors(boolean)` | 启用/禁用注册错误跳过（仅开发环境） |
| `getDataProvider(GeneratorType<P>)` | 获取数据生成器实例（仅数据生成阶段） |

### Builder 接口

所有构建器的根接口，扩展 `NonNullSupplier<RegistryEntry<R, T>>`。

| 方法 | 说明 |
|------|------|
| `register()` | 完成注册，返回 `RegistryEntry` |
| `get()` | 获取已注册的 `RegistryEntry` |
| `getEntry()` | 获取注册的实际对象 |
| `asSupplier()` | 返回延迟获取的 `NonNullSupplier<T>` |
| `onRegister(NonNullConsumer<T>)` | 注册完成后回调 |
| `onRegisterAfter(ResourceKey, ...)` | 等待其他注册表完成后回调 |
| `setData(GeneratorType, ...)` | 设置数据生成回调 |
| `addMiscData(GeneratorType, ...)` | 追加非覆盖数据生成回调 |
| `dataMap(DataMapType, val)` | 注册 DataMap 附件 |
| `tag(TagKey...)` | 添加标签 |
| `build()` | 调用 `register()` 后返回父构建器 |

## 3. 构建器类型

### BlockBuilder

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
        .properties(props -> props.strength(3.0f).requiresCorrectToolForDrops())
        .initialProperties(Blocks.STONE)     // 复制参考方块的属性
        .simpleItem()                        // 自动创建 BlockItem
        .item(MyCustomBlockItem::new)        // 或自定义 BlockItem
        .simpleBlockEntity(MyBE::new)        // 自动创建方块实体
        .blockEntity(MyBE::new)              // 或创建可配置的方块实体构建器
        .defaultBlockstate()                 // 默认立方体模型
        .blockstate(customGen)               // 自定义模型生成器
        .defaultLoot()                       // 默认自掉落战利品表
        .loot(customLootGen)                 // 自定义战利品表
        .color(colorSupplier)                // 方块颜色处理器
        .tag(BlockTags.MINEABLE_WITH_PICKAXE)
        .lang("My Block")
        .register();                         // 返回 BlockEntry<T>
```

### ItemBuilder

```java
REGISTRUM.object("my_item")
    .item(MyItem::new)
        .properties(props -> props.stacksTo(16))
        .tab(CreativeModeTabs.TOOLS)         // 添加到创造模式标签页
        .removeTab(CreativeModeTabs.FOOD)    // 移除标签页
        .defaultModel()                      // 默认 flat 模型
        .model(customGen)                    // 自定义模型生成器
        .recipe(recipeGen)                   // 配方生成
        .burnTime(200)                       // 熔炉燃料时间（tick）
        .compostable(0.65f)                  // 堆肥概率
        .tag(ItemTags.SWORDS)
        .lang("My Item")
        .register();                         // 返回 ItemEntry<T>
```

### BlockEntityBuilder

```java
REGISTRUM.object("my_block_entity")
    .blockEntity(MyBlockEntity::new)
        .validBlock(MY_BLOCK)                // 添加有效方块
        .validBlocks(BLOCK1, BLOCK2)         // 批量添加
        .renderer(MyRenderer::new)           // 注册方块实体渲染器
        .register();                         // 返回 BlockEntityEntry<T>
```

### EntityBuilder

```java
REGISTRUM.object("my_entity")
    .entity(MyEntity::new, MobCategory.CREATURE)
        .properties(builder -> builder.sized(0.6f, 1.8f))
        .renderer(MyRenderer::new)           // 实体渲染器
        .attributes(MyEntity::createAttributes) // 属性（需 LivingEntity）
        .spawnPlacement(...)                 // 生成位置（需 Mob）
        .loot(lootGen)                       // 战利品表
        .tag(EntityTypeTags.SKELETONS)
        .lang("My Entity")
        .register();                         // 返回 EntityEntry<T>
```

### MenuBuilder

```java
REGISTRUM.object("my_menu")
    .menu(MyMenu::new, MyScreen::new)        // 容器 + 屏幕工厂
        .register();                         // 返回 MenuEntry<T>
```

支持普通 `MenuFactory<T>`（无 buffer）和 `ForgeMenuFactory<T>`（带 `RegistryFriendlyByteBuf`）。

### FluidBuilder

```java
REGISTRUM.object("my_fluid")
    .fluid(MyFluidType::new, MyFluid::new)
        .lang("My Fluid")
        .register();
```

## 4. Entry 类型

| 类型 | 基类 | 说明 |
|------|------|------|
| `RegistryEntry<R, T>` | `DeferredHolder<R, T>` | 通用注册条目，提供 `get()`、`getSibling(registry)` |
| `ItemProviderEntry<R, T>` | `RegistryEntry<R, T>` + `ItemLike` | 可作为物品使用的条目，提供 `asStack()`、`asItem()` |
| `BlockEntry<T>` | `ItemProviderEntry<Block, T>` | 方块条目，提供 `getDefaultState()` |
| `ItemEntry<T>` | `ItemProviderEntry<Item, T>` | 物品条目 |
| `BlockEntityEntry<T>` | `RegistryEntry<BlockEntityType<?>, BlockEntityType<T>>` | 方块实体类型条目 |
| `EntityEntry<T>` | `RegistryEntry<EntityType<?>, EntityType<T>>` | 实体类型条目 |
| `MenuEntry<T>` | `RegistryEntry<MenuType<?>, MenuType<T>>` | 菜单类型条目 |

### RegistryEntry 关键方法

```java
// 获取同名其他注册表的兄弟条目（如从方块获取其 BlockItem）
ItemEntry<BlockItem> item = blockEntry.getSibling(Registries.ITEM);

// 安全类型转换
BlockEntry<MyBlock> casted = BlockEntry.cast(genericEntry);
```

### ItemProviderEntry 便捷方法

```java
ItemStack stack = entry.asStack();       // 数量 1
ItemStack stack64 = entry.asStack(64);   // 数量 64
boolean match = entry.isIn(someStack);   // 物品匹配检查
```

## 5. 数据生成

Registrum 深度集成 NeoForge 数据生成系统，通过 `GeneratorType` 管理各类数据生成器。

### 方块数据生成

- `RegistrumBlockModelGenerator` — 方块模型/方块状态 JSON
- `RegistrumBlockLootTables` — 战利品表
- `RegistrumRecipeProvider` — 配方

### 物品数据生成

- `RegistrumItemModelGenerator` — 物品模型 JSON
- `RegistrumRecipeProvider` — 配方

### 实体数据生成

- `RegistrumEntityLootTables` — 实体战利品表

### 使用方式

```java
// 在构建器中注册数据生成回调
.block(MyBlock::new)
    .blockstate((ctx, gen) -> {
        gen.simpleBlock(ctx.getEntry().get());
    })
    .loot((tables, block) -> {
        tables.dropSelf(block);
    })
    .recipe((ctx, gen) -> {
        gen.shapeless(ctx.getEntry(), Items.DIAMOND);
    })
```

数据生成入口类通过 `AnvilLibDatagen`（或在模组的 datagen 入口中手动调用 `registrum.genData(type, generator)`）触发。

## 6. 其他功能

### 自定义注册表

```java
// 创建同步注册表
ResourceKey<Registry<MyType>> MY_REGISTRY =
    registrum.makeRegistry("my_registry", name ->
        new RegistryBuilder<MyType>(name).sync(true));

// 创建数据包注册表（网络同步）
ResourceKey<Registry<MyDatapackType>> MY_DP_REGISTRY =
    registrum.makeDatapackRegistry("my_dp", MyDatapackType.CODEC, MyDatapackType.NETWORK_CODEC);
```

### Transform 与回调

```java
REGISTRUM
    .object("my_block")
    .block(MyBlock::new)
        .transform(builder -> {
            // 对 builder 进行条件修改
            if (someCondition) builder.tag(BlockTags.NEEDS_DIAMOND_TOOL);
            return builder;
        })
        .onRegister(block -> LOGGER.info("Block registered: {}", block))
        .register();
```

## 注意事项

1. **条目名称**：每个 `object(String)` 调用后的 name 会持续生效，直到下一次 `object()` 调用。务必在调用 builder 前设置正确的名称。
2. **线程安全**：所有注册操作应在模组构造阶段（`@Mod` 构造函数或 `FMLCommonSetupEvent` 之前）完成。
3. **数据生成**：`getDataProvider` 仅在数据生成环境可用，运行时返回 `Optional.empty()`。
4. **方块实体渲染器**：通过 `BlockEntityBuilder.renderer()` 注册，在客户端自动绑定到 `EntityRenderersEvent.RegisterRenderers`。
5. **创造性标签页**：`defaultCreativeTab` 设置后会影响后续所有 `item()` builder。`tab()` 调用会覆盖默认值。
6. **流体注册**：`FluidBuilder` 支持多种构造方式（自定义纹理、`FluidTypeFactory`、`NonNullSupplier<FluidType>` 等），适合不同复杂度的流体需求。
