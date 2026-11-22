# Nullness Functional Interfaces & UnlimitedItemStack

This section covers two core infrastructure pieces in `module.util`:
1. **`dev.anvilcraft.lib.v2.util.nullness`**: Null-safe functional interface family with static-analysis annotations (foundational to `Registrum` etc.).
2. **`dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack`**: Breaks vanilla `ItemStack`'s `99` cap, supporting arbitrary `int` counts (up to `Integer.MAX_VALUE`) while implementing `DataComponentHolder`, `MutableDataComponentHolder`, and `IWithData<Item>`.

## 1. Nullness Annotations & Functional Interfaces (`nullness`)

The package declares `@ParametersAreNonnullByDefault`, `@MethodsReturnNonnullByDefault`, and `@FieldsAreNonnullByDefault` at package level.

### Annotation Types

| Annotation Signature | Description |
| --- | --- |
| `@NonnullType` | Targets `FIELD`, `METHOD`, `PARAMETER`, `TYPE_PARAMETER`, `TYPE_USE`; meta-annotated with JSR-305 `@Nonnull` |
| `@NullableType` | Targets `FIELD`, `METHOD`, `PARAMETER`, `TYPE_PARAMETER`, `TYPE_USE`; meta-annotated with JSR-305 `@Nullable` |

### Functional Interface Family

| Interface Signature | Extends | Specific Default / Static Methods |
| --- | --- | --- |
| `NonNullSupplier<@NonnullType T>` | `Supplier<T>` | `static <T> NonNullSupplier<T> of(Supplier<@NullableType T> sup)`, `static <T> NonNullSupplier<T> of(Supplier<@NullableType T> sup, NonNullSupplier<String> errorMsg)` (throws `NullPointerException` immediately if `null`); `default NonNullSupplier<T> lazy()` and `static <T> NonNullSupplier<T> lazy(Supplier<@NonnullType T> sup)` (backed by NeoForge `Lazy.of(sup)::get`) |
| `NonNullConsumer<@NonnullType T>` | `Consumer<T>` | `default NonNullConsumer<T> andThen(NonNullConsumer<? super T> after)`, `static <T> NonNullConsumer<T> noop()` |
| `NonNullBiConsumer<@NonnullType T, @NonnullType U>` | `BiConsumer<T, U>` | `static <T, U> NonNullBiConsumer<T, U> noop()` |
| `NonNullFunction<@NonnullType T, @NonnullType R>` | `Function<T, R>` | `default <V> NonNullFunction<T, V> andThen(NonNullFunction<? super R, ? extends V> after)` |
| `NonNullBiFunction<@NonnullType T, @NonnullType U, @NonnullType R>` | `BiFunction<T, U, R>` | No extra default methods |
| `NonNullUnaryOperator<T>` | `NonNullFunction<T, T>` | `static <T> NonNullUnaryOperator<T> identity()`, `default <V> NonNullUnaryOperator<T> andThen(NonNullUnaryOperator<T> after)` |
| `@Deprecated NullableSupplier<@NullableType T>` | `Supplier<T>` | Deprecated; includes `getNonNull()`, `getNonNull(NonNullSupplier<String>)`, `asNonNull()`, `asNonNull(NonNullSupplier<String>)` |

## 2. Unlimited Stack Size ItemStack: `UnlimitedItemStack`

### Design & Core Differences

Vanilla `ItemStack`'s `Codec` in 1.21.1 caps `count` at `99`, truncating large automated storage or recipe outputs. `UnlimitedItemStack` holds a `count = 1` prototype `ItemStack` for item type and `DataComponent` state alongside an independent `int count` field:
- Interops with vanilla `ItemStack`: **`toStack()`** preserves the full huge count (may exceed vanilla caps), while **`toStacks()`** splits by `stack.getMaxStackSize()` into a `List<ItemStack>` of valid stack sizes.
- When replacing the underlying prototype via `setStack(ItemStack stack)`, note that it **calls `stack.copyWithCount(1)` internally and does not modify `count`**—call `setCount(int)` explicitly to change count.

### Constants, Codecs & Constructors

| Member Signature | Description |
| --- | --- |
| `public static final UnlimitedItemStack EMPTY` | Global empty stack constant (`ItemStack.EMPTY, 0`) |
| `public static final MapCodec<UnlimitedItemStack> MAP_CODEC` | Recursive field-mapped Codec (uses NeoForge `ExtraCodecs.POSITIVE_INT` for arbitrary positive int counts and component patches) |
| `public static final Codec<UnlimitedItemStack> CODEC` | Lazily initialized primary JSON `Codec` |
| `public static final StreamCodec<RegistryFriendlyByteBuf, UnlimitedItemStack> OPTIONAL_STREAM_CODEC` | Allows sending empty stacks: writes boolean or `VarInt` count (`0` decodes as `EMPTY`), then encodes prototype components |
| `public static final StreamCodec<RegistryFriendlyByteBuf, UnlimitedItemStack> STREAM_CODEC` | Non-empty stream codec: throws `EncoderException` on empty stack |
| `public static final StreamCodec<RegistryFriendlyByteBuf, List<UnlimitedItemStack>> OPTIONAL_LIST_STREAM_CODEC` | List stream codec (uses `NonNullList::createWithCapacity`) |
| `public UnlimitedItemStack(ItemStack stack, int count)` | Clamps `count >= 0` and stores prototype + count |
| `public UnlimitedItemStack(Holder<Item> itemHolder, int count, DataComponentPatch components)` | Constructs from registry holder and component patch |
| `public UnlimitedItemStack(ItemStack stack)` | Constructs using `stack.getCount()` |

### Complete Member Methods Summary

#### Count, Splitting, Copying & Conversion

| Method Signature | Description |
| --- | --- |
| `boolean isEmpty()` | Returns `true` when prototype is empty or `count <= 0` |
| `int getCount()` / `int count()` | Returns `0` if empty, else actual `count` |
| `void setCount(int count)` | Provided by Lombok `@Setter`; directly sets `count` |
| `void grow(int amount)` / `void shrink(int amount)` | Increments or decrements count |
| `void setStack(ItemStack stack)` | **Replaces only prototype item and components**, normalizing its count to `1` without changing `count` |
| `ItemStack getStack()` | Provided by Lombok `@Getter`; returns underlying 1-count prototype `ItemStack` |
| `UnlimitedItemStack split(int amount)` | Splits up to `amount` items into a new stack and shrinks self |
| `UnlimitedItemStack copyAndClear()` | Copies self then zeroes current stack count |
| `UnlimitedItemStack copy()` / `copyWithCount(int count)` | Deep-copies self (optionally with new count) |
| `UnlimitedItemStack transmuteCopy(ItemLike newItem)` / `transmuteCopy(ItemLike newItem, int newCount)` | Changes item type while preserving existing component patch and count |
| `ItemStack toStack()` | Converts to a single `ItemStack` with full `count` (**may exceed `maxStackSize` / `99`**) |
| `List<ItemStack> toStacks()` | Safely splits by `getMaxStackSize()` into an immutable list of standard-sized `ItemStack`s |

#### Item Checks, Comparison & Hashing

| Method Signature | Description |
| --- | --- |
| `Item getItem()` / `Holder<Item> getItemHolder()` / `Holder<Item> typeHolder()` | Gets item or holder; returns `Items.AIR` when empty |
| `Stream<TagKey<Item>> tags()` | Streams all tags of the item |
| `boolean is(...)` | Overloads for `TagKey<Item>`, `HolderSet<Item>`, `Item`, `Holder<Item>`, `ResourceKey<Item>`, `ItemLike`, `Predicate<Holder<Item>>` |
| `boolean isAny(ItemLike... items)` | Checks whether it matches any of the given items |
| `int getMaxStackSize()` / `boolean isStackable()` / `isDamageableItem()` / `isDamaged()` | Forwards to prototype `ItemStack` |
| `boolean canPerformAction(ItemAbility ability)` | NeoForge tool action capability check |
| `boolean matches(ItemStack stack)` / `matches(UnlimitedItemStack stack)` | Checks **type, components, and count equality** (`true` if both empty) |
| `boolean isSameItem(ItemStack stack)` / `isSameItem(UnlimitedItemStack stack)` | Compares item type only |
| `boolean isSameItemSameComponents(ItemStack stack)` / `isSameItemSameComponents(@Nullable UnlimitedItemStack stack)` | Compares item type and all data components (ignoring count) |
| `boolean matchesIgnoringComponents(ItemStack other, Predicate<DataComponentType<?>> ignoredPredicate)` / `(UnlimitedItemStack, Predicate)` | Equivalence check ignoring specified components |
| `int hashItemAndComponents()` / `static int hashStackList(List<UnlimitedItemStack> list)` | Computes item+component hash and list hash |
| `static boolean listMatches(List<UnlimitedItemStack> list, List<UnlimitedItemStack> other)` | Element-wise `isSameItemSameComponents` comparison across two lists |
| `equals(Object o)` / `hashCode()` / `toString()` | `equals` compares item, components, and count; `toString` returns `"<count> <item>"` |

#### Data Components, Enchantments & NeoForge DataMap Access

| Method Signature | Description |
| --- | --- |
| `<T> @Nullable T getData(DataMapType<Item, T> type)` | Implements NeoForge `IWithData<Item>` to read DataMap data for this item |
| `<T> @Nullable TypedDataComponent<T> getTyped(DataComponentType<T> type)` | Gets typed component entry |
| `<T> @Nullable T set(DataComponentType<? super T> type, @Nullable T value)` / `set(TypedDataComponent<T> value)` | Sets mutable data component (forwarded to prototype stack) |
| `void copyFrom(DataComponentHolder src, DataComponentType<?>... componentTypes)` / `void copyFrom(UnlimitedItemStack stack)` | Batch-copies specified or all components |
| `<T, U> @Nullable T update(...)` / `<T> @Nullable T update(DataComponentType<T> type, T defaultValue, UnaryOperator<T> function)` | Atomic in-place component update |
| `<T> @Nullable T remove(DataComponentType<? extends T> type)` | Removes specified data component |
| `void applyComponents(DataComponentPatch patch)` / `applyComponents(DataComponentMap components)` | Batch-applies patch or full component map |
| `DataComponentMap getComponents()` / `DataComponentPatch getComponentsPatch()` | Reads read-only component map and diff patch relative to defaults |
| `ItemEnchantments getTagEnchantments()` / `int getEnchantmentLevel(Holder<Enchantment> enchantment)` | Reads item enchantment components and enchantment levels |
| `ItemStack getCraftingRemainingItem()` / `getCraftingRemainder()` | Returns crafting container remainder item (e.g., bucket) |
| `<T extends TooltipProvider> void addToTooltip(DataComponentType<T> component, Item.TooltipContext context, Consumer<Component> adder, TooltipFlag flag)` | Appends the specified component lines to the Tooltip display |

## Full Example: Storage Cache Accumulation & Safe Vanilla Stack Ejection

```java
package com.example.mymod.storage;

import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;
import dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack;
import net.minecraft.core.BlockPos;
import net.minecraft.world.Containers;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;

import java.util.List;

public final class BulkCacheExample {
    private static final NonNullSupplier<UnlimitedItemStack> DEFAULT_STARTER =
        NonNullSupplier.lazy(() -> new UnlimitedItemStack(new ItemStack(Items.REDSTONE), 512));

    public static UnlimitedItemStack mergeIntoCache(UnlimitedItemStack cache, ItemStack incoming) {
        if (cache.isEmpty()) {
            return new UnlimitedItemStack(incoming, incoming.getCount());
        }
        if (cache.isSameItemSameComponents(incoming)) {
            cache.grow(incoming.getCount());
        }
        return cache;
    }

    public static void dropAllSafely(Level level, BlockPos pos, UnlimitedItemStack cache) {
        if (cache.isEmpty()) {
            cache = DEFAULT_STARTER.get().copy();
        }
        List<ItemStack> validVanillaStacks = cache.toStacks();
        for (ItemStack vanillaStack : validVanillaStacks) {
            Containers.dropItemStack(
                level,
                pos.getX() + 0.5,
                pos.getY() + 0.5,
                pos.getZ() + 0.5,
                vanillaStack
            );
        }
        cache.setCount(0);
    }
}
```
