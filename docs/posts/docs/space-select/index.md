---
title: Space Select 空间选区
prev: false
next: false
---

# 空间选区模块 <Badge type="tip" text=">=26.1" />

包 `dev.anvilcraft.lib.v2.space_select` 提供了一套**可视化空间选区系统**，通过手持选区工具在游戏世界中划定立方体区域，支持选区扩张/收缩/移动/滚轮缩放，并通过网络同步到客户端渲染。

## 架构概览

1. **数据层** — `District` 记录选区的起点和终点
2. **管理层** — `DistrictManager` 服务端维护所有玩家的选区状态
3. **物品层** — `SpaceSelectItem` 选区工具物品
4. **客户端层** — `DistrictRenderer` 客户端渲染选区轮廓，`SpaceSelectScrollHandler` 滚轮缩放
5. **网络层** — `SpaceSelectPayload` 同步选区数据到客户端
6. **事件层** — `PlayerCreateDistrictEvent` 选区创建事件

## 快速开始

```java
// 获取玩家的 DistrictManager
DistrictManager manager = DistrictManager.of(player);

// 设置选区
District district = District.create(startPos, endPos);
manager.setDistrict(player, district);

// 获取当前选区
District current = manager.getDistrict(level, player);
```

## 核心 API

| 类 | 说明 |
|----|------|
| `District` | 选区记录，支持 `expand`/`contraction`/`move`/`scaleOnAxis`/`contains` |
| `DistrictManager` | 服务端选区管理，`setDistrict`/`getDistrict`/`clearDistrict` |
| `SpaceSelectItem` | 选区工具，右键设置选区点 |
| `DistrictRenderer` | 客户端选区线框渲染 |
| `SpaceSelectScrollHandler` | 滚动缩放选区（基于玩家朝向选择缩放轴） |
| `PlayerCreateDistrictEvent` | 选区创建事件 |
| `SpaceSelectPayload` | `IClientboundPacket` 同步选区 |

## 依赖引入

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0"
}
```

## 注意事项

- 选区数据仅保存在服务端，客户端通过 `SpaceSelectPayload` 同步
- `District` 的 `start`/`end` 为 `MutableBlockPos`，支持原地修改
- 选区颜色由 `District.hashCode()` 生成的随机值决定
- 构建依赖 `module.registrum` 和 `module.network`
