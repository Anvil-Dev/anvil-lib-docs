# @Network 注解、自动注册与工具方法 (`dev.anvilcraft.lib.v2.network.register` / `util`)

<BranchContextCard branch="26.3" />

定义好实现 `IPacket` 子接口的数据包类后，只需在它们所在的 Java 包（`package-info.java`）上标注 `@Network`，并在 `RegisterPayloadHandlersEvent` 事件中调用一行 `NetworkRegistrar.register(registrar, MOD_ID)`，即可自动完成包下所有数据包的扫描、反射提取与通道注册。本篇同时介绍广播辅助类 `NetworkUtil` 与紧凑位打包工具 `BoolAndInt`。

---

## 一、 `@Network` 包级自动扫描注册流程

### 1. 第一步：在数据包所在目录下创建 `package-info.java`

`@Network` 是一个**包级注解（`@Target(ElementType.PACKAGE)`）**，必须写在对应包目录的 `package-info.java` 文件中。

> **重要机制说明**：
> `NetworkRegistrar` 在匹配类名时使用的是精确包名比对：`className.substring(0, className.lastIndexOf('.')).equals(packageName)`。
> 这意味着：
> 1. `@Network` **只扫描直接位于当前包下的类，不会递归扫描子包**（如果子包也有网络包，请在子包下也放一个 `package-info.java`）；
> 2. 如果你的网络包需要不同的协议通道（例如一部分走 `PLAY`，一部分走 `CONFIGURATION`），只需将它们分放在两个不同的包下，分别在各自的 `package-info.java` 中声明 `@Network(protocol = PacketProtocol.PLAY)` 和 `@Network(protocol = PacketProtocol.CONFIGURATION)`；
> 3. 请将网络包定义为包下的**顶层类**（而非内部类 `Outer$Inner`），因为 Java 编译后内部类的二进制类名虽然用 `$` 连接，但保持一包一类结构最为清晰可靠。

```java
// 文件路径: src/main/java/com/example/mymod/network/packet/package-info.java
@Network(protocol = PacketProtocol.PLAY)
package com.example.mymod.network.packet;

import dev.anvilcraft.lib.v2.network.register.Network;
import dev.anvilcraft.lib.v2.network.register.PacketProtocol;
```

### 2. 第二步：在 `RegisterPayloadHandlersEvent` 中调用 `NetworkRegistrar.register`

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
        // 自动扫描 my_mod 中所有标注了 @Network 的包并注册其中的 IPacket 实现类
        NetworkRegistrar.register(registrar, MyMod.MOD_ID);
    }
}
```

---

## 二、 网络广播与 `BoolAndInt` 工具用法示例

### 1. 使用 `NetworkUtil` 按条件或排除特定玩家广播数据包

原版 `PacketDistributor.sendToAllPlayers` 总是发给服务器上的所有人；而在许多同步场景下，我们希望“发送给除触发者本人以外的所有人”或“仅发送给满足特定谓词（如佩戴了特定护目镜）的玩家”。`NetworkUtil` 提供了这四类常用广播方法：

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

        // 1. 向当前维度内除 triggerPlayer 以外的所有玩家发送
        NetworkUtil.sendToAllPlayersInDimensionExcluded(level, triggerPlayer, packet);

        // 2. 向当前维度内所有头部佩戴了工程师护目镜的玩家发送
        NetworkUtil.sendToAllPlayersInDimensionIncluded(
            level,
            player -> player.getItemBySlot(EquipmentSlot.HEAD).is(ModItems.ENGINEER_GOGGLES.get()),
            packet
        );
    }
}
```

### 2. 使用 `BoolAndInt` 将布尔标志与有符号整数打包为单个 VarInt

当网络包中同时需要传输一个 `boolean` 状态位和一个通常较小的有符号 `int`（可正可负）时，分开写需要 `1 byte (bool) + 1~5 bytes (VarInt)`，且负数在普通 `VarInt` 下总是占满 5 字节。`BoolAndInt` 先对整数执行 **ZigZag 编码**（将小负数映射为小正数），再将 `boolean` 折叠进最低位（bit 0），最后作为单个 `VarInt`（1~5 字节）写出：

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

## 三、 公开类、注解与枚举 API 详解

### 1. `@Network` 与 `PacketProtocol`

| 类型 / 签名 | 说明 |
| :--- | :--- |
| `@Target(ElementType.PACKAGE) public @interface Network` | 包级注解，包含属性 `PacketProtocol protocol() default PacketProtocol.PLAY;`。 |
| `public enum PacketProtocol` | • `CONFIGURATION`：连接配置阶段通道（对应 `registrar.configurationToClient` / `ToServer` / `Bidirectional`）；<br>• `PLAY`：游戏内阶段通道（默认，对应 `registrar.playToClient` / `ToServer` / `Bidirectional`）；<br>• `COMMON`：配置与游戏内通用阶段通道（对应 `registrar.commonToClient` / `ToServer` / `Bidirectional`）。 |

### 2. `NetworkRegistrar` 与内部 `PacketData`

| 类 / 方法签名 | 说明与边界异常 |
| :--- | :--- |
| `public static void NetworkRegistrar.register(PayloadRegistrar registrar, String modId)` | 扫描 `modId` 模组文件中的所有 `@Network` 包，加载包下所有实现了 `dev.anvilcraft.lib.v2.network.packet.*` 接口的类，提取其 `static final CustomPacketPayload.Type<T>` 与 `static final StreamCodec<B, T>` 字段并向 `registrar` 注册。<br>**异常条件**：<br>• 若数据包类缺少匹配的 `static final Type<T>` 或 `static final StreamCodec<B, T>` 字段，抛出 `IllegalArgumentException`；<br>• 若类无法加载或未实现 `IClientboundPacket` / `IServerboundPacket`，抛出 `IllegalStateException`。 |

### 3. `NetworkUtil`（服务端数据包广播辅助类）

位于 `dev.anvilcraft.lib.v2.network.util.NetworkUtil`。所有方法**仅限在服务端调用**（在客户端调用获取不到 `ServerLifecycleHooks.getCurrentServer()` 会抛出 `NullPointerException("Cannot send clientbound payloads on the client")`）：

| 方法签名 | 参数与行为说明 |
| :--- | :--- |
| `public static void sendToAllPlayersExcluded(@Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向全服所有在线玩家发送一个或多个数据包，跳过 `excluded` 玩家（若 `excluded == null` 则发给全服所有人）。 |
| `public static void sendToAllPlayersInDimensionExcluded(ServerLevel level, @Nullable ServerPlayer excluded, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向指定维度 `level.players()` 中的所有玩家发送数据包，跳过 `excluded` 玩家。 |
| `public static void sendToAllPlayersIncluded(@Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向全服所有满足 `included.test(player)` 为 `true` 的玩家发送数据包（若 `included == null` 则视为恒真，发给全服所有人）。 |
| `public static void sendToAllPlayersInDimensionIncluded(ServerLevel level, @Nullable Predicate<ServerPlayer> included, CustomPacketPayload payload, CustomPacketPayload... payloads)` | 向指定维度 `level.players()` 中所有满足 `included.test(player)` 为 `true` 的玩家发送数据包。 |

### 4. `BoolAndInt`（布尔与整数 ZigZag 紧凑编码记录）

```java
public record BoolAndInt(boolean bool, int integer)
```

| 常量 / 方法签名 | 说明与边界注意 |
| :--- | :--- |
| `public static final StreamCodec<ByteBuf, BoolAndInt> STREAM_CODEC` | 将 `integer` 进行 ZigZag 编码 `((long) integer << 1) ^ (integer >> 31)`，再左移 1 位将 `bool` 存入最低位，按 7-bit 分组变长编码写出。<br>**边界条件**：解码端限制最多读取 `5` 个字节（`bytes > 5` 抛出 `RuntimeException("VarInt too big")`），总共承载 `35` 个有效比特（1 位 `bool` + 34 位 ZigZag 整数），适合绝对值在 $2^{32}$ 范围内（含全部常见正负整数）的紧凑传输。 |
