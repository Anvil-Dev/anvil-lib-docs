# 自动扫描注册器与紧凑编码工具 (`register` / `util`)

<BranchContextCard branch="1.21.4" />

本篇介绍如何使用 `@Network` 注解与 `NetworkRegistrar` 自动完成数据包注册，以及如何使用 `NetworkUtil` 与 `BoolAndInt` 进行单字节位压缩网络编码。

---

## 一、 `@Network` 与 `NetworkRegistrar` 自动扫描注册机制

### 1. `@Network` 标注规则（按所属 Package 扫描）

`@Network` 注解可以标注在 **`package-info.java`、`interface`、`class`、`enum` 或 `record`** 上。

当 `NetworkRegistrar.register(registrar, modId)` 运行时：
1. 它会在 `modId` 对应的模组扫描数据（`ModFileScanData`）中查找所有标注了 `@Network` 的类型；
2. 提取该类型所在的**包名（Package Name）**，以及 `@Network(protocol = ...)` 指定的网络协议阶段（默认为 `PacketProtocol.PLAY`）；
3. 自动扫描**同一个 Java Package 下（不含子包）**所有直接实现了 `dev.anvilcraft.lib.v2.network.packet.*` 接口的数据包类，通过 `PacketData.find(packetClass)` 提取其静态 `Type` 字段、静态 `StreamCodec` 字段与方向处理器，自动注册到 NeoForge 的 `PayloadRegistrar` 中！

> **注意**：如果你的模组既有 `PLAY` 阶段的数据包，又有 `CONFIGURATION` 阶段的数据包，请将它们放在**两个不同的子包**下，并分别标注 `@Network(protocol = PacketProtocol.PLAY)` 和 `@Network(protocol = PacketProtocol.CONFIGURATION)`。

### 2. 完整代码示例：在模组中调用 `NetworkRegistrar.register` 并发送数据包

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

## 二、 公开类、注解与枚举 API 详解 (`dev.anvilcraft.lib.v2.network.register`)

| 名称 | 类型 | 签名与说明 |
| :--- | :---: | :--- |
| **`@Network`** | `@interface` | `PacketProtocol protocol() default PacketProtocol.PLAY;`。标注在包或包内任意类型上，声明该包为网络数据包扫描目标。 |
| **`PacketProtocol`** | `enum` | • `CONFIGURATION`：对应 `registrar.configurationToClient` / `ToServer` / `Bidirectional`<br>• `PLAY`：对应 `registrar.playToClient` / `ToServer` / `Bidirectional`<br>• `COMMON`：对应 `registrar.commonToClient` / `ToServer` / `Bidirectional` |
| **`PacketDirection`** | `enum` | `CLIENTBOUND`、`SERVERBOUND`、`BIDIRECTIONAL`。 |
| **`NetworkRegistrar`** | `class` | `public static void register(PayloadRegistrar registrar, String modId)`：扫描并注册 `modId` 模组内所有 `@Network` 包下的数据包。 |
| **`PacketData<B, T>`** | `record` | `public record PacketData<B extends FriendlyByteBuf, T extends IPacket>(Type<T> type, StreamCodec<? super B, T> streamCodec, IPayloadHandler<T> handler, PacketDirection direction)`<br>`public static <B extends FriendlyByteBuf, T extends IPacket> PacketData<B, T> find(Class<T> clazz)`：反射提取数据包类的 `Type`、`StreamCodec` 与方向处理器。 |

---

## 三、 位压缩编码工具 (`NetworkUtil` & `BoolAndInt`)

位于 `dev.anvilcraft.lib.v2.network.util`。

### 1. 代码示例：单字节打包布尔值与槽位索引

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

### 2. `BoolAndInt` 与 `NetworkUtil` API 详表

| 类 / 记录名 | 常量 / 方法签名 | 值域限制与说明 |
| :--- | :--- | :--- |
| **`BoolAndInt`** | • `public record BoolAndInt(boolean bool, int integer)`<br>• `public static final Codec<BoolAndInt> CODEC`<br>• `public static final StreamCodec<ByteBuf, BoolAndInt> STREAM_CODEC` | 将 `bool`（bit 7）与 `integer`（低 7 位 `0..127`）打包为 1 字节。越界抛出 `IllegalArgumentException`。 |
| **`NetworkUtil`** | • `void writeBoolAndInt(ByteBuf buf, boolean bool, int i)`<br>• `BoolAndInt readBoolAndInt(ByteBuf buf)` | 读写 1 个布尔值 + 1 个 `[0, 127]` 整数（占 1 字节）。 |
| | • `void write8Booleans(ByteBuf buf, boolean... booleans)`<br>• `boolean[] read8Booleans(ByteBuf buf, int size)` | 将 `1 ~ 8` 个布尔值按位打包为 1 字节读写（超出 `[1, 8]` 抛 `IllegalArgumentException`）。 |
| | • `void write2Ints(ByteBuf buf, int a, int b)`<br>• `int[] read2Ints(ByteBuf buf)` | 将两个 **`[-8, 7]`** 有符号半字节整数打包为 1 字节。 |
| | • `void write2UnsignedInts(ByteBuf buf, int a, int b)`<br>• `int[] read2UnsignedInts(ByteBuf buf)` | 将两个 **`[0, 15]`** 无符号半字节整数打包为 1 字节。 |
