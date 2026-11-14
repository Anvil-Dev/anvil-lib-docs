# 非空函数式接口与无限物品栈

本节涵盖 `module.util` 中的两类核心基础设施：
1. **`dev.anvilcraft.lib.v2.util.nullness`**：配合空安全静态分析注解的无空值函数式接口家族（也是 `Registrum` 模块等重度依赖的类型基础）。
2. **`dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack`**：突破原版 `ItemStack` `99` 上限、支持任意 `int` 数量（最高 `Integer.MAX_VALUE`）并完整实现 `DataComponentHolder`、`MutableDataComponentHolder` 与 `IWithData<Item>` 的大数据组件物品栈。

## 1. 非空注解与函数式接口（`nullness`）

默认所在包声明了包级注解 `@ParametersAreNonnullByDefault`、`@MethodsReturnNonnullByDefault` 与 `@FieldsAreNonnullByDefault`。

### 注解类型

| 注解签名 | 说明 |
| --- | --- |
| `@NonnullType` | 标注目标：`FIELD`、`METHOD`、`PARAMETER`、`TYPE_PARAMETER`、`TYPE_USE`，元注解携带 JSR-305 `@Nonnull` |
| `@NullableType` | 标注目标：`FIELD`、`METHOD`、`PARAMETER`、`TYPE_PARAMETER`、`TYPE_USE`，元注解携带 JSR-305 `@Nullable` |

### 函数式接口家族

| 接口签名 | 继承自 | 特有默认 / 静态方法 |
| --- | --- | --- |
| `NonNullSupplier<@NonnullType T>` | `Supplier<T>` | `static <T> NonNullSupplier<T> of(Supplier<@NullableType T> sup)`、`static <T> NonNullSupplier<T> of(Supplier<@NullableType T> sup, NonNullSupplier<String> errorMsg)`（取值为 `null` 时立即抛 `NullPointerException`）；`default NonNullSupplier<T> lazy()` 与 `static <T> NonNullSupplier<T> lazy(Supplier<@NonnullType T> sup)`（基于 NeoForge `Lazy.of(sup)::get`） |
| `NonNullConsumer<@NonnullType T>` | `Consumer<T>` | `default NonNullConsumer<T> andThen(NonNullConsumer<? super T> after)`、`static <T> NonNullConsumer<T> noop()` |
| `NonNullBiConsumer<@NonnullType T, @NonnullType U>` | `BiConsumer<T, U>` | `static <T, U> NonNullBiConsumer<T, U> noop()` |
| `NonNullFunction<@NonnullType T, @NonnullType R>` | `Function<T, R>` | `default <V> NonNullFunction<T, V> andThen(NonNullFunction<? super R, ? extends V> after)` |
| `NonNullBiFunction<@NonnullType T, @NonnullType U, @NonnullType R>` | `BiFunction<T, U, R>` | 无额外默认方法 |
| `NonNullUnaryOperator<T>` | `NonNullFunction<T, T>` | `static <T> NonNullUnaryOperator<T> identity()`、`default <V> NonNullUnaryOperator<T> andThen(NonNullUnaryOperator<T> after)` |
| `@Deprecated NullableSupplier<@NullableType T>` | `Supplier<T>` | 已废弃；包含 `getNonNull()`、`getNonNull(NonNullSupplier<String>)`、`asNonNull()`、`asNonNull(NonNullSupplier<String>)` |

## 2. 无限物品栈：`UnlimitedItemStack`

### 设计思路与核心差异

原版 `ItemStack` 在 1.21.1 中的 `Codec` 限制 `count` 最大值为 `99`，在大型自动化仓储、多物品合成输出累计或工业配方产物统计时极易被截断。`UnlimitedItemStack` 在内部以一份单数量（`count = 1`）的原型 `ItemStack` 承载物品类型与 `DataComponent` 状态，并将数量单独存放在独立的整型字段 `count` 中：
- 支持与原版 `ItemStack` 互转：**`toStack()`** 保留完整超大数量（可能超过原版上限），**`toStacks()`** 按 `stack.getMaxStackSize()` 自动拆分为合法数量的 `List<ItemStack>`。
- 若使用 `setStack(ItemStack stack)` 替换底层物品原型，请注意该方法**内部调用 `stack.copyWithCount(1)`，不会修改当前 `count` 字段**，如需修改数量必须显式调用 `setCount(int)`。

### 常量、编解码器与构造方法

| 成员签名 | 说明 |
| --- | --- |
| `public static final UnlimitedItemStack EMPTY` | 全局空栈常量（`ItemStack.EMPTY, 0`） |
| `public static final MapCodec<UnlimitedItemStack> MAP_CODEC` | 递归字段映射 Codec（使用 NeoForge `ExtraCodecs.POSITIVE_INT` 支持任意正整数数量与组件补丁） |
| `public static final Codec<UnlimitedItemStack> CODEC` | 惰性初始化的主 JSON `Codec` |
| `public static final StreamCodec<RegistryFriendlyByteBuf, UnlimitedItemStack> OPTIONAL_STREAM_CODEC` | 允许发送空栈：先写布尔或 `VarInt` 数量（0 则解码为 `EMPTY`），再编码原型组件 |
| `public static final StreamCodec<RegistryFriendlyByteBuf, UnlimitedItemStack> STREAM_CODEC` | 非空传输编解码器：遇到空栈抛 `EncoderException` |
| `public static final StreamCodec<RegistryFriendlyByteBuf, List<UnlimitedItemStack>> OPTIONAL_LIST_STREAM_CODEC` | 列表流编解码器（内部用 `NonNullList::createWithCapacity`） |
| `public UnlimitedItemStack(ItemStack stack, int count)` | 将 `count` 钳制为 `>= 0` 后存储原型与数量 |
| `public UnlimitedItemStack(Holder<Item> itemHolder, int count, DataComponentPatch components)` | 从注册表条目与组件补丁构造 |
| `public UnlimitedItemStack(ItemStack stack)` | 以传入 `stack` 的 `getCount()` 构造 |

### 完整成员方法汇总

#### 数量、分裂、拷贝与转换

| 方法签名 | 说明 |
| --- | --- |
| `boolean isEmpty()` | 底层原型为空或 `count <= 0` 时返回 `true` |
| `int getCount()` / `int count()` | 空栈返回 `0`，否则返回实际 `count` |
| `void setCount(int count)` | 由 Lombok `@Setter` 提供，直接设置数量字段 |
| `void grow(int amount)` / `void shrink(int amount)` | 增加或减少数量 |
| `void setStack(ItemStack stack)` | **仅替换原型物品与组件**，强制将其数量规范为 `1`，不会更改 `count` |
| `ItemStack getStack()` | 由 Lombok `@Getter` 提供，获取底层单件原型 `ItemStack` |
| `UnlimitedItemStack split(int amount)` | 拆分出最多 `amount` 个作为新栈并扣减自身数量 |
| `UnlimitedItemStack copyAndClear()` | 拷贝自身后将当前栈数量清零 |
| `UnlimitedItemStack copy()` / `copyWithCount(int count)` | 深拷贝自身（可指定新数量） |
| `UnlimitedItemStack transmuteCopy(ItemLike newItem)` / `transmuteCopy(ItemLike newItem, int newCount)` | 更换物品类型但尽量保留现有组件补丁与数量 |
| `ItemStack toStack()` | 转为单个含完整 `count` 的 `ItemStack`（**可能超出 `maxStackSize` / `99`**） |
| `List<ItemStack> toStacks()` | 按 `getMaxStackSize()` 安全分拆为多个标准数量 `ItemStack` 的不可变列表 |

#### 物品判断、比较与哈希

| 方法签名 | 说明 |
| --- | --- |
| `Item getItem()` / `Holder<Item> getItemHolder()` / `Holder<Item> typeHolder()` | 获取物品或持有者，空栈返回 `Items.AIR` |
| `Stream<TagKey<Item>> tags()` | 获取物品全部标签流 |
| `boolean is(...)` | 重载支持 `TagKey<Item>`、`HolderSet<Item>`、`Item`、`Holder<Item>`、`ResourceKey<Item>`、`ItemLike`、`Predicate<Holder<Item>>` |
| `boolean isAny(ItemLike... items)` | 判断是否为任意给定物品之一 |
| `int getMaxStackSize()` / `boolean isStackable()` / `isDamageableItem()` / `isDamaged()` | 转发至底层原型 `ItemStack` 的对应属性 |
| `boolean canPerformAction(ItemAbility ability)` | NeoForge 工具能力校验 |
| `boolean matches(ItemStack stack)` / `matches(UnlimitedItemStack stack)` | 检查**类型、组件且数量相等**（双向空栈同样返回 `true`） |
| `boolean isSameItem(ItemStack stack)` / `isSameItem(UnlimitedItemStack stack)` | 仅比较物品类型是否相同 |
| `boolean isSameItemSameComponents(ItemStack stack)` / `isSameItemSameComponents(@Nullable UnlimitedItemStack stack)` | 比较物品类型与全部数据组件（忽略数量） |
| `boolean matchesIgnoringComponents(ItemStack other, Predicate<DataComponentType<?>> ignoredPredicate)` / `(UnlimitedItemStack, Predicate)` | 忽略指定组件的等价性比较 |
| `int hashItemAndComponents()` / `static int hashStackList(List<UnlimitedItemStack> list)` | 计算物品类型+组件哈希及列表整体哈希 |
| `static boolean listMatches(List<UnlimitedItemStack> list, List<UnlimitedItemStack> other)` | 逐项检查两个列表同索引元素是否满足 `isSameItemSameComponents` |
| `equals(Object o)` / `hashCode()` / `toString()` | `equals` 对比物品、组件与数量；`toString` 返回 `"<count> <item>"` |

#### 数据组件、附魔与 NeoForge DataMap 读写

| 方法签名 | 说明 |
| --- | --- |
| `<T> @Nullable T getData(DataMapType<Item, T> type)` | 实现 NeoForge `IWithData<Item>`，直接读取该物品的 DataMap 数据 |
| `<T> @Nullable TypedDataComponent<T> getTyped(DataComponentType<T> type)` | 获取带类型的组件条目 |
| `<T> @Nullable T set(DataComponentType<? super T> type, @Nullable T value)` / `set(TypedDataComponent<T> value)` | 设置可变数据组件（转发到内部原型栈） |
| `void copyFrom(DataComponentHolder src, DataComponentType<?>... componentTypes)` / `void copyFrom(UnlimitedItemStack stack)` | 批量复制指定或全部组件 |
| `<T, U> @Nullable T update(...)` / `<T> @Nullable T update(DataComponentType<T> type, T defaultValue, UnaryOperator<T> function)` | 原地原子式组件更新 |
| `<T> @Nullable T remove(DataComponentType<? extends T> type)` | 移除指定数据组件 |
| `void applyComponents(DataComponentPatch patch)` / `applyComponents(DataComponentMap components)` | 批量应用补丁或完整组件映射 |
| `DataComponentMap getComponents()` / `DataComponentPatch getComponentsPatch()` | 读取只读组件表与相对默认组件的差量补丁 |
| `ItemEnchantments getTagEnchantments()` / `int getEnchantmentLevel(Holder<Enchantment> enchantment)` | 读取物品附魔组件与附魔等级 |
| `ItemStack getCraftingRemainingItem()` / `getCraftingRemainder()` | 获取合成容器残留物品（如桶） |
| `<T extends TooltipProvider> void addToTooltip(DataComponentType<T> component, Item.TooltipContext context, Consumer<Component> adder, TooltipFlag flag)` | 将指定组件行加入 Tooltip 显示 |

## 完整示例：仓储缓存累计与安全吐出原版栈

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
