---
title: Registrum 实体与菜单构建器
prev: false
next: false
---

# 实体与菜单构建器

## BlockEntityBuilder

构建 `BlockEntityType<T>` 注册条目。

### 工厂接口

```java
@FunctionalInterface
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

### 创建

```java
REGISTRUM.object("my_block_entity")
    .blockEntity(MyBlockEntity::new)
```

### 配置有效方块

```java
builder.validBlock(MY_BLOCK);
builder.validBlocks(BLOCK1, BLOCK2, BLOCK3);
```

### 渲染器

```java
builder.renderer(() -> ctx -> new MyBlockEntityRenderer(ctx));
```

在 `EntityRenderersEvent.RegisterRenderers` 时自动注册，客户端专用。

### 注册

```java
BlockEntityEntry<MyBlockEntity> entry = builder.register();
```

| 方法                                                 | 说明                       |
|----------------------------------------------------|--------------------------|
| `validBlock(NonNullSupplier<? extends Block>)`     | 添加单个有效方块                 |
| `validBlocks(NonNullSupplier<? extends Block>...)` | 批量添加有效方块                 |
| `renderer(NonNullSupplier<...>)`                   | 注册方块实体渲染器                |
| `register()`                                       | 返回 `BlockEntityEntry<T>` |

## EntityBuilder

构建 `EntityType<T>` 注册条目。

### 创建

```java
REGISTRUM.object("my_entity")
    .entity(MyEntity::new, MobCategory.CREATURE)
```

### 属性配置

```java
builder.properties(b -> b.sized(0.6f, 1.8f).clientTrackingRange(8));
```

### 渲染器

```java
builder.renderer(() -> ctx -> new MyEntityRenderer(ctx));
```

在 `EntityRenderersEvent.RegisterRenderers` 时自动注册。

### 属性 (Attribute)

仅当实体 extends `LivingEntity` 时可用，最多调用一次：

```java
builder.attributes(() -> LivingEntity.createLivingAttributes()
    .add(Attributes.MAX_HEALTH, 20.0)
    .add(Attributes.MOVEMENT_SPEED, 0.3));
```

### 生成位置 (Spawn Placement)

仅当实体 extends `Mob` 时可用，最多调用一次：

```java
builder.spawnPlacement(
    SpawnPlacementTypes.ON_GROUND,
    Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
    MyEntity::checkSpawnRules,
    RegisterSpawnPlacementsEvent.Operation.OR
);
```

### 战利品表与翻译

```java
builder.loot((tables, type) -> tables.add(type, LootTable.lootTable().build()));
builder.lang("My Entity");
```

### 标签

```java
builder.tag(EntityTypeTags.SKELETONS, EntityTypeTags.FREEZE_IMMUNE_ENTITY_TYPES);
```

### 注册

```java
EntityEntry<MyEntity> entry = builder.register();
```

| 方法                                        | 说明                    |
|-------------------------------------------|-----------------------|
| `properties(NonNullConsumer<Builder<T>>)` | 修改 EntityType.Builder |
| `renderer(NonNullSupplier<...>)`          | 注册实体渲染器               |
| `attributes(Supplier<Builder>)`           | 注册属性（仅 LivingEntity）  |
| `spawnPlacement(...)`                     | 注册生成位置（仅 Mob）         |
| `loot(NonNullBiConsumer<...>)`            | 自定义战利品表               |
| `lang(String)`                            | 翻译名称                  |
| `tag(TagKey<EntityType<?>>...)`           | 添加实体标签                |
| `register()`                              | 返回 `EntityEntry<T>`   |

## MenuBuilder

构建 `MenuType<T>` 注册条目，支持 `Screen`。

### 工厂接口

```java
// 无 buffer（标准菜单）
public interface MenuFactory<T extends AbstractContainerMenu> {
    T create(MenuType<T> type, int windowId, Inventory inv);
}

// 带 buffer（支持额外数据）
public interface ForgeMenuFactory<T extends AbstractContainerMenu> {
    T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer);
}

// 屏幕工厂
public interface ScreenFactory<M extends AbstractContainerMenu, T extends Screen & MenuAccess<M>> {
    T create(M menu, Inventory inv, Component displayName);
}
```

### 创建

```java
// 标准菜单
REGISTRUM.object("my_menu")
    .menu(MyMenu::new, () -> MyScreen::new);

// 带 buffer 的菜单（可接收额外网络数据）
REGISTRUM.object("my_menu")
    .menu(
        (type, windowId, inv, buf) -> new MyMenu(type, windowId, inv),
        () -> MyScreen::new
    );
```

屏幕通过 `RegisterMenuScreensEvent` 在客户端自动注册。

### 注册

```java
MenuEntry<MyMenu> entry = builder.register();
```

## FluidBuilder

构建 `Fluid` 注册条目，支持自动创建 `FluidType`、`LiquidBlock` 和 `BucketItem`。

### 工厂接口

```java
@FunctionalInterface
public interface FluidTypeFactory {
    FluidType create(FluidType.Properties properties, Identifier stillTexture, Identifier flowingTexture);
}

@FunctionalInterface
public interface FluidFactory<T extends BaseFlowingFluid> {
    T create(BaseFlowingFluid.Properties properties);
}
```

### 创建

```java
// 最简方式：自动纹理路径（block/<name>_still + block/<name>_flow）
REGISTRUM.object("my_fluid").fluid();

// 指定纹理 + 自动类型
REGISTRUM.object("my_fluid").fluid(stillTex, flowingTex);

// 全部自定义
REGISTRUM.object("my_fluid")
    .fluid(stillTex, flowingTex, MyFluidType::new, MyFlowingFluid::new);
```

### 附属注册项

```java
builder.defaultSource();    // 标准 Source 流体
builder.defaultBlock();     // 标准 LiquidBlock
builder.block(MyBlock::new); // 自定义 LiquidBlock
builder.noBlock();          // 禁用方块

builder.defaultBucket();    // 标准 BucketItem
builder.bucket(MyBucket::new); // 自定义 BucketItem
builder.noBucket();         // 禁用桶

builder.clientExtension(() -> () -> new MyFluidClientExtension());
builder.fluidModel(stillTex, flowingTex);
```

### 标签

```java
builder.tag(FluidTags.WATER);
```

### 注册

`FluidEntry<T>` 同时注册 FluidType、LiquidBlock（可选）、BucketItem（可选）和 Fluid。

```java
FluidEntry<MyFluid> entry = builder.register();

entry.getSource();  // 获取 Source 流体
entry.getType();    // 获取 FluidType
entry.getBlock();   // 获取 LiquidBlock（Optional）
entry.getBucket();  // 获取 BucketItem（Optional）
```

## 数据与修改器构建器

### AttachmentBuilder

构建 `AttachmentType<E>` 注册条目，注册到 `NeoForgeRegistries.Keys.ATTACHMENT_TYPES`。

#### 创建

```java
// 使用 Function<IAttachmentHolder, E>
REGISTRUM.attachment("my_attachment", holder -> new MyAttachment());

// 使用 Supplier<E>
REGISTRUM.attachment("my_attachment", MyAttachment::new);
```

#### 序列化

```java
builder.serialize(mySerializer);       // IAttachmentSerializer
builder.serialize(myMapCodec);         // MapCodec
builder.serialize(myMapCodec, predicate); // MapCodec + 谓词
```

#### 同步

```java
builder.sync(mySyncHandler);                            // AttachmentSyncHandler
builder.sync(myStreamCodec);                             // StreamCodec
builder.sync(sendToPlayer, myStreamCodec);               // BiPredicate + StreamCodec
```

#### 生命周期控制

```java
builder.copyOnDeath();               // 玩家死亡时保留
builder.copyHandler(myCloner);        // 自定义复制处理器
```

#### 注册

```java
AttachmentEntry<E> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `serialize(IAttachmentSerializer<E>)` | 设置序列化器 |
| `serialize(MapCodec<E>)` | 设置 MapCodec 序列化器 |
| `serialize(MapCodec<E>, Predicate)` | 设置 MapCodec 序列化器及谓词 |
| `copyOnDeath()` | 死亡时复制数据 |
| `copyHandler(IAttachmentCopyHandler<E>)` | 自定义复制处理器 |
| `sync(AttachmentSyncHandler<E>)` | 设置同步处理器 |
| `sync(StreamCodec<..., E>)` | 设置 StreamCodec 同步 |
| `register()` | 返回 `AttachmentEntry<E>` |

### DataComponentBuilder

构建 `DataComponentType<E>` 注册条目，注册到 `Registries.DATA_COMPONENT_TYPE`。

#### 创建

```java
REGISTRUM.dataComponent("my_component")
```

#### 配置

```java
builder.persistent(myCodec);                       // 持久化 Codec
builder.networkSynchronized(myStreamCodec);        // 网络同步
builder.cacheEncoding();                           // 缓存编码
builder.ignoreSwapAnimation();                     // 忽略交换动画
```

#### 注册

```java
DataComponentEntry<E> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `persistent(Codec<E>)` | 设置持久化 Codec |
| `networkSynchronized(StreamCodec<..., E>)` | 设置网络同步 Codec |
| `cacheEncoding()` | 缓存编码结果 |
| `ignoreSwapAnimation()` | 忽略交换动画 |
| `register()` | 返回 `DataComponentEntry<E>` |

### CreativeTabBuilder

构建 `CreativeModeTab` 注册条目，注册到 `Registries.CREATIVE_MODE_TAB`。独立于 `AbstractRegistrum` 的 `defaultCreativeTab()`，是构建单独创造标签页的专用 Builder。

#### 创建

```java
// 使用 ItemLike
REGISTRUM.creativeTab("my_tab", MY_ITEM);

// 使用 Supplier<ItemLike>
REGISTRUM.creativeTab("my_tab", () -> MY_ITEM.get());
```

#### 配置

```java
builder.title(Component.literal("My Tab"));          // 标题
builder.defaultTitle();                              // 自动翻译键标题
builder.icon(() -> MY_ITEM.asStack());               // 图标
builder.displayItems((params, output) -> { ... });   // 物品生成器
builder.displayItems(MY_ITEM1, MY_ITEM2);            // 直接列出物品
builder.hideTitle();                                 // 隐藏标题
builder.noScrollBar();                               // 无滚动条
builder.withSearchBar();                             // 搜索栏
builder.alignedRight();                              // 右对齐
builder.withTabsBefore(otherTabId);                  // 排序控制
builder.withTabsAfter(otherTabId);                   // 排序控制
builder.backgroundTexture(myTexture);                // 背景纹理
builder.withLabelColor(0xFF0000);                    // 标签颜色
```

#### 注册

```java
RegistryEntry<CreativeModeTab, CreativeModeTab> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `defaultTitle()` | 使用自动翻译键标题 |
| `title(Component)` | 设置标题 |
| `icon(Supplier<ItemStack>)` | 设置图标 |
| `displayItems(DisplayItemsGenerator)` | 设置物品生成器 |
| `displayItems(ItemLike...)` | 直接列出物品 |
| `hideTitle()` | 隐藏标题 |
| `noScrollBar()` | 禁用滚动条 |
| `withSearchBar()` | 启用搜索栏 |
| `alignedRight()` | 右对齐 |
| `withTabsBefore(...)` | 在指定标签页之前 |
| `withTabsAfter(...)` | 在指定标签页之后 |
| `backgroundTexture(Identifier)` | 设置背景纹理 |
| `withLabelColor(int)` | 设置标签颜色 |
| `register()` | 返回 `RegistryEntry<CreativeModeTab, CreativeModeTab>` |

### ConditionBuilder

构建 `MapCodec<T extends ICondition>` 注册条目，注册到 `NeoForgeRegistries.Keys.CONDITION_CODECS`。注册条件编解码器，允许数据驱动条件系统识别自定义条件类型。

#### 创建

```java
REGISTRUM.condition("my_condition", MyCondition.CODEC);
```

#### 注册

```java
ConditionEntry<MyCondition> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `register()` | 返回 `ConditionEntry<T>` |

### BiomeModifierBuilder

构建 `MapCodec<T extends BiomeModifier>` 注册条目，注册到 `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS`。注册生物群系修改器序列化器。

#### 创建

```java
REGISTRUM.biomeModifier("my_biome_modifier", MyBiomeModifier.CODEC);
```

#### 注册

```java
BiomeModifierEntry<MyBiomeModifier> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `register()` | 返回 `BiomeModifierEntry<T>` |

### GlobalLootModifierBuilder

构建 `MapCodec<T extends IGlobalLootModifier>` 注册条目，注册到 `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS`。注册全局战利品修改器序列化器。

#### 创建

```java
REGISTRUM.glm("my_loot_modifier", MyLootModifier.CODEC);
```

#### 注册

```java
GlobalLootModifierEntry<MyLootModifier> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `register()` | 返回 `GlobalLootModifierEntry<T>` |

### StructureModifierBuilder

构建 `MapCodec<T extends StructureModifier>` 注册条目，注册到 `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS`。注册结构修改器序列化器。

#### 创建

```java
REGISTRUM.structureModifier("my_structure_modifier", MyStructureModifier.CODEC);
```

#### 注册

```java
StructureModifierEntry<MyStructureModifier> entry = builder.register();
```

| 方法 | 说明 |
|------|------|
| `register()` | 返回 `StructureModifierEntry<T>` |
