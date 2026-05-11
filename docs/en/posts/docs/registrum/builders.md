---
title: Registrum Builders
prev: false
next: false
---

# Builders

## Builder Interface

The root interface for all builders, extending `NonNullSupplier<RegistryEntry<R, T>>`.

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

### Common Methods

| Method         | Description                                      |
|----------------|--------------------------------------------------|
| `register()`   | Completes registration, returns `RegistryEntry`  |
| `get()`        | Gets the registered entry from the Owner         |
| `getEntry()`   | Gets the actual object (via `get().get()`)       |
| `asSupplier()` | Returns `NonNullSupplier<T>` for deferred access |
| `build()`      | Calls `register()` then returns the Parent       |

### Callbacks and Transforms

```java
// Post-registration callback
builder.onRegister(block -> LOGGER.info("Registered: {}", block));

// Callback after another registry completes
builder.onRegisterAfter(Registries.ITEM, block -> { ... });

// Transform
builder.transform(b -> someCondition ? b.tag(MyTags.SPECIAL) : b);
```

### Data Generation Configuration

```java
// Set a data generation callback (replaces existing)
builder.setData(GeneratorType type, (ctx, gen) -> { ... });

// Append a non-overwriting data generation callback
builder.addMiscData(GeneratorType type, gen -> { ... });

// Register a DataMap attachment
builder.dataMap(DataMapType type, value);
```

## BlockBuilder

Constructs a `Block` registration entry.

### Creation

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
```

### Property Configuration

```java
// Modify block properties (e.g., hardness, resistance)
builder.properties(props -> props.strength(3.0f).requiresCorrectToolForDrops());

// Copy initial properties from a reference block
builder.initialProperties(Blocks.STONE);
```

### BlockItem Creation

```java
// Auto-create a standard BlockItem
builder.simpleItem();

// Standard BlockItem with more configuration
builder.item()  // -> ItemBuilder<BlockItem, BlockBuilder<T, P>>
    .tab(CreativeModeTabs.BUILDING_BLOCKS)
    .lang("My Block");

// Custom BlockItem subclass
builder.item(MyCustomBlockItem::new);
```

### BlockEntity Integration

```java
// Quick creation (no further configuration possible)
builder.simpleBlockEntity(MyBlockEntity::new);

// Returns BlockEntityBuilder for further configuration
builder.blockEntity(MyBlockEntity::new)
    .renderer(MyRenderer::new)
    .validBlock(MY_BLOCK);
```

### Rendering and Color

```java
// Client-side block color handler
builder.color(() -> () -> List.of(BlockTintSource.tint(...)));
```

### Model, Loot Table, Recipe

```java
// Default cube model
builder.defaultBlockstate();

// Custom model
builder.blockstate(() -> (ctx, gen) -> gen.create(ctx.getEntry().get(), TexturedModel.CUBE));

// Default self-drop loot table
builder.defaultLoot();

// Custom loot table
builder.loot((tables, block) -> tables.add(block, tables.createSingleItemTable(Items.DIAMOND)));

// Recipe
builder.recipe((ctx, gen) -> gen.stairs(ctx.getEntry(), DataIngredient.items(Items.OAK_PLANKS)));
```

### Tags

```java
// Add tags
builder.tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL);
```

### Registration

```java
// Returns BlockEntry<T>
BlockEntry<MyBlock> entry = builder.register();
```

### BlockBuilder-Specific Methods

| Method                       | Return Type                            | Description                |
|------------------------------|----------------------------------------|----------------------------|
| `simpleItem()`               | `BlockBuilder<T,P>`                    | Quick BlockItem creation   |
| `item()`                     | `ItemBuilder<BlockItem, BlockBuilder>` | Standard BlockItem Builder |
| `item(factory)`              | `ItemBuilder<I, BlockBuilder>`         | Custom BlockItem factory   |
| `simpleBlockEntity(factory)` | `BlockBuilder<T,P>`                    | Quick BlockEntity creation |
| `blockEntity(factory)`       | `BlockEntityBuilder<BE, BlockBuilder>` | BlockEntity Builder        |
| `color(supplier)`            | `BlockBuilder<T,P>`                    | Block color handler        |
| `clientExtension(supplier)`  | `BlockBuilder<T,P>`                    | Client extension           |
| `defaultBlockstate()`        | `BlockBuilder<T,P>`                    | Default blockstate model   |
| `blockstate(supplier)`       | `BlockBuilder<T,P>`                    | Custom blockstate model    |
| `defaultLoot()`              | `BlockBuilder<T,P>`                    | Default loot table         |
| `loot(consumer)`             | `BlockBuilder<T,P>`                    | Custom loot table          |
| `recipe(consumer)`           | `BlockBuilder<T,P>`                    | Custom recipe              |
| `tag(TagKey...)`             | `BlockBuilder<T,P>`                    | Add block tags             |
| `register()`                 | `BlockEntry<T>`                        | Complete registration      |

## ItemBuilder

Constructs an `Item` registration entry.

### Creation

```java
REGISTRUM.object("my_item")
    .item(MyItem::new)
```

### Property Configuration

```java
builder.properties(props -> props.stacksTo(16).fireResistant());
builder.initialProperties(() -> new Item.Properties().stacksTo(1));
```

### Creative Tabs

```java
// Add to a tab (using default stack)
builder.tab(CreativeModeTabs.TOOLS);

// Add to a tab with custom behavior
builder.tab(CreativeModeTabs.TOOLS, (ctx, modifier) -> {
    modifier.accept(ctx.getEntry().asStack());
});

// Remove from a tab
builder.removeTab(CreativeModeTabs.FOOD);
```

### Model and Recipe

```java
// Default flat item model
builder.defaultModel();

// Custom model
builder.model(() -> (ctx, gen) -> gen.withExistingModel(ctx.getEntry().get(), otherModel));

// Recipe
builder.recipe((ctx, gen) -> gen.singleItem(ctx.getEntry(), DataIngredient.items(Items.IRON_INGOT)));
```

### DataMap

```java
// Furnace fuel
builder.burnTime(200);  // 200 ticks = 10 seconds

// Compost probability
builder.compostable(0.65f);
```

### Tags

```java
builder.tag(ItemTags.SWORDS, ItemTags.CREEPER_DROP_MUSIC_DISCS);
```

### Registration

```java
ItemEntry<MyItem> entry = builder.register();
```

### ItemBuilder-Specific Methods

| Method                      | Return Type        | Description           |
|-----------------------------|--------------------|-----------------------|
| `tab(key)`                  | `ItemBuilder<T,P>` | Add to creative tab   |
| `tab(key, consumer)`        | `ItemBuilder<T,P>` | Tab with context      |
| `removeTab(key)`            | `ItemBuilder<T,P>` | Remove from tab       |
| `defaultModel()`            | `ItemBuilder<T,P>` | Default flat model    |
| `model(supplier)`           | `ItemBuilder<T,P>` | Custom model          |
| `recipe(consumer)`          | `ItemBuilder<T,P>` | Recipe generation     |
| `burnTime(int)`             | `ItemBuilder<T,P>` | Fuel time (ticks)     |
| `compostable(float)`        | `ItemBuilder<T,P>` | Compost probability   |
| `clientExtension(supplier)` | `ItemBuilder<T,P>` | Client extension      |
| `tag(TagKey...)`            | `ItemBuilder<T,P>` | Add item tags         |
| `register()`                | `ItemEntry<T>`     | Complete registration |

## Complete Example

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
