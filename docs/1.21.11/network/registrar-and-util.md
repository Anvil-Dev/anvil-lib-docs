# 自动扫描注册器与广播/压缩工具 (`register` / `util`)

<BranchContextCard branch="1.21.11" />

本篇介绍如何使用 `@Network` 注解与 `NetworkRegistrar` 自动完成数据包注册，以及如何使用 `NetworkUtil` 进行条件玩家广播、`BoolAndInt` 进行 ZigZag + VarInt 紧凑网络编码。

---

## 一、 `@Network` 与 `NetworkRegistrar` 自动扫描注册机制

### 1. `@Network` 标注规则（按所属 Package 扫描）

`@Network` 注解可以标注在 **`package-info.java`、`interface`、`class`、`enum` 或 `record`** 上。

当 `NetworkRegistrar.register(registrar, modId)` 运行时：
1. 它会在 `modId` 对应的模组扫描数据（`ModFileScanData`）中查找所有标注了 `@Network` 的类型；
2. 提取该类型所在的**包名（Package Name）**，以及 `@Network(protocol = ...)` 指定的网络协议阶段（默认为 `PacketProtocol.PLAY`）；
3. 自动扫描**同一个 Java Package 下（不含子包）**所有直接实现了 `dev.anvilcraft.lib.v2.network.packet.*` 接口的数据包类，通过 `PacketData.find(packetClass)` 提取其静态 `Type` 字段、静态 `StreamCodec` 字段与方向处理器，自动注册到 NeoForge 的 `PayloadRegistrar` 中（针对 NeoForge 21.11 双向注册签名自动传入双端处理器）！

> **注意**：如果你的模组既有 `PLAY` 阶段的数据包，又有 `CONFIGURATION` 阶段的数据包，请将它们放在**两个不同的子包**下，并分别标注 `@Network(protocol = PacketProtocol.PLAY)` 和 `@Network(protocol = PacketProtocol.CONFIGURATION)`。

### 2. 完整代码示例：在模组中调用 `NetworkRegistrar.register` 并发送数据包

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

## 二、 公开类、注解与枚举 API 详解 (`dev.anvilcraft.lib.v2.network.register`)

| 名称 | 类型 | 签名与说明 |
| :--- | :---: | :--- |
| **`@Network`** | `@interface` | `PacketProtocol protocol() default PacketProtocol.PLAY;`。标注在包或包内任意类型上，声明该包为网络数据包扫描目标。 |
| **`PacketProtocol`** | `enum` | • `CONFIGURATION`：对应 `registrar.configurationToClient` / `ToServer` / `Bidirectional`<br>• `PLAY`：对应 `registrar.playToClient` / `ToServer` / `Bidirectional`<br>• `COMMON`：对应 `registrar.commonToClient` / `ToServer` / `Bidirectional` |
| **`PacketDirection`** | `enum` | `CLIENTBOUND`、`SERVERBOUND`、`BIDIRECTIONAL`。 |
| **`NetworkRegistrar`** | `class` | `public static void register(PayloadRegistrar registrar, String modId)`：扫描并注册 `modId` 模组内所有 `@Network` 包下的数据包。 |
| **`PacketData<B, T>`** | `record` | `public record PacketData<B extends FriendlyByteBuf, T extends IPacket>(Type<T> type, StreamCodec<? super B, T> streamCodec, IPayloadHandler<T> handler, PacketDirection direction)`<br>`public static <B extends FriendlyByteBuf, T extends IPacket> PacketData<B, T> find(Class<T> clazz)`：反射提取数据包类的 `Type`、`StreamCodec` 与方向处理器。 |

---

## 三、 条件广播与紧凑编码工具 (`NetworkUtil` & `BoolAndInt`)

位于 `dev.anvilcraft.lib.v2.network.util`。

### 1. 代码示例：使用 `BoolAndInt` 与 `NetworkUtil`

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

### 2. `BoolAndInt` 与 `NetworkUtil` API 详表

| 类 / 记录名 | 常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`BoolAndInt`** | • `public record BoolAndInt(boolean bool, int integer)`<br>• `public static final StreamCodec<ByteBuf, BoolAndInt> STREAM_CODEC` | 将 `integer` 先经 ZigZag 编码压缩负数体积，再把 `bool` 折叠进最低位 `bit 0`，整体以 VarInt 写入 `ByteBuf`（支持任意 32 位有符号整数）。 |
| **`NetworkUtil`** | `static void sendToAllPlayersExcluded(@Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向全服所有在线玩家广播数据包，排除指定的 `excluded` 玩家（若为 `null` 则不排除）。仅限服务端调用（依赖 `ServerLifecycleHooks.getCurrentServer()`）。 |
| | `static void sendToAllPlayersInDimensionExcluded(ServerLevel level, @Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向指定维度 `level` 内的所有玩家广播数据包，排除 `excluded`。 |
| | `static void sendToAllPlayersIncluded(@Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向全服满足 `included` 条件的玩家发送数据包（`included == null` 时匹配全体玩家）。仅限服务端调用。 |
| | `static void sendToAllPlayersInDimensionIncluded(ServerLevel level, @Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向指定维度 `level` 内满足 `included` 条件的玩家发送数据包（`included == null` 时匹配该维度全体玩家）。 |
