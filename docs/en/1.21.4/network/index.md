# Network Communication Framework: Packet Interface Hierarchy (`module.network`)

<BranchContextCard branch="1.21.4" />

`module.network` (artifact `anvillib-network-neoforge-1.21.4`, package `dev.anvilcraft.lib.v2.network`) provides a **high-level directional interface wrapper over NeoForge `CustomPacketPayload` and a one-line `@Network` package-scanning auto-registration framework**.

In raw NeoForge `21.4.x`, every new packet requires implementing `CustomPacketPayload`, writing verbose `registrar.playToServer(MyPacket.TYPE, MyPacket.STREAM_CODEC, MyPacket::handle)` calls in `RegisterPayloadHandlersEvent` per protocol (`play` / `configuration` / `common`) and direction (`ToClient` / `ToServer` / `Bidirectional`), and manually wrapping handlers in `ctx.enqueueWork(...)`.

With `module.network`:
1. Have your packet `record` implement **`IClientboundPacket`**, **`IServerboundPacket`**, **`IInsensitiveBiPacket`**, or **`ISensitiveBiPacket`**—the framework automatically dispatches to the main thread via `context.enqueueWork(...)` and passes `Player` directly;
2. Annotate the packet's `package-info.java` (or any class in the package) with **`@Network`**, then call `NetworkRegistrar.register(registrar, MOD_ID)` once in `RegisterPayloadHandlersEvent` to auto-discover and register all packets in that package!

This module is split into 2 sub-documents:
- **This page (Packet Directional Interfaces)**: Covers `IPacket`, `IClientboundPacket`, `IServerboundPacket`, `IInsensitiveBiPacket`, and `ISensitiveBiPacket`.
- **[Auto-Scanner Registrar & Compact Packing Utilities](./registrar-and-util)**: Covers `@Network`, `NetworkRegistrar`, `PacketData`, `PacketDirection`, `PacketProtocol`, `NetworkUtil`, and `BoolAndInt`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.4`, this module is included automatically. To depend on `network` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-network-neoforge-1.21.4:2.0.0")
}
```

---

## 2. Sealed Interface Hierarchy & Required Fields

`IPacket` is a **sealed interface (`sealed interface`)** extending `CustomPacketPayload` with the following sub-interfaces:

- `IPacket` (root interface)
  - **`IClientboundPacket`**: server to client only (`S -> C`)
  - **`IServerboundPacket`**: client to server only (`C -> S`)
  - **Bidirectional packets implementing both `IClientboundPacket` and `IServerboundPacket`**:
    - **`IInsensitiveBiPacket`**: direction-insensitive bidirectional packet (both sides share `handleOnBothSide(Player player)`)
    - **`ISensitiveBiPacket`**: direction-sensitive bidirectional packet (client runs `handleOnClient(Player)`, server runs `handleOnServer(Player)`)

### Auto-Scan Reflection Contract (Important)

For `PacketData.find(packetClass)` to automatically extract your packet's metadata, every class implementing an `IPacket` sub-interface **must declare two static fields (any name and modifiers, matched solely by field type)**:
1. A `static` field of type **`CustomPacketPayload.Type<Self>`** (easily created via `IPacket.type(ResourceLocation)`);
2. A `static` field of type **`StreamCodec<? super B, Self>`** (for `PLAY`, `B` can be up to `RegistryFriendlyByteBuf`; for `CONFIGURATION` and `COMMON`, `B` can be at most `FriendlyByteBuf` or `ByteBuf`).

---

## 3. Full Code Example: Writing One-Way & Bidirectional Packets

```java
package com.example.mymod.network;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.network.packet.IClientboundPacket;
import dev.anvilcraft.lib.v2.network.packet.IPacket;
import dev.anvilcraft.lib.v2.network.packet.ISensitiveBiPacket;
import dev.anvilcraft.lib.v2.network.packet.IServerboundPacket;
import dev.anvilcraft.lib.v2.network.register.Network;
import dev.anvilcraft.lib.v2.network.register.PacketProtocol;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

@Network(protocol = PacketProtocol.PLAY)
public final class ModPackets {
    private ModPackets() {
    }

    public record ToggleMachinePacket(BlockPos pos, boolean enabled) implements IServerboundPacket {
        public static final Type<ToggleMachinePacket> TYPE =
            IPacket.type(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "toggle_machine"));

        public static final StreamCodec<ByteBuf, ToggleMachinePacket> STREAM_CODEC = StreamCodec.composite(
            BlockPos.STREAM_CODEC, ToggleMachinePacket::pos,
            ByteBufCodecs.BOOL, ToggleMachinePacket::enabled,
            ToggleMachinePacket::new
        );

        @Override
        public Type<ToggleMachinePacket> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            if (player instanceof ServerPlayer serverPlayer && serverPlayer.level().isLoaded(this.pos)) {
                MyMod.LOGGER.info("Player {} toggled machine at {} -> {}", serverPlayer.getName().getString(), this.pos, this.enabled);
            }
        }
    }

    public record SyncEnergyEffectPacket(BlockPos pos, int energy) implements IClientboundPacket {
        public static final Type<SyncEnergyEffectPacket> TYPE =
            IPacket.type(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "sync_energy_effect"));

        public static final StreamCodec<RegistryFriendlyByteBuf, SyncEnergyEffectPacket> STREAM_CODEC = StreamCodec.composite(
            BlockPos.STREAM_CODEC, SyncEnergyEffectPacket::pos,
            ByteBufCodecs.VAR_INT, SyncEnergyEffectPacket::energy,
            SyncEnergyEffectPacket::new
        );

        @Override
        public Type<SyncEnergyEffectPacket> type() {
            return TYPE;
        }

        @Override
        public void handleOnClient(Player player) {
            MyMod.LOGGER.debug("Client received energy update at {}: {}", this.pos, this.energy);
        }
    }

    public record PingPongHandshakePacket(long timestamp) implements ISensitiveBiPacket {
        public static final Type<PingPongHandshakePacket> TYPE =
            IPacket.type(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "ping_pong"));

        public static final StreamCodec<ByteBuf, PingPongHandshakePacket> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_LONG, PingPongHandshakePacket::timestamp,
            PingPongHandshakePacket::new
        );

        @Override
        public Type<PingPongHandshakePacket> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            MyMod.LOGGER.info("Server received ping: {}", this.timestamp);
        }

        @Override
        public void handleOnClient(Player player) {
            MyMod.LOGGER.info("Client received pong: {}", this.timestamp);
        }
    }
}
```

---

## 4. Packet Interfaces API Reference (`dev.anvilcraft.lib.v2.network.packet`)

| Interface | Inheritance | Method to Implement | Default Underlying Handler |
| :--- | :--- | :--- | :--- |
| **`IPacket`** | `extends CustomPacketPayload` | `Type<? extends CustomPacketPayload> type()` | Provides static factory `static <T extends IPacket> Type<T> type(ResourceLocation id)`. |
| **`IClientboundPacket`** | `extends IPacket` | `void handleOnClient(Player player)` | `default void clientboundHandler(IPayloadContext context)`: calls `context.enqueueWork(() -> this.handleOnClient(context.player()))`. |
| **`IServerboundPacket`** | `extends IPacket` | `void handleOnServer(Player player)` | `default void serverboundHandler(IPayloadContext context)`: calls `context.enqueueWork(() -> this.handleOnServer(context.player()))`. |
| **`IInsensitiveBiPacket`** | `extends IClientboundPacket, IServerboundPacket` | `void handleOnBothSide(Player player)` | Forwards both `handleOnClient` and `handleOnServer` to `handleOnBothSide`, and provides `default void bidirectionalHandler(IPayloadContext context)`. |
| **`ISensitiveBiPacket`** | `extends IClientboundPacket, IServerboundPacket` | • `void handleOnClient(Player player)`<br>• `void handleOnServer(Player player)` | `default void bidirectionalHandler(IPayloadContext context)`: checks `context.flow().isClientbound()` and delegates to `clientboundHandler(context)` or `serverboundHandler(context)`. |
