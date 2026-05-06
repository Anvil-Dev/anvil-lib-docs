---
title: Network 数据包接口
prev: false
next: false
---

# 数据包接口

模块定义了一个密封体系，所有网络包都必须实现 `IPacket`，并只能通过以下子接口扩展。

## 接口层级

```
IPacket (sealed)
├── IClientboundPacket (non-sealed) — 服务端 → 客户端
├── IServerboundPacket (non-sealed) — 客户端 → 服务端
└── (双端包 = IClientboundPacket + IServerboundPacket)
    ├── IInsensitiveBiPacket — 双端共用一套处理逻辑
    └── ISensitiveBiPacket — 双端各自独立处理
```

## IPacket

根接口，扩展 `CustomPacketPayload`，提供 `Type` 工厂方法。

```java
public sealed interface IPacket extends CustomPacketPayload
        permits IClientboundPacket, IServerboundPacket {

    static <T extends IPacket> Type<T> type(Identifier id) {
        return new Type<>(id);
    }
}
```

## IClientboundPacket

服务端 → 客户端包。

```java
public non-sealed interface IClientboundPacket extends IPacket {
    // 自动 enqueueWork 并调用 handleOnClient
    default void clientHandler(IPayloadContext ctx) {
        ctx.enqueueWork(() -> this.handleOnClient(ctx.player()));
    }

    void handleOnClient(Player player); // 客户端处理逻辑
}
```

实现者只需声明 `TYPE`、`STREAM_CODEC` 和 `handleOnClient`。

```java
public record MyClientPacket(String message) implements IClientboundPacket {
    public static final Type<MyClientPacket> TYPE =
        IPacket.type(ResourceLocation.fromNamespaceAndPath("modid", "my_packet"));
    public static final StreamCodec<RegistryFriendlyByteBuf, MyClientPacket> STREAM_CODEC =
        StreamCodec.composite(ByteBufCodecs.STRING_UTF8, MyClientPacket::message, MyClientPacket::new);

    @Override
    public void handleOnClient(Player player) {
        // 客户端处理
    }
}
```

## IServerboundPacket

客户端 → 服务端包。与 `IClientboundPacket` 对称，提供 `serverHandler` 和 `handleOnServer`。

```java
public non-sealed interface IServerboundPacket extends IPacket {
    default void serverHandler(IPayloadContext ctx) {
        ctx.enqueueWork(() -> this.handleOnServer(ctx.player()));
    }

    void handleOnServer(Player player); // 服务端处理逻辑（player 恒为 ServerPlayer）
}
```

## IInsensitiveBiPacket

双端通用包，两端用同一套逻辑。

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

实现者只需声明 `handleOnBothSide`，所有 handler 已由接口默认实现。

```java
public record SyncPacket(int value) implements IInsensitiveBiPacket {
    // ... TYPE, STREAM_CODEC ...

    @Override
    public void handleOnBothSide(Player player) {
        // 客户端和服务端执行相同逻辑
    }
}
```

## ISensitiveBiPacket

双端方向感知包，两端各自独立处理。

```java
public interface ISensitiveBiPacket extends IClientboundPacket, IServerboundPacket {
    default void bidirectionalHandler(IPayloadContext ctx) {
        if (ctx.flow().isClientbound()) {
            this.clientHandler(ctx);   // → handleOnClient
        } else if (ctx.flow().isServerbound()) {
            this.serverHandler(ctx);   // → handleOnServer
        }
    }
}
```

自动根据网络流方向分发到 `clientHandler` 或 `serverHandler`。

```java
public record BiDiPacket(int id) implements ISensitiveBiPacket {
    // ... TYPE, STREAM_CODEC ...

    @Override
    public void handleOnClient(Player player) { /* 客户端收到后的逻辑 */ }
    @Override
    public void handleOnServer(Player player) { /* 服务端收到后的逻辑 */ }
}
```

## 接口对比

| 接口                     | 方向  | 需实现方法                               | 适用场景        |
|------------------------|-----|-------------------------------------|-------------|
| `IClientboundPacket`   | S→C | `handleOnClient`                    | 服务端通知客户端    |
| `IServerboundPacket`   | C→S | `handleOnServer`                    | 客户端请求服务端    |
| `IInsensitiveBiPacket` | 双向  | `handleOnBothSide`                  | 两端处理逻辑相同的同步 |
| `ISensitiveBiPacket`   | 双向  | `handleOnClient` + `handleOnServer` | 两端处理逻辑不同的同步 |
