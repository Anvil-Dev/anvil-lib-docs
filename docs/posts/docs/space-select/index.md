---
title: Space Select 空间选区
prev: false
next: false
---

# 空间选区模块 <Badge type="tip" text=">=26.1" />

包 `dev.anvilcraft.lib.v2.space_select` 提供了一套**可视化空间选区系统**。通过实现 `SpaceSelectItem` 接口的物品，玩家可以在游戏世界中划定立方体区域，支持选区扩张/收缩/移动/滚轮缩放。选区状态在服务端存储、客户端渲染线框。

## 架构概览

1. **数据层** — `District` 记录选区的起点和终点
2. **服务端管理层** — `DistrictManager` 按 `DistrictKey(slot, offhand, item)` 维护选区
3. **客户端管理层** — `ClientDistrictManager`（`AnvilLibSpaceSelectClient.MANAGER`）管理选区过程状态和渲染数据
4. **物品层** — `SpaceSelectItem` 接口，实现选区逻辑（`select`/`cancel`/`onCreateDistrict`）
5. **网络层** — `SpaceSelectPayload`（`IServerboundPacket`）客户端→服务端提交选区
6. **渲染层** — `DistrictRenderer` 绘制选区线框，`SpaceSelectScrollHandler` 处理滚轮缩放
7. **事件层** — `PlayerCreateDistrictEvent` 选区创建事件

## 数据流

```
玩家右键选区工具
  → SpaceSelectItem.select(player, pos)
    → ClientDistrictManager.startSelect / endSelect
      → SpaceSelectPayload (C→S, IServerboundPacket)
        → PlayerCreateDistrictEvent
          → 业务逻辑处理选区
```

## 核心 API

### District

选区记录，由 `start`/`end` 两个 `MutableBlockPos` 定义。

```java
// 创建选区（自动归一化 start/end）
District district = District.create(pos1, pos2);

// 判断点是否在选区内
boolean inside = district.contains(x, y, z);
```

| 方法 | 说明 |
|------|------|
| `create(BlockPos, BlockPos)` | 创建选区，自动取 min/max |
| `expand(Direction, int)` | 向指定方向扩张 |
| `contraction(Direction, int)` | 向指定方向收缩 |
| `move(Direction, int)` | 向指定方向整体移动 |
| `scaleOnAxis(Axis, scrollAmount, playerPos, boundingBox, lookAngle)` | 基于玩家朝向和位置缩放 |
| `getPrimaryAxis(Vec3 lookAngle)` | 根据视角确定主轴 |
| `contains(double, double, double)` | 点包含检测 |
| `shape()` | 返回选区 VoxelShape |
| `color()` | 基于 hashCode 的随机半透明色 |

### DistrictManager

服务端选区数据存储，按 `DistrictKey` 索引。

```java
DistrictManager.DistrictKey key = new DistrictManager.DistrictKey(
    slot,    // 物品栏槽位 (-1 表示副手)
    offhand, // 是否副手
    item     // 使用的物品
);

manager.select(key, district);  // 存储选区
manager.clear(key);             // 清除选区
```

### SpaceSelectItem

物品实现的接口。默认逻辑：右键时通过 `AnvilLibSpaceSelectClient.MANAGER` 跟踪选区过程（startSelect→endSelect），选区完成时发送 `SpaceSelectPayload`。

```java
public class MySelectTool extends Item implements SpaceSelectItem {
    @Override
    public void onCreateDistrict(Player player, ItemStack stack,
                                  BlockPos start, BlockPos end) {
        // 选区创建回调
    }
}
```

### 网络包

`SpaceSelectPayload` 是 `IServerboundPacket`（客户端→服务端），携带 `offhand`、`start`、`end`。服务端收到后发送 `PlayerCreateDistrictEvent`。

## 依赖引入

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0"
}
```

## 注意事项

- `SpaceSelectPayload` 是 **服务端包**（`IServerboundPacket`），由客户端发送到服务端
- 选区按 `(slot, offhand, item)` 三元组索引，不同栏位/不同物品的选区独立
- `District.start`/`end` 为 `MutableBlockPos`，支持原地修改
- 选区颜色由 `District.hashCode()` 生成的随机值决定
- 构建依赖 `module.registrum` 和 `module.network`
- 客户端渲染通过 `DistrictRenderer` 在 `RenderLevelStageEvent.AfterTranslucentParticles` 阶段绘制
