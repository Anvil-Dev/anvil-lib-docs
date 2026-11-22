# Nullness Functional Interfaces & UnlimitedItemStack (`nullness` / `UnlimitedItemStack`)

<BranchContextCard branch="26.1" />

This page covers `module.util`'s **stack-limit-free `UnlimitedItemStack`** for Minecraft 26.1 and the **`dev.anvilcraft.lib.v2.util.nullness`** functional interface family providing strict null-safety annotations for fluent builders like `module.registrum`.

---

## 1. Unlimited Stack Size ItemStack (`UnlimitedItemStack`)

### 1. Problem & Package Migration Note

Vanilla `ItemStack`'s `CODEC` caps `count` at `[1, 99]` (or the item's max stack size). When high-capacity drawers, multiblock bulk storage, or batch crafting caches need to store and sync tens of thousands or up to `Integer.MAX_VALUE` of an item (while preserving its `DataComponentMap`), vanilla `ItemStack` cannot be serialized directly.

`dev.anvilcraft.lib.v2.util.UnlimitedItemStack` implements vanilla 26.1's **`ItemInstance`** and NeoForge's **`MutableDataComponentHolder`**:
- Holds an internal `count = 1` prototype `ItemStack` for item type and data components, alongside an independent `int count` in `[0, Integer.MAX_VALUE]`;
- Supports direct conversion and comparison with NeoForge 26.1's `ItemResource`, vanilla `ItemStackTemplate`, and `ItemStack`;
- Calling **`toStacks()`** splits a huge `UnlimitedItemStack` into a `List<ItemStack>` of valid stacks respecting `getMaxStackSize()`!

> **Package Deprecation Notice**:
> The old package `dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack` is marked `@Deprecated(forRemoval = true)` since `2.0.0+snapshot.463`. In `26.1`, always use **`dev.anvilcraft.lib.v2.util.UnlimitedItemStack`**.

### 2. Full Code Example: Storing Huge Counts, Mutating Components & Splitting to Vanilla `ItemStack`s

```java
package com.example.mymod.storage;

import dev.anvilcraft.lib.v2.util.UnlimitedItemStack;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.transfer.item.ItemResource;

import java.util.List;

public final class DeepStorageSlotExample {
    public static void demonstrateUnlimitedStack() {
        // 1. Create an UnlimitedItemStack of 10,000 diamond swords
        UnlimitedItemStack hugeStack = new UnlimitedItemStack(new ItemStack(Items.DIAMOND_SWORD), 10_000);

        // 2. Mutate its data components directly as a MutableDataComponentHolder
        hugeStack.set(DataComponents.CUSTOM_NAME, Component.literal("Mass-Produced Diamond Sword"));

        // 3. Grow, shrink, and split (split returns UnlimitedItemStack instead of throwing above maxStackSize)
        hugeStack.grow(500);
        UnlimitedItemStack taken = hugeStack.split(250); // taken.getCount() == 250, hugeStack.getCount() == 10250

        // 4. Compare item and component equality with NeoForge ItemResource or ItemStack
        ItemResource resource = ItemResource.of(hugeStack.toStack());
        boolean same = hugeStack.isSameItemSameComponents(resource);

        // 5. Split 200 iron ingots into valid vanilla ItemStack stacks ([64, 64, 64, 8], 4 stacks)
        UnlimitedItemStack ironStorage = new UnlimitedItemStack(new ItemStack(Items.IRON_INGOT), 200);
        List<ItemStack> vanillaStacks = ironStorage.toStacks();
    }
}
```

### 3. `UnlimitedItemStack` Core API Reference (`dev.anvilcraft.lib.v2.util.UnlimitedItemStack`)

| Category | Constants / Constructors / Method Signatures | Description |
| :--- | :--- | :--- |
| **Constants & Codecs** | • `EMPTY`: empty instance (`count = 0`)<br>• `MAP_CODEC` / `CODEC` (`count` range `1..Integer.MAX_VALUE`) / `OPTIONAL_CODEC`<br>• `OPTIONAL_STREAM_CODEC` / `STREAM_CODEC` / `OPTIONAL_LIST_STREAM_CODEC` | Complete codecs for JSON/NBT and network buffers. |
| **Constructors** | • `UnlimitedItemStack(ItemResource resource, int count)`<br>• `UnlimitedItemStack(ItemStack stack, int count)`<br>• `UnlimitedItemStack(Holder<Item> itemHolder, int count, DataComponentPatch components)`<br>• `UnlimitedItemStack(ItemStack stack)` | Constructs from `ItemResource`, `ItemStack`, or `Holder<Item>`. |
| **Count & Splitting** | • `int getCount()` / `int count()` / `void setCount(int count)` / `boolean isEmpty()`<br>• `void grow(int amount)` / `void shrink(int amount)`<br>• `UnlimitedItemStack split(int amount)`: splits up to `amount` items into a new `UnlimitedItemStack` and shrinks self<br>• `UnlimitedItemStack copy()` / `copyWithCount(int count)` / `copyAndClear()`<br>• `UnlimitedItemStack transmuteCopy(ItemLike newItem, [int newCount])` | Count mutation, splitting, and component-preserving item transmutation. |
| **Vanilla Conversion** | • `ItemStack toStack()`: returns a single `ItemStack` with `this.getCount()` (note: count may exceed vanilla max stack size)<br>• `List<ItemStack> toStacks()`: splits into multiple `ItemStack`s respecting `getMaxStackSize()` | Interop with vanilla `ItemStack`. |
| **Matching & Hashing** | • `is(ItemLike)` / `is(Predicate<Holder<Item>>)` / `isAny(ItemLike...)`<br>• `isSameItem(ItemResource / ItemStack / ItemStackTemplate / UnlimitedItemStack)`<br>• `isSameItemSameComponents(ItemResource / ItemStack / ItemStackTemplate / UnlimitedItemStack)`<br>• `matches(ItemStack / ItemStackTemplate / UnlimitedItemStack)`<br>• `matchesIgnoringComponents(ItemStack / UnlimitedItemStack, Predicate<DataComponentType<?>>)`<br>• `int hashItemAndComponents()` / `static int hashStackList(List<UnlimitedItemStack>)` / `static boolean listMatches(List<UnlimitedItemStack>, List<UnlimitedItemStack>)` | Comprehensive item, component, and list equality checks. |
| **Component Access** | Implements `MutableDataComponentHolder`: `get(type)`, `set(type, val)`, `update(...)`, `remove(type)`, `applyComponents(patch / map)`, `getComponents()`, `getComponentsPatch()` | Direct read/write access to data components. |

---

## 2. Nullness Annotations & Functional Interfaces (`dev.anvilcraft.lib.v2.util.nullness`)

This package provides functional interfaces with JSR-305 `@Nonnull` type parameter annotations (`@NonnullType` / `@NullableType`) so IDEs and static analyzers do not need repetitive null checks inside fluent lambdas (such as `Registrum` builder callbacks):

| Interface / Annotation | Extends / Target | Specific Signatures & Description |
| :--- | :--- | :--- |
| `@NonnullType` | `TYPE_USE` | Marks a generic type argument as `@Nonnull`. |
| `@NullableType` | `TYPE_USE` | Marks a generic type argument as `@Nullable`. |
| `@FieldsAreNonnullByDefault` | `PACKAGE`, `TYPE` | Marks all fields in a package or class as `@Nonnull` by default. |
| **`NonNullSupplier<T>`** | `Supplier<T>` | • `T get()`<br>• `static <T> NonNullSupplier<T> of(Supplier<@NullableType T> sup, [NonNullSupplier<String> errorMsg])` (wraps and throws NPE if `null` is returned)<br>• `default NonNullSupplier<T> lazy()` / `static <T> NonNullSupplier<T> lazy(Supplier<T> sup)` (wraps with `Lazy.of` into a lazy non-null supplier) |
| **`NonNullFunction<T, R>`** | `Function<T, R>` | `R apply(T t)`, `default <V> NonNullFunction<T, V> andThen(NonNullFunction<? super R, ? extends V> after)` |
| **`NonNullBiFunction<T, U, R>`** | `BiFunction<T, U, R>` | `R apply(T t, U u)` |
| **`NonNullUnaryOperator<T>`** | `NonNullFunction<T, T>` | `static <T> NonNullUnaryOperator<T> identity()`, `andThen(NonNullUnaryOperator<T> after)` |
| **`NonNullConsumer<T>`** | `Consumer<T>` | `void accept(T t)`, `andThen(NonNullConsumer<? super T> after)`, `static <T> NonNullConsumer<T> noop()` |
| **`NonNullBiConsumer<T, U>`** | `BiConsumer<T, U>` | `void accept(T t, U u)`, `static <T, U> NonNullBiConsumer<T, U> noop()` |
| `NullableSupplier<T>` | `Supplier<T>` | (`@Deprecated`) Provides `getNonNull()` and `asNonNull()` conversion helpers. |
