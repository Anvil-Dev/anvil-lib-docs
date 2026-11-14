# 扁平化多维循环 (FlattenLoop)

`dev.anvilcraft.lib.v2.util.FlattenLoop` 将 2 维至 7 维的嵌套 `for` 循环扁平化为单一 `Iterable` 序列，用于在不写出 5~7 层深层嵌套代码的前提下遍历笛卡尔积组合。

## 设计意图与执行特性

1. **按需惰性迭代（Lazy Iterator）**：除任意维度为空时直接返回 `List.of()` 外，不会预先在内存中分配整个笛卡尔积集合，每次 `next()` 按**外层维度先行、内层维度最末递增**的顺序逐一推进下标。
2. **强类型记录元组（`Objs2` ~ `Objs7`）**：每个维度数量分别返回不可变 Record `Objs2<T, U>` 直至 `Objs7<T, U, V, W, X, Y, Z>`，支持 Java 21 Record 模式匹配与直观的 `.t()`、`.u()`、`.v()` 访问器。
3. **双形态输入支持**：每个维度数同时提供 **数组 (`T[]`)** 与 **`List<T>`** 两种静态工厂重载，内部全部封装为索引访问以保持统一的顺序语义。

> [!NOTE]
> `FlattenLoop` 不做参数克隆：如果在迭代期间外部修改了传入的数组或 `List` 内容，后续迭代将直接反映该修改（若在内部删除 `List` 元素导致长度缩小，会触发越界风险）。建议仅传入静态/只读组合源。

## 完整示例：在多维度组合配方生成中使用

以下示例展示了利用 3 维与 4 维 `FlattenLoop` 为不同材质、后缀与等级批量注册合成变体的典型做法：

```java
package com.example.mymod.recipe;

import dev.anvilcraft.lib.v2.util.FlattenLoop;

import java.util.ArrayList;
import java.util.List;

public final class MatrixRecipeBuilder {
    public record GearSpec(String wood, String metal, String tier, boolean enchanted) {}

    public static List<GearSpec> buildAllCombinations() {
        List<String> woods = List.of("oak", "spruce", "dark_oak");
        List<String> metals = List.of("iron", "gold", "diamond");
        List<String> tiers = List.of("basic", "advanced");
        List<Boolean> enchantedStates = List.of(false, true);

        List<GearSpec> result = new ArrayList<>();
        for (FlattenLoop.Objs4<String, String, String, Boolean> entry :
            FlattenLoop.loop(woods, metals, tiers, enchantedStates)) {
            if ("gold".equals(entry.u()) && "basic".equals(entry.v()) && entry.w()) {
                continue;
            }
            result.add(new GearSpec(entry.t(), entry.u(), entry.v(), entry.w()));
        }
        return result;
    }

    public static List<String> buildPairLabels(String[] prefixes, Integer[] levels) {
        List<String> labels = new ArrayList<>();
        for (FlattenLoop.Objs2<String, Integer> pair : FlattenLoop.loop(prefixes, levels)) {
            labels.add(pair.t() + "_lv" + pair.u());
        }
        return labels;
    }
}
```

## 公开 API 与 Record 元组签名全表

### 静态工厂方法（`FlattenLoop`）

| 维度 | 数组重载签名 | 列表重载签名 | 空维度行为 |
| --- | --- | --- | --- |
| 2 维 | `static <T, U> Iterable<Objs2<T, U>> loop(T[] arrayT, U[] arrayU)` | `static <T, U> Iterable<Objs2<T, U>> loop(List<T> listT, List<U> listU)` | 任一输入为空时返回空 `List.of()` |
| 3 维 | `static <T, U, V> Iterable<Objs3<T, U, V>> loop(T[] arrayT, U[] arrayU, V[] arrayV)` | `static <T, U, V> Iterable<Objs3<T, U, V>> loop(List<T> listT, List<U> listU, List<V> listV)` | 同上 |
| 4 维 | `static <T, U, V, W> Iterable<Objs4<T, U, V, W>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW)` | `static <T, U, V, W> Iterable<Objs4<T, U, V, W>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW)` | 同上 |
| 5 维 | `static <T, U, V, W, X> Iterable<Objs5<T, U, V, W, X>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX)` | `static <T, U, V, W, X> Iterable<Objs5<T, U, V, W, X>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX)` | 同上 |
| 6 维 | `static <T, U, V, W, X, Y> Iterable<Objs6<T, U, V, W, X, Y>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY)` | `static <T, U, V, W, X, Y> Iterable<Objs6<T, U, V, W, X, Y>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY)` | 同上 |
| 7 维 | `static <T, U, V, W, X, Y, Z> Iterable<Objs7<T, U, V, W, X, Y, Z>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY, Z[] arrayZ)` | `static <T, U, V, W, X, Y, Z> Iterable<Objs7<T, U, V, W, X, Y, Z>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY, List<Z> listZ)` | 同上 |

### 内嵌元组 Record 类型（`FlattenLoop.Objs2` ~ `Objs7`）

| Record 定义 | 访问器方法 |
| --- | --- |
| `public record Objs2<T, U>(T t, U u)` | `t()`, `u()` |
| `public record Objs3<T, U, V>(T t, U u, V v)` | `t()`, `u()`, `v()` |
| `public record Objs4<T, U, V, W>(T t, U u, V v, W w)` | `t()`, `u()`, `v()`, `w()` |
| `public record Objs5<T, U, V, W, X>(T t, U u, V v, W w, X x)` | `t()`, `u()`, `v()`, `w()`, `x()` |
| `public record Objs6<T, U, V, W, X, Y>(T t, U u, V v, W w, X x, Y y)` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()` |
| `public record Objs7<T, U, V, W, X, Y, Z>(T t, U u, V v, W w, X x, Y y, Z z)` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()`, `z()` |
