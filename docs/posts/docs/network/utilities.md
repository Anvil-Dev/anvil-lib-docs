---
title: Network 发送工具
prev: false
next: false
---

# 发送工具

`NetworkUtil` 提供服务端向玩家批量发送网络包的静态快捷方法。

## sendToAllPlayersExcluded

向所有玩家发送网络包，可排除指定玩家。

```java
public static void sendToAllPlayersExcluded(
    @Nullable ServerPlayer excluded,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

| 参数       | 说明                 |
|----------|--------------------|
| excluded | 要排除的玩家（null 则广播全部） |
| payload  | 主网络包               |
| payloads | 附加网络包（一并发送）        |

## sendToAllPlayersInDimensionExcluded

向特定维度的所有玩家发送网络包，可排除指定玩家。

```java
public static void sendToAllPlayersInDimensionExcluded(
    ServerLevel level,
    @Nullable ServerPlayer excluded,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

## sendToAllPlayersIncluded

向满足条件的所有玩家发送网络包。

```java
public static void sendToAllPlayersIncluded(
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

`included` 为 `null` 时等同于发送给全部玩家（全服广播）。

## sendToAllPlayersInDimensionIncluded

向特定维度中满足条件的玩家发送网络包。

```java
public static void sendToAllPlayersInDimensionIncluded(
    ServerLevel level,
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

## 使用示例

```java
// 向所有玩家广播（除发送者外）
NetworkUtil.sendToAllPlayersExcluded(sender, new MyPacket(data));

// 仅向所在维度的玩家发送
NetworkUtil.sendToAllPlayersInDimensionExcluded(
    sender.serverLevel(), sender, new LevelEventPacket(eventData)
);

// 向持有特定物品的玩家发送
NetworkUtil.sendToAllPlayersIncluded(
    player -> player.getMainHandItem().is(Items.COMPASS),
    new CompassUpdatePacket(direction)
);

// 向某维度所有玩家广播
NetworkUtil.sendToAllPlayersInDimensionIncluded(
    level, null, new DimensionBroadcastPacket(info)
);
```

## 注意事项

- 所有方法均在服务端调用，依赖 `ServerLifecycleHooks.getCurrentServer()`
- 在专用服务端环境下保证 `ServerLifecycleHooks.getCurrentServer()` 非空
- 内部使用 `PacketDistributor.sendToPlayer()` 逐个发送
