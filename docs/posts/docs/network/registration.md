---
title: Network 注册系统
prev: false
next: false
---

# 注册系统

## `@Network` 注解

标记在包上（`package-info.java`），声明该包下的网络包协议阶段。

```java
@Network(protocol = PacketProtocol.PLAY)
package com.example.mod.network;

import dev.anvilcraft.lib.v2.network.register.Network;
```

| 属性       | 类型               | 默认值    | 说明       |
|----------|------------------|--------|----------|
| protocol | `PacketProtocol` | `PLAY` | 数据包的协议阶段 |

## PacketProtocol

```java
public enum PacketProtocol {
    CONFIGURATION,  // 配置阶段（登录时）
    PLAY,           // 游戏阶段（默认）
    COMMON          // 通用阶段
}
```

## NetworkRegistrar

提供静态方法 `register(PayloadRegistrar, String modId)`，在 `RegisterPayloadHandlersEvent` 中调用。

```java
@SubscribeEvent
public static void register(final RegisterPayloadHandlersEvent event) {
    NetworkRegistrar.register(event.registrar("1"), "modid");
}
```

### 注册流程

1. 扫描模组文件的 `@Network` 注解，获取目标包名
2. 在每个包下查找实现了 `IPacket` 的类（通过 ASM 扫描数据中的接口信息）
3. 通过反射获取类的 `static final Type<T>` 和 `static final StreamCodec<B, T>` 字段
4. 根据实现的接口自动判断方向并调用对应注册方法

### PacketData.find

内部记录类，反射提取数据包的元数据：

```java
record PacketData<B extends ByteBuf, T extends IPacket>(
    CustomPacketPayload.Type<T> type,
    StreamCodec<B, T> streamCodec,
    PacketDirection direction,
    IPayloadHandler<T> handler
)
```

**方向判断逻辑**：

| 实现的接口                  | PacketDirection | Handler                |
|------------------------|-----------------|------------------------|
| `IInsensitiveBiPacket` | `BIDIRECTIONAL` | `bidirectionalHandler` |
| `ISensitiveBiPacket`   | `BIDIRECTIONAL` | `bidirectionalHandler` |
| `IClientboundPacket`   | `CLIENTBOUND`   | `clientHandler`        |
| `IServerboundPacket`   | `SERVERBOUND`   | `serverHandler`        |

### 注册方法映射

```
protocol + direction → registrar 方法

CONFIGURATION + CLIENTBOUND   → configurationToClient()
CONFIGURATION + SERVERBOUND   → configurationToServer()
CONFIGURATION + BIDIRECTIONAL → configurationBidirectional()

PLAY + CLIENTBOUND   → playToClient()
PLAY + SERVERBOUND   → playToServer()
PLAY + BIDIRECTIONAL → playBidirectional()

COMMON + CLIENTBOUND   → commonToClient()
COMMON + SERVERBOUND   → commonToServer()
COMMON + BIDIRECTIONAL → commonBidirectional()
```

### 错误排查

如果注册抛出异常，检查：

- 网络包类是否遗漏了 `public static final Type<T>` 字段
- 网络包类是否遗漏了 `public static final StreamCodec<B, T>` 字段
- 包是否实现了预期的接口（`IClientboundPacket` / `IServerboundPacket` / 双端包）
- `@Network` 注解是否正确放置在 `package-info.java` 上
