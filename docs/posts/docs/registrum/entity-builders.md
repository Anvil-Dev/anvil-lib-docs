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

| 方法 | 说明 |
|------|------|
| `validBlock(NonNullSupplier<? extends Block>)` | 添加单个有效方块 |
| `validBlocks(NonNullSupplier<? extends Block>...)` | 批量添加有效方块 |
| `renderer(NonNullSupplier<...>)` | 注册方块实体渲染器 |
| `register()` | 返回 `BlockEntityEntry<T>` |

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

| 方法 | 说明 |
|------|------|
| `properties(NonNullConsumer<Builder<T>>)` | 修改 EntityType.Builder |
| `renderer(NonNullSupplier<...>)` | 注册实体渲染器 |
| `attributes(Supplier<Builder>)` | 注册属性（仅 LivingEntity） |
| `spawnPlacement(...)` | 注册生成位置（仅 Mob） |
| `loot(NonNullBiConsumer<...>)` | 自定义战利品表 |
| `lang(String)` | 翻译名称 |
| `tag(TagKey<EntityType<?>>...)` | 添加实体标签 |
| `register()` | 返回 `EntityEntry<T>` |

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
