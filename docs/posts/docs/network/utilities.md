---
title: Network 发送工具
prev: false
next: false
---

# 工具

## 发送

<Badge type="tip" text="1.21.1" /> <Badge type="danger" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

::: warning Availability
`NetworkUtil` 在 1.21.2 至 1.21.11 版本中**不可用**。如果你使用这些版本，请直接使用 `PacketDistributor` 或自行实现等价的批量发送逻辑。
:::

`NetworkUtil` 提供服务端向玩家批量发送网络包的静态快捷方法。

### sendToAllPlayersExcluded

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

### sendToAllPlayersInDimensionExcluded

向特定维度的所有玩家发送网络包，可排除指定玩家。

```java
public static void sendToAllPlayersInDimensionExcluded(
    ServerLevel level,
    @Nullable ServerPlayer excluded,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

### sendToAllPlayersIncluded

向满足条件的所有玩家发送网络包。

```java
public static void sendToAllPlayersIncluded(
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

`included` 为 `null` 时等同于发送给全部玩家（全服广播）。

### sendToAllPlayersInDimensionIncluded

向特定维度中满足条件的玩家发送网络包。

```java
public static void sendToAllPlayersInDimensionIncluded(
    ServerLevel level,
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

### 使用示例

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

### 注意事项

- 所有方法均在服务端调用，依赖 `ServerLifecycleHooks.getCurrentServer()`
- 在专用服务端环境下保证 `ServerLifecycleHooks.getCurrentServer()` 非空
- 内部使用 `PacketDistributor.sendToPlayer()` 逐个发送

## 布尔与整数

<Badge type="tip" text="1.21.1" /> <Badge type="danger" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

::: warning Availability
`BoolAndInt` 在 1.21.2 至 1.21.11 版本中**不可用**。如果你使用这些版本，请自行实现等价的紧凑发送逻辑。
:::

`BoolAndInt` 提供更紧凑的布尔值与整数值对的发送逻辑。

### 使用示例

```java
// 编码
BoolAndInt.STREAM_CODEC.encode(buf, new BoolAndInt(this.boolValue, this.intValue));

// 解码
BoolAndInt bai = BoolAndInt.STREAM_CODEC.decode(buf);
```

### 字节数对比

与直接编码 `Boolean + VarInt` 相比，
- 若数据为正且较小，平均节省约 0.6 ~ 0.9 字节；
- 若数据为正且完全随机，平均节省约 0.8 字节；
- 若数据为负，至少节省 1 字节，小负数（绝对值 <= 32）节省 5 字节，中等负数节省 3 ~ 4 字节；
- 若数据中正负数均匀分布且绝对值较小（常见于游戏中的小偏移、delta值等），平均节省可能高达 2~3 字节。
