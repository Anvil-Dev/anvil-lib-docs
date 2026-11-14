# 扁平化多维循环 (`FlattenLoop`)

在处理三维方块矩阵、多层配方网格或笛卡尔积测试数据时，传统多层 `for (var a : listA) for (var b : listB) ...` 不仅缩进深、难以在单条增强 `for` 循环或 `Stream` 中消费，而且每次修改维数都需要改动嵌套结构。`FlattenLoop` 将 2 维至 7 维的数组或 `List` 组合懒加载扁平化为一个轻量级 `Iterable`，配合 Java `record` 元组一次性解构遍历全部组合。

## 核心 API 签名一览

`FlattenLoop` 为 **2 维到 7 维** 分别提供面向原始数组 `T[]` 与 `List<T>` 的双版本静态 `loop(...)` 方法（无预先笛卡尔积内存分配，使用内部匿名迭代器按需步进推进索引）：

| 维度 | `loop(...)` 参数类型 | 返回元素 Record 类型 | Record 字段访问器 |
| --- | --- | --- | --- |
| 2 维 | `(T[], U[])` 或 `(List<T>, List<U>)` | `Objs2<T, U>` | `t()`, `u()` |
| 3 维 | `(T[], U[], V[])` 或 `(List<T>, List<U>, List<V>)` | `Objs3<T, U, V>` | `t()`, `u()`, `v()` |
| 4 维 | `(T[], U[], V[], W[])` 或 `(List<T>, List<U>, List<V>, List<W>)` | `Objs4<T, U, V, W>` | `t()`, `u()`, `v()`, `w()` |
| 5 维 | 5 组数组或 5 个列表 | `Objs5<T, U, V, W, X>` | `t()`, `u()`, `v()`, `w()`, `x()` |
| 6 维 | 6 组数组或 6 个列表 | `Objs6<T, U, V, W, X, Y>` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()` |
| 7 维 | 7 组数组或 7 个列表 | `Objs7<T, U, V, W, X, Y, Z>` | `t()`, `u()`, `v()`, `w()`, `x()`, `y()`, `z()` |

> [!NOTE]
> 当任意传入维度为空数组或空列表时，`FlattenLoop.loop(...)` 的迭代器在第一次调用 `hasNext()` 时立即返回 `false`，安全零遍历退出，不会抛出越界异常。

## 使用示例

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

        // 同时迭代 颜色 × 朝向 × 等级 组合（无需 3 层缩进，且支持 Java Record Pattern 解构）
        for (FlattenLoop.Objs3<DyeColor, Direction, Integer> combo :
            FlattenLoop.loop(colors, List.of(faces), List.of(tiers))) {
            DyeColor color = combo.t();
            Direction dir = combo.u();
            int tier = combo.v();
            registerVariant(color, dir, tier);
        }
    }

    private void registerVariant(DyeColor color, Direction dir, int tier) {
        // 注册逻辑
    }
}
```
