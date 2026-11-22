# Nullness Functional Interfaces & UnlimitedItemStack

`module.util` also provides two foundational components used across the library: the `nullness` functional interface package compatible with JSR-305/JetBrains `@NotNull`, and `UnlimitedItemStack` breaking vanilla's 64/99 stack limit.

## `dev.anvilcraft.lib.v2.util.nullness` Nullness Constraint System

Instead of standard `java.util.function.*`, AnvilLib uses interfaces annotated with `@NonnullType` (and `@NullableType`) throughout `module.util` and `module.registrum` to avoid "lambda triggers unannotated type warnings" in `@ParametersAreNonnullByDefault` packages:

| Interface / Annotation | Extends / Semantics | Description |
| --- | --- | --- |
| `NonNullSupplier<T>` | `Supplier<T>` | Non-null supplier |
| `NullableSupplier<T>` | `Supplier<T>` | Supplier explicitly declaring `get()` may return `null` |
| `NonNullConsumer<T>` | `Consumer<T>` | Non-null single-arg consumer |
| `NonNullBiConsumer<T, U>` | `BiConsumer<T, U>` | Non-null two-arg consumer |
| `NonNullFunction<T, R>` | `Function<T, R>` | Non-null single-arg mapping function |
| `NonNullBiFunction<T, U, R>` | `BiFunction<T, U, R>` | Non-null two-arg mapping function |
| `NonNullUnaryOperator<T>` | `NonNullFunction<T, T>` | Non-null unary operator |
| `@NonnullType` / `@NullableType` | `ElementType.TYPE_USE` | Generic type-argument nullability annotations |

## Unlimited Stack Size: `UnlimitedItemStack`

In 1.21, vanilla `ItemStack`'s `Codec` caps `count` at 99 (default 64) and errors on serialization above that. `UnlimitedItemStack` wraps an `ItemStack` template with an independent `int` count (supporting any positive `int` count while preserving full `DataComponentMap` and `DataComponentPatch`), widely used in automated machine buffers, logistics buses, and bulk storage.

`UnlimitedItemStack` directly implements vanilla `DataComponentHolder`, `MutableDataComponentHolder`, and `IWithData<Item>`, making it seamlessly interchangeable with native `ItemStack` across almost all component read/write APIs.

### Codecs & Constants

| Static Member | Type & Purpose |
| --- | --- |
| `UnlimitedItemStack.EMPTY` | Global empty stack singleton (`count == 0`) |
| `UnlimitedItemStack.MAP_CODEC` / `CODEC` | Disk and datapack serialization (uses `Item.CODEC` for `"id"`, `DataComponentPatch.CODEC` for `"components"`, and any positive int `"count"`) |
| `UnlimitedItemStack.STREAM_CODEC` | Non-empty network stream codec |
| `UnlimitedItemStack.OPTIONAL_STREAM_CODEC` | Network stream codec allowing empty stacks (`EMPTY`) |
| `UnlimitedItemStack.OPTIONAL_LIST_STREAM_CODEC` | Batch network codec for `List<UnlimitedItemStack>` |

### Core Constructors & Common API

| Category | Method Signatures | Description |
| --- | --- | --- |
| **Construction** | `UnlimitedItemStack(ItemStack stack)` / `(ItemStack, int count)` / `(Holder<Item>, int count, DataComponentPatch)` | Creates from a vanilla stack or `Holder<Item>` |
| **Count Ops** | `getCount()` / `count()`, `grow(int)`, `shrink(int)`, `isEmpty()` | Arbitrary integer adjustments without 64/99 caps |
| **Splitting & Copying** | `split(int amount)`, `copyAndClear()`, `copy()`, `copyWithCount(int)`, `transmuteCopy(ItemLike[, int])` | Splits or copies with item transmutation |
| **Vanilla Interop** | `toStack()` / `toStacks()` | `toStack()` returns a vanilla `ItemStack`; `toStacks()` splits into a `List<ItemStack>` respecting `getMaxStackSize()` (for world drops or vanilla chests) |
| **Matching & Comparison** | `matches(...)`, `isSameItem(...)`, `isSameItemSameComponents(...)`, `matchesIgnoringComponents(...)`, `listMatches(...)`, `hashItemAndComponents()` / `hashStackList(...)` | Fine-grained item and data-component equality checks |
| **Tags / Components / Capabilities** | `is(TagKey / HolderSet / Item / Holder / ResourceKey / ItemLike / Predicate)`, `isAny(ItemLike...)`, `getData(DataMapType)`, `getTyped(...)`, `set(...)`, `update(...)`, `remove(...)`, `applyComponents(...)`, `copyFrom(...)`, `getCraftingRemainder()` / `getCraftingRemainingItem()` | Full delegation and maintenance of underlying template data components and crafting remainders |

```java
// Example: extract 300 logs from a logistics slot and split into standard vanilla stacks to drop in world
UnlimitedItemStack buffer = new UnlimitedItemStack(new ItemStack(Items.OAK_LOG), 300);
UnlimitedItemStack extracted = buffer.split(300);

List<ItemStack> vanillaDrops = extracted.toStacks(); // Produces 4 stacks of 64 + 1 stack of 44
for (ItemStack drop : vanillaDrops) {
    Block.popResource(level, pos, drop);
}
```
