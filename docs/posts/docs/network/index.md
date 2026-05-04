---
title: Network 网络
prev: false
next: false
---

# 网络包模块 (Network Module)

包 `dev.anvilcraft.lib.v2.network` 提供了基于 NeoForge 网络系统的高层抽象，用于简化网络包的定义、方向管理及自动注册。

## 1. 概述

网络模块通过密封接口 `IPacket` 建立了一套类型安全的网络包体系，将包分为 **客户端包**、**服务端包** 和 **双端包**，并结合
`@Network` 注解与 `NetworkRegistrar` 实现自动扫描注册，大幅减少样板代码。

**核心流程**：

1. 在合适的包下定义网络包类，实现对应接口（如 `IClientboundPacket`），并声明 `static final CustomPacketPayload.Type<?>` 和
   `StreamCodec` 字段。
2. 在该包的 `package-info.java` 上添加 `@Network` 注解，指定协议阶段（默认 `PLAY`）。
3. 在 `RegisterPayloadHandlersEvent` 中调用 `NetworkRegistrar.register(registrar, modId)`，自动完成所有包的注册。

## 2. 包方向接口

模块定义了一个密封体系，所有网络包都必须实现 `IPacket`，并只能通过以下子接口扩展：

| 接口                     | 说明                                                 |
|------------------------|----------------------------------------------------|
| `IPacket`              | 根接口，扩展自 `CustomPacketPayload`，提供 `Type` 工厂方法       |
| `IClientboundPacket`   | 服务端 → 客户端包，必须实现 `handleOnClient(Player)`           |
| `IServerboundPacket`   | 客户端 → 服务端包，必须实现 `handleOnServer(Player)`           |
| `IInsensitiveBiPacket` | 双端通用包，不区分方向，实现 `handleOnBothSide(Player)`          |
| `ISensitiveBiPacket`   | 双端方向感知包，仍需分别实现 `handleOnClient` 和 `handleOnServer` |

### 2.1 客户端包示例

```java
public class MyClientPacket implements IClientboundPacket {
    public static final Type<MyClientPacket> TYPE = IPacket.type(ResourceLocation.fromNamespaceAndPath("modid", "my_packet"));
    public static final StreamCodec<RegistryFriendlyByteBuf, MyClientPacket> STREAM_CODEC = StreamCodec.composite(...);

    @Override
    public void handleOnClient(Player player) {
        // 处理在客户端
    }
}
```

### 2.2 服务端包示例

与客户端包类似，只需实现 `IServerboundPacket` 和 `handleOnServer`。

### 2.3 双端包

如果两端逻辑完全一致，可以使用 `IInsensitiveBiPacket`：

```java
public class SyncPacket implements IInsensitiveBiPacket {
    // ... TYPE, STREAM_CODEC ...

    @Override
    public void handleOnBothSide(Player player) {
        // 客户端或服务端执行相同逻辑
    }
}
```

如果两端逻辑不同，使用 `ISensitiveBiPacket`，仍需分别实现 `handleOnClient` 和 `handleOnServer`。

## 3. 注解与自动注册

### `@Network`

标记在包上（`package-info.java`），声明该包下的网络包协议阶段。

```java
@Network(protocol = PacketProtocol.PLAY)
package com.example.mod.network;
```

- **protocol**：枚举 `PacketProtocol`，可选 `CONFIGURATION`、`PLAY` 或 `COMMON`，默认 `PLAY`。

### `NetworkRegistrar`

提供静态方法 `register(PayloadRegistrar, String modId)`，在 `RegisterPayloadHandlersEvent` 中调用：

```java
@SubscribeEvent
public static void register(final RegisterPayloadHandlersEvent event) {
    NetworkRegistrar.register(event.registrar("modid"), "modid");
}
```

该方法会：

1. 扫描模组文件中所有被 `@Network` 注解的包。
2. 在每个包下查找实现了 `IPacket` 的类。
3. 通过反射获取类的 `Type` 和 `StreamCodec` 静态字段。
4. 根据包实现的接口自动判断方向，并调用对应的 `registrar.playToClient(...)` 等注册方法。

方向判断逻辑（在 `PacketData.find` 中）：

- 实现 `IInsensitiveBiPacket` 或 `ISensitiveBiPacket` → `BIDIRECTIONAL`
- 实现 `IClientboundPacket` → `CLIENTBOUND`
- 实现 `IServerboundPacket` → `SERVERBOUND`

**要求**：每个网络包类必须包含 `public static final CustomPacketPayload.Type<T>` 和
`public static final StreamCodec<B, T>` 静态字段，否则注册将抛出异常。

## 4. 辅助发送工具

`NetworkUtil` 提供了服务端向玩家批量发送包的快捷方法：

### `sendToAllPlayersExcluded`

```java
public static void sendToAllPlayersExcluded(
   @Nullable ServerPlayer excluded,
   CustomPacketPayload payload,
   CustomPacketPayload... payloads
)
```

* 向所有玩家发送包，可排除指定玩家。

### `sendToAllPlayersInDimensionExcluded`

```java
public static void sendToAllPlayersInDimensionExcluded(
   ServerLevel level,
   @Nullable ServerPlayer excluded,
   CustomPacketPayload payload,
   CustomPacketPayload... payloads
)
```

* 向特定维度的所有玩家发送包，可排除指定玩家。

### `sendToAllPlayersIncluded`

```java
public static void sendToAllPlayersIncluded(
   @Nullable Predicate<ServerPlayer> included,
   CustomPacketPayload payload,
   CustomPacketPayload... payloads
)
```

* 向**所有满足条件的玩家**发送网络包。若 `included` 为 `null`，则发送给全部玩家（等同于全服广播）。

### `sendToAllPlayersInDimensionIncluded`

```java
public static void sendToAllPlayersInDimensionIncluded(
   ServerLevel level,
   @Nullable Predicate<ServerPlayer> included,
   CustomPacketPayload payload,
   CustomPacketPayload... payloads
)
```

* 向**特定维度中满足条件的玩家**发送网络包。若 `included` 为 `null`，则发送给该维度所有玩家。

## 5. 注意事项

- 包类必须有无参构造函数（如果需要通过 `StreamCodec` 解码），通常使用 record 或显式定义即可。
- `IPacket.type(Identifier)` 是构造 `CustomPacketPayload.Type` 的便捷方法，等同于 `new Type<>(id)`。
- 在专用服务端环境下，`NetworkUtil` 中的 `ServerLifecycleHooks.getCurrentServer()` 保证可用。
- 如果 `NetworkRegistrar` 抛出异常，请检查网络包类是否遗漏了静态 `Type` 或 `StreamCodec` 字段，或者包没有实现预期的接口。
