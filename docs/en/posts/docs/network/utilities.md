---
title: Network Sending Utilities
prev: false
next: false
---

# Utilities

## Sending Utilities

<Badge type="tip" text="1.21.1" /> <Badge type="danger" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

::: warning Availability
`NetworkUtil` is **not available** in versions 1.21.2 through 1.21.11. If you are using these versions, use `PacketDistributor` directly or implement equivalent batch-sending logic yourself.
:::

`NetworkUtil` provides static convenience methods for sending network packets from the server to multiple players.

### sendToAllPlayersExcluded

Sends a network packet to all players, with the option to exclude a specific player.

```java
public static void sendToAllPlayersExcluded(
    @Nullable ServerPlayer excluded,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

| Parameter | Description                                       |
|-----------|---------------------------------------------------|
| excluded  | Player to exclude (null means broadcast to all)   |
| payload   | Primary packet                                    |
| payloads  | Additional packets (sent together)                |

### sendToAllPlayersInDimensionExcluded

Sends a network packet to all players in a specific dimension, with the option to exclude a specific player.

```java
public static void sendToAllPlayersInDimensionExcluded(
    ServerLevel level,
    @Nullable ServerPlayer excluded,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

### sendToAllPlayersIncluded

Sends a network packet to all players matching a condition.

```java
public static void sendToAllPlayersIncluded(
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

When `included` is `null`, it is equivalent to sending to all players (server-wide broadcast).

### sendToAllPlayersInDimensionIncluded

Sends a network packet to players in a specific dimension who match a condition.

```java
public static void sendToAllPlayersInDimensionIncluded(
    ServerLevel level,
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

### Usage Examples

```java
// Broadcast to all players (except the sender)
NetworkUtil.sendToAllPlayersExcluded(sender, new MyPacket(data));

// Send only to players in the same dimension
NetworkUtil.sendToAllPlayersInDimensionExcluded(
    sender.serverLevel(), sender, new LevelEventPacket(eventData)
);

// Send to players holding a specific item
NetworkUtil.sendToAllPlayersIncluded(
    player -> player.getMainHandItem().is(Items.COMPASS),
    new CompassUpdatePacket(direction)
);

// Broadcast to all players in a dimension
NetworkUtil.sendToAllPlayersInDimensionIncluded(
    level, null, new DimensionBroadcastPacket(info)
);
```

### Notes

- All methods are called on the server side and depend on `ServerLifecycleHooks.getCurrentServer()`
- On a dedicated server environment, `ServerLifecycleHooks.getCurrentServer()` is guaranteed to be non-null
- Internally uses `PacketDistributor.sendToPlayer()` to send to each player individually

## BoolAndInt

<Badge type="tip" text="1.21.1" /> <Badge type="danger" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

::: warning Availability
`BoolAndInt` is **not available** in versions 1.21.2 through 1.21.11. If you are using these versions, implement equivalent compact-sending logic yourself.
:::

`BoolAndInt` provides more compact sending logic to send a pair of boolean and integer.

### Usage Examples

```java
// Encoding
BoolAndInt.STREAM_CODEC.encode(buf, new BoolAndInt(this.boolValue, this.intValue));

// Decoding
BoolAndInt bai = BoolAndInt.STREAM_CODEC.decode(buf);
```

### Comparison

Compared to directly encoding `Boolean + VarInt`,
-If the data is positive and small, it saves an average of about 0.6 to 0.9 bytes;
-If the data is positive and completely random, it saves an average of about 0.8 bytes;
-If the data is negative, at least 1 byte is saved, small negative numbers (absolute value<=32) save 5 bytes, and medium negative numbers save 3-4 bytes;
-If the positive and negative numbers in the data are evenly distributed and have small absolute values (commonly seen in small offsets, delta values, etc. in games), the average savings may be as high as 2-3 bytes.
