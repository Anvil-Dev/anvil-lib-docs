# Auto-Scanner Registrar & Broadcast/Packing Utilities (`register` / `util`)

<BranchContextCard branch="1.21.11" />

This page covers using `@Network` and `NetworkRegistrar` to auto-register packets, plus `NetworkUtil` for conditional player broadcasts and `BoolAndInt` for compact ZigZag + VarInt network encoding.

---

## 1. `@Network` & `NetworkRegistrar` Auto-Registration

### 1. `@Network` Annotation Rules (Scanned by Enclosing Package)

The `@Network` annotation can be placed on **`package-info.java`, `interface`, `class`, `enum`, or `record`**.

When `NetworkRegistrar.register(registrar, modId)` runs:
1. It searches `ModFileScanData` for `modId` to find all types annotated with `@Network`;
2. Extracts each type's **package name** and the protocol phase specified by `@Network(protocol = ...)` (defaults to `PacketProtocol.PLAY`);
3. Automatically scans all classes **directly in that Java package (non-recursive)** implementing `dev.anvilcraft.lib.v2.network.packet.*`, extracts their static `Type`, static `StreamCodec`, and directional handler via `PacketData.find(packetClass)`, and registers them to NeoForge's `PayloadRegistrar` (automatically passing dual handlers for NeoForge 21.11 bidirectional registration)!

> **Note**: If your mod has both `PLAY` packets and `CONFIGURATION` packets, place them in **two separate subpackages** annotated with `@Network(protocol = PacketProtocol.PLAY)` and `@Network(protocol = PacketProtocol.CONFIGURATION)` respectively.

### 2. Full Code Example: Calling `NetworkRegistrar.register` & Sending Packets

```java
package com.example.mymod.network;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.network.register.NetworkRegistrar;
import dev.anvilcraft.lib.v2.network.util.NetworkUtil;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.network.ClientPacketDistributor;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class ModNetworkSetup {
    public static final String NETWORK_VERSION = "1";

    private ModNetworkSetup() {
    }

    @SubscribeEvent
    public static void onRegisterPayloads(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar registrar = event.registrar(NETWORK_VERSION);
        NetworkRegistrar.register(registrar, MyMod.MOD_ID);
    }

    public static void sendToggleToServer(BlockPos pos, boolean enabled) {
        ClientPacketDistributor.sendToServer(new ModPackets.ToggleMachinePacket(pos, enabled));
    }

    public static void sendEnergyToPlayer(ServerPlayer player, BlockPos pos, int energy) {
        PacketDistributor.sendToPlayer(player, new ModPackets.SyncEnergyEffectPacket(pos, energy));
    }

    public static void broadcastEnergyToOthersInLevel(ServerPlayer sender, BlockPos pos, int energy) {
        NetworkUtil.sendToAllPlayersInDimensionExcluded(
            sender.level(),
            sender,
            new ModPackets.SyncEnergyEffectPacket(pos, energy)
        );
    }
}
```

---

## 2. Public Classes, Annotations & Enums API Reference (`dev.anvilcraft.lib.v2.network.register`)

| Name | Kind | Signature & Description |
| :--- | :---: | :--- |
| **`@Network`** | `@interface` | `PacketProtocol protocol() default PacketProtocol.PLAY;`. Placed on a package or any type in the package to mark it for packet scanning. |
| **`PacketProtocol`** | `enum` | • `CONFIGURATION`: `registrar.configurationToClient` / `ToServer` / `Bidirectional`<br>• `PLAY`: `registrar.playToClient` / `ToServer` / `Bidirectional`<br>• `COMMON`: `registrar.commonToClient` / `ToServer` / `Bidirectional` |
| **`PacketDirection`** | `enum` | `CLIENTBOUND`, `SERVERBOUND`, `BIDIRECTIONAL`. |
| **`NetworkRegistrar`** | `class` | `public static void register(PayloadRegistrar registrar, String modId)`: scans and registers all packets in `@Network`-annotated packages of `modId`. |
| **`PacketData<B, T>`** | `record` | `public record PacketData<B extends FriendlyByteBuf, T extends IPacket>(Type<T> type, StreamCodec<? super B, T> streamCodec, IPayloadHandler<T> handler, PacketDirection direction)`<br>`public static <B extends FriendlyByteBuf, T extends IPacket> PacketData<B, T> find(Class<T> clazz)`: reflectively extracts a packet's `Type`, `StreamCodec`, and handler. |

---

## 3. Conditional Broadcast & Compact Encoding Utilities (`NetworkUtil` & `BoolAndInt`)

Located in `dev.anvilcraft.lib.v2.network.util`.

### 1. Code Example: Using `BoolAndInt` & `NetworkUtil`

```java
package com.example.mymod.network;

import dev.anvilcraft.lib.v2.network.util.BoolAndInt;
import dev.anvilcraft.lib.v2.network.util.NetworkUtil;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;

public final class NetworkUtilExample {
    public static BoolAndInt roundTripBoolAndInt(boolean active, int signedDelta) {
        ByteBuf buf = Unpooled.buffer();
        BoolAndInt.STREAM_CODEC.encode(buf, new BoolAndInt(active, signedDelta));
        return BoolAndInt.STREAM_CODEC.decode(buf);
    }

    public static void notifyNearbyOps(ServerPlayer originPlayer, BlockPos pos, int energy) {
        NetworkUtil.sendToAllPlayersInDimensionIncluded(
            originPlayer.level(),
            player -> player.hasPermissions(2),
            new ModPackets.SyncEnergyEffectPacket(pos, energy)
        );
    }
}
```

### 2. `BoolAndInt` & `NetworkUtil` API Reference

| Class / Record | Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| **`BoolAndInt`** | • `public record BoolAndInt(boolean bool, int integer)`<br>• `public static final StreamCodec<ByteBuf, BoolAndInt> STREAM_CODEC` | ZigZag-encodes `integer` to shrink negative values, folds `bool` into bit 0, and writes as a single VarInt to `ByteBuf` (supports any 32-bit signed int). |
| **`NetworkUtil`** | `static void sendToAllPlayersExcluded(@Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Broadcasts to all online players on the server except `excluded` (none excluded if `null`). Server-only (relies on `ServerLifecycleHooks.getCurrentServer()`). |
| | `static void sendToAllPlayersInDimensionExcluded(ServerLevel level, @Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Broadcasts to all players in `level` except `excluded`. |
| | `static void sendToAllPlayersIncluded(@Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Sends to all online players matching `included` (all players if `included == null`). Server-only. |
| | `static void sendToAllPlayersInDimensionIncluded(ServerLevel level, @Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Sends to all players in `level` matching `included` (all players in `level` if `included == null`). |
