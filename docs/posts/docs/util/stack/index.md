# 无限数量的物品栈

`dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack` 是支持无限数量的物品栈实现（数量可超过 64），适用于配方成本、大型物品容器等。

**构造方式**：

- `new UnlimitedItemStack(ItemStack, int count)` – 从原版 ItemStack 复制物品与组件，仅保留一个数量的栈，count 单独存储
- 提供 `CODEC`, `MAP_CODEC`, `STREAM_CODEC` 用于序列化
- `serializeNBT` / `deserializeNBT` – NBT 读写
- `parse(HolderLookup.Provider, Tag)` – 解析为 Optional

**常用方法**：

- `isEmpty()`, `copy()`, `copyWithCount(int)`
- `grow(int)` – 增加数量
- `splitUnlimited(int)` – 切分并返回新 UnlimitedItemStack（不影响原版最大堆叠数）
- `split(int)` – 返回原版 ItemStack（不超过最大堆叠数），剩余数量减少
- `toStack()` – 生成一个可能数量 > 64 的 ItemStack（不推荐直接使用）
- `toStacks()` – 按原版最大堆叠数分包为 `List<ItemStack>`
- `is(Item)`, `is(TagKey<Item>)`, `isAny(ItemLike...)` – 物品匹配
- `isSameItemSameComponents(ItemStack/UnlimitedItemStack)` – 忽略数量比较
- `listMatches`, `hashStackList` – 列表比较与哈希

**注意**：`hashCode()` 和 `equals()` 基于物品、数量、组件；实现 `split` 时数量不得超过 64。
