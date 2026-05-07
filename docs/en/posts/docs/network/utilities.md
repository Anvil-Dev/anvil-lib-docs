---
title: Network Sending Utilities
prev: false
next: false
---

# Sending Utilities

<Badge type="tip" text="1.21.1" /> <Badge type="danger" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

> **Availability Warning**: `NetworkUtil` is **not available** in versions 1.21.2 through 1.21.11. If you are using these versions, use `PacketDistributor` directly or implement equivalent batch-sending logic yourself.

`NetworkUtil` provides static convenience methods for sending network packets from the server to multiple players.

## sendToAllPlayersExcluded

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

## sendToAllPlayersInDimensionExcluded

Sends a network packet to all players in a specific dimension, with the option to exclude a specific player.

```java
public static void sendToAllPlayersInDimensionExcluded(
    ServerLevel level,
    @Nullable ServerPlayer excluded,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

## sendToAllPlayersIncluded

Sends a network packet to all players matching a condition.

```java
public static void sendToAllPlayersIncluded(
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

When `included` is `null`, it is equivalent to sending to all players (server-wide broadcast).

## sendToAllPlayersInDimensionIncluded

Sends a network packet to players in a specific dimension who match a condition.

```java
public static void sendToAllPlayersInDimensionIncluded(
    ServerLevel level,
    @Nullable Predicate<ServerPlayer> included,
    CustomPacketPayload payload,
    CustomPacketPayload... payloads
)
```

## Usage Examples

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

## Notes

- All methods are called on the server side and depend on `ServerLifecycleHooks.getCurrentServer()`
- On a dedicated server environment, `ServerLifecycleHooks.getCurrentServer()` is guaranteed to be non-null
- Internally uses `PacketDistributor.sendToPlayer()` to send to each player individually
