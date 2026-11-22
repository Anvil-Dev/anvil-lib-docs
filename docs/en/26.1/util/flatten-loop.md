# Flattened Multi-Dimensional Loop (`FlattenLoop`)

<BranchContextCard branch="26.1" />

When batch-registering multi-dimensional orthogonal variants (e.g., iterating `SpriteTheme × SpriteStyle × SpriteType × SpriteVariant` in `FlexibleSprites`, or iterating block property combinations), deeply nested `for` loops cause excessive indentation and require loop labels for inner `break` / `continue`.

`dev.anvilcraft.lib.v2.util.FlattenLoop` provides a **2D-to-7D Cartesian product flattened iterator factory** backed by Guava's lazy `AbstractIterator`:
- Expands in dimension argument order (1st argument is the outermost loop, last is the innermost loop);
- Lazily produces combination records `Objs2<T, U>` .. `Objs7<T, U, V, W, X, Y, Z>` on demand without allocating the full Cartesian product list in memory;
- If any dimension is an empty array or list, safely returns an empty iterable `List.of()` yielding no elements.

---

## 1. Full Code Example: Iterating 4D Enum Combinations with a Single `for` Loop

```java
package com.example.mymod.util;

import dev.anvilcraft.lib.v2.ui.flexible.SpriteStyle;
import dev.anvilcraft.lib.v2.ui.flexible.SpriteTheme;
import dev.anvilcraft.lib.v2.ui.flexible.SpriteType;
import dev.anvilcraft.lib.v2.ui.flexible.SpriteVariant;
import dev.anvilcraft.lib.v2.util.FlattenLoop;

public final class FlattenLoopExample {
    public static void enumerateAllSpriteCombinations() {
        // Flatten 4 nested for loops into a single enhanced for loop
        for (FlattenLoop.Objs4<SpriteTheme, SpriteStyle, SpriteType, SpriteVariant> comb : FlattenLoop.loop(
            SpriteTheme.values(),
            SpriteStyle.values(),
            SpriteType.values(),
            SpriteVariant.values()
        )) {
            SpriteTheme theme = comb.t();     // 1st dimension (outermost)
            SpriteStyle style = comb.u();     // 2nd dimension
            SpriteType type = comb.v();       // 3rd dimension
            SpriteVariant variant = comb.w(); // 4th dimension (innermost)

            String key = theme.name() + "/" + style.name() + "/" + type.name() + "/" + variant.name();
        }
    }
}
```

---

## 2. `FlattenLoop` Methods & Output Records

Every arity provides both **all-array overloads (`T[]...`)** and **all-list overloads (`List<T>...`)**:

| Dimensions | Method Signatures (Array / List Overloads) | Output Record Type & Accessors |
| :---: | :--- | :--- |
| **2D** | • `loop(T[] arrayT, U[] arrayU)`<br>• `loop(List<T> listT, List<U> listU)` | `FlattenLoop.Objs2<T, U>(T t, U u)` |
| **3D** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV)` | `FlattenLoop.Objs3<T, U, V>(T t, U u, V v)` |
| **4D** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW)` | `FlattenLoop.Objs4<T, U, V, W>(T t, U u, V v, W w)` |
| **5D** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX)` | `FlattenLoop.Objs5<T, U, V, W, X>(T t, U u, V v, W w, X x)` |
| **6D** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY)` | `FlattenLoop.Objs6<T, U, V, W, X, Y>(T t, U u, V v, W w, X x, Y y)` |
| **7D** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY, Z[] arrayZ)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY, List<Z> listZ)` | `FlattenLoop.Objs7<T, U, V, W, X, Y, Z>(T t, U u, V v, W w, X x, Y y, Z z)` |
