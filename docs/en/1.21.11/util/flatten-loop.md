# Flattened Multi-Dimensional Loop (`FlattenLoop`)

When processing 3D block matrices, multi-layer recipe grids, or Cartesian product test data, nested `for (var a : listA) for (var b : listB) ...` loops indent deeply, cannot be consumed in a single enhanced `for` or `Stream`, and require restructuring whenever dimensions change. `FlattenLoop` lazily flattens 2D–7D arrays or `List` combinations into a lightweight `Iterable` yielding Java `record` tuples.

## Core API Signatures

`FlattenLoop` provides static `loop(...)` overloads for **2D to 7D** taking either raw arrays `T[]` or `List<T>` (no upfront Cartesian product allocation; steps indices lazily via an inner iterator):

| Dimensions | `loop(...)` Parameter Types | Output Record Type | Record Accessors |
| --- | --- | --- | --- |
| 2D | `(T[], U[])` or `(List<T>, List<U>)` | `Objs2<T, U>` | `t()`, `u()` |
| 3D | `(T[], U[], V[])` or `(List<T>, List<U>, List<V>)` | `Objs3<T, U, V>` | `t()`, `u()`, `v()` |
| 4D | `(T[], U[], V[], W[])` or `(List<T>, List<U>, List<V>, List<W>)` | `Objs4<T, U, V, W>` | `t()`, `u()`, `v()`, `w()` |
| 5D | 5 arrays or 5 lists | `Objs5<T, U, V, W, X>` | `t()`, `u()`, `v()`, `w()`, `x()` |
| 6D | 6 arrays or 6 lists | `Objs6<T, U, V, W, X, Y>` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()` |
| 7D | 7 arrays or 7 lists | `Objs7<T, U, V, W, X, Y, Z>` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()`, `z()` |

> [!NOTE]
> When any input dimension is an empty array or empty list, `FlattenLoop.loop(...)`'s iterator returns `false` immediately on the first `hasNext()` call, exiting cleanly with zero iterations and no out-of-bounds errors.

## Usage Example

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.util.FlattenLoop;
import net.minecraft.core.Direction;
import net.minecraft.world.item.DyeColor;

import java.util.List;

public class MatrixRecipeRegistrations {
    public void generateVariants() {
        List<DyeColor> colors = List.of(DyeColor.RED, DyeColor.BLUE, DyeColor.YELLOW);
        Direction[] faces = new Direction[] { Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST };
        Integer[] tiers = new Integer[] { 1, 2, 3 };

        // Iterate Color × Facing × Tier combinations simultaneously (without 3 levels of indentation)
        for (FlattenLoop.Objs3<DyeColor, Direction, Integer> combo :
            FlattenLoop.loop(colors, List.of(faces), List.of(tiers))) {
            DyeColor color = combo.t();
            Direction dir = combo.u();
            int tier = combo.v();
            registerVariant(color, dir, tier);
        }
    }

    private void registerVariant(DyeColor color, Direction dir, int tier) {
        // Run variant recipe or block registration logic
    }
}
```
