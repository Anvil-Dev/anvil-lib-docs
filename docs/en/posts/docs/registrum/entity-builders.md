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

| Method                                             | Description                    |
|----------------------------------------------------|--------------------------------|
| `validBlock(NonNullSupplier<? extends Block>)`     | Add a single valid block       |
| `validBlocks(NonNullSupplier<? extends Block>...)` | Add multiple valid blocks      |
| `renderer(NonNullSupplier<...>)`                   | Register block entity renderer |
| `register()`                                       | Returns `BlockEntityEntry<T>`  |

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

| Method                                    | Description                             |
|-------------------------------------------|-----------------------------------------|
| `properties(NonNullConsumer<Builder<T>>)` | Modify EntityType.Builder               |
| `renderer(NonNullSupplier<...>)`          | Register entity renderer                |
| `attributes(Supplier<Builder>)`           | Register attributes (LivingEntity only) |
| `spawnPlacement(...)`                     | Register spawn placement (Mob only)     |
| `loot(NonNullBiConsumer<...>)`            | Custom loot table                       |
| `lang(String)`                            | Translation name                        |
| `tag(TagKey<EntityType<?>>...)`           | Add entity tags                         |
| `register()`                              | Returns `EntityEntry<T>`                |

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

## SoundEventBuilder

Registers a `SoundEvent` to `Registries.SOUND_EVENT`.

- Constructor takes `(owner, parent, name, callback)` -- uses modid:name as the sound event ID
- `fix(float range)` -- creates a fixed range sound event; omit for variable range (default)
- Returns `SoundEventEntry`

```java
REGISTRUM.object("my_sound")
    .soundEvent()
        .fix(16.0f)  // optional: fixed range
        .register();
```

Without `fix()`, uses `SoundEvent.createVariableRangeEvent(id)`.

## Data and Modifier Builders

### AttachmentBuilder

Constructs an `AttachmentType<E>` registration entry, registered to `NeoForgeRegistries.Keys.ATTACHMENT_TYPES`.

#### Creation

```java
// Using Function<IAttachmentHolder, E>
REGISTRUM.attachment("my_attachment", holder -> new MyAttachment());

// Using Supplier<E>
REGISTRUM.attachment("my_attachment", MyAttachment::new);
```

#### Serialization

```java
builder.serialize(mySerializer);       // IAttachmentSerializer
builder.serialize(myMapCodec);         // MapCodec
builder.serialize(myMapCodec, predicate); // MapCodec + predicate
```

#### Synchronization

```java
builder.sync(mySyncHandler);                            // AttachmentSyncHandler
builder.sync(myStreamCodec);                             // StreamCodec
builder.sync(sendToPlayer, myStreamCodec);               // BiPredicate + StreamCodec
```

#### Lifecycle Control

```java
builder.copyOnDeath();               // Preserve on player death
builder.copyHandler(myCloner);        // Custom copy handler
```

#### Registration

```java
AttachmentEntry<E> entry = builder.register();
```

| Method                                   | Description                            |
|------------------------------------------|----------------------------------------|
| `serialize(IAttachmentSerializer<E>)`    | Set the serializer                     |
| `serialize(MapCodec<E>)`                 | Set the MapCodec serializer            |
| `serialize(MapCodec<E>, Predicate)`      | Set MapCodec serializer with predicate |
| `copyOnDeath()`                          | Copy data on death                     |
| `copyHandler(IAttachmentCopyHandler<E>)` | Custom copy handler                    |
| `sync(AttachmentSyncHandler<E>)`         | Set sync handler                       |
| `sync(StreamCodec<..., E>)`              | Set StreamCodec sync                   |
| `register()`                             | Returns `AttachmentEntry<E>`           |

### DataComponentBuilder

Constructs a `DataComponentType<E>` registration entry, registered to `Registries.DATA_COMPONENT_TYPE`.

#### Creation

```java
REGISTRUM.dataComponent("my_component")
```

#### Configuration

```java
builder.persistent(myCodec);                       // Persistent codec
builder.networkSynchronized(myStreamCodec);        // Network synchronization
builder.cacheEncoding();                           // Cache encoding
builder.ignoreSwapAnimation();                     // Ignore swap animation
```

#### Registration

```java
DataComponentEntry<E> entry = builder.register();
```

| Method                                     | Description                     |
|--------------------------------------------|---------------------------------|
| `persistent(Codec<E>)`                     | Set the persistent codec        |
| `networkSynchronized(StreamCodec<..., E>)` | Set the network sync codec      |
| `cacheEncoding()`                          | Cache encoding results          |
| `ignoreSwapAnimation()`                    | Ignore swap animation           |
| `register()`                               | Returns `DataComponentEntry<E>` |

### CreativeTabBuilder

Constructs a `CreativeModeTab` registration entry, registered to `Registries.CREATIVE_MODE_TAB`. Independent of
`AbstractRegistrum`'s `defaultCreativeTab()`, this is a dedicated Builder for creating standalone creative tabs.

#### Creation

```java
// Using ItemLike
REGISTRUM.creativeTab("my_tab", MY_ITEM);

// Using Supplier<ItemLike>
REGISTRUM.creativeTab("my_tab", () -> MY_ITEM.get());
```

#### Configuration

```java
builder.title(Component.literal("My Tab"));          // Title
builder.defaultTitle();                              // Auto translation key title
builder.icon(() -> MY_ITEM.asStack());               // Icon
builder.displayItems((params, output) -> { ... });   // Display items generator
builder.displayItems(MY_ITEM1, MY_ITEM2);            // List items directly
builder.hideTitle();                                 // Hide title
builder.noScrollBar();                               // No scroll bar
builder.withSearchBar();                             // Search bar
builder.alignedRight();                              // Align right
builder.withTabsBefore(otherTabId);                  // Ordering control
builder.withTabsAfter(otherTabId);                   // Ordering control
builder.backgroundTexture(myTexture);                // Background texture
builder.withLabelColor(0xFF0000);                    // Label color
```

#### Registration

```java
RegistryEntry<CreativeModeTab, CreativeModeTab> entry = builder.register();
```

| Method                                | Description                                               |
|---------------------------------------|-----------------------------------------------------------|
| `defaultTitle()`                      | Use auto translation key title                            |
| `title(Component)`                    | Set the title                                             |
| `icon(Supplier<ItemStack>)`           | Set the icon                                              |
| `displayItems(DisplayItemsGenerator)` | Set the display items generator                           |
| `displayItems(ItemLike...)`           | List items directly                                       |
| `hideTitle()`                         | Hide the title                                            |
| `noScrollBar()`                       | Disable scroll bar                                        |
| `withSearchBar()`                     | Enable search bar                                         |
| `alignedRight()`                      | Align right                                               |
| `withTabsBefore(...)`                 | Place before specified tabs                               |
| `withTabsAfter(...)`                  | Place after specified tabs                                |
| `backgroundTexture(Identifier)`       | Set background texture                                    |
| `withLabelColor(int)`                 | Set label color                                           |
| `register()`                          | Returns `RegistryEntry<CreativeModeTab, CreativeModeTab>` |

### ConditionBuilder

Constructs a `MapCodec<T extends ICondition>` registration entry, registered to
`NeoForgeRegistries.Keys.CONDITION_CODECS`. Registers a condition codec, enabling the data-driven condition system to
recognize custom condition types.

#### Creation

```java
REGISTRUM.condition("my_condition", MyCondition.CODEC);
```

#### Registration

```java
ConditionEntry<MyCondition> entry = builder.register();
```

| Method       | Description                 |
|--------------|-----------------------------|
| `register()` | Returns `ConditionEntry<T>` |

### BiomeModifierBuilder

Constructs a `MapCodec<T extends BiomeModifier>` registration entry, registered to
`NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS`. Registers a biome modifier serializer.

#### Creation

```java
REGISTRUM.biomeModifier("my_biome_modifier", MyBiomeModifier.CODEC);
```

#### Registration

```java
BiomeModifierEntry<MyBiomeModifier> entry = builder.register();
```

| Method       | Description                     |
|--------------|---------------------------------|
| `register()` | Returns `BiomeModifierEntry<T>` |

### GlobalLootModifierBuilder

Constructs a `MapCodec<T extends IGlobalLootModifier>` registration entry, registered to
`NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS`. Registers a global loot modifier serializer.

#### Creation

```java
REGISTRUM.glm("my_loot_modifier", MyLootModifier.CODEC);
```

#### Registration

```java
GlobalLootModifierEntry<MyLootModifier> entry = builder.register();
```

| Method       | Description                          |
|--------------|--------------------------------------|
| `register()` | Returns `GlobalLootModifierEntry<T>` |

### StructureModifierBuilder

Constructs a `MapCodec<T extends StructureModifier>` registration entry, registered to
`NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS`. Registers a structure modifier serializer.

#### Creation

```java
REGISTRUM.structureModifier("my_structure_modifier", MyStructureModifier.CODEC);
```

#### Registration

```java
StructureModifierEntry<MyStructureModifier> entry = builder.register();
```

| Method       | Description                         |
|--------------|-------------------------------------|
| `register()` | Returns `StructureModifierEntry<T>` |
