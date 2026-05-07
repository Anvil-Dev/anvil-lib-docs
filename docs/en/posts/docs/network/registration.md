---
title: Network Registration
prev: false
next: false
---

# Registration System

## `@Network` Annotation

Placed on a package (in `package-info.java`), declares the protocol phase for network packets within that package.

```java
@Network(protocol = PacketProtocol.PLAY)
package com.example.mod.network;

import dev.anvilcraft.lib.v2.network.register.Network;
```

| Attribute | Type             | Default | Description                   |
|-----------|------------------|---------|-------------------------------|
| protocol  | `PacketProtocol` | `PLAY`  | Protocol phase for the packets |

## PacketProtocol

```java
public enum PacketProtocol {
    CONFIGURATION,  // Configuration phase (during login)
    PLAY,           // Game phase (default)
    COMMON          // Common phase
}
```

## NetworkRegistrar

Provides the static method `register(PayloadRegistrar, String modId)`, called inside `RegisterPayloadHandlersEvent`.

```java
@SubscribeEvent
public static void register(final RegisterPayloadHandlersEvent event) {
    NetworkRegistrar.register(event.registrar("1"), "modid");
}
```

### Registration Flow

1. Scans the mod files for `@Network` annotations to obtain target package names
2. Within each package, finds classes implementing `IPacket` (via interface information in ASM scan data)
3. Uses reflection to retrieve the `static final Type<T>` and `static final StreamCodec<B, T>` fields from each class
4. Automatically determines the direction based on implemented interfaces and calls the corresponding registration method

### PacketData.find

Internal record class that extracts packet metadata via reflection:

```java
record PacketData<B extends ByteBuf, T extends IPacket>(
    CustomPacketPayload.Type<T> type,
    StreamCodec<B, T> streamCodec,
    PacketDirection direction,
    IPayloadHandler<T> handler
)
```

**Direction Detection Logic**:

| Implemented Interface  | PacketDirection | Handler                |
|------------------------|-----------------|------------------------|
| `IInsensitiveBiPacket` | `BIDIRECTIONAL` | `bidirectionalHandler` |
| `ISensitiveBiPacket`   | `BIDIRECTIONAL` | `bidirectionalHandler` |
| `IClientboundPacket`   | `CLIENTBOUND`   | `clientHandler`        |
| `IServerboundPacket`   | `SERVERBOUND`   | `serverHandler`        |

### Registration Method Mapping

```
protocol + direction -> registrar method

CONFIGURATION + CLIENTBOUND   -> configurationToClient()
CONFIGURATION + SERVERBOUND   -> configurationToServer()
CONFIGURATION + BIDIRECTIONAL -> configurationBidirectional()

PLAY + CLIENTBOUND   -> playToClient()
PLAY + SERVERBOUND   -> playToServer()
PLAY + BIDIRECTIONAL -> playBidirectional()

COMMON + CLIENTBOUND   -> commonToClient()
COMMON + SERVERBOUND   -> commonToServer()
COMMON + BIDIRECTIONAL -> commonBidirectional()
```

### Troubleshooting

If registration throws an exception, check:

- Whether the packet class is missing a `public static final Type<T>` field
- Whether the packet class is missing a `public static final StreamCodec<B, T>` field
- Whether the packet implements the expected interface (`IClientboundPacket` / `IServerboundPacket` / bidirectional)
- Whether the `@Network` annotation is correctly placed on `package-info.java`
