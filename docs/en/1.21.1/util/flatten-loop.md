# Flattened Multi-Dimensional Loop (`FlattenLoop`)

`dev.anvilcraft.lib.v2.util.FlattenLoop` flattens 2D-to-7D nested `for` loops into a single `Iterable` sequence for iterating Cartesian product combinations without 5–7 levels of indentation.

## Design Intent & Execution Characteristics

1. **Lazy on-demand iteration**: Other than returning `List.of()` immediately when any dimension is empty, it never pre-allocates the full Cartesian product in memory; each `next()` advances indices **outermost dimension first, innermost dimension last**.
2. **Strongly typed record tuples (`Objs2`–`Objs7`)**: Each arity returns immutable records `Objs2<T, U>` through `Objs7<T, U, V, W, X, Y, Z>`, supporting Java 21 Record pattern matching and `.t()`, `.u()`, `.v()` accessors.
3. **Dual input forms**: Every arity provides both **array (`T[]`)** and **`List<T>`** static factory overloads, unified internally via indexed access.

> [!NOTE]
> `FlattenLoop` does not clone inputs: mutating the passed array or `List` during iteration affects subsequent elements (shrinking a `List` mid-iteration risks out-of-bounds errors). Pass static or read-only sources.

## Full Example: Using in Multi-Dimensional Recipe Generation

The example below demonstrates using 3D and 4D `FlattenLoop`s to batch-register crafting variants across materials, suffixes, and tiers:

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

## Public API & Record Tuple Signatures

### Static Factory Methods (`FlattenLoop`)

| Dimensions | Array Overload Signature | List Overload Signature | Empty Dimension Behavior |
| --- | --- | --- | --- |
| 2D | `static <T, U> Iterable<Objs2<T, U>> loop(T[] arrayT, U[] arrayU)` | `static <T, U> Iterable<Objs2<T, U>> loop(List<T> listT, List<U> listU)` | Returns empty `List.of()` if any input is empty |
| 3D | `static <T, U, V> Iterable<Objs3<T, U, V>> loop(T[] arrayT, U[] arrayU, V[] arrayV)` | `static <T, U, V> Iterable<Objs3<T, U, V>> loop(List<T> listT, List<U> listU, List<V> listV)` | Same |
| 4D | `static <T, U, V, W> Iterable<Objs4<T, U, V, W>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW)` | `static <T, U, V, W> Iterable<Objs4<T, U, V, W>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW)` | Same |
| 5D | `static <T, U, V, W, X> Iterable<Objs5<T, U, V, W, X>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX)` | `static <T, U, V, W, X> Iterable<Objs5<T, U, V, W, X>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX)` | Same |
| 6D | `static <T, U, V, W, X, Y> Iterable<Objs6<T, U, V, W, X, Y>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY)` | `static <T, U, V, W, X, Y> Iterable<Objs6<T, U, V, W, X, Y>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY)` | Same |
| 7D | `static <T, U, V, W, X, Y, Z> Iterable<Objs7<T, U, V, W, X, Y, Z>> loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY, Z[] arrayZ)` | `static <T, U, V, W, X, Y, Z> Iterable<Objs7<T, U, V, W, X, Y, Z>> loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY, List<Z> listZ)` | Same |

### Nested Tuple Record Types (`FlattenLoop.Objs2`–`Objs7`)

| Record Definition | Accessor Methods |
| --- | --- |
| `public record Objs2<T, U>(T t, U u)` | `t()`, `u()` |
| `public record Objs3<T, U, V>(T t, U u, V v)` | `t()`, `u()`, `v()` |
| `public record Objs4<T, U, V, W>(T t, U u, V v, W w)` | `t()`, `u()`, `v()`, `w()` |
| `public record Objs5<T, U, V, W, X>(T t, U u, V v, W w, X x)` | `t()`, `u()`, `v()`, `w()`, `x()` |
| `public record Objs6<T, U, V, W, X, Y>(T t, U u, V v, W w, X x, Y y)` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()` |
| `public record Objs7<T, U, V, W, X, Y, Z>(T t, U u, V v, W w, X x, Y y, Z z)` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()`, `z()` |
