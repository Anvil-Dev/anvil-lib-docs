# @Network Annotation, Auto-Registration & Utilities (`dev.anvilcraft.lib.v2.network.register` / `util`)

<BranchContextCard branch="26.2" />

Once your packet classes implement `IPacket` sub-interfaces, simply annotate their Java package (`package-info.java`) with `@Network` and call `NetworkRegistrar.register(registrar, MOD_ID)` once in `RegisterPayloadHandlersEvent` to automatically scan, reflectively extract, and register all packets in the package. This page also covers the broadcast helper `NetworkUtil` and compact bit-packing utility `BoolAndInt`.

---

## 1. `@Network` Package-Level Auto-Registration Flow

### 1. Step 1: Create `package-info.java` in the Packet Package

`@Network` is a **package-level annotation (`@Target(ElementType.PACKAGE)`)** and must be placed in the target package's `package-info.java`.

> **Important Mechanism**:
> `NetworkRegistrar` matches class names using exact package equality: `className.substring(0, className.lastIndexOf('.')).equals(packageName)`.
> This means:
> 1. `@Network` **only scans classes directly in that package and does not recurse into subpackages** (place a `package-info.java` in subpackages too if they contain packets);
> 2. If your packets use different protocol channels (e.g., some on `PLAY`, some on `CONFIGURATION`), place them in separate packages with `@Network(protocol = PacketProtocol.PLAY)` and `@Network(protocol = PacketProtocol.CONFIGURATION)` respectively;
> 3. Define packets as **top-level classes** in the package (not inner classes `Outer$Inner`) for clean, reliable scanning.

```java
// File path: src/main/java/com/example/mymod/network/packet/package-info.java
@Network(protocol = PacketProtocol.PLAY)
package com.example.mymod.network.packet;

import dev.anvilcraft.lib.v2.network.register.Network;
import dev.anvilcraft.lib.v2.network.register.PacketProtocol;
```

### 2. Step 2: Call `NetworkRegistrar.register` in `RegisterPayloadHandlersEvent`

```java
package com.example.mymod.network;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.network.register.NetworkRegistrar;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class ModNetworkHandler {
    private ModNetworkHandler() {
    }

    @SubscribeEvent
    public static void onRegisterPayloads(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar registrar = event.registrar("1");
        // Automatically scan all @Network-annotated packages in my_mod and register their IPacket implementations
        NetworkRegistrar.register(registrar, MyMod.MOD_ID);
    }
}
```

---

## 2. Network Broadcasting & `BoolAndInt` Usage Examples

### 1. Broadcasting Conditionally or Excluding Players with `NetworkUtil`

Vanilla `PacketDistributor.sendToAllPlayers` always sends to everyone on the server; in many sync scenarios, you want to "send to everyone except the triggering player" or "send only to players matching a predicate (e.g., wearing specific goggles)". `NetworkUtil` provides these four broadcast helpers:

```java
package com.example.mymod.network;

import com.example.mymod.init.ModItems;
import com.example.mymod.network.packet.MachineEffectPacket;
import dev.anvilcraft.lib.v2.network.util.NetworkUtil;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EquipmentSlot;

public final class MachineBroadcastHelper {
    private MachineBroadcastHelper() {
    }

    public static void broadcastEffect(ServerLevel level, ServerPlayer triggerPlayer, BlockPos pos) {
        MachineEffectPacket packet = new MachineEffectPacket(pos, 5);

        // 1. Send to all players in the current dimension except triggerPlayer
        NetworkUtil.sendToAllPlayersInDimensionExcluded(level, triggerPlayer, packet);

        // 2. Send to all players in the current dimension wearing engineer's goggles on their head
        NetworkUtil.sendToAllPlayersInDimensionIncluded(
            level,
            player -> player.getItemBySlot(EquipmentSlot.HEAD).is(ModItems.ENGINEER_GOGGLES.get()),
            packet
        );
    }
}
```

### 2. Packing a Boolean Flag and Signed Int into One VarInt with `BoolAndInt`

When a packet needs to send both a `boolean` flag and a typically small signed `int` (positive or negative), writing them separately costs `1 byte (bool) + 1–5 bytes (VarInt)`, and negative numbers always take 5 bytes as a plain `VarInt`. `BoolAndInt` applies **ZigZag encoding** to the int (mapping small negatives to small positives), folds the `boolean` into the lowest bit (bit 0), and writes a single `VarInt` (1–5 bytes):

```java
package com.example.mymod.network.packet;

import dev.anvilcraft.lib.v2.network.packet.IClientboundPacket;
import dev.anvilcraft.lib.v2.network.packet.IPacket;
import dev.anvilcraft.lib.v2.network.util.BoolAndInt;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;

public record EnergyDeltaPacket(BoolAndInt activeAndDelta) implements IClientboundPacket {
    public static final Type<EnergyDeltaPacket> TYPE = IPacket.type(
        Identifier.fromNamespaceAndPath("my_mod", "energy_delta")
    );

    public static final StreamCodec<ByteBuf, EnergyDeltaPacket> STREAM_CODEC =
        BoolAndInt.STREAM_CODEC.map(EnergyDeltaPacket::new, EnergyDeltaPacket::activeAndDelta);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }

    @Override
    public void handleOnClient(Player player) {
        boolean isMachineActive = this.activeAndDelta.bool();
        int energyChange = this.activeAndDelta.integer();
    }
}
```

---

## 3. Public Classes, Annotations & Enums API Reference

### 1. `@Network` & `PacketProtocol`

| Type / Signature | Description |
| :--- | :--- |
| `@Target(ElementType.PACKAGE) public @interface Network` | Package-level annotation with attribute `PacketProtocol protocol() default PacketProtocol.PLAY;`. |
| `public enum PacketProtocol` | • `CONFIGURATION`: configuration-phase channel (`registrar.configurationToClient` / `ToServer` / `Bidirectional`);<br>• `PLAY`: in-game play-phase channel (default, `registrar.playToClient` / `ToServer` / `Bidirectional`);<br>• `COMMON`: common-phase channel (`registrar.commonToClient` / `ToServer` / `Bidirectional`). |

### 2. `NetworkRegistrar` & Internal `PacketData`

| Class / Method Signature | Description & Boundary Exceptions |
| :--- | :--- |
| `public static void NetworkRegistrar.register(PayloadRegistrar registrar, String modId)` | Scans all `@Network` packages in `modId`'s mod file, loads all classes implementing `dev.anvilcraft.lib.v2.network.packet.*` interfaces, extracts their `static final CustomPacketPayload.Type<T>` and `static final StreamCodec<B, T>` fields, and registers them with `registrar`.<br>**Exceptions**:<br>• Throws `IllegalArgumentException` if a packet class lacks matching `static final Type<T>` or `static final StreamCodec<B, T>` fields;<br>• Throws `IllegalStateException` if the class fails to load or implements neither `IClientboundPacket` nor `IServerboundPacket`. |

### 3. `NetworkUtil` (Server-Side Packet Broadcast Utility)

Located in `dev.anvilcraft.lib.v2.network.util.NetworkUtil`. All methods are **server-only** (calling on the client fails to obtain `ServerLifecycleHooks.getCurrentServer()` and throws `NullPointerException("Cannot send clientbound payloads on the client")`):

| Method Signature | Parameters & Behavior |
| :--- | :--- |
| `public static void sendToAllPlayersExcluded(@Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Sends one or more payloads to all online players on the server, skipping `excluded` (sends to everyone if `excluded == null`). |
| `public static void sendToAllPlayersInDimensionExcluded(ServerLevel level, @Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Sends payloads to all players in `level.players()`, skipping `excluded`. |
| `public static void sendToAllPlayersIncluded(@Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Sends payloads to all online players where `included.test(player)` is `true` (treated as always true if `included == null`). |
| `public static void sendToAllPlayersInDimensionIncluded(ServerLevel level, @Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | Sends payloads to all players in `level.players()` where `included.test(player)` is `true`. |

### 4. `BoolAndInt` (Compact ZigZag-Encoded Boolean + Int Record)

```java
public record BoolAndInt(boolean bool, int integer)
```

| Constant / Method Signature | Description & Boundary Notes |
| :--- | :--- |
| `public static final StreamCodec<ByteBuf, BoolAndInt> STREAM_CODEC` | ZigZag-encodes `integer` via `((long) integer << 1) ^ (integer >> 31)`, shifts left by 1 bit to store `bool` in bit 0, and writes as a 7-bit VarInt.<br>**Boundary**: decoder reads at most `5` bytes (`bytes > 5` throws `RuntimeException("VarInt too big")`), carrying `35` effective bits (1-bit `bool` + 34-bit ZigZag int), ideal for compactly transmitting any signed integer within ±$2^{32}$. |
