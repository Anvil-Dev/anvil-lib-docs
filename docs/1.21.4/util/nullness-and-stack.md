# 非空函数式接口与无限物品栈

`module.util` 还包含了两个在全库广泛依赖的基础部分：兼容 JSR-305/JetBrains `@NotNull` 的 `nullness` 函数式接口包，以及突破原版 64/99 数量上限的 `UnlimitedItemStack`。

## `dev.anvilcraft.lib.v2.util.nullness` 非空约束体系

相比 Java 标准 `java.util.function.*`，AnvilLib 在 `module.util` 与 `module.registrum` 中统一使用带 `@NonnullType`（与 `NullableType`）语义标记的接口，方便在启用包级 `@ParametersAreNonnullByDefault` 的代码中避免“传入 lambda 触发未注解类型警告”：

| 接口 / 注解 | 继承标准接口 / 语义 | 说明 |
| --- | --- | --- |
| `NonNullSupplier<T>` | `Supplier<T>` | 非空供应器 |
| `NullableSupplier<T>` | `Supplier<T>` | 显式声明 `get()` 可能返回 `null` 的供应器 |
| `NonNullConsumer<T>` | `Consumer<T>` | 非空单参数消费回调 |
| `NonNullBiConsumer<T, U>` | `BiConsumer<T, U>` | 非空双参数消费回调 |
| `NonNullFunction<T, R>` | `Function<T, R>` | 非空单参数映射函数 |
| `NonNullBiFunction<T, U, R>` | `BiFunction<T, U, R>` | 非空双参数映射函数 |
| `NonNullUnaryOperator<T>` | `NonNullFunction<T, T>` | 非空一元变换算子 |
| `@NonnullType` / `@NullableType` | `ElementType.TYPE_USE` | 泛型类型参数级空性修饰注解 |

## 无限堆叠物品栈：`UnlimitedItemStack`

在 1.21 体系下，原版 `ItemStack` 的 `Codec` 对单格 `count` 做了最高 99（默认 64）上限验证，超出即序列化报错。`UnlimitedItemStack` 包装了一个 `ItemStack` 模板与独立 `int` 计数（支持任意 `int` 正整数数量，同时保留完整 `DataComponentMap` 与 `DataComponentPatch`），常用于大规模自动化机器缓冲槽、物流总线及巨型存储单元。

`UnlimitedItemStack` 直接实现了原版 `DataComponentHolder`、`MutableDataComponentHolder` 与 `IWithData<Item>` 接口，因此在绝大多数组件读写 API 上可与原生 `ItemStack` 无缝互换。

### 编解码器与常量

| 静态成员 | 类型与用途 |
| --- | --- |
| `UnlimitedItemStack.EMPTY` | 空堆叠全局单例（`count == 0`） |
| `UnlimitedItemStack.MAP_CODEC` / `CODEC` | 磁盘与数据包序列化（底层采用 `Item.CODEC` 读取 `"id"`、`DataComponentPatch.CODEC` 读写 `"components"` 与任意正整数 `"count"`） |
| `UnlimitedItemStack.STREAM_CODEC` | 强制非空网络编解码器 |
| `UnlimitedItemStack.OPTIONAL_STREAM_CODEC` | 允许空堆叠（`EMPTY`）的网络编解码器 |
| `UnlimitedItemStack.OPTIONAL_LIST_STREAM_CODEC` | `List<UnlimitedItemStack>` 批量网络编码器 |

### 核心构造方法与常用 API

| 分类 | 方法签名 | 说明 |
| --- | --- | --- |
| **构造** | `UnlimitedItemStack(ItemStack stack)` / `(ItemStack, int count)` / `(Holder<Item>, int count, DataComponentPatch)` | 从原版堆叠或 `Holder<Item>` 创建 |
| **数量操作** | `getCount()` / `count()`、`grow(int)`、`shrink(int)`、`isEmpty()` | 任意整型增减，不受 64/99 约束 |
| **拆分与转换** | `split(int amount)`、`copyAndClear()`、`copy()`、`copyWithCount(int)`、`transmuteCopy(ItemLike[, int])` | 按需拆出或变体拷贝 |
| **与原生互相转换** | `toStack()` / `toStacks()` | `toStack()` 返回原版 `ItemStack`；`toStacks()` 按该物品 `getMaxStackSize()` 自动拆分为一组符合原版上限的 `List<ItemStack>`（用于实际掉落在世界或塞回原版箱子） |
| **匹配与比较** | `matches(...)`、`isSameItem(...)`、`isSameItemSameComponents(...)`、`matchesIgnoringComponents(...)`、`listMatches(...)`、`hashItemAndComponents()` / `hashStackList(...)` | 精细比较物品与数据组件一致性 |
| **标签/组件/能力** | `is(TagKey / HolderSet / Item / Holder / ResourceKey / ItemLike / Predicate)`、`isAny(ItemLike...)`、`getData(DataMapType)`、`getTyped(...)`、`set(...)`、`update(...)`、`remove(...)`、`applyComponents(...)`、`copyFrom(...)`、`getCraftingRemainder()` / `getCraftingRemainingItem()` | 完整委托并同步维护底层模板的数据组件及合成残留物查询 |

```java
// 示例：从物流槽位扣减 300 个原木并分解成标准原版物品堆抛出世界
UnlimitedItemStack buffer = new UnlimitedItemStack(new ItemStack(Items.OAK_LOG), 300);
UnlimitedItemStack extracted = buffer.split(300);

List<ItemStack> vanillaDrops = extracted.toStacks(); // 得到 4 组 64 + 1 组 44
for (ItemStack drop : vanillaDrops) {
    Block.popResource(level, pos, drop);
}
```
