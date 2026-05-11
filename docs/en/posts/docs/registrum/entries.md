---
title: Registrum Entry Types
prev: false
next: false
---

# Entry Types

## Type Hierarchy

```
RegistryEntry<R, T> (extends DeferredHolder<R, T>, NonNullSupplier<T>)
├── ItemProviderEntry<R extends ItemLike, T> (implements ItemLike)
│   ├── BlockEntry<T extends Block>
│   └── ItemEntry<T extends Item>
├── BlockEntityEntry<T extends BlockEntity>
├── EntityEntry<T extends Entity>
├── MenuEntry<T extends AbstractContainerMenu>
├── FluidEntry<T extends BaseFlowingFluid>
├── AttachmentEntry<E> (R = AttachmentType<?>, T = AttachmentType<E>)
├── DataComponentEntry<E> (R = DataComponentType<?>, T = DataComponentType<E>)
├── ConditionEntry<T extends ICondition> (R = MapCodec<?>, T = MapCodec<T>)
├── BiomeModifierEntry<T extends BiomeModifier> (R = MapCodec<?>, T = MapCodec<T>)
├── GlobalLootModifierEntry<T extends IGlobalLootModifier> (R = MapCodec<?>, T = MapCodec<T>)
└── StructureModifierEntry<T extends StructureModifier> (R = MapCodec<?>, T = MapCodec<T>)
```

## RegistryEntry

The generic registration entry, wrapping `DeferredHolder` and providing Registrum-specific functionality.

```java
public class RegistryEntry<R, S extends R>
        extends DeferredHolder<R, S>
        implements NonNullSupplier<S> {
```

### Core Methods

| Method                                 | Description                                                   |
|----------------------------------------|---------------------------------------------------------------|
| `get()`                                | Gets the registered object (inherited from `DeferredHolder`)  |
| `getSibling(ResourceKey<Registry<X>>)` | Gets the sibling entry in another registry with the same name |
| `getSibling(Registry<X>)`              | Same as above, via Registry instance                          |
| `filter(Predicate<R>)`                 | Returns `Optional.of(this)` if the predicate matches          |
| `is(X entry)`                          | Reference equality check (`get() == entry`)                   |
| `cast(Class<E>, RegistryEntry)`        | Safe type cast (checks type parameters)                       |

### Usage Example

```java
// Get the corresponding BlockItem entry from a block entry
RegistryEntry<Block, MyBlock> blockEntry = ...;
ItemEntry<BlockItem> itemEntry = blockEntry.getSibling(Registries.ITEM);

// Safe cast
BlockEntry<MyBlock> casted = BlockEntry.cast(registryEntry);
```

## ItemProviderEntry

A registration entry that can be used as an `ItemLike`.

```java
public class ItemProviderEntry<R extends ItemLike, T extends R>
        extends RegistryEntry<R, T>
        implements ItemLike {
```

### Methods

| Method                  | Description                                   |
|-------------------------|-----------------------------------------------|
| `asStack()`             | Returns an `ItemStack` of count 1             |
| `asStack(int count)`    | Returns an `ItemStack` of the specified count |
| `isIn(ItemStack stack)` | Checks if the item matches                    |
| `is(Item item)`         | Checks for a specific item                    |
| `asItem()`              | Returns the `Item` instance                   |

### Usage Example

```java
// Use directly where ItemLike is required
ShapelessRecipeBuilder.shapeless(RecipeCategory.MISC, MY_ITEM);
// ItemProviderEntry implements ItemLike

// Create an ItemStack
ItemStack stack = MY_ITEM.asStack(64);
```

## BlockEntry

```java
public class BlockEntry<T extends Block> extends ItemProviderEntry<Block, T> {
```

### Methods

| Method                          | Description                                       |
|---------------------------------|---------------------------------------------------|
| `getDefaultState()`             | Returns the block's default `BlockState`          |
| `has(BlockState state)`         | Checks whether a BlockState belongs to this block |
| `cast(RegistryEntry<Block, T>)` | Static safe cast                                  |

## ItemEntry

```java
public class ItemEntry<T extends Item> extends ItemProviderEntry<Item, T> {
```

### Methods

| Method                         | Description      |
|--------------------------------|------------------|
| `cast(RegistryEntry<Item, T>)` | Static safe cast |

## BlockEntityEntry

```java
public class BlockEntityEntry<T extends BlockEntity>
        extends RegistryEntry<BlockEntityType<?>, BlockEntityType<T>> {
```

### Methods

| Method                               | Description                     |
|--------------------------------------|---------------------------------|
| `create(BlockPos, BlockState)`       | Creates a block entity instance |
| `is(@Nullable BlockEntity)`          | Type check                      |
| `get(BlockGetter, BlockPos)`         | Gets Optional from the world    |
| `getNullable(BlockGetter, BlockPos)` | Gets from the world or null     |
| `cast(RegistryEntry)`                | Static safe cast                |

### Usage Example

```java
BlockEntityEntry<MyBE> MY_BE = ...;
Optional<MyBE> be = MY_BE.get(level, pos);
if (MY_BE.is(be)) { ... }
```

## EntityEntry

```java
public class EntityEntry<T extends Entity>
        extends RegistryEntry<EntityType<?>, EntityType<T>> {
```

### Methods

| Method                             | Description                |
|------------------------------------|----------------------------|
| `create(Level, EntitySpawnReason)` | Creates an entity instance |
| `is(Entity)`                       | Type check                 |
| `cast(RegistryEntry)`              | Static safe cast           |

## MenuEntry

```java
public class MenuEntry<T extends AbstractContainerMenu>
        extends RegistryEntry<MenuType<?>, MenuType<T>> {
```

### Methods

| Method                                                             | Description                    |
|--------------------------------------------------------------------|--------------------------------|
| `create(int windowId, Inventory)`                                  | Creates a menu instance        |
| `asProvider()`                                                     | Wraps as `MenuConstructor`     |
| `open(ServerPlayer, Component)`                                    | Opens the menu                 |
| `open(ServerPlayer, Component, Consumer<RegistryFriendlyByteBuf>)` | Opens the menu with extra data |

## FluidEntry

```java
public class FluidEntry<T extends BaseFlowingFluid>
        extends RegistryEntry<Fluid, T> {
```

### Methods

| Method        | Description                     |
|---------------|---------------------------------|
| `getSource()` | Gets the Source fluid           |
| `getType()`   | Gets the `FluidType`            |
| `getBlock()`  | Gets the LiquidBlock (Optional) |
| `getBucket()` | Gets the BucketItem (Optional)  |

## AttachmentEntry

```java
public class AttachmentEntry<E> extends RegistryEntry<AttachmentType<?>, AttachmentType<E>> {
```

A registration entry for `AttachmentType`, produced by `AttachmentBuilder`.

### Methods

| Method                | Description      |
|-----------------------|------------------|
| `cast(RegistryEntry)` | Static safe cast |

## DataComponentEntry

```java
public class DataComponentEntry<E> extends RegistryEntry<DataComponentType<?>, DataComponentType<E>> {
```

A registration entry for `DataComponentType`, produced by `DataComponentBuilder`.

### Methods

| Method                | Description      |
|-----------------------|------------------|
| `cast(RegistryEntry)` | Static safe cast |

## ConditionEntry

```java
public class ConditionEntry<T extends ICondition> extends RegistryEntry<MapCodec<? extends ICondition>, MapCodec<T>> {
```

A registration entry for condition codecs, produced by `ConditionBuilder`. What is registered is the `MapCodec`, not the
condition instance itself, enabling the NeoForge data-driven condition system to recognize custom condition types.

### Methods

| Method                | Description      |
|-----------------------|------------------|
| `cast(RegistryEntry)` | Static safe cast |

## BiomeModifierEntry

```java
public class BiomeModifierEntry<T extends BiomeModifier> extends RegistryEntry<MapCodec<? extends BiomeModifier>, MapCodec<T>> {
```

A registration entry for biome modifier serializers, produced by `BiomeModifierBuilder`.

### Methods

| Method                | Description      |
|-----------------------|------------------|
| `cast(RegistryEntry)` | Static safe cast |

## GlobalLootModifierEntry

```java
public class GlobalLootModifierEntry<T extends IGlobalLootModifier> extends RegistryEntry<MapCodec<? extends IGlobalLootModifier>, MapCodec<T>> {
```

A registration entry for global loot modifier serializers, produced by `GlobalLootModifierBuilder`.

### Methods

| Method                | Description      |
|-----------------------|------------------|
| `cast(RegistryEntry)` | Static safe cast |

## StructureModifierEntry

```java
public class StructureModifierEntry<T extends StructureModifier> extends RegistryEntry<MapCodec<? extends StructureModifier>, MapCodec<T>> {
```

A registration entry for structure modifier serializers, produced by `StructureModifierBuilder`.

### Methods

| Method                | Description      |
|-----------------------|------------------|
| `cast(RegistryEntry)` | Static safe cast |

## LazyRegistryEntry

A lazily-resolved entry reference.

```java
public class LazyRegistryEntry<R, T extends R> implements NonNullSupplier<T> {
    public LazyRegistryEntry(NonNullSupplier<? extends RegistryEntry<R, T>> supplier);
    public T get(); // Resolves on first call and discards the supplier
}
```

Used internally in `AbstractBuilder` to prevent memory leaks from long-held Builder references.
