# Network Packet Interfaces & Direction Model (`module.network`)

<BranchContextCard branch="26.3" />

`module.network` (artifact `anvillib-network-neoforge-26.3`, package `dev.anvilcraft.lib.v2.network`) is a lightweight wrapper around NeoForge's `CustomPacketPayload` networking system, eliminating boilerplate for manually registering packet handlers and switching to the main thread (`ctx.enqueueWork(...)`).

This module is split into 2 sub-documents by functionality:
- **This page (Packet Interfaces & Direction Model)**: Covers the five interfaces `IPacket`, `IClientboundPacket`, `IServerboundPacket`, `IInsensitiveBiPacket`, and `ISensitiveBiPacket`, along with their thread scheduling.
- **[@Network Annotation, Auto-Registration & Utilities](./registrar-and-util)**: Covers the `@Network` package annotation, `PacketProtocol`, `NetworkRegistrar`, `PacketData`, `NetworkUtil`, and the compact bit-packed `BoolAndInt` record.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.3`, this module is included automatically. To depend on `network` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-network-neoforge-26.3:2.0.0")
}
```

---

## 2. The Five Packet Interfaces & Selection Guide

`module.network` is rooted at the sealed interface `IPacket` (extending vanilla `CustomPacketPayload`) and branches into 4 sub-interfaces by direction:

```text
IPacket (sealed, extends CustomPacketPayload)
 ├── IClientboundPacket (non-sealed, Server -> Client)
 │    ├── IInsensitiveBiPacket (bidirectional, shares the same handleOnBothSide logic)
 │    └── ISensitiveBiPacket   (bidirectional, client runs handleOnClient, server runs handleOnServer)
 └── IServerboundPacket (non-sealed, Client -> Server)
      ├── IInsensitiveBiPacket
      └── ISensitiveBiPacket
```

| Interface | Direction | Method to Implement | Thread Safety Guarantee |
| :--- | :--- | :--- | :--- |
| **`IClientboundPacket`** | Server → Client | `void handleOnClient(Player player)` | `clientHandler` schedules `handleOnClient` on the **client main thread** via `ctx.enqueueWork(...)`; `player` is always `LocalPlayer`. |
| **`IServerboundPacket`** | Client → Server | `void handleOnServer(Player player)` | `serverHandler` schedules `handleOnServer` on the **server main thread** via `ctx.enqueueWork(...)`; `player` is always `ServerPlayer`. |
| **`IInsensitiveBiPacket`** | Client ↔ Server (Bidirectional) | `void handleOnBothSide(Player player)` | For packets with identical handling on both sides. Calls `handleOnBothSide(player)` on the respective main thread by default. |
| **`ISensitiveBiPacket`** | Client ↔ Server (Bidirectional) | Implement both `handleOnClient(Player)` and `handleOnServer(Player)` | For packets sharing one payload structure in both directions with distinct handling per side. `bidirectionalHandler` dispatches via `ctx.flow().isClientbound()` / `isServerbound()`. |

---

## 3. Mandatory Packet Contract (For Auto-Registration)

For `NetworkRegistrar.register(registrar, MOD_ID)` to scan and register your packet class automatically, each packet class (typically a `record`) implementing the interfaces above **must declare two `static final` fields** (any field name; matched by generic type signature):

1. **`CustomPacketPayload.Type<Self>` static constant**:
   Easily created via `IPacket.type(Identifier)`; type argument 0 must be the packet class itself.
2. **`StreamCodec<B, Self>` static constant**:
   - For `PacketProtocol.PLAY` (default), buffer type `B` can be `RegistryFriendlyByteBuf`, `FriendlyByteBuf`, or `ByteBuf`;
   - For `PacketProtocol.CONFIGURATION` or `PacketProtocol.COMMON`, buffer type `B` must be `FriendlyByteBuf` or `ByteBuf` (registry sync context is not yet established during configuration).
   - Type argument 1 must be the packet class itself.

---

## 4. Full Code Example

The examples below show a server-to-client packet (`IClientboundPacket`), a client-to-server packet (`IServerboundPacket`), and a direction-sensitive bidirectional packet (`ISensitiveBiPacket`):

```java
package com.example.mymod.network.packet;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.codec.StreamCodecUtil;
import dev.anvilcraft.lib.v2.network.packet.IClientboundPacket;
import dev.anvilcraft.lib.v2.network.packet.IPacket;
import dev.anvilcraft.lib.v2.network.packet.ISensitiveBiPacket;
import dev.anvilcraft.lib.v2.network.packet.IServerboundPacket;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

public final class ModPackets {
    private ModPackets() {
    }

    // 1. Server -> Client one-way packet: tell client to play machine effects
    public record MachineEffectPacket(BlockPos pos, int powerLevel) implements IClientboundPacket {
        public static final Type<MachineEffectPacket> TYPE = IPacket.type(
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "machine_effect")
        );

        public static final StreamCodec<RegistryFriendlyByteBuf, MachineEffectPacket> STREAM_CODEC =
            StreamCodec.composite(
                StreamCodecUtil.VAR_INT_BLOCK_POS,
                MachineEffectPacket::pos,
                ByteBufCodecs.VAR_INT,
                MachineEffectPacket::powerLevel,
                MachineEffectPacket::new
            );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }

        @Override
        public void handleOnClient(Player player) {
            // Already switched to client main thread via ctx.enqueueWork; safe to access player.level()
            player.level().levelEvent(2004, this.pos, this.powerLevel);
        }
    }

    // 2. Client -> Server one-way packet: player clicks GUI button to toggle machine mode
    public record ToggleMachineModePacket(BlockPos pos, boolean overdrive) implements IServerboundPacket {
        public static final Type<ToggleMachineModePacket> TYPE = IPacket.type(
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "toggle_machine_mode")
        );

        public static final StreamCodec<ByteBuf, ToggleMachineModePacket> STREAM_CODEC =
            StreamCodec.composite(
                BlockPos.STREAM_CODEC,
                ToggleMachineModePacket::pos,
                ByteBufCodecs.BOOL,
                ToggleMachineModePacket::overdrive,
                ToggleMachineModePacket::new
            );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            // Already on server main thread; player is always ServerPlayer
            if (!(player instanceof ServerPlayer serverPlayer)) return;
            if (serverPlayer.distanceToSqr(this.pos.getCenter()) > 64.0) return;
            // Safely mutate server-side block entity state...
        }
    }

    // 3. Direction-sensitive bidirectional packet: client requests value, server replies with latest value using the same packet
    public record ValveSyncPacket(BlockPos pos, int flowRate) implements ISensitiveBiPacket {
        public static final Type<ValveSyncPacket> TYPE = IPacket.type(
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "valve_sync")
        );

        public static final StreamCodec<ByteBuf, ValveSyncPacket> STREAM_CODEC =
            StreamCodec.composite(
                BlockPos.STREAM_CODEC,
                ValveSyncPacket::pos,
                ByteBufCodecs.VAR_INT,
                ValveSyncPacket::flowRate,
                ValveSyncPacket::new
            );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            // After client sends a change request, server validates and broadcasts back to client
        }

        @Override
        public void handleOnClient(Player player) {
            // Client updates local state upon receiving latest flowRate from server
        }
    }
}
```

---

## 5. Interface API Signatures

| Interface | Method Signature | Default Behavior & Notes |
| :--- | :--- | :--- |
| `IPacket` | `static <T extends IPacket> Type<T> type(Identifier id)` | Returns `new CustomPacketPayload.Type<>(id)`. |
| `IClientboundPacket` | `default void clientHandler(IPayloadContext ctx)`<br>`void handleOnClient(Player player)` | `clientHandler` calls `ctx.enqueueWork(() -> this.handleOnClient(ctx.player()))`. Override `clientHandler` if you need to handle directly on the Netty thread. |
| `IServerboundPacket` | `default void serverHandler(IPayloadContext ctx)`<br>`void handleOnServer(Player player)` | `serverHandler` calls `ctx.enqueueWork(() -> this.handleOnServer(ctx.player()))`. |
| `IInsensitiveBiPacket` | `default void bidirectionalHandler(IPayloadContext ctx)`<br>`void handleOnBothSide(Player player)` | Routes `clientHandler`, `serverHandler`, `handleOnClient`, and `handleOnServer` all to `handleOnBothSide(player)`. |
| `ISensitiveBiPacket` | `default void bidirectionalHandler(IPayloadContext ctx)` | Dispatches to `this.clientHandler(ctx)` or `this.serverHandler(ctx)` based on `ctx.flow().isClientbound()` and `ctx.flow().isServerbound()`. |
