# 非空函数式接口与无限物品栈 (`nullness` / `UnlimitedItemStack`)

<BranchContextCard branch="26.3" />

本篇介绍 `module.util` 中面向 Minecraft 26.3 的**不限堆叠上限物品栈 `UnlimitedItemStack`**，以及为 `module.registrum` 等流式构建器提供严格类型空安全标注的 **`dev.anvilcraft.lib.v2.util.nullness`** 函数式接口族。

---

## 一、 突破堆叠上限的无限物品栈 (`UnlimitedItemStack`)

### 1. 要解决什么问题 & 包路径迁移注意

原版 `ItemStack` 的 `CODEC` 将 `count` 限制在 `[1, 99]`（或物品最大堆叠数）以内。当你的大容量抽屉、多方块巨型仓储或批量合成缓存需要存储并网络传输数量高达数万甚至 `Integer.MAX_VALUE` 的同种物品（同时完整保留其 `DataComponentMap` 数据组件）时，原版 `ItemStack` 无法直接序列化。

`dev.anvilcraft.lib.v2.util.UnlimitedItemStack` 实现了原版 26.3 的 **`ItemInstance`** 与 NeoForge 的 **`MutableDataComponentHolder`** 接口：
- 内部持有一个 `count = 1` 的原型 `ItemStack` 承载物品类型与数据组件，独立维护范围为 `[0, Integer.MAX_VALUE]` 的 `int count`；
- 支持与 NeoForge 26.3 的传输系统 `ItemResource`、原版 `ItemStackTemplate` 及 `ItemStack` 直接互转或比较；
- 调用 **`toStacks()`** 可一键将超大数量的 `UnlimitedItemStack` 按该物品的 `getMaxStackSize()` 自动拆分为若干个合法满堆叠的 `List<ItemStack>`！

> **包路径弃用提示**：
> 旧包路径 `dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack` 自 `2.0.0+snapshot.463` 起已标注 `@Deprecated(forRemoval = true)`。在 `26.3` 中请统一使用顶层包下的 **`dev.anvilcraft.lib.v2.util.UnlimitedItemStack`**。

### 2. 完整代码示例：存储超大数量物品、修改组件并拆分为原版 `ItemStack` 列表

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
        // 1. 创建一个数量为 10,000 的钻石剑无限物品栈
        UnlimitedItemStack hugeStack = new UnlimitedItemStack(new ItemStack(Items.DIAMOND_SWORD), 10_000);

        // 2. 直接作为 MutableDataComponentHolder 修改其数据组件
        hugeStack.set(DataComponents.CUSTOM_NAME, Component.literal("量产型钻石剑"));

        // 3. 增减与分割数量（split 不会像旧版那样因超过 maxStackSize 抛异常，而是返回 UnlimitedItemStack）
        hugeStack.grow(500);
        UnlimitedItemStack taken = hugeStack.split(250); // taken.getCount() == 250, hugeStack.getCount() == 10250

        // 4. 与 NeoForge ItemResource 或 ItemStack 比较物品与组件一致性
        ItemResource resource = ItemResource.of(hugeStack.toStack());
        boolean same = hugeStack.isSameItemSameComponents(resource);

        // 5. 将 200 个铁锭拆分为合法的原版 ItemStack 列表（[64, 64, 64, 8] 共 4 组）
        UnlimitedItemStack ironStorage = new UnlimitedItemStack(new ItemStack(Items.IRON_INGOT), 200);
        List<ItemStack> vanillaStacks = ironStorage.toStacks();
    }
}
```

### 3. `UnlimitedItemStack` 核心 API 详表 (`dev.anvilcraft.lib.v2.util.UnlimitedItemStack`)

| 分类 | 常量 / 构造器 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **常量与编解码器** | • `EMPTY`：空实例（`count = 0`）<br>• `MAP_CODEC` / `CODEC`（`count` 范围 `1..Integer.MAX_VALUE`） / `OPTIONAL_CODEC`<br>• `OPTIONAL_STREAM_CODEC` / `STREAM_CODEC` / `OPTIONAL_LIST_STREAM_CODEC` | 支持 JSON/NBT 与网络缓冲区的完整编解码器。 |
| **构造器** | • `UnlimitedItemStack(ItemResource resource, int count)`<br>• `UnlimitedItemStack(ItemStack stack, int count)`<br>• `UnlimitedItemStack(Holder<Item> itemHolder, int count, DataComponentPatch components)`<br>• `UnlimitedItemStack(ItemStack stack)` | 从 `ItemResource`、`ItemStack` 或 `Holder<Item>` 构造。 |
| **数量与分割** | • `int getCount()` / `int count()` / `void setCount(int count)` / `boolean isEmpty()`<br>• `void grow(int amount)` / `void shrink(int amount)`<br>• `UnlimitedItemStack split(int amount)`：分割出最多 `amount` 个物品返回新 `UnlimitedItemStack` 并扣减自身数量<br>• `UnlimitedItemStack copy()` / `copyWithCount(int count)` / `copyAndClear()`<br>• `UnlimitedItemStack transmuteCopy(ItemLike newItem, [int newCount])` | 数量增减、拆分与保留组件转换物品类型。 |
| **原版转换** | • `ItemStack toStack()`：返回带有 `this.getCount()` 的单个 `ItemStack`（注意数量可能大于原版堆叠上限）<br>• `List<ItemStack> toStacks()`：按 `getMaxStackSize()` 切分为多个数量合法的 `ItemStack` 列表 | 与原版 `ItemStack` 互转。 |
| **匹配与哈希** | • `is(ItemLike)` / `is(Predicate<Holder<Item>>)` / `isAny(ItemLike...)`<br>• `isSameItem(ItemResource / ItemStack / ItemStackTemplate / UnlimitedItemStack)`<br>• `isSameItemSameComponents(ItemResource / ItemStack / ItemStackTemplate / UnlimitedItemStack)`<br>• `matches(ItemStack / ItemStackTemplate / UnlimitedItemStack)`<br>• `matchesIgnoringComponents(ItemStack / UnlimitedItemStack, Predicate<DataComponentType<?>>)`<br>• `int hashItemAndComponents()` / `static int hashStackList(List<UnlimitedItemStack>)` / `static boolean listMatches(List<UnlimitedItemStack>, List<UnlimitedItemStack>)` | 全方位类型、组件与列表相等性判断。 |
| **组件读写** | 实现 `MutableDataComponentHolder`：`get(type)`、`set(type, val)`、`update(...)`、`remove(type)`、`applyComponents(patch / map)`、`getComponents()`、`getComponentsPatch()` | 直接读写物品上的数据组件。 |

---

## 二、 非空注解与函数式接口 (`dev.anvilcraft.lib.v2.util.nullness`)

该包提供了一组带 JSR-305 `@Nonnull` 类型参数标注（`@NonnullType` / `@NullableType`）的函数式接口，使 IDE 与静态分析器在链式 Lambda（如 `Registrum` 构建器回调）中无需重复编写空检查：

| 接口 / 注解名 | 继承自 / 目标 | 特有方法签名与说明 |
| :--- | :--- | :--- |
| `@NonnullType` | `TYPE_USE` | 标记泛型类型参数为 `@Nonnull`。 |
| `@NullableType` | `TYPE_USE` | 标记泛型类型参数为 `@Nullable`。 |
| `@FieldsAreNonnullByDefault` | `PACKAGE`, `TYPE` | 标记包或类中所有字段默认为 `@Nonnull`。 |
| **`NonNullSupplier<T>`** | `Supplier<T>` | • `T get()`<br>• `static <T> NonNullSupplier<T> of(Supplier<@NullableType T> sup, [NonNullSupplier<String> errorMsg])`（包装并在返回 `null` 时抛 NPE）<br>• `default NonNullSupplier<T> lazy()` / `static <T> NonNullSupplier<T> lazy(Supplier<T> sup)`（使用 `Lazy.of` 包装为懒加载非空 Supplier） |
| **`NonNullFunction<T, R>`** | `Function<T, R>` | `R apply(T t)`、`default <V> NonNullFunction<T, V> andThen(NonNullFunction<? super R, ? extends V> after)` |
| **`NonNullBiFunction<T, U, R>`** | `BiFunction<T, U, R>` | `R apply(T t, U u)` |
| **`NonNullUnaryOperator<T>`** | `NonNullFunction<T, T>` | `static <T> NonNullUnaryOperator<T> identity()`、`andThen(NonNullUnaryOperator<T> after)` |
| **`NonNullConsumer<T>`** | `Consumer<T>` | `void accept(T t)`、`andThen(NonNullConsumer<? super T> after)`、`static <T> NonNullConsumer<T> noop()` |
| **`NonNullBiConsumer<T, U>`** | `BiConsumer<T, U>` | `void accept(T t, U u)`、`static <T, U> NonNullBiConsumer<T, U> noop()` |
| `NullableSupplier<T>` | `Supplier<T>` | （`@Deprecated`）提供 `getNonNull()` 与 `asNonNull()` 转换方法。 |
