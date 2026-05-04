# 集合操 Util 与 列表 Util

## CollectionUtil

位于 `dev.anvilcraft.lib.v2.util.CollectionUtil`，提供集合操作：

- `allMatch(Collection<T>, Predicate<T>)` – 全匹配
- `anyMatch(Collection<T>, Predicate<T>)` – 任一匹配
- `newMultimap(M, Collection<V>, Function<V,K>)` – 创建 Guava Multimap
- `newLinkedList(int)` – 创建 `LinkedList`（忽略参数，仅方便调用）
- `get(SequencedCollection<T>, int)` – 安全按索引获取，返回 `null` 如果越界

## ListUtil

位于 `dev.anvilcraft.lib.v2.util.ListUtil`：

- `safelyGet(List<T>, int)` – 返回 `Optional<T>`，处理空列表或越界
- `cycle(List<T>, int)` – 循环移位元素，返回新列表
- `createWithValues(int, IntFunction<T>)` – 构建指定大小的列表
- `cast(List<T>, Class<R>)` – 过滤并转换为子类型列表
- `equals(List<T>, List<U>, BiPredicate<T,U>)` – 使用自定义比较器比较两列表
