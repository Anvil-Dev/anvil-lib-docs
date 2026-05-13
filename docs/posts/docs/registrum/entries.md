---
title: Registrum 条目类型
prev: false
next: false
---

# 条目类型

## 类型层级

```
RegistryEntry<R, T> (extends DeferredHolder<R, T>, NonNullSupplier<T>)
├── ItemProviderEntry<R extends ItemLike, T> (implements ItemLike)
│   ├── BlockEntry<T extends Block>
│   └── ItemEntry<T extends Item>
├── BlockEntityEntry<T extends BlockEntity>
├── EntityEntry<T extends Entity>
├── MenuEntry<T extends AbstractContainerMenu>
├── FluidEntry<T extends BaseFlowingFluid>
├── SoundEventEntry
├── AttachmentEntry<E> (R = AttachmentType<?>, T = AttachmentType<E>)
├── DataComponentEntry<E> (R = DataComponentType<?>, T = DataComponentType<E>)
├── ConditionEntry<T extends ICondition> (R = MapCodec<?>, T = MapCodec<T>)
├── BiomeModifierEntry<T extends BiomeModifier> (R = MapCodec<?>, T = MapCodec<T>)
├── GlobalLootModifierEntry<T extends IGlobalLootModifier> (R = MapCodec<?>, T = MapCodec<T>)
└── StructureModifierEntry<T extends StructureModifier> (R = MapCodec<?>, T = MapCodec<T>)
```

## RegistryEntry

通用注册条目，包装 `DeferredHolder` 并提供 Registrum 特有功能。

```java
public class RegistryEntry<R, S extends R>
        extends DeferredHolder<R, S>
        implements NonNullSupplier<S> {
```

### 核心方法

| 方法                                     | 说明                            |
|----------------------------------------|-------------------------------|
| `get()`                                | 获取注册的对象（继承自 `DeferredHolder`） |
| `getSibling(ResourceKey<Registry<X>>)` | 获取同名其他注册表的兄弟条目                |
| `getSibling(Registry<X>)`              | 同上，通过 Registry 实例             |
| `filter(Predicate<R>)`                 | 如果谓词匹配则返回 `Optional.of(this)` |
| `is(X entry)`                          | 引用相等检查（`get() == entry`）      |
| `cast(Class<E>, RegistryEntry)`        | 安全类型转换（检查类型参数）                |

### 使用示例

```java
// 从方块条目获取对应的 BlockItem 条目
RegistryEntry<Block, MyBlock> blockEntry = ...;
ItemEntry<BlockItem> itemEntry = blockEntry.getSibling(Registries.ITEM);

// 安全转换
BlockEntry<MyBlock> casted = BlockEntry.cast(registryEntry);
```

## ItemProviderEntry

可当作 `ItemLike` 使用的注册条目。

```java
public class ItemProviderEntry<R extends ItemLike, T extends R>
        extends RegistryEntry<R, T>
        implements ItemLike {
```

### 方法

| 方法                      | 说明                   |
|-------------------------|----------------------|
| `asStack()`             | 返回数量 1 的 `ItemStack` |
| `asStack(int count)`    | 返回指定数量的 `ItemStack`  |
| `isIn(ItemStack stack)` | 检查物品是否匹配             |
| `is(Item item)`         | 检查特定物品               |
| `asItem()`              | 返回 `Item` 实例         |

### 使用示例

```java
// 直接用于需要 ItemLike 的地方
ShapelessRecipeBuilder.shapeless(RecipeCategory.MISC, MY_ITEM);
// ItemProviderEntry 实现了 ItemLike

// 生成 ItemStack
ItemStack stack = MY_ITEM.asStack(64);
```

## BlockEntry

```java
public class BlockEntry<T extends Block> extends ItemProviderEntry<Block, T> {
```

### 方法

| 方法                              | 说明                    |
|---------------------------------|-----------------------|
| `getDefaultState()`             | 返回方块的默认 `BlockState`  |
| `has(BlockState state)`         | 检查 BlockState 是否属于此方块 |
| `cast(RegistryEntry<Block, T>)` | 静态安全转换                |

## ItemEntry

```java
public class ItemEntry<T extends Item> extends ItemProviderEntry<Item, T> {
```

### 方法

| 方法                             | 说明     |
|--------------------------------|--------|
| `cast(RegistryEntry<Item, T>)` | 静态安全转换 |

## BlockEntityEntry

```java
public class BlockEntityEntry<T extends BlockEntity>
        extends RegistryEntry<BlockEntityType<?>, BlockEntityType<T>> {
```

### 方法

| 方法                                   | 说明             |
|--------------------------------------|----------------|
| `create(BlockPos, BlockState)`       | 创建方块实体实例       |
| `is(@Nullable BlockEntity)`          | 类型检查           |
| `get(BlockGetter, BlockPos)`         | 从世界获取 Optional |
| `getNullable(BlockGetter, BlockPos)` | 从世界获取或 null    |
| `cast(RegistryEntry)`                | 静态安全转换         |

### 使用示例

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

### 方法

| 方法                                 | 说明     |
|------------------------------------|--------|
| `create(Level, EntitySpawnReason)` | 创建实体实例 |
| `is(Entity)`                       | 类型检查   |
| `cast(RegistryEntry)`              | 静态安全转换 |

## MenuEntry

```java
public class MenuEntry<T extends AbstractContainerMenu>
        extends RegistryEntry<MenuType<?>, MenuType<T>> {
```

### 方法

| 方法                                                                 | 说明                    |
|--------------------------------------------------------------------|-----------------------|
| `create(int windowId, Inventory)`                                  | 创建菜单实例                |
| `asProvider()`                                                     | 包装为 `MenuConstructor` |
| `open(ServerPlayer, Component)`                                    | 打开菜单                  |
| `open(ServerPlayer, Component, Consumer<RegistryFriendlyByteBuf>)` | 打开菜单 + 额外数据           |

## FluidEntry

```java
public class FluidEntry<T extends BaseFlowingFluid>
        extends RegistryEntry<Fluid, T> {
```

### 方法

| 方法            | 说明                       |
|---------------|--------------------------|
| `getSource()` | 获取 Source 流体             |
| `getType()`   | 获取 `FluidType`           |
| `getBlock()`  | 获取 LiquidBlock（Optional） |
| `getBucket()` | 获取 BucketItem（Optional）  |

## SoundEventEntry

```java
public class SoundEventEntry extends RegistryEntry<SoundEvent, SoundEvent>
```

`SoundEvent` 注册条目的包装器。由 `SoundEventBuilder` 生成。提供 `cast()` 方法用于类型安全转换。

## AttachmentEntry

```java
public class AttachmentEntry<E> extends RegistryEntry<AttachmentType<?>, AttachmentType<E>> {
```

用于 `AttachmentType` 的注册条目，由 `AttachmentBuilder` 生成。

### 方法

| 方法                    | 说明     |
|-----------------------|--------|
| `cast(RegistryEntry)` | 静态安全转换 |

## DataComponentEntry

```java
public class DataComponentEntry<E> extends RegistryEntry<DataComponentType<?>, DataComponentType<E>> {
```

用于 `DataComponentType` 的注册条目，由 `DataComponentBuilder` 生成。

### 方法

| 方法                    | 说明     |
|-----------------------|--------|
| `cast(RegistryEntry)` | 静态安全转换 |

## ConditionEntry

```java
public class ConditionEntry<T extends ICondition> extends RegistryEntry<MapCodec<? extends ICondition>, MapCodec<T>> {
```

用于条件编解码器的注册条目，由 `ConditionBuilder` 生成。注册的是 `MapCodec` 而非条件实例本身，使 NeoForge
数据驱动条件系统能识别自定义条件类型。

### 方法

| 方法                    | 说明     |
|-----------------------|--------|
| `cast(RegistryEntry)` | 静态安全转换 |

## BiomeModifierEntry

```java
public class BiomeModifierEntry<T extends BiomeModifier> extends RegistryEntry<MapCodec<? extends BiomeModifier>, MapCodec<T>> {
```

用于生物群系修改器序列化器的注册条目，由 `BiomeModifierBuilder` 生成。

### 方法

| 方法                    | 说明     |
|-----------------------|--------|
| `cast(RegistryEntry)` | 静态安全转换 |

## GlobalLootModifierEntry

```java
public class GlobalLootModifierEntry<T extends IGlobalLootModifier> extends RegistryEntry<MapCodec<? extends IGlobalLootModifier>, MapCodec<T>> {
```

用于全局战利品修改器序列化器的注册条目，由 `GlobalLootModifierBuilder` 生成。

### 方法

| 方法                    | 说明     |
|-----------------------|--------|
| `cast(RegistryEntry)` | 静态安全转换 |

## StructureModifierEntry

```java
public class StructureModifierEntry<T extends StructureModifier> extends RegistryEntry<MapCodec<? extends StructureModifier>, MapCodec<T>> {
```

用于结构修改器序列化器的注册条目，由 `StructureModifierBuilder` 生成。

### 方法

| 方法                    | 说明     |
|-----------------------|--------|
| `cast(RegistryEntry)` | 静态安全转换 |

## LazyRegistryEntry

延迟解析的条目引用。

```java
public class LazyRegistryEntry<R, T extends R> implements NonNullSupplier<T> {
    public LazyRegistryEntry(NonNullSupplier<? extends RegistryEntry<R, T>> supplier);
    public T get(); // 首次调用时解析并丢弃 supplier
}
```

用于 `AbstractBuilder` 内部，防止 Builder 被长时间持有导致内存泄漏。
