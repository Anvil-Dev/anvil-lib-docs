# 区域模型 (`District`)、选择器物品与管理器

`module.space-select` 为游戏内的三维立方体选区交互提供完整基础设施，涵盖选区数据结构 (`District`)、手持物品标识接口 (`SpaceSelectItem`) 与多槽位隔离管理器 (`DistrictManager`)。

## 模块信息

- 模组 ID：`anvillib_space_select`（`AnvilLibSpaceSelect.MOD_ID`）
- 资源命名空间：`AnvilLibSpaceSelect.MOD_ID`

## 核心组件概览

| 类型 / 成员 | 职责 |
| --- | --- |
| `SpaceSelectItem` | 空标记接口，使物品成为合法的空间选择器；服务端同步校验和客户端滚轮微调都会检查主/副手物品是否实现此接口 |
| `District` | 不可变外框对象，持有可变的起始角落 `BlockPos`、颜色等元数据，封装了缩放、扩张、平移及 `VoxelShape` 构造算法 |
| `DistrictManager` | 将多个选区按 `(slot, offhand, item)` 槽位键值映射（`DistrictKey`），支持同一名玩家快捷栏中存放多个互不干扰的选区工具 |
| `PlayerCreateDistrictEvent` | 当选区从客户端提交并经网络到达服务端验证后派发的 NeoForge 玩家事件 |

## `District` 选区数据与空间变换 API

`District` 是支持三维调整的坐标包围框记录类：

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `District.create(BlockPos start, BlockPos end)` | `District` | 给定任意两个对角顶点坐标初始化新选区 |
| `expand(Direction direction, int size)` | `void` | 向指定方向外扩或收缩对应边界面 |
| `contraction(Direction direction, int size)` | `void` | 从指定方向向内部收缩指定格数 |
| `move(Direction direction, int step)` | `void` | 保持包围盒尺寸不变，整体沿方向平移 `step` 格 |
| `contains(double x, double y, double z)` | `boolean` | 判断世界浮点坐标是否落在该离散方块区域内 |
| `District.getPrimaryAxis(Vec3 lookAngle)` | `Direction.Axis` | 提取视线矢量中绝对值最大的主坐标轴（用于滚轮单轴调整） |
| `scaleOnAxis(Direction.Axis axis, int scrollAmount, Vec3 playerPos, AABB boundingBox, Vec3 lookAngle)` | `void` | 根据玩家与选区包围盒的空间位置以及滚轮方向，智能决定对正方向边界还是负方向边界推拉缩放 |
| `shape()` | `VoxelShape` | 将当前整数包围盒转化为 `Shapes.box(...)` 以便用于渲染线框或碰撞校验 |
| `color()` | `int` | 返回该选区渲染时使用的 ARGB 颜色值 |

## `DistrictManager` 与 `DistrictKey`

为防止不同道具栏格子里的多支“区域选定棒”互相覆盖选区，`DistrictManager` 通过 `DistrictKey(int slot, boolean offhand, Item item)` 隔离状态：

| 方法 | 说明 |
| --- | --- |
| `select(DistrictKey key, District district)` | 写入或更新对应槽位物品绑定的选区 |
| `clear(DistrictKey key)` | 移除指定槽位绑定的选区 |
| `DistrictKey#check(@Nullable Player player)` | 校验玩家对应槽位当前仍手持同一款实现 `SpaceSelectItem` 的物品 |

## 完整示例：实现一个自定义区域选择工具

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.space_select.SpaceSelectItem;
import dev.anvilcraft.lib.v2.space_select.client.AnvilLibSpaceSelectClient;
import dev.anvilcraft.lib.v2.space_select.client.ClientDistrictManager;
import dev.anvilcraft.lib.v2.space_select.DistrictManager;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

public class RegionWandItem extends Item implements SpaceSelectItem {
    public RegionWandItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Level level = context.getLevel();
        Player player = context.getPlayer();
        if (player == null) return InteractionResult.PASS;

        if (level.isClientSide()) {
            boolean offhand = context.getHand() == InteractionHand.OFF_HAND;
            int slot = player.getInventory().selected;
            DistrictManager.DistrictKey key = new DistrictManager.DistrictKey(slot, offhand, this);

            ClientDistrictManager manager = AnvilLibSpaceSelectClient.MANAGER;
            BlockPos clicked = context.getClickedPos();
            if (!manager.isSelecting(key)) {
                manager.startSelect(key, clicked);
            } else {
                // 结束选区并自动派发 SpaceSelectPayload 至服务端
                manager.endSelect(key, clicked);
            }
        }
        return InteractionResult.SUCCESS;
    }
}
```
