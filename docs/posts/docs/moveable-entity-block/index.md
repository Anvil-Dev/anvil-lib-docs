---
title: Moveable Entity Block 可推动方块实体
prev: false
next: false
---

# 可推动方块实体模块

包 `dev.anvilcraft.lib.v2.piston` 解决了原版活塞无法推动带方块实体的方块的问题。通过一组 Mixin 和接口，允许方块在移动过程中携带自定义
NBT 数据，并在活塞停止时将数据写回目标位置的方块实体。

## 文档索引

| 文档                   | 内容                                                         |
|----------------------|------------------------------------------------------------|
| [核心接口](./api)        | `IMoveableEntityBlock`、`IPistonMovingBlockEntityExtension` |
| [Mixin 与使用](./usage) | Mixin 修改点、完整使用示例                                           |

## 概述

在原版中，活塞推动带方块实体的方块时不会有任何效果。本模块通过注入活塞的移动逻辑：

1. **移动前** — 调用 `clearData` 提取方块实体数据
2. **移动中** — 数据暂存于 `PistonMovingBlockEntity`
3. **移动结束** — 调用 `setData` 将数据写回新位置的方块实体

全过程对服务端透明，无需修改原版活塞核心逻辑。

## 注意事项

- 所有数据传递在服务端进行，客户端不保留额外数据
- `clearData` 应返回需要保留的自定义数据，而非序列化整个方块实体
- `IMoveableEntityBlock` 继承 `EntityBlock`，若方块已是 `BaseEntityBlock` 子类，只需额外实现该接口
- Mixin 优先级 `priority = 943`，与其他活塞修改模组冲突时可能需要调整
