---
title: Registrum Entity & Menu Builders
prev: false
next: false
---

# Entity and Menu Builders

## BlockEntityBuilder

Constructs a `BlockEntityType<T>` registration entry.

### Factory Interface

```java
@FunctionalInterface
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

### Creation

```java
REGISTRUM.object("my_block_entity")
    .blockEntity(MyBlockEntity::new)
```

### Configuring Valid Blocks

```java
builder.validBlock(MY_BLOCK);
builder.validBlocks(BLOCK1, BLOCK2, BLOCK3);
```

### Renderer

```java
builder.renderer(() -> ctx -> new MyBlockEntityRenderer(ctx));
```

Automatically registered during `EntityRenderersEvent.RegisterRenderers`. Client-side only.

### Registration

```java
BlockEntityEntry<MyBlockEntity> entry = builder.register();
```

| Method                                              | Description                       |
|-----------------------------------------------------|-----------------------------------|
| `validBlock(NonNullSupplier<? extends Block>)`     | Add a single valid block          |
| `validBlocks(NonNullSupplier<? extends Block>...)`  | Add multiple valid blocks         |
| `renderer(NonNullSupplier<...>)`                   | Register block entity renderer    |
| `register()`                                        | Returns `BlockEntityEntry<T>`     |

## EntityBuilder

Constructs an `EntityType<T>` registration entry.

### Creation

```java
REGISTRUM.object("my_entity")
    .entity(MyEntity::new, MobCategory.CREATURE)
```

### Property Configuration

```java
builder.properties(b -> b.sized(0.6f, 1.8f).clientTrackingRange(8));
```

### Renderer

```java
builder.renderer(() -> ctx -> new MyEntityRenderer(ctx));
```

Automatically registered during `EntityRenderersEvent.RegisterRenderers`.

### Attributes

Only available when the entity extends `LivingEntity`. Can be called at most once:

```java
builder.attributes(() -> LivingEntity.createLivingAttributes()
    .add(Attributes.MAX_HEALTH, 20.0)
    .add(Attributes.MOVEMENT_SPEED, 0.3));
```

### Spawn Placement

Only available when the entity extends `Mob`. Can be called at most once:

```java
builder.spawnPlacement(
    SpawnPlacementTypes.ON_GROUND,
    Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
    MyEntity::checkSpawnRules,
    RegisterSpawnPlacementsEvent.Operation.OR
);
```

### Loot Table and Translation

```java
builder.loot((tables, type) -> tables.add(type, LootTable.lootTable().build()));
builder.lang("My Entity");
```

### Tags

```java
builder.tag(EntityTypeTags.SKELETONS, EntityTypeTags.FREEZE_IMMUNE_ENTITY_TYPES);
```

### Registration

```java
EntityEntry<MyEntity> entry = builder.register();
```

| Method                                     | Description                           |
|--------------------------------------------|---------------------------------------|
| `properties(NonNullConsumer<Builder<T>>)` | Modify EntityType.Builder             |
| `renderer(NonNullSupplier<...>)`          | Register entity renderer              |
| `attributes(Supplier<Builder>)`           | Register attributes (LivingEntity only) |
| `spawnPlacement(...)`                     | Register spawn placement (Mob only)   |
| `loot(NonNullBiConsumer<...>)`            | Custom loot table                     |
| `lang(String)`                            | Translation name                      |
| `tag(TagKey<EntityType<?>>...)`           | Add entity tags                       |
| `register()`                              | Returns `EntityEntry<T>`              |

## MenuBuilder

Constructs a `MenuType<T>` registration entry, with `Screen` support.

### Factory Interfaces

```java
// Without buffer (standard menu)
public interface MenuFactory<T extends AbstractContainerMenu> {
    T create(MenuType<T> type, int windowId, Inventory inv);
}

// With buffer (supports additional data)
public interface ForgeMenuFactory<T extends AbstractContainerMenu> {
    T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer);
}

// Screen factory
public interface ScreenFactory<M extends AbstractContainerMenu, T extends Screen & MenuAccess<M>> {
    T create(M menu, Inventory inv, Component displayName);
}
```

### Creation

```java
// Standard menu
REGISTRUM.object("my_menu")
    .menu(MyMenu::new, () -> MyScreen::new);

// Buffered menu (can receive additional network data)
REGISTRUM.object("my_menu")
    .menu(
        (type, windowId, inv, buf) -> new MyMenu(type, windowId, inv),
        () -> MyScreen::new
    );
```

The screen is automatically registered on the client via `RegisterMenuScreensEvent`.

### Registration

```java
MenuEntry<MyMenu> entry = builder.register();
```

## FluidBuilder

Constructs a `Fluid` registration entry, with support for auto-creating `FluidType`, `LiquidBlock`, and `BucketItem`.

### Factory Interfaces

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

### Creation

```java
// Simplest form: auto texture paths (block/<name>_still + block/<name>_flow)
REGISTRUM.object("my_fluid").fluid();

// Specify textures + auto type
REGISTRUM.object("my_fluid").fluid(stillTex, flowingTex);

// Fully custom
REGISTRUM.object("my_fluid")
    .fluid(stillTex, flowingTex, MyFluidType::new, MyFlowingFluid::new);
```

### Sub-registrations

```java
builder.defaultSource();    // Standard Source fluid
builder.defaultBlock();     // Standard LiquidBlock
builder.block(MyBlock::new); // Custom LiquidBlock
builder.noBlock();          // Disable block

builder.defaultBucket();    // Standard BucketItem
builder.bucket(MyBucket::new); // Custom BucketItem
builder.noBucket();         // Disable bucket

builder.clientExtension(() -> () -> new MyFluidClientExtension());
builder.fluidModel(stillTex, flowingTex);
```

### Tags

```java
builder.tag(FluidTags.WATER);
```

### Registration

`FluidEntry<T>` simultaneously registers FluidType, LiquidBlock (optional), BucketItem (optional), and Fluid.

```java
FluidEntry<MyFluid> entry = builder.register();

entry.getSource();  // Get Source fluid
entry.getType();    // Get FluidType
entry.getBlock();   // Get LiquidBlock (Optional)
entry.getBucket();  // Get BucketItem (Optional)
```
