# 扁平化多维循环 (`FlattenLoop`)

<BranchContextCard branch="26.2" />

在批量注册多维正交变体（例如在 `FlexibleSprites` 中遍历 `SpriteTheme × SpriteStyle × SpriteType × SpriteVariant` 四维枚举，或遍历多个方块属性组合）时，多层嵌套 `for` 循环会导致代码缩进过深，且在内层 `break` / `continue` 外层时还得引入标签（label）。

`dev.anvilcraft.lib.v2.util.FlattenLoop` 提供了一套基于 Guava `AbstractIterator` 惰性求值的 **2 维至 7 维笛卡尔积扁平化迭代器工厂**：
- 按传入维度的顺序展开（第 1 个参数对应最外层循环，最后一个参数对应最内层循环）；
- 惰性按需生成组合记录 `Objs2<T, U>` .. `Objs7<T, U, V, W, X, Y, Z>`，无需预先在内存中分配全量笛卡尔积列表；
- 任意一维为空数组或空列表时，安全返回空可迭代对象 `List.of()`，不产出任何元素。

---

## 一、 完整代码示例：用单层 `for` 循环遍历四维枚举组合

```java
package com.example.mymod.util;

import dev.anvilcraft.lib.v2.ui.flexible.SpriteStyle;
import dev.anvilcraft.lib.v2.ui.flexible.SpriteTheme;
import dev.anvilcraft.lib.v2.ui.flexible.SpriteType;
import dev.anvilcraft.lib.v2.ui.flexible.SpriteVariant;
import dev.anvilcraft.lib.v2.util.FlattenLoop;

public final class FlattenLoopExample {
    public static void enumerateAllSpriteCombinations() {
        // 将 4 层嵌套 for 循环扁平化为单层增强 for 循环
        for (FlattenLoop.Objs4<SpriteTheme, SpriteStyle, SpriteType, SpriteVariant> comb : FlattenLoop.loop(
            SpriteTheme.values(),
            SpriteStyle.values(),
            SpriteType.values(),
            SpriteVariant.values()
        )) {
            SpriteTheme theme = comb.t();     // 第 1 维（最外层）
            SpriteStyle style = comb.u();     // 第 2 维
            SpriteType type = comb.v();       // 第 3 维
            SpriteVariant variant = comb.w(); // 第 4 维（最内层）

            String key = theme.name() + "/" + style.name() + "/" + type.name() + "/" + variant.name();
        }
    }
}
```

---

## 二、 `FlattenLoop` 全套方法与返回记录一览

每种维度数量均提供**全数组重载（`T[]...`）**和**全列表重载（`List<T>...`）**：

| 维度数 | 方法签名（数组重载 / 列表重载） | 产出的元素记录类型与字段访问器 |
| :---: | :--- | :--- |
| **2 维** | • `loop(T[] arrayT, U[] arrayU)`<br>• `loop(List<T> listT, List<U> listU)` | `FlattenLoop.Objs2<T, U>(T t, U u)` |
| **3 维** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV)` | `FlattenLoop.Objs3<T, U, V>(T t, U u, V v)` |
| **4 维** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW)` | `FlattenLoop.Objs4<T, U, V, W>(T t, U u, V v, W w)` |
| **5 维** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX)` | `FlattenLoop.Objs5<T, U, V, W, X>(T t, U u, V v, W w, X x)` |
| **6 维** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY)` | `FlattenLoop.Objs6<T, U, V, W, X, Y>(T t, U u, V v, W w, X x, Y y)` |
| **7 维** | • `loop(T[] arrayT, U[] arrayU, V[] arrayV, W[] arrayW, X[] arrayX, Y[] arrayY, Z[] arrayZ)`<br>• `loop(List<T> listT, List<U> listU, List<V> listV, List<W> listW, List<X> listX, List<Y> listY, List<Z> listZ)` | `FlattenLoop.Objs7<T, U, V, W, X, Y, Z>(T t, U u, V v, W w, X x, Y y, Z z)` |
