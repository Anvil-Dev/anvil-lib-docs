---
title: Network Packet Interfaces
prev: false
next: false
---

# Packet Interfaces

The module defines a sealed hierarchy: all network packets must implement `IPacket` and can only be extended through the following sub-interfaces.

## Interface Hierarchy

```
IPacket (sealed)
├── IClientboundPacket (non-sealed) — Server -> Client
├── IServerboundPacket (non-sealed) — Client -> Server
└── (Bidirectional = IClientboundPacket + IServerboundPacket)
    ├── IInsensitiveBiPacket — Single handler for both sides
    └── ISensitiveBiPacket — Independent handlers per side
```

## IPacket

The root interface, extending `CustomPacketPayload`, providing a `Type` factory method.

```java
public sealed interface IPacket extends CustomPacketPayload
        permits IClientboundPacket, IServerboundPacket {

    static <T extends IPacket> Type<T> type(Identifier id) {
        return new Type<>(id);
    }
}
```

## IClientboundPacket

Server -> Client packets.

```java
public non-sealed interface IClientboundPacket extends IPacket {
    // Automatically enqueueWork and call handleOnClient
    default void clientHandler(IPayloadContext ctx) {
        ctx.enqueueWork(() -> this.handleOnClient(ctx.player()));
    }

    void handleOnClient(Player player); // Client-side handling logic
}
```

Implementors only need to declare `TYPE`, `STREAM_CODEC`, and `handleOnClient`.

```java
public record MyClientPacket(String message) implements IClientboundPacket {
    public static final Type<MyClientPacket> TYPE =
        IPacket.type(ResourceLocation.fromNamespaceAndPath("modid", "my_packet"));
    public static final StreamCodec<RegistryFriendlyByteBuf, MyClientPacket> STREAM_CODEC =
        StreamCodec.composite(ByteBufCodecs.STRING_UTF8, MyClientPacket::message, MyClientPacket::new);

    @Override
    public void handleOnClient(Player player) {
        // Client-side handling
    }
}
```

## IServerboundPacket

Client -> Server packets. Symmetric to `IClientboundPacket`, provides `serverHandler` and `handleOnServer`.

```java
public non-sealed interface IServerboundPacket extends IPacket {
    default void serverHandler(IPayloadContext ctx) {
        ctx.enqueueWork(() -> this.handleOnServer(ctx.player()));
    }

    void handleOnServer(Player player); // Server-side handling logic (player is always ServerPlayer)
}
```

## IInsensitiveBiPacket

Bidirectional common packet -- both sides use the same logic.

```java
public interface IInsensitiveBiPacket extends IClientboundPacket, IServerboundPacket {
    default void bidirectionalHandler(IPayloadContext ctx) {
        ctx.enqueueWork(() -> this.handleOnBothSide(ctx.player()));
    }

    void handleOnBothSide(Player player);

    @Override
    default void clientHandler(IPayloadContext ctx) { this.bidirectionalHandler(ctx); }
    @Override
    default void handleOnClient(Player player) { this.handleOnBothSide(player); }
    @Override
    default void serverHandler(IPayloadContext ctx) { this.bidirectionalHandler(ctx); }
    @Override
    default void handleOnServer(Player player) { this.handleOnBothSide(player); }
}
```

Implementors only need to declare `handleOnBothSide`; all handlers are already implemented by the interface defaults.

```java
public record SyncPacket(int value) implements IInsensitiveBiPacket {
    // ... TYPE, STREAM_CODEC ...

    @Override
    public void handleOnBothSide(Player player) {
        // Same logic executed on both client and server
    }
}
```

## ISensitiveBiPacket

Bidirectional direction-aware packet -- each side handles independently.

```java
public interface ISensitiveBiPacket extends IClientboundPacket, IServerboundPacket {
    default void bidirectionalHandler(IPayloadContext ctx) {
        if (ctx.flow().isClientbound()) {
            this.clientHandler(ctx);   // -> handleOnClient
        } else if (ctx.flow().isServerbound()) {
            this.serverHandler(ctx);   // -> handleOnServer
        }
    }
}
```

Automatically dispatches to `clientHandler` or `serverHandler` based on the network flow direction.

```java
public record BiDiPacket(int id) implements ISensitiveBiPacket {
    // ... TYPE, STREAM_CODEC ...

    @Override
    public void handleOnClient(Player player) { /* Logic when received on client */ }
    @Override
    public void handleOnServer(Player player) { /* Logic when received on server */ }
}
```

## Interface Comparison

| Interface               | Direction | Methods to Implement                     | Use Case                                      |
|-------------------------|-----------|------------------------------------------|-----------------------------------------------|
| `IClientboundPacket`    | S->C      | `handleOnClient`                         | Server notifying client                       |
| `IServerboundPacket`    | C->S      | `handleOnServer`                         | Client requesting server                      |
| `IInsensitiveBiPacket`  | Bidirectional | `handleOnBothSide`                   | Synchronization with identical logic on both sides |
| `ISensitiveBiPacket`    | Bidirectional | `handleOnClient` + `handleOnServer`  | Synchronization with different logic per side  |
