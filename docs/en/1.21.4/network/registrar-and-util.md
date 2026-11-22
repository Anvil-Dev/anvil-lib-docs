# Auto-Scanner Registrar & Compact Packing Utilities (`register` / `util`)

<BranchContextCard branch="1.21.4" />

This page covers using `@Network` and `NetworkRegistrar` to auto-register packets, plus `NetworkUtil` and `BoolAndInt` for single-byte bit-packed network encoding.

---

## 1. `@Network` & `NetworkRegistrar` Auto-Registration

### 1. `@Network` Annotation Rules (Scanned by Enclosing Package)

The `@Network` annotation can be placed on **`package-info.java`, `interface`, `class`, `enum`, or `record`**.

When `NetworkRegistrar.register(registrar, modId)` runs:
1. It searches `ModFileScanData` for `modId` to find all types annotated with `@Network`;
2. Extracts each type's **package name** and the protocol phase specified by `@Network(protocol = ...)` (defaults to `PacketProtocol.PLAY`);
3. Automatically scans all classes **directly in that Java package (non-recursive)** implementing `dev.anvilcraft.lib.v2.network.packet.*`, extracts their static `Type`, static `StreamCodec`, and directional handler via `PacketData.find(packetClass)`, and registers them to NeoForge's `PayloadRegistrar`!

> **Note**: If your mod has both `PLAY` packets and `CONFIGURATION` packets, place them in **two separate subpackages** annotated with `@Network(protocol = PacketProtocol.PLAY)` and `@Network(protocol = PacketProtocol.CONFIGURATION)` respectively.

### 2. Full Code Example: Calling `NetworkRegistrar.register` & Sending Packets

```java
package com.example.mymod.network;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.network.register.NetworkRegistrar;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.network.ClientPacketDistributor;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

@EventBusSubscriber(modid = MyMod.MOD_ID, bus = EventBusSubscriber.Bus.MOD)
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

## 3. Bit-Packed Encoding Utilities (`NetworkUtil` & `BoolAndInt`)

Located in `dev.anvilcraft.lib.v2.network.util`.

### 1. Code Example: Single-Byte Packing of a Boolean & Slot Index

```java
package com.example.mymod.network;

import dev.anvilcraft.lib.v2.network.util.BoolAndInt;
import dev.anvilcraft.lib.v2.network.util.NetworkUtil;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;

public final class BitPackingExample {
    public static void packAndUnpackExample() {
        ByteBuf buf = Unpooled.buffer();

        BoolAndInt.STREAM_CODEC.encode(buf, new BoolAndInt(true, 35));
        BoolAndInt decoded = BoolAndInt.STREAM_CODEC.decode(buf);

        NetworkUtil.write8Booleans(buf, true, false, true, true, false);
        boolean[] flags = NetworkUtil.read8Booleans(buf, 5);

        NetworkUtil.write2Ints(buf, -4, 7);
        int[] signedPair = NetworkUtil.read2Ints(buf);

        NetworkUtil.write2UnsignedInts(buf, 12, 15);
        int[] unsignedPair = NetworkUtil.read2UnsignedInts(buf);
    }
}
```

### 2. `BoolAndInt` & `NetworkUtil` API Reference

| Class / Record | Constants / Method Signatures | Range Limits & Description |
| :--- | :--- | :--- |
| **`BoolAndInt`** | • `public record BoolAndInt(boolean bool, int integer)`<br>• `public static final Codec<BoolAndInt> CODEC`<br>• `public static final StreamCodec<ByteBuf, BoolAndInt> STREAM_CODEC` | Packs `bool` (bit 7) and `integer` (low 7 bits `0..127`) into 1 byte. Throws `IllegalArgumentException` if out of range. |
| **`NetworkUtil`** | • `void writeBoolAndInt(ByteBuf buf, boolean bool, int i)`<br>• `BoolAndInt readBoolAndInt(ByteBuf buf)` | Reads/writes 1 boolean + 1 `[0, 127]` integer (1 byte). |
| | • `void write8Booleans(ByteBuf buf, boolean... booleans)`<br>• `boolean[] read8Booleans(ByteBuf buf, int size)` | Bit-packs `1–8` booleans into 1 byte (throws `IllegalArgumentException` if outside `[1, 8]`). |
| | • `void write2Ints(ByteBuf buf, int a, int b)`<br>• `int[] read2Ints(ByteBuf buf)` | Packs two **`[-8, 7]`** signed nibbles into 1 byte. |
| | • `void write2UnsignedInts(ByteBuf buf, int a, int b)`<br>• `int[] read2UnsignedInts(ByteBuf buf)` | Packs two **`[0, 15]`** unsigned nibbles into 1 byte. |
